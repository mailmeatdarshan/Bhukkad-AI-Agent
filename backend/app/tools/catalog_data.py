"""Read-only catalog access + product/tier resolution for the tools.

Prices come straight from catalog.json tiers. The "starting price" of a product
is its lowest paid tier monthly price (matching pricing.md), used for sorting and
top-k. All functions are pure and return new data.
"""
from __future__ import annotations

import json
from functools import lru_cache

from app import config


@lru_cache(maxsize=1)
def _catalog() -> dict:
    if not config.CATALOG_PATH.exists():
        return {"products": [], "categories": []}
    try:
        with config.CATALOG_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {"products": [], "categories": []}


def load_catalog() -> dict:
    return _catalog()


def products() -> list[dict]:
    return list(_catalog().get("products", []))


def _norm(s: str) -> str:
    return "".join(c for c in (s or "").lower() if c.isalnum())


def resolve_product(query: str) -> dict | None:
    """Match a product by id, exact name, token match, or substring."""
    if not query:
        return None
    q = _norm(query)
    prods = products()
    # 1. Exact id or exact name match
    for p in prods:
        if _norm(p.get("id", "")) == q or _norm(p.get("name", "")) == q:
            return p

    # 2. Substring match
    for p in prods:
        name = _norm(p.get("name", ""))
        pid = _norm(p.get("id", ""))
        if (q and (q in name or q in pid)) or (name and name in q):
            return p

    # 3. Token-based word overlap
    q_words = set(query.lower().split())
    best_match = None
    best_score = 0
    for p in prods:
        p_words = set(p.get("name", "").lower().split()) | {p.get("id", "").lower()}
        overlap = len(q_words & p_words)
        if overlap > best_score:
            best_score = overlap
            best_match = p

    if best_score > 0:
        return best_match

    return None


def starting_tier(product: dict) -> dict | None:
    paid = [t for t in product.get("tiers", []) if (t.get("priceMonthly") or 0) > 0]
    if paid:
        return min(paid, key=lambda t: t.get("priceMonthly", 0))
    tiers = product.get("tiers", [])
    return tiers[0] if tiers else None


def starting_price(product: dict) -> float:
    t = starting_tier(product)
    return float(t.get("priceMonthly", 0)) if t else 0.0


def resolve_tier(product: dict, tier_name: str | None) -> dict | None:
    tiers = product.get("tiers", [])
    if not tiers:
        return None
    if not tier_name:
        return starting_tier(product)
    tn = _norm(tier_name)
    for t in tiers:
        if _norm(t.get("name", "")) == tn:
            return t
    for t in tiers:
        if tn and tn in _norm(t.get("name", "")):
            return t
    return None


def product_summary(product: dict) -> dict:
    """Compact, JSON-safe view of a product for tool results."""
    return {
        "id": product["id"],
        "name": product["name"],
        "category": product.get("category"),
        "starting_price_monthly": starting_price(product),
        "tiers": [
            {
                "name": t.get("name"),
                "monthly": float(t.get("priceMonthly") or 0),
                "annual_monthly": float(t.get("priceAnnualMonthly") or t.get("priceMonthly") or 0),
                "unit": t.get("unit"),
            }
            for t in product.get("tiers", [])
        ],
    }
