"""Comprehensive test suite for Bhukkad AI Food Delivery Voice Platform.
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.tools import catalog_data as cat
from app.tools import domain_food as food_tools
from app.tools import registry as reg


def test_food_catalog():
    prods = cat.products()
    assert len(prods) >= 20, f"Expected >=20 dishes, got {len(prods)}"
    print(f"✓ Catalog contains {len(prods)} delicious dishes across categories")

    p1 = cat.resolve_product("Farmhouse Pizza")
    assert p1 is not None and "Farmhouse" in p1["name"]
    assert p1["is_veg"] is True
    print(f"✓ Resolved product: {p1['name']} (Veg: {p1['is_veg']})")

    p2 = cat.resolve_product("Chicken Biryani")
    assert p2 is not None and "Biryani" in p2["name"]
    assert p2["is_veg"] is False
    print(f"✓ Resolved product: {p2['name']} (Veg: {p2['is_veg']})")


def test_food_tools():
    session_id = "test-food-session-123"

    # 1. Clear cart
    reg.dispatch("clear_cart", {}, session_id)

    # 2. Add Farmhouse Pizza (Medium)
    res_add1 = reg.dispatch("add_to_cart", {
        "product": "Farmhouse Supreme Pizza",
        "tier": "Medium (10 inch)",
        "seats": 2,
        "customization": "Extra mozzarella cheese"
    }, session_id)
    assert "Added" in res_add1.get("message", "")
    print(f"✓ add_to_cart (1): {res_add1['message']}")

    # 3. Add Chicken Dum Biryani
    res_add2 = reg.dispatch("add_to_cart", {
        "product": "Chicken Dum Biryani",
        "seats": 1,
        "customization": "Less spicy, extra raita"
    }, session_id)
    assert "Added" in res_add2.get("message", "")
    print(f"✓ add_to_cart (2): {res_add2['message']}")

    # 4. View Cart
    res_view = reg.dispatch("view_cart", {}, session_id)
    assert len(res_view["items"]) == 2
    print(f"✓ view_cart returned {len(res_view['items'])} items")

    # 5. Apply Coupon BHUKKAD50
    res_coupon = reg.dispatch("apply_coupon", {"coupon_code": "BHUKKAD50"}, session_id)
    assert res_coupon.get("discount", 0) > 0
    print(f"✓ apply_coupon (BHUKKAD50): {res_coupon['message']}")

    # 6. Filter Menu
    res_filter = reg.dispatch("filter_menu", {"is_veg": True, "category": "Pizzas"}, session_id)
    assert res_filter.get("count", 0) >= 1
    print(f"✓ filter_menu: {res_filter['message']}")

    # 7. Item Details & Allergens
    res_details = reg.dispatch("item_details", {"product": "Choco Lava Cake"}, session_id)
    assert "Molten Choco Lava Cake" in res_details.get("message", "")
    print(f"✓ item_details: {res_details['message'][:90]}...")

    # 8. Calculate Bill
    res_bill = reg.dispatch("calculate_bill", {"tip": 2.50}, session_id)
    assert res_bill["bill"]["tip"] == 2.50
    print(f"✓ calculate_bill: {res_bill['message']}")

    # 9. Checkout & Place Order
    res_checkout = reg.dispatch("checkout", {
        "delivery_address": "Flat 402, Sunshine Heights, Koramangala",
        "payment_method": "UPI"
    }, session_id)
    order_id = res_checkout.get("order_id")
    assert order_id is not None and order_id.startswith("BK-")
    print(f"✓ checkout placed order: {order_id}")

    # 10. Track Order
    res_track = reg.dispatch("track_order", {"order_id": order_id}, session_id)
    assert "active" in res_track.get("message", "").lower() or "prepared" in res_track.get("message", "").lower()
    print(f"✓ track_order: {res_track['message']}")


def test_food_websocket():
    client = TestClient(app)
    with client.websocket_connect("/ws/voice") as ws:
        ready = ws.receive_json()
        assert ready.get("type") == "ready"
        print("✓ Connected to Bhukkad WebSocket Voice stream")

        # Session init with food configuration
        ws.send_json({
            "type": "init",
            "config": {
                "model_key": "openai-lite",
                "tts_provider": "openai",
                "tts_voice": "alloy",
                "use_rag": True,
                "tools_enabled": True,
            }
        })
        ready_conf = ws.receive_json()
        assert ready_conf.get("type") == "ready"
        print("✓ Initialized Bhukkad voice session with food tools & RAG")


if __name__ == "__main__":
    print("\n--- Running Bhukkad Food Delivery Voice AI Tests ---\n")
    test_food_catalog()
    test_food_tools()
    test_food_websocket()
    print("\n--- ALL BHUKKAD FOOD TESTS PASSED! ---\n")
