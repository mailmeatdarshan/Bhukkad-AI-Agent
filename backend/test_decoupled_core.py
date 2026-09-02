"""Comprehensive test suite for the decoupled Voice AI Core.

Validates:
1. Dynamic agent configuration & persona prompts.
2. Dynamic ToolRegistry (general utilities + pluggable SaaS suite).
3. Resilient catalog resolution and safe fallbacks.
4. RAG chunking and topic labeling.
5. FastAPI platform API endpoints (/health, /models, /tools, /voices, /agent/config, /inspect).
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))


def test_prompts():
    from app.llm import prompts

    cfg = prompts.get_agent_config()
    assert "system_prompt" in cfg
    assert "routing_rules" in cfg
    print("✓ prompts.get_agent_config() works:", cfg["name"])

    # Test default prompt build
    prompt_default = prompts.build_system_prompt(length_guidance="Short answer.")
    assert "bhukkad" in prompt_default.lower()
    assert "Short answer." in prompt_default
    print("✓ prompts.build_system_prompt (default) works")

    # Test custom persona & RAG context injection
    custom_persona = "You are a specialized customer service AI for Acme Corp."
    prompt_rag = prompts.build_system_prompt(
        user_system_prompt=custom_persona,
        retrieved_context="Acme Widget 3000 costs $49.",
    )
    assert "Acme Corp" in prompt_rag
    assert "Retrieved Knowledge" in prompt_rag
    assert "Acme Widget 3000 costs $49." in prompt_rag
    print("✓ prompts.build_system_prompt (custom + RAG) works")


def test_tool_registry():
    from app.tools import registry

    tools = registry.list_tools()
    assert len(tools) >= 13, f"Expected at least 13 tools, found {len(tools)}"
    tool_names = [t["name"] for t in tools]
    assert "get_current_time" in tool_names
    assert "calculate_expression" in tool_names
    assert "add_to_cart" in tool_names
    assert "view_cart" in tool_names
    print(f"✓ registry.list_tools() returned {len(tools)} tools")

    # Test general tool execution
    res_time = registry.dispatch("get_current_time", {}, "test-session")
    assert "utc_time" in res_time
    print("✓ dispatch('get_current_time') returned:", res_time["utc_time"])

    res_math = registry.dispatch("calculate_expression", {"expression": "25 * 4 + 10"}, "test-session")
    assert res_math.get("result") == 110
    print("✓ dispatch('calculate_expression') returned:", res_math["result"])

    # Test domain food tool execution
    res_cart_clear = registry.dispatch("clear_cart", {}, "test-session")
    assert res_cart_clear.get("status") == "cleared"

    res_add = registry.dispatch(
        "add_to_cart",
        {"product": "Farmhouse Supreme Pizza", "tier": "Medium (10 inch)", "seats": 1},
        "test-session",
    )
    assert "added" in res_add
    print("✓ dispatch('add_to_cart') works:", res_add.get("message"))

    res_view = registry.dispatch("view_cart", {}, "test-session")
    assert res_view.get("bill", {}).get("subtotal", 0) > 0
    print("✓ dispatch('view_cart') works:", res_view.get("message"))

    # Test custom dynamic tool registration
    from app.tools.registry import ToolSpec, _schema

    def dummy_handler(val: int = 1):
        return {"doubled": val * 2}

    custom_spec = ToolSpec(
        name="double_number",
        description="Double a number",
        parameters=_schema({"val": {"type": "integer"}}),
        handler=dummy_handler,
    )
    registry.register_tool(custom_spec)
    assert registry.dispatch("double_number", {"val": 21}, "test-session")["doubled"] == 42
    print("✓ Dynamic custom tool registration & execution works")


def test_catalog_data():
    from app.tools import catalog_data

    # Match exact
    p1 = catalog_data.resolve_product("Farmhouse Supreme Pizza")
    assert p1 is not None, "Failed to resolve 'Farmhouse Supreme Pizza'"
    assert "Pizza" in p1["name"]

    # Match token
    p2 = catalog_data.resolve_product("Biryani")
    assert p2 is not None, "Failed to resolve 'Biryani'"
    print(f"✓ catalog_data.resolve_product works: resolved {p1['name']} and {p2['name']}")


def test_rag_chunking():
    from app.rag import chunk

    chunks = chunk.build_chunks()
    assert len(chunks) > 0, "Expected chunks to be built from docs/"
    print(f"✓ rag.chunk.build_chunks() produced {len(chunks)} chunks")


def test_api_endpoints():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # Health
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    print("✓ GET /health returned 200 OK")

    # Models
    r = client.get("/models")
    assert r.status_code == 200
    assert len(r.json().get("models", [])) > 0
    print("✓ GET /models returned 200 OK")

    # Tools
    r = client.get("/tools")
    assert r.status_code == 200
    assert len(r.json().get("tools", [])) >= 13
    print("✓ GET /tools returned 200 OK")

    # Voices
    r = client.get("/voices")
    assert r.status_code == 200
    assert "asr" in r.json() and "tts" in r.json()
    print("✓ GET /voices returned 200 OK")

    # Agent config
    r = client.get("/agent/config")
    assert r.status_code == 200
    assert "system_prompt" in r.json()
    print("✓ GET /agent/config returned 200 OK")

    # Inspect endpoint
    r = client.post("/inspect", json={"session_id": "test-s", "message": "Hello!"})
    assert r.status_code == 200
    assert "total_tokens" in r.json()
    print("✓ POST /inspect returned 200 OK, token count:", r.json()["total_tokens"])


if __name__ == "__main__":
    print("\n--- Running Decoupled Voice AI Core Tests ---\n")
    test_prompts()
    test_tool_registry()
    test_catalog_data()
    test_rag_chunking()
    test_api_endpoints()
    print("\n--- ALL TESTS PASSED SUCCESSFULLY! ---\n")
