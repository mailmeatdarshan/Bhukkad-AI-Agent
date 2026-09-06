"""Real-time streaming voice pipeline.

Connects LLM token streaming -> punctuation sentence chunking -> concurrent TTS
synthesis -> real-time audio packet delivery, achieving sub-600ms Time-to-First-Audio (TTFA).
"""
from __future__ import annotations

import asyncio
import base64
import re
import time
from dataclasses import dataclass, field
from typing import AsyncIterator

from app.latency import Latency
from app.llm.orchestrator import ChatRequest, _prepare, _run_tool_loop, _STORE, _meta
from app.llm.providers.base import ProviderError
from app.tts import service as tts_service


# Punctuation regex for sentence and clause boundaries
_SENTENCE_END_RE = re.compile(r"([.!?\n]+)\s*")
_CLAUSE_END_RE = re.compile(r"([,;:\u2014\-]+)\s*")


class SentenceChunker:
    """Buffers streaming token deltas and yields speakable sentence/phrase chunks."""

    def __init__(self, min_clause_chars: int = 35):
        self.buffer = ""
        self.min_clause_chars = min_clause_chars

    def feed(self, delta: str) -> list[str]:
        self.buffer += delta
        chunks: list[str] = []

        while True:
            # 1. Check for sentence terminators (. ! ? \n)
            m = _SENTENCE_END_RE.search(self.buffer)
            if m:
                end_pos = m.end()
                sentence = self.buffer[:end_pos].strip()
                self.buffer = self.buffer[end_pos:]
                if sentence:
                    chunks.append(sentence)
                continue

            # 2. Check for intermediate clause terminators (, ; :) if buffer is long enough
            if len(self.buffer) >= self.min_clause_chars:
                m_clause = _CLAUSE_END_RE.search(self.buffer)
                if m_clause and m_clause.end() >= 20:
                    end_pos = m_clause.end()
                    clause = self.buffer[:end_pos].strip()
                    self.buffer = self.buffer[end_pos:]
                    if clause:
                        chunks.append(clause)
                    continue

            break

        return chunks

    def flush(self) -> list[str]:
        rem = self.buffer.strip()
        self.buffer = ""
        return [rem] if rem else []


@dataclass
class AudioChunk:
    chunk_idx: int
    text: str
    audio_base64: str
    media_type: str
    tts_ms: float


async def _synthesize_chunk(
    text: str,
    provider: str,
    voice: str | None,
    api_key: str | None,
    chunk_idx: int,
) -> AudioChunk | None:
    """Synthesize a text chunk to audio asynchronously."""
    if not text.strip():
        return None
    try:
        res = await asyncio.to_thread(
            tts_service.synthesize,
            text=text,
            provider=provider,
            voice=voice,
            api_key=api_key,
        )
        audio_b64 = base64.b64encode(res["audio"]).decode("ascii")
        return AudioChunk(
            chunk_idx=chunk_idx,
            text=text,
            audio_base64=audio_b64,
            media_type=res.get("media_type", "audio/mpeg"),
            tts_ms=res.get("tts_ms", 0.0),
        )
    except Exception as e:
        return None


async def run_streaming_voice_pipeline(
    req: ChatRequest,
    tts_provider: str = "openai",
    tts_voice: str | None = "alloy",
) -> AsyncIterator[dict]:
    """Runs the streaming voice loop: LLM stream -> sentence chunker -> TTS -> audio packets."""
    lat = Latency()
    turn_start = time.perf_counter()

    prov, spec, session, msgs, max_tokens, older, rag_meta = await _prepare(req, lat)
    tts_key = req.key_for(tts_provider)

    # Tool turns run non-streamed then synthesize response
    if req.active_tool_specs():
        try:
            text, trace = await _run_tool_loop(req, prov, spec, msgs, max_tokens, lat)
        except ProviderError as e:
            yield {"type": "error", "error": str(e)}
            return

        # Emit tool_call events so the client can sync local state (e.g. localStorage cart)
        if trace:
            for t in trace:
                yield {"type": "tool_call", "name": t["name"], "arguments": t.get("args", {}), "result": t.get("result")}

        yield {"type": "llm_delta", "delta": text}
        _STORE.append(req.session_id, "user", req.message)
        _STORE.append(req.session_id, "assistant", text)

        # Synthesize audio
        t0 = time.perf_counter()
        chunk = await _synthesize_chunk(text, tts_provider, tts_voice, tts_key, 0)
        tts_dur = (time.perf_counter() - t0) * 1000.0
        lat.add("tts_ms", tts_dur)
        lat.add("ttfa_ms", (time.perf_counter() - turn_start) * 1000.0)

        if chunk:
            yield {
                "type": "audio",
                "chunk_idx": 0,
                "text": chunk.text,
                "audio": chunk.audio_base64,
                "media_type": chunk.media_type,
                "tts_ms": chunk.tts_ms,
            }

        meta = _meta(spec, "websocket(tools)", msgs, older, session, trace)
        meta["rag"] = rag_meta
        yield {"type": "turn_done", "text": text, "latency": lat.as_dict(), "meta": meta}
        return

    # Streaming LLM -> Sentence Chunker -> Concurrent TTS
    chunker = SentenceChunker()
    pieces: list[str] = []
    first_token_at: float | None = None
    first_audio_at: float | None = None
    chunk_idx = 0
    total_tts_ms = 0.0

    try:
        async for delta in prov.stream(
            api_key=req.key_for(spec.provider),
            model_id=spec.model_id,
            messages=msgs,
            max_tokens=max_tokens,
            temperature=req.temperature,
        ):
            if first_token_at is None:
                first_token_at = time.perf_counter()
                lat.add("llm_ttft", (first_token_at - turn_start) * 1000.0)

            pieces.append(delta)
            yield {"type": "llm_delta", "delta": delta}

            # Feed delta into sentence chunker
            sentences = chunker.feed(delta)
            for sentence in sentences:
                chunk = await _synthesize_chunk(sentence, tts_provider, tts_voice, tts_key, chunk_idx)
                if chunk:
                    if first_audio_at is None:
                        first_audio_at = time.perf_counter()
                        lat.add("ttfa_ms", (first_audio_at - turn_start) * 1000.0)
                    total_tts_ms += chunk.tts_ms
                    yield {
                        "type": "audio",
                        "chunk_idx": chunk.chunk_idx,
                        "text": chunk.text,
                        "audio": chunk.audio_base64,
                        "media_type": chunk.media_type,
                        "tts_ms": chunk.tts_ms,
                    }
                    chunk_idx += 1

        # Flush any remaining buffer
        for remaining in chunker.flush():
            chunk = await _synthesize_chunk(remaining, tts_provider, tts_voice, tts_key, chunk_idx)
            if chunk:
                if first_audio_at is None:
                    first_audio_at = time.perf_counter()
                    lat.add("ttfa_ms", (first_audio_at - turn_start) * 1000.0)
                total_tts_ms += chunk.tts_ms
                yield {
                    "type": "audio",
                    "chunk_idx": chunk.chunk_idx,
                    "text": chunk.text,
                    "audio": chunk.audio_base64,
                    "media_type": chunk.media_type,
                    "tts_ms": chunk.tts_ms,
                }
                chunk_idx += 1

    except ProviderError as e:
        yield {"type": "error", "error": str(e)}
        return

    full_text = "".join(pieces)
    lat.add("llm_total", (time.perf_counter() - turn_start) * 1000.0)
    lat.add("tts_ms", total_tts_ms)
    _STORE.append(req.session_id, "user", req.message)
    _STORE.append(req.session_id, "assistant", full_text)

    meta = _meta(spec, "websocket", msgs, older, session)
    meta["rag"] = rag_meta
    yield {"type": "turn_done", "text": full_text, "latency": lat.as_dict(), "meta": meta}
