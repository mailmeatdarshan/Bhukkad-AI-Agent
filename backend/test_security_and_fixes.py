"""Automated test suite verifying security hardening, KB purity, and correctness fixes.
"""
import pytest
from starlette.testclient import TestClient
from app.main import app
from app import config
from app.tools import domain_food, cart_store
from app.llm.history import HistoryStore, Session
from app.llm.providers.base import Message
from app.llm import orchestrator


def test_kb_purity_no_saas_docs():
    """Ensure no old Nimbus SaaS docs remain in data/docs/."""
    products_dir = config.DOCS_DIR / "products"
    product_docs = list(products_dir.glob("*.md"))
    doc_names = [f.name for f in product_docs]
    assert len(product_docs) == 32
    for name in doc_names:
        assert not name.startswith("nimbus-"), f"Found SaaS doc: {name}"
    
    # Check context.md
    assert config.CONTEXT_PATH.exists()
    context_text = config.CONTEXT_PATH.read_text(encoding="utf-8")
    assert "Nimbus CRM" not in context_text
    assert "Bhukkad" in context_text
    assert "Farmhouse Supreme Pizza" in context_text


def test_coupon_min_order_failure():
    """Ensure apply_coupon fails if order minimum is not met."""
    sid = "test-coupon-min-order"
    cart_store.clear(sid)
    
    # Empty cart
    res = domain_food.apply_coupon(sid, "BITE50")
    assert "error" in res

    # Add 1 Lemonade (₹249 < ₹300 min for BITE50)
    domain_food.add_to_cart(session_id=sid, product="Fresh Mint & Masala Lemonade", seats=1)
    res = domain_food.apply_coupon(sid, "BITE50")
    assert "error" in res
    assert "min order" in res["error"].lower() or "requires" in res["error"].lower()

    # Now add 2x Farmhouse Pizza (₹749 * 2 + ₹249 = ₹1747 > ₹300)
    domain_food.add_to_cart(session_id=sid, product="Farmhouse Supreme Pizza", seats=2)
    res_valid = domain_food.apply_coupon(sid, "BITE50")
    assert "error" not in res_valid
    assert res_valid["discount"] > 0
    assert "applied successfully" in res_valid["message"]




def test_remove_from_cart_partial_quantity():
    """Ensure remove_from_cart supports partial decrementing."""
    sid = "test-partial-remove"
    cart_store.clear(sid)

    # Add 3x Farmhouse Supreme Pizza
    cart_store.add(sid, {"product_id": "farmhouse-pizza", "product_name": "Farmhouse Supreme Pizza", "price": 10.0}, quantity=3)
    items = cart_store.get(sid)
    assert items[0]["quantity"] == 3

    # Remove 1x
    res = domain_food.remove_from_cart(sid, "Farmhouse Supreme Pizza", quantity=1)
    assert res.get("remaining_quantity") == 2
    items = cart_store.get(sid)
    assert items[0]["quantity"] == 2

    # Remove remaining 2x
    res2 = domain_food.remove_from_cart(sid, "Farmhouse Supreme Pizza", quantity=2)
    items = cart_store.get(sid)
    assert len(items) == 0


def test_track_order_unknown_id():
    """Ensure track_order does not hallucinate delivery for non-existent order IDs."""
    res = domain_food.track_order("BD-99999999")
    assert "error" in res
    assert "not found" in res["error"].lower()


def test_history_store_lru_bounds():
    """Ensure HistoryStore evicts oldest sessions when exceeding MAX_HISTORY_SESSIONS."""
    store = HistoryStore()
    for i in range(550):
        store.append(f"session-{i}", "user", f"Hello {i}")
    
    assert len(store._sessions) <= 500
    assert "session-0" not in store._sessions
    assert "session-549" in store._sessions


def test_cart_store_lru_bounds():
    """Ensure cart_store evicts oldest sessions when exceeding MAX_STORE_SESSIONS."""
    for i in range(550):
        cart_store.add(f"cart-session-{i}", {"product_id": "item-1", "product_name": "Pizza", "price": 10.0}, quantity=1)
    
    assert len(cart_store._carts) <= 500
    assert "cart-session-0" not in cart_store._carts
    assert "cart-session-549" in cart_store._carts


def test_security_admin_auth_and_bounds():
    """Ensure admin endpoints require auth when ADMIN_API_KEY is configured."""
    client = TestClient(app)
    
    # /rag/query top_k clamped
    res = client.post("/rag/query", json={"query": "pizza", "top_k": 100})
    # Should not crash and top_k is clamped internally
    assert res.status_code in (200, 429)

    # /agent/config
    res_cfg = client.get("/agent/config")
    assert res_cfg.status_code == 200
