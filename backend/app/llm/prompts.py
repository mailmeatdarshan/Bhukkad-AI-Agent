"""System-prompt construction, persona management, and grounding context routing.

Provides configurable voice agent personas, generic knowledge grounding rules,
and dynamic context injection for both RAG and RAGless paths.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app import config

DEFAULT_AGENT_NAME = "Foodie Voice Assistant"

DEFAULT_SYSTEM_PROMPT = (
    "You are Foodie, a friendly, ultra-fast conversational voice food ordering companion. "
    "You help customers explore delicious dishes (Pizzas, Burgers, Biryanis, Salads, Desserts, Shakes), "
    "customize orders, apply discount coupons (BHUKKAD50, BITE50, PARTY20, FREEDEL), manage their food cart, "
    "check dietary/allergen info, and track delivery status. "
    "Keep answers conversational, mouth-watering, natural, and concise for spoken audio."
)

DEFAULT_ROUTING_RULES = (
    "Food Ordering & Tool Guidelines:\n"
    "- When a user wants to order or add food, call `add_to_cart(product, tier, seats, customization)`.\n"
    "- When a user asks about offers or discounts, suggest active coupons (BHUKKAD50 / BITE50: 50% off, PARTY20: 20% off, FREEDEL: Free delivery) and call `apply_coupon`.\n"
    "- When a user asks for dietary choices (Veg/Non-Veg, under ₹500, healthy), call `filter_menu`.\n"
    "- When a user asks about ingredients or allergen safety, call `item_details`.\n"
    "- When a user asks to check out or place the order, call `checkout`.\n"
    "- When asked about delivery time (30 mins express guarantee), cold food refunds, or midnight service, use the knowledge base."
)



def get_agent_config() -> dict[str, Any]:
    """Load persisted agent configuration if present, or return defaults."""
    path = config.AGENT_CONFIG_PATH
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "name": DEFAULT_AGENT_NAME,
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "routing_rules": DEFAULT_ROUTING_RULES,
        "default_voice_provider": "openai",
        "default_voice": "alloy",
        "response_length": "medium",
    }


def save_agent_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """Persist agent configuration to disk."""
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    current = get_agent_config()
    current.update(cfg)
    config.AGENT_CONFIG_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return current


def _load_context(max_chars: int) -> str:
    path: Path = config.CONTEXT_PATH
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8")
    return text[:max_chars]


def build_system_prompt(
    *,
    user_system_prompt: str | None = None,
    routing_rules: str | None = None,
    length_guidance: str = "",
    use_context: bool = True,
    retrieved_context: str | None = None,
    max_context_chars: int = 120_000,
) -> str:
    """Assemble the final system prompt.

    - `use_context=True` with no `retrieved_context` -> RAGless: inject context.md.
    - `retrieved_context` provided -> RAG path: inject only the retrieved chunks.
    """
    cfg = get_agent_config()
    base = (user_system_prompt or cfg.get("system_prompt") or DEFAULT_SYSTEM_PROMPT).strip()
    rules = (routing_rules or cfg.get("routing_rules") or DEFAULT_ROUTING_RULES).strip()

    parts = [base, rules]
    if length_guidance.strip():
        parts.append(length_guidance.strip())

    if retrieved_context:
        parts.append(
            "Retrieved Knowledge (grounding context, use this to answer):\n"
            + retrieved_context.strip()
        )
    elif use_context:
        ctx = _load_context(max_context_chars)
        if ctx:
            parts.append(
                "Knowledge Base (full corpus, use this to answer):\n" + ctx
            )

    return "\n\n".join(p for p in parts if p)

