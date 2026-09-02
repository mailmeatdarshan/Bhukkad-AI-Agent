"""Conversation history with the spec's verbatim+summary model.

A session holds the full turn list. When building context we keep the most recent
`verbatim` messages as-is and fold everything older into a rolling summary. The
summary is regenerated (one cheap LLM call) only when the aged-out set changes, so
steady-state turns add no summarization latency.

Sessions are immutable-friendly: callers never mutate returned lists; the store
replaces a session's turn list with a new list on each append.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace

from app.llm.providers.base import Message


@dataclass(frozen=True)
class Session:
    turns: tuple[Message, ...] = ()
    summary: str = ""
    summarized_count: int = 0  # how many leading turns the summary already covers


from collections import OrderedDict

MAX_HISTORY_SESSIONS = 500


class HistoryStore:
    """In-memory session store with LRU bounds."""

    def __init__(self) -> None:
        self._sessions: OrderedDict[str, Session] = OrderedDict()

    def _evict_if_needed(self) -> None:
        while len(self._sessions) > MAX_HISTORY_SESSIONS:
            self._sessions.popitem(last=False)

    def get(self, session_id: str) -> Session:
        if session_id in self._sessions:
            self._sessions.move_to_end(session_id)
            return self._sessions[session_id]
        return Session()

    def reset(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def set(self, session_id: str, session: Session) -> None:
        self._sessions[session_id] = session
        self._sessions.move_to_end(session_id)
        self._evict_if_needed()

    def append(self, session_id: str, role: str, content: str) -> Session:
        cur = self.get(session_id)
        new = replace(cur, turns=cur.turns + (Message(role, content),))
        self._sessions[session_id] = new
        self._sessions.move_to_end(session_id)
        self._evict_if_needed()
        return new

    def annotate_last_assistant(self, session_id: str, note: str) -> bool:
        """Append a note to the current assistant turn. If the current turn is the user,
        appends a cancelled assistant turn rather than corrupting a previous turn."""
        cur = self.get(session_id)
        if not cur.turns:
            return False

        last_idx = len(cur.turns) - 1
        if cur.turns[last_idx].role == "assistant":
            updated = Message("assistant", cur.turns[last_idx].content.rstrip() + " " + note)
            turns = cur.turns[:last_idx] + (updated,)
            self.set(session_id, replace(cur, turns=turns))
            return True
        elif cur.turns[last_idx].role == "user":
            # Assistant turn was interrupted before saving
            turns = cur.turns + (Message("assistant", note),)
            self.set(session_id, replace(cur, turns=turns))
            return True
        return False



def split_for_context(session: Session, verbatim: int) -> tuple[tuple[Message, ...], tuple[Message, ...]]:
    """Return (older, recent) where recent is the last `verbatim` messages."""
    if verbatim <= 0:
        return session.turns, ()
    if len(session.turns) <= verbatim:
        return (), session.turns
    return session.turns[:-verbatim], session.turns[-verbatim:]


def needs_summary(session: Session, older: tuple[Message, ...]) -> bool:
    return bool(older) and len(older) != session.summarized_count


def summary_prompt(prev_summary: str, older: tuple[Message, ...]) -> list[Message]:
    convo = "\n".join(f"{m.role}: {m.content}" for m in older)
    instruction = (
        "Summarize the earlier part of this conversation into a compact paragraph "
        "that preserves user intents, facts established, and any cart or product "
        "decisions. This summary replaces the verbatim turns."
    )
    body = instruction
    if prev_summary:
        body += f"\n\nExisting summary so far:\n{prev_summary}"
    body += f"\n\nConversation to summarize:\n{convo}"
    return [Message("user", body)]
