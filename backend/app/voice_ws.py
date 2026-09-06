"""WebSocket endpoint handler for real-time streaming voice agent.

Provides full-duplex WebSocket communication:
- Client -> Server: init, prompt, interrupt, reset, ping
- Server -> Client: ready, llm_delta, audio, turn_done, interrupted, error
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app import config
from app.llm.orchestrator import ChatRequest, cancel_last, reset_session
from app.voice_pipeline import run_streaming_voice_pipeline

logger = logging.getLogger(__name__)


class VoiceSession:
    """Manages the configuration and ongoing tasks for a WebSocket connection."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.model_key = "gemini-flash" if os.getenv("GEMINI_API_KEY") else "openai-lite"
        self.tts_provider = "elevenlabs"
        self.tts_voice = "Sarah"
        self.system_prompt: str | None = None
        self.response_length = "medium"
        self.verbatim_turns = 6
        self.use_context = True
        self.temperature = 0.5
        self.tools_enabled = True
        self.enabled_tools: list[str] | None = None
        self.use_rag = True
        self.top_k = 4
        self.rerank = False
        self.keys: dict[str, str] = {}
        self.active_task: asyncio.Task | None = None

    def update_config(self, data: dict[str, Any]) -> None:
        if "model_key" in data:
            self.model_key = str(data["model_key"])
        if "tts_provider" in data:
            self.tts_provider = str(data["tts_provider"])
        if "tts_voice" in data:
            self.tts_voice = str(data["tts_voice"])
        if "system_prompt" in data:
            self.system_prompt = data["system_prompt"]
        if "response_length" in data:
            self.response_length = str(data["response_length"])
        if "verbatim_turns" in data:
            self.verbatim_turns = int(data["verbatim_turns"])
        if "use_context" in data:
            self.use_context = bool(data["use_context"])
        if "temperature" in data:
            self.temperature = float(data["temperature"])
        if "tools_enabled" in data:
            self.tools_enabled = bool(data["tools_enabled"])
        if "enabled_tools" in data:
            self.enabled_tools = data["enabled_tools"]
        if "use_rag" in data:
            self.use_rag = bool(data["use_rag"])
        if "top_k" in data:
            self.top_k = int(data["top_k"])
        if "rerank" in data:
            self.rerank = bool(data["rerank"])
        if "keys" in data and isinstance(data["keys"], dict):
            self.keys.update(data["keys"])

    def resolved_keys(self) -> dict[str, str]:
        """Combine per-session frontend keys with server environment variables."""
        resolved = dict(self.keys)
        for provider, env_var in config.KEY_REGISTRY.items():
            if not resolved.get(provider) and os.getenv(env_var):
                resolved[provider] = os.getenv(env_var, "")
        return resolved

    def cancel_active(self) -> bool:
        if self.active_task and not self.active_task.done():
            self.active_task.cancel()
            self.active_task = None
            cancel_last(self.session_id, "[interrupted by user]")
            return True
        return False


import uuid


async def handle_voice_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    qp_sid = websocket.query_params.get("session_id")
    session = VoiceSession(qp_sid or f"ws-{uuid.uuid4().hex[:10]}")

    try:
        # Send initial ready state
        await websocket.send_json({"type": "ready", "session_id": session.session_id})

        while True:
            raw_msg = await websocket.receive_text()
            if not raw_msg:
                continue

            try:
                data = json.loads(raw_msg)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "error": "Invalid JSON format."})
                continue

            msg_type = data.get("type", "")

            # 1. Ping / Keepalive
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # 2. Session Initialization / Config Update
            elif msg_type == "init":
                if "session_id" in data:
                    session.session_id = str(data["session_id"])
                session.update_config(data.get("config", {}))
                if "keys" in data and isinstance(data["keys"], dict):
                    session.keys.update(data["keys"])
                await websocket.send_json({"type": "ready", "session_id": session.session_id})
                continue

            # 3. Barge-In Interruption
            elif msg_type == "interrupt":
                was_cancelled = session.cancel_active()
                await websocket.send_json({"type": "interrupted", "cancelled": was_cancelled})
                continue

            # 4. Session History Reset
            elif msg_type == "reset":
                session.cancel_active()
                reset_session(session.session_id)
                await websocket.send_json({"type": "reset_done"})
                continue

            # 5. User Speech / Text Prompt
            elif msg_type in ("prompt", "message"):
                text = (data.get("text") or data.get("message") or "").strip()
                if not text:
                    continue
                # Clamp prompt length to 8000 characters
                text = text[:8000]

                # Cancel any ongoing turn
                session.cancel_active()

                # Build chat request
                req = ChatRequest(
                    session_id=session.session_id,
                    message=text,
                    model_key=session.model_key,
                    mode="stream",
                    system_prompt=session.system_prompt,
                    response_length=session.response_length,
                    verbatim_turns=session.verbatim_turns,
                    use_context=session.use_context,
                    temperature=session.temperature,
                    keys=session.resolved_keys(),
                    tools_enabled=session.tools_enabled,
                    enabled_tools=session.enabled_tools,
                    use_rag=session.use_rag,
                    top_k=session.top_k,
                    rerank=session.rerank,
                )

                async def _stream_turn():
                    try:
                        async for event in run_streaming_voice_pipeline(
                            req,
                            tts_provider=session.tts_provider,
                            tts_voice=session.tts_voice,
                        ):
                            await websocket.send_json(event)
                    except asyncio.CancelledError:
                        await websocket.send_json({"type": "interrupted"})
                    except Exception as e:
                        logger.exception("Voice streaming error")
                        await websocket.send_json({"type": "error", "error": str(e)})

                session.active_task = asyncio.create_task(_stream_turn())

            else:
                await websocket.send_json({"type": "error", "error": f"Unknown message type '{msg_type}'."})

    except WebSocketDisconnect:
        session.cancel_active()
    except Exception as e:
        logger.exception("WebSocket connection error")
        session.cancel_active()
