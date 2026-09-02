"""FastAPI app entrypoint.

Phase 0: health + corpus status.
Phase 1: model registry + text chat (batch + streaming) with the verbatim/summary
history model and per-stage latency. API keys arrive per-request from the frontend
(localStorage) via headers, falling back to server env vars.
"""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from app import config
from app.asr import service as asr_service
from app.llm import registry
from app.llm import tokens
from app.llm.orchestrator import (
    ChatRequest, assemble_messages, cancel_last, reset_session, run_batch, run_stream,
)
from app.tools import cart_store
from app.tools import registry as tools_registry
from app.tts import service as tts_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the RAG index in the background on startup (non-blocking), so the
    first RAG query on a fresh deploy isn't slow. Failures are non-fatal."""
    async def _warm():
        try:
            from app.rag import index as rag_index
            if (not rag_index.is_built() and config.EMBEDDING_PROFILE == "light"
                    and config.key_present("openai")):
                await asyncio.to_thread(rag_index.build, None, 8)
        except Exception:
            pass  # lazy build on first /rag call still works
    asyncio.create_task(_warm())
    yield


app = FastAPI(title="Voice AI Platform API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Header name -> provider key. Frontend sends whichever the user has saved.
_KEY_HEADERS = {
    "x-openai-key": "openai",
    "x-gemini-key": "gemini",
    "x-elevenlabs-key": "elevenlabs",
}


def resolve_keys(request: Request) -> dict[str, str]:
    """Per-request keys from headers, falling back to server env vars."""
    keys: dict[str, str] = {}
    for header, provider in _KEY_HEADERS.items():
        val = request.headers.get(header)
        if not val:
            env = config.KEY_REGISTRY.get(provider)
            val = os.getenv(env) if env else None
        if val:
            keys[provider] = val
    return keys


class ChatBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=8000)
    model_key: str = "openai-lite"
    mode: str = "batch"
    system_prompt: str | None = None
    response_length: str = "medium"
    verbatim_turns: int = Field(default=6, ge=0, le=50)
    use_context: bool = True
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)
    tools_enabled: bool = False
    enabled_tools: list[str] | None = None
    use_rag: bool = False
    top_k: int = Field(default=4, ge=1, le=20)
    rerank: bool = False


def _to_request(body: ChatBody, keys: dict[str, str]) -> ChatRequest:
    return ChatRequest(
        session_id=body.session_id,
        message=body.message,
        model_key=body.model_key,
        mode=body.mode,
        system_prompt=body.system_prompt,
        response_length=body.response_length,
        verbatim_turns=body.verbatim_turns,
        use_context=body.use_context,
        temperature=body.temperature,
        keys=keys,
        tools_enabled=body.tools_enabled,
        enabled_tools=body.enabled_tools,
        use_rag=body.use_rag,
        top_k=body.top_k,
        rerank=body.rerank,
    )


@app.get("/health")
def health() -> dict:
    corpus_ready = config.CONTEXT_PATH.exists()
    doc_count = len(list(config.DOCS_DIR.glob("**/*.md"))) if config.DOCS_DIR.exists() else 0
    return {
        "status": "ok",
        "phase": 1,
        "keys_env": config.available_keys(),
        "embedding_profile": config.EMBEDDING_PROFILE,
        "corpus": {"context_md_ready": corpus_ready, "doc_count": doc_count},
    }


@app.get("/models")
def models() -> dict:
    return {"models": registry.available_models(), "lengths": list(registry.LENGTH_PRESETS)}


@app.get("/tools")
def tools() -> dict:
    return {"tools": tools_registry.list_tools()}


@app.get("/cart")
def cart(session_id: str) -> dict:
    items = cart_store.get(session_id)
    return {
        "items": items,
        "monthly_total": sum(i["price_monthly"] * i["seats"] for i in items),
        "count": sum(i["seats"] for i in items),
    }


class OrderLine(BaseModel):
    product: str = Field(min_length=1, max_length=200)
    tier: str | None = None
    quantity: int = Field(default=1, ge=1, le=100)
    customization: str = ""


class OrderPlaceBody(BaseModel):
    session_id: str = Field(min_length=1, max_length=200)
    items: list[OrderLine] = Field(default_factory=list, max_length=100)
    delivery_address: str = "Home Address"
    payment_method: str = "UPI"
    coupon: str | None = None


@app.post("/order/place")
def order_place(body: OrderPlaceBody, request: Request):
    from app.tools import domain_food as food_tools
    check_rate_limit(request)
    if not body.items:
        return {"error": "Your cart is empty. Add some dishes first!"}

    sid = body.session_id.strip()
    food_tools.clear_cart(sid)
    for line in body.items:
        result = food_tools.add_to_cart(
            sid, line.product, tier=line.tier, seats=line.quantity, customization=line.customization
        )
        if "error" in result:
            return {"error": result["error"]}

    coupon_note = None
    if body.coupon:
        coupon_result = food_tools.apply_coupon(sid, body.coupon)
        if coupon_result.get("error"):
            coupon_note = coupon_result["error"]

    out = food_tools.checkout(
        sid, body.delivery_address or "Home Address", body.payment_method or "UPI"
    )
    if "error" in out:
        return {"error": out["error"]}

    order = cart_store.get_order(out["order_id"]) or {}
    return {
        "order_id": out["order_id"],
        "grand_total": out["grand_total"],
        "eta": out.get("eta", "28-30 mins"),
        "status": order.get("status", "Preparing in Kitchen"),
        "eta_mins": order.get("eta_mins", 28),
        "items": order.get("items", []),
        "bill": order.get("bill", {}),
        "address": order.get("address", body.delivery_address),
        "payment": order.get("payment", body.payment_method),
        "timestamp": order.get("timestamp"),
        "coupon_note": coupon_note,
        "message": out.get("message", ""),
    }


@app.get("/order/{order_id}")
def order_status(order_id: str, request: Request):
    from app.tools import domain_food as food_tools
    check_rate_limit(request)
    cleaned = order_id.upper().strip()
    order = cart_store.get_order(cleaned)
    if not order:
        return {"error": f"Order #{cleaned} was not found in active orders. Please check your order ID."}
    return {
        "order_id": order["order_id"],
        "status": order["status"],
        "eta_mins": order["eta_mins"],
        "items": order.get("items", []),
        "bill": order.get("bill", {}),
        "address": order.get("address", ""),
        "payment": order.get("payment", ""),
        "timestamp": order.get("timestamp"),
    }


from app.security import check_rate_limit, verify_admin_auth


@app.post("/chat")
async def chat(body: ChatBody, request: Request):
    check_rate_limit(request)
    keys = resolve_keys(request)
    result = await run_batch(_to_request(body, keys))
    return result


@app.post("/chat/stream")
async def chat_stream(body: ChatBody, request: Request):
    check_rate_limit(request)
    keys = resolve_keys(request)
    req = _to_request(body, keys)

    async def gen():
        async for event in run_stream(req):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/session/reset")
def session_reset(payload: dict):
    sid = (payload or {}).get("session_id")
    if sid:
        reset_session(sid)
    return {"status": "ok"}


@app.post("/session/cancel_last")
def session_cancel_last(payload: dict):
    """Barge-in: annotate the last assistant turn as cancelled."""
    sid = (payload or {}).get("session_id")
    ok = cancel_last(sid) if sid else False
    return {"status": "ok", "annotated": ok}


# ---- voice: ASR + TTS ----
@app.get("/voices")
def voices() -> dict:
    return {
        "asr": ["browser", *asr_service.PROVIDERS],
        "tts": {p: tts_service.VOICES[p] for p in tts_service.PROVIDERS},
    }


MAX_ASR_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB limit


@app.post("/asr")
async def asr(request: Request, provider: str = Form("openai"), file: UploadFile = File(...)):
    check_rate_limit(request)
    keys = resolve_keys(request)
    raw = await file.read()
    if not raw:
        return {"error": "Empty audio."}
    if len(raw) > MAX_ASR_UPLOAD_BYTES:
        return {"error": "Audio file exceeds maximum size limit (15MB)."}
    try:
        return asr_service.transcribe(raw, provider, api_key=keys.get(provider))
    except Exception as e:
        return {"error": str(e)}


class TTSBody(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    provider: str = "openai"
    voice: str | None = None


@app.post("/tts")
def tts(body: TTSBody, request: Request):
    check_rate_limit(request)
    keys = resolve_keys(request)
    try:
        out = tts_service.synthesize(body.text, body.provider, body.voice, api_key=keys.get(body.provider))
    except Exception as e:
        return Response(content=str(e), status_code=400, media_type="text/plain")
    return Response(
        content=out["audio"], media_type=out["media_type"],
        headers={"X-TTS-Ms": str(out["tts_ms"]), "X-TTS-Voice": out["voice"],
                 "Access-Control-Expose-Headers": "X-TTS-Ms, X-TTS-Voice"},
    )


@app.post("/inspect")
async def inspect(body: ChatBody, request: Request):
    """Return the exact messages that would be sent + token counts, no LLM call."""
    keys = resolve_keys(request)
    req = _to_request(body, keys)
    try:
        msgs, rag_meta = await assemble_messages(req)
    except Exception as e:
        return {"error": str(e)}
    counts = tokens.count_messages(msgs)
    return {**counts, "rag": rag_meta, "model": body.model_key}


# ---- RAG ----
def _openai_key(request: Request) -> str | None:
    return resolve_keys(request).get("openai")


@app.get("/rag/status")
def rag_status():
    from app.rag import index as rag_index
    return rag_index.status()


@app.post("/rag/build")
def rag_build(request: Request, payload: dict | None = None):
    verify_admin_auth(request)
    from app.rag import index as rag_index
    raw_clusters = int((payload or {}).get("clusters", 8))
    clusters = max(2, min(20, raw_clusters))
    try:
        return rag_index.build(api_key=_openai_key(request), clusters=clusters)
    except Exception as e:
        return {"error": str(e)}


@app.get("/rag/visualization")
def rag_visualization():
    from app.rag import index as rag_index
    if not rag_index.is_built():
        return {"error": "RAG index not built. POST /rag/build first."}
    proj = rag_index.projection()
    labels = proj.get("cluster_labels") or [f"cluster {i}" for i in range(proj["clusters"])]
    return {"points": proj["points"], "clusters": proj["clusters"],
            "cluster_labels": labels,
            "profile": proj["profile"], "model": proj["model"], "dim": proj["dim"]}


@app.post("/rag/query")
def rag_query(request: Request, payload: dict):
    check_rate_limit(request)
    from app.rag import service as rag_service
    q = (payload or {}).get("query", "").strip()
    if not q:
        return {"error": "Missing 'query'."}
    raw_k = int((payload or {}).get("top_k", 4))
    k = max(1, min(20, raw_k))
    do_rerank = bool((payload or {}).get("rerank", False))
    try:
        return rag_service.query_with_viz(q, k=k, do_rerank=do_rerank, api_key=_openai_key(request))
    except Exception as e:
        return {"error": str(e)}


# ---- Agent Platform Configuration & Dynamic Ingestion ----
from app.llm import prompts as llm_prompts


@app.get("/agent/config")
def get_agent_config():
    return llm_prompts.get_agent_config()


@app.post("/agent/config")
def update_agent_config(payload: dict, request: Request):
    verify_admin_auth(request)
    if not isinstance(payload, dict):
        return {"error": "Expected JSON object."}
    saved = llm_prompts.save_agent_config(payload)
    return {"status": "ok", "config": saved}


class IngestBody(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=50000)
    rebuild_rag: bool = False


@app.post("/rag/ingest")
def rag_ingest(body: IngestBody, request: Request):
    """Dynamically ingest arbitrary markdown/text knowledge documents."""
    verify_admin_auth(request)
    safe_name = os.path.basename(body.filename.strip())
    if not safe_name.endswith(".md") and not safe_name.endswith(".txt"):
        safe_name += ".md"
    config.DOCS_DIR.mkdir(parents=True, exist_ok=True)
    target_path = config.DOCS_DIR / safe_name
    target_path.write_text(body.content, encoding="utf-8")

    result = {"status": "ok", "file": safe_name, "bytes": len(body.content)}
    if body.rebuild_rag:
        from app.rag import index as rag_index
        try:
            build_res = rag_index.build(api_key=_openai_key(request))
            result["rag_build"] = build_res
        except Exception as e:
            result["rag_build_error"] = str(e)
    return result


# ---- Real-Time Full-Duplex WebSocket Voice Engine ----
from fastapi import WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
import pathlib
from app.voice_ws import handle_voice_websocket


@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    await handle_voice_websocket(websocket)


# ---- Mount Frontend Static Assets & Root Route ----
_ROOT_DIR = pathlib.Path(__file__).resolve().parent.parent.parent
_STORE_DIR = _ROOT_DIR / "bhukkad-store"
_PLAYGROUND_DIR = _ROOT_DIR / "playground"

if _STORE_DIR.exists():
    app.mount("/bhukkad-store", StaticFiles(directory=str(_STORE_DIR), html=True), name="bhukkad-store")

if _PLAYGROUND_DIR.exists():
    app.mount("/playground", StaticFiles(directory=str(_PLAYGROUND_DIR), html=True), name="playground")


@app.get("/")
def root_redirect():
    if _STORE_DIR.exists():
        return RedirectResponse(url="/bhukkad-store/index.html")
    return {"message": "Bhukkad AI Voice Agent API is running!", "status": "healthy"}



