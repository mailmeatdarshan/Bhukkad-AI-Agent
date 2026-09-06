"""In-memory per-session cart and orders store for Bhukkad Food Delivery.
"""
from __future__ import annotations

from collections import OrderedDict

MAX_STORE_SESSIONS = 500
MAX_STORE_ORDERS = 500

_carts: OrderedDict[str, list[dict]] = OrderedDict()
_coupons: OrderedDict[str, str] = OrderedDict()
_orders: OrderedDict[str, dict] = OrderedDict()


def _evict_carts() -> None:
    while len(_carts) > MAX_STORE_SESSIONS:
        oldest, _ = _carts.popitem(last=False)
        _coupons.pop(oldest, None)


def _evict_orders() -> None:
    while len(_orders) > MAX_STORE_ORDERS:
        _orders.popitem(last=False)


def get(session_id: str) -> list[dict]:
    if session_id in _carts:
        _carts.move_to_end(session_id)
        return list(_carts[session_id])
    return []


def _set(session_id: str, items: list[dict]) -> list[dict]:
    _carts[session_id] = items
    _carts.move_to_end(session_id)
    _evict_carts()
    return list(items)


def clear(session_id: str) -> list[dict]:
    _coupons.pop(session_id, None)
    return _set(session_id, [])


def add(session_id: str, item: dict, quantity: int = 1, customization: str = "") -> list[dict]:
    items = get(session_id)
    cust = customization or item.get("customization", "")
    idx = next(
        (i for i, it in enumerate(items)
         if it["product_id"] == item["product_id"] and it.get("tier") == item.get("tier") and it.get("customization", "") == cust),
        None,
    )
    if idx is None:
        new_item = {
            "product_id": item["product_id"],
            "product_name": item["product_name"],
            "tier": item.get("tier", "Regular"),
            "price": float(item.get("price") or item.get("price_monthly") or 0),
            "seats": quantity,
            "quantity": quantity,
            "customization": cust,
            "is_veg": item.get("is_veg", True),
        }
        items = items + [new_item]
    else:
        q = items[idx].get("quantity", items[idx].get("seats", 1)) + quantity
        merged = {**items[idx], "quantity": q, "seats": q}
        items = items[:idx] + [merged] + items[idx + 1:]
    return _set(session_id, items)


def find_index(session_id: str, product_id: str, tier: str | None = None) -> int | None:
    items = get(session_id)
    for i, it in enumerate(items):
        if it["product_id"] == product_id and (tier is None or it.get("tier") == tier):
            return i
    return None


def remove_at(session_id: str, idx: int) -> tuple[dict, list[dict]]:
    items = get(session_id)
    removed = items[idx]
    items = items[:idx] + items[idx + 1:]
    _set(session_id, items)
    return removed, items


# ---- Coupon store ----
def get_coupon(session_id: str) -> str | None:
    return _coupons.get(session_id)


def set_coupon(session_id: str, code: str) -> None:
    _coupons[session_id] = code.upper().strip()
    _coupons.move_to_end(session_id)


def clear_coupon(session_id: str) -> None:
    _coupons.pop(session_id, None)


# ---- Order tracking store ----
def save_order(order_id: str, order_data: dict) -> None:
    _orders[order_id] = order_data
    _orders.move_to_end(order_id)
    _evict_orders()


def get_order(order_id: str) -> dict | None:
    if order_id in _orders:
        _orders.move_to_end(order_id)
        return _orders[order_id]
    return None


def get_latest_order(session_id: str | None = None) -> dict | None:
    if not _orders:
        return None
    if session_id:
        for order in reversed(_orders.values()):
            if order.get("session_id") == session_id:
                return order
    return next(reversed(_orders.values()))
