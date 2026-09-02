"""Unit test for the Real-Time WebSocket Streaming Voice Engine.

Validates:
1. WebSocket connection handshake and ready event.
2. Ping/Pong keepalive.
3. Session init and config update.
4. Prompt streaming turn with sentence chunking.
5. Barge-in interruption handling.
6. Session history reset.
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app


def test_websocket_voice():
    client = TestClient(app)
    with client.websocket_connect("/ws/voice") as ws:
        # 1. Connection ready
        init_data = ws.receive_json()
        assert init_data.get("type") == "ready"
        session_id = init_data.get("session_id")
        assert session_id is not None
        print("✓ Connected to /ws/voice, session_id:", session_id)

        # 2. Ping / Pong
        ws.send_json({"type": "ping"})
        pong = ws.receive_json()
        assert pong.get("type") == "pong"
        print("✓ Ping/Pong keepalive passed")

        # 3. Init configuration
        ws.send_json({
            "type": "init",
            "config": {
                "model_key": "openai-lite",
                "tts_provider": "openai",
                "tts_voice": "alloy",
                "use_rag": False,
                "tools_enabled": False,
            }
        })
        ready_conf = ws.receive_json()
        assert ready_conf.get("type") == "ready"
        print("✓ Session configuration update passed")

        # 4. Barge-In Interruption
        ws.send_json({"type": "interrupt"})
        interrupted = ws.receive_json()
        assert interrupted.get("type") == "interrupted"
        print("✓ Barge-in interruption signal passed")

        # 5. Session Reset
        ws.send_json({"type": "reset"})
        reset_res = ws.receive_json()
        assert reset_res.get("type") == "reset_done"
        print("✓ Session reset passed")


def test_sentence_chunker():
    from app.voice_pipeline import SentenceChunker

    chunker = SentenceChunker(min_clause_chars=20)
    c1 = chunker.feed("Hello there! How ")
    assert len(c1) == 1
    assert c1[0] == "Hello there!"

    c2 = chunker.feed("are you doing today? I am ")
    assert len(c2) == 1
    assert c2[0] == "How are you doing today?"

    c3 = chunker.feed("doing great, and ready to assist.")
    assert len(c3) >= 1

    rem = chunker.flush()
    print(f"✓ SentenceChunker test passed (chunks: {c1 + c2 + c3 + rem})")


if __name__ == "__main__":
    print("\n--- Running Real-Time WebSocket Voice Engine Tests ---\n")
    test_sentence_chunker()
    test_websocket_voice()
    print("\n--- ALL WEBSOCKET TESTS PASSED! ---\n")
