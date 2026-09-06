"""Pluggable Domain Suite: Bhukkad Food Ordering & Delivery Tools.

These 11 tools provide complete voice-driven food ordering capabilities:
menu browsing, dietary filtering, cart management, coupon discounts,
allergen lookups, checkout, and live order tracking.
"""
from __future__ import annotations

import random
import time
import urllib.parse
from typing import TYPE_CHECKING, Any

from app.tools import cart_store as cart
from app.tools import catalog_data as cat

if TYPE_CHECKING:
    from app.tools.registry import ToolRegistry, ToolSpec


def _money(v: float) -> str:
    return f"₹{v:.0f}" if v == int(v) else f"₹{v:.2f}"


def _compute_bill(items: list[dict], coupon_code: str | None = None, tip: float = 0.0) -> dict:
    subtotal = sum(i["price"] * i.get("quantity", i.get("seats", 1)) for i in items)
    discount = 0.0
    discount_msg = ""

    # Coupon math
    if coupon_code:
        code = coupon_code.upper().strip()
        if code in ("BHUKKAD50", "BITE50"):
            if subtotal >= 300.0:
                discount = min(500.0, subtotal * 0.5)
                discount_msg = f"Applied 50% discount (-{_money(discount)}) via {code}."
            else:
                discount_msg = f"Coupon {code} requires min order of ₹300 (Current: {_money(subtotal)})."
        elif code == "PARTY20":
            if subtotal >= 1000.0:
                discount = min(1500.0, subtotal * 0.2)
                discount_msg = f"Applied 20% discount (-{_money(discount)}) via PARTY20."
            else:
                discount_msg = f"Coupon PARTY20 requires min order of ₹1000 (Current: {_money(subtotal)})."
        elif code == "FREEDEL":
            discount_msg = "Applied FREE delivery via FREEDEL."

    delivery_fee = 0.0 if (subtotal >= 500.0 or (coupon_code and coupon_code.upper().strip() == "FREEDEL")) else 40.0
    taxes = round((subtotal - discount) * 0.05, 2)
    grand_total = max(0.0, subtotal - discount + delivery_fee + taxes + tip)

    return {
        "subtotal": round(subtotal, 2),
        "discount": round(discount, 2),
        "coupon_code": coupon_code,
        "coupon_message": discount_msg,
        "delivery_fee": round(delivery_fee, 2),
        "taxes": taxes,
        "tip": round(tip, 2),
        "grand_total": round(grand_total, 2),
    }


# ---- Handler 1: Add to Cart ----
def add_to_cart(session_id: str, product: str, tier: str | None = None, seats: int = 1, customization: str = "") -> dict:
    p = cat.resolve_product(product)
    if not p:
        return {"error": f"Could not find dish '{product}' in our menu."}
    
    t = cat.resolve_tier(p, tier) if tier else p.get("tiers", [{}])[0]
    tier_name = t["name"] if t else "Standard"
    price = float(t.get("priceMonthly") or 0.0) if t else float(p.get("tiers", [{}])[0].get("priceMonthly", 0.0))
    qty = max(1, int(seats or 1))

    item = {
        "product_id": p["id"],
        "product_name": p["name"],
        "tier": tier_name,
        "price": price,
        "price_monthly": price,
        "is_veg": p.get("is_veg", True),
        "customization": customization.strip(),
    }
    cart.add(session_id, item, qty, customization)
    
    items = cart.get(session_id)
    coupon = cart.get_coupon(session_id)
    bill = _compute_bill(items, coupon)

    diet = "🟢 Veg" if p.get("is_veg") else "🔴 Non-Veg"
    cust_str = f" with {customization}" if customization else ""
    return {
        "added": {
            "id": p["id"],
            "name": p["name"],
            "item": p["name"],
            "tier": tier_name,
            "portion": tier_name,
            "price": price,
            "quantity": qty,
            "customization": customization,
            "is_veg": p.get("is_veg", True),
            "image": p.get("image", ""),
        },
        "cart_count": sum(i.get("quantity", i.get("seats", 1)) for i in items),
        "subtotal": bill["subtotal"],
        "grand_total": bill["grand_total"],
        "message": f"Added {qty}x {p['name']} ({tier_name}{cust_str}) to your cart [{diet}]. Current cart total is {_money(bill['grand_total'])}.",
    }


# ---- Handler 2: View Cart ----
def view_cart(session_id: str) -> dict:
    items = cart.get(session_id)
    if not items:
        return {"empty": True, "items": [], "grand_total": 0.0, "message": "Your Bhukkad food cart is empty! What would you like to order today?"}
    
    coupon = cart.get_coupon(session_id)
    bill = _compute_bill(items, coupon)
    
    lines = []
    for it in items:
        q = it.get("quantity", it.get("seats", 1))
        diet = "🟢" if it.get("is_veg") else "🔴"
        cust = f" ({it['customization']})" if it.get("customization") else ""
        lines.append(f"- {q}x {it['product_name']} [{it.get('tier', 'Regular')}]{cust}: {_money(it['price'] * q)} {diet}")

    summary = (
        f"Cart Summary ({len(items)} item(s)):\n" +
        "\n".join(lines) +
        f"\nSubtotal: {_money(bill['subtotal'])}" +
        (f"\nDiscount ({coupon}): -{_money(bill['discount'])}" if bill['discount'] else "") +
        f"\nDelivery Fee: {_money(bill['delivery_fee'])}" +
        f"\nTaxes: {_money(bill['taxes'])}" +
        f"\n👉 Grand Total: {_money(bill['grand_total'])}"
    )
    return {"items": items, "bill": bill, "message": summary}


# ---- Handler 3: Apply Coupon ----
def apply_coupon(session_id: str, coupon_code: str) -> dict:
    code = coupon_code.upper().strip()
    valid_codes = ["BHUKKAD50", "BITE50", "PARTY20", "FREEDEL"]
    if code not in valid_codes:
        return {"error": f"Invalid coupon code '{code}'. Active coupons are BHUKKAD50 (50% off, min ₹300), PARTY20 (20% off, min ₹1000), and FREEDEL (Free delivery)."}
    
    items = cart.get(session_id)
    if not items:
        return {"error": "Your cart is empty. Please add dishes to your cart before applying a coupon."}
    
    bill = _compute_bill(items, code)
    if bill["discount"] <= 0 and code != "FREEDEL":
        return {
            "error": bill["coupon_message"] or f"Coupon {code} could not be applied due to minimum order requirement.",
            "subtotal": bill["subtotal"],
            "grand_total": bill["grand_total"],
        }

    cart.set_coupon(session_id, code)
    return {
        "coupon_code": code,
        "discount": bill["discount"],
        "grand_total": bill["grand_total"],
        "message": f"🎉 Coupon {code} applied successfully! {bill['coupon_message']} New total: {_money(bill['grand_total'])}.",
    }


# ---- Handler 4: Filter Menu by Diet & Category ----
def filter_menu(category: str | None = None, is_veg: bool | None = None, max_price: float | None = None) -> dict:
    catalog = cat.load_catalog()
    products = catalog.get("products", [])
    
    filtered = []
    for p in products:
        if is_veg is not None and p.get("is_veg") != is_veg:
            continue
        if category:
            cat_match = (category.lower() in p.get("category", "").lower() or
                         category.lower() in p.get("categoryId", "").lower() or
                         category.lower() in p.get("name", "").lower())
            if not cat_match:
                continue
        first_price = float(p.get("tiers", [{}])[0].get("priceMonthly", 0.0))
        if max_price is not None and first_price > max_price:
            continue
        filtered.append(p)

    results = []
    for p in filtered:
        diet = "🟢 Veg" if p.get("is_veg") else "🔴 Non-Veg"
        t = p.get("tiers", [{}])[0]
        results.append(f"{p['name']} ({diet}) - from {_money(float(t.get('priceMonthly', 0)))} (⭐ {p.get('rating', 4.8)})")

    return {
        "count": len(filtered),
        "dishes": results,
        "message": f"Found {len(filtered)} dishes matching your criteria:\n" + "\n".join(f"- {d}" for d in results[:8]),
    }


# ---- Handler 5: Item Details & Allergens ----
def item_details(product: str) -> dict:
    p = cat.resolve_product(product)
    if not p:
        return {"error": f"Item '{product}' not found in the menu."}
    
    allergens = p.get("allergens") or []
    allergen_str = ", ".join(allergens) if allergens else "None (Allergen-free)"
    diet = "🟢 100% Vegetarian" if p.get("is_veg") else "🔴 Non-Vegetarian (100% Halal Chicken)"
    
    sizes = []
    for t in p.get("tiers", []):
        sizes.append(f"{t.get('name')}: {_money(float(t.get('priceMonthly', 0)))}")

    msg = (
        f"🍽️ {p['name']} ({diet})\n"
        f"⭐ Rating: {p.get('rating', 4.8)}/5.0 | 🔥 Calories: {p.get('calories', 'N/A')} | ⏱️ Prep Time: {p.get('prepTimeMins', 20)} mins\n"
        f"📝 Description: {p.get('description')}\n"
        f"⚠️ Allergens: {allergen_str}\n"
        f"💰 Portions & Prices: {', '.join(sizes)}"
    )
    return {"item": p, "allergens": allergens, "message": msg}


# ---- Handler 6: Calculate Bill ----
def calculate_bill(session_id: str, tip: float = 0.0) -> dict:
    items = cart.get(session_id)
    if not items:
        return {"empty": True, "message": "Your cart is empty. Add some delicious dishes first!"}
    
    coupon = cart.get_coupon(session_id)
    bill = _compute_bill(items, coupon, tip)
    return {
        "bill": bill,
        "message": f"Bill breakdown: Subtotal {_money(bill['subtotal'])} + Delivery {_money(bill['delivery_fee'])} + Taxes {_money(bill['taxes'])} + Tip {_money(bill['tip'])} - Discount {_money(bill['discount'])} = Grand Total {_money(bill['grand_total'])}.",
    }


# ---- Handler 7: Remove Item from Cart ----
def remove_from_cart(session_id: str, product: str, tier: str | None = None, quantity: int | None = None) -> dict:
    p = cat.resolve_product(product)
    if not p:
        return {"error": f"No item matches '{product}' in cart."}
    
    idx = cart.find_index(session_id, p["id"], tier)
    if idx is None:
        return {"error": f"'{p['name']}' is not in your cart."}
    
    items = cart.get(session_id)
    current_qty = items[idx].get("quantity", items[idx].get("seats", 1))

    if quantity is not None and quantity > 0 and quantity < current_qty:
        # Partial decrement
        remaining_qty = current_qty - quantity
        items[idx]["quantity"] = remaining_qty
        items[idx]["seats"] = remaining_qty
        cart._set(session_id, items)
        coupon = cart.get_coupon(session_id)
        bill = _compute_bill(items, coupon)
        return {
            "removed_count": quantity,
            "remaining_quantity": remaining_qty,
            "cart_count": sum(i.get("quantity", 1) for i in items),
            "grand_total": bill["grand_total"],
            "message": f"Removed {quantity}x {items[idx]['product_name']}. Remaining quantity: {remaining_qty}. Updated total: {_money(bill['grand_total'])}.",
        }
    else:
        # Full line removal
        removed, remaining = cart.remove_at(session_id, idx)
        coupon = cart.get_coupon(session_id)
        bill = _compute_bill(remaining, coupon)
        return {
            "removed": removed,
            "cart_count": sum(i.get("quantity", 1) for i in remaining),
            "grand_total": bill["grand_total"],
            "message": f"Removed {removed['product_name']} from your cart. Updated total: {_money(bill['grand_total'])}.",
        }


def build_whatsapp_receipt_url(order_data: dict, phone: str = "") -> str:
    order_id = order_data.get("order_id", "BK-00000")
    address = order_data.get("address", "Home Address")
    eta = order_data.get("eta_mins", 28)
    bill = order_data.get("bill", {})
    grand_total = bill.get("grand_total", order_data.get("grand_total", 0))
    items = order_data.get("items", [])

    items_summary = []
    for it in items:
        name = it.get("product_name") or it.get("name") or it.get("product") or "Item"
        qty = it.get("quantity") or it.get("seats") or 1
        tier = it.get("tier")
        tier_str = f" ({tier})" if tier and tier not in ("Standard", "Regular") else ""
        items_summary.append(f"* {qty}x {name}{tier_str}")

    items_text = "\n".join(items_summary) if items_summary else "* Food items"

    receipt_text = (
        f"BHUKKAD FOOD ORDER RECEIPT\n"
        f"===========================\n"
        f"Order ID: #{order_id}\n"
        f"Status: Confirmed & In Kitchen\n"
        f"---------------------------\n"
        f"Items Ordered:\n"
        f"{items_text}\n"
        f"---------------------------\n"
        f"Total Amount: Rs. {grand_total}\n"
        f"Delivery Address: {address}\n"
        f"Estimated Time: ~{eta} mins\n"
        f"---------------------------\n"
        f"Track live: http://localhost:8100/checkout.html\n"
        f"Thank you for ordering with Bhukkad!"
    )
    encoded = urllib.parse.quote(receipt_text)
    phone_clean = "".join(c for c in phone if c.isdigit())
    if phone_clean:
        return f"https://api.whatsapp.com/send?phone={phone_clean}&text={encoded}"
    return f"https://api.whatsapp.com/send?text={encoded}"


# ---- Handler 8: Checkout & Place Order ----
def checkout(session_id: str, delivery_address: str = "Home Address", payment_method: str = "Cash on Delivery / UPI") -> dict:
    items = cart.get(session_id)
    if not items:
        return {"error": "Your cart is empty; nothing to order. Add some dishes first!"}
    
    coupon = cart.get_coupon(session_id)
    bill = _compute_bill(items, coupon)
    
    order_num = random.randint(10000, 99999)
    order_id = f"BK-{order_num}"
    
    order_data = {
        "order_id": order_id,
        "session_id": session_id,
        "items": items,
        "bill": bill,
        "address": delivery_address,
        "payment": payment_method,
        "timestamp": time.time(),
        "status": "Preparing in Kitchen (Chef Vikram)",
        "eta_mins": 28,
    }
    whatsapp_url = build_whatsapp_receipt_url(order_data)
    order_data["whatsapp_url"] = whatsapp_url
    cart.save_order(order_id, order_data)
    cart.clear(session_id)
    
    return {
        "order_id": order_id,
        "items": items,
        "bill": bill,
        "address": delivery_address,
        "grand_total": bill["grand_total"],
        "eta": "28-30 mins",
        "whatsapp_url": whatsapp_url,
        "message": (
            f"Order #{order_id} confirm ho gaya hai! Total {_money(bill['grand_total'])}. "
            f"Food fresh prepare ho raha hai aur '{delivery_address}' par lagbhag 28-30 mins mein deliver ho jayega. "
            f"Aapka order confirm ho gaya hai, kya aap receipt WhatsApp par lena chahte hain?"
        ),
    }


# ---- Handler 8b: Send WhatsApp Receipt ----
def send_whatsapp_receipt(session_id: str, order_id: str | None = None, phone_number: str = "") -> dict:
    target_id = (order_id or "").upper().strip() if order_id else None
    order = None
    if target_id:
        order = cart.get_order(target_id)
    if not order:
        order = cart.get_latest_order(session_id)
    if not order:
        return {"error": "Koi active order nahi mila jiska receipt generate kiya ja sake."}

    whatsapp_url = build_whatsapp_receipt_url(order, phone_number)
    oid = order.get("order_id", "BK-00000")
    return {
        "order_id": oid,
        "whatsapp_url": whatsapp_url,
        "message": f"Order #{oid} ka WhatsApp receipt link ready hai! Niche diye gaye button par click karke WhatsApp par receipt open kar sakte hain.",
    }


# ---- Handler 9: Track Live Order ----
def track_order(order_id: str | None = None) -> dict:
    if not order_id:
        return {
            "error": "Please specify the Order ID to track (e.g., 'track order BK-72419').",
        }
    
    cleaned = order_id.upper().strip()
    order = cart.get_order(cleaned)
    if not order:
        return {
            "error": f"Order #{cleaned} was not found in active orders. Please check your order ID.",
        }
    
    return {
        "order_id": order["order_id"],
        "status": order["status"],
        "eta": f"{order['eta_mins']} mins",
        "message": f"Order #{order['order_id']} is active: {order['status']}. Estimated arrival in {order['eta_mins']} minutes to '{order.get('address', 'your address')}'.",
    }


# ---- Handler 10: Clear Cart ----
def clear_cart(session_id: str) -> dict:
    cart.clear(session_id)
    return {"status": "cleared", "message": "Your Bhukkad cart has been cleared."}


# ---- Handler 11: Recommend Combos ----
def recommend_combos() -> dict:
    combos = [
        "🍕 Game Night Combo (₹1899): 1 Medium Pizza + 6 Peri-Peri Wings + 2 Cold Coffees (Save 25%)",
        "🍛 Biryani Feast Combo (₹1449): Hyderabadi Chicken Biryani + Garlic Bread + Choco Lava Cake",
        "🍔 All-American Meal (₹1299): BBQ Chicken Burger + Loaded Peri-Peri Fries + Belgian Chocolate Shake",
    ]
    return {
        "combos": combos,
        "message": "Here are our top money-saving meal combos:\n" + "\n".join(f"- {c}" for c in combos),
    }


def get_food_tools() -> list["ToolSpec"]:
    """Returns the list of ToolSpec items for Bhukkad food delivery."""
    from app.tools.registry import ToolSpec, _schema, _NONE

    return [
        ToolSpec("add_to_cart",
                 "Add a food dish (with size, quantity, and custom instructions) to the cart.",
                 _schema({
                     "product": {"type": "string", "description": "Dish name, e.g. 'Farmhouse Pizza' or 'Chicken Biryani'."},
                     "tier": {"type": "string", "description": "Portion size, e.g. 'Regular', 'Medium', 'Large'. Optional."},
                     "seats": {"type": "integer", "description": "Quantity to order (default 1)."},
                     "customization": {"type": "string", "description": "Special request like 'Extra cheese', 'Less spicy', 'No onions'."},
                 }, ["product"]),
                 add_to_cart, True),

        ToolSpec("view_cart",
                 "View the user's food cart items, subtotal, discounts, and total bill.",
                 _NONE, view_cart, True),

        ToolSpec("apply_coupon",
                 "Apply a promotional discount coupon code (e.g. 'BHUKKAD50', 'PARTY20', 'FREEDEL').",
                 _schema({"coupon_code": {"type": "string", "description": "Promo code to apply."}}, ["coupon_code"]),
                 apply_coupon, True),

        ToolSpec("filter_menu",
                 "Filter food menu by dietary preference (veg/non-veg), category, or budget.",
                 _schema({
                     "category": {"type": "string", "description": "Category like 'Pizzas', 'Biryani', 'Burgers', 'Desserts'."},
                     "is_veg": {"type": "boolean", "description": "True for 100% vegetarian dishes only."},
                     "max_price": {"type": "number", "description": "Max price limit in rupees."},
                 }),
                 filter_menu, False),

        ToolSpec("item_details",
                 "Get complete dish details, rating, prep time, calories, and allergen warnings.",
                 _schema({"product": {"type": "string", "description": "Dish name to look up."}}, ["product"]),
                 item_details, False),

        ToolSpec("calculate_bill",
                 "Compute detailed breakdown of cart total, taxes, delivery fee, and optional tip.",
                 _schema({"tip": {"type": "number", "description": "Optional rider tip in rupees."}}),
                 calculate_bill, True),

        ToolSpec("remove_from_cart",
                 "Remove or decrement a dish from the food cart.",
                 _schema({
                     "product": {"type": "string", "description": "Dish name to remove."},
                     "tier": {"type": "string", "description": "Portion size."},
                     "quantity": {"type": "integer", "description": "Number of items to remove. Optional (removes all if omitted)."},
                 }, ["product"]),
                 remove_from_cart, True),

        ToolSpec("checkout",
                 "Place the food delivery order and receive order confirmation and ETA.",
                 _schema({
                     "delivery_address": {"type": "string", "description": "Delivery address or room number."},
                     "payment_method": {"type": "string", "description": "Payment mode like 'UPI', 'Cash on Delivery', 'Card'."},
                 }),
                 checkout, True),

        ToolSpec("send_whatsapp_receipt",
                 "Generate or send a WhatsApp receipt link for an order.",
                 _schema({
                     "order_id": {"type": "string", "description": "Optional Order ID like 'BK-12345'. Defaults to the latest placed order."},
                     "phone_number": {"type": "string", "description": "Optional phone number with country code."},
                 }),
                 send_whatsapp_receipt, True),

        ToolSpec("track_order",
                 "Track real-time kitchen preparation and rider status for an order ID.",
                 _schema({"order_id": {"type": "string", "description": "Order ID like 'BD-12345'."}}, ["order_id"]),
                 track_order, False),

        ToolSpec("clear_cart",
                 "Remove all items from the food cart.",
                 _NONE, clear_cart, True),

        ToolSpec("recommend_combos",
                 "Get recommended money-saving curated meal combos.",
                 _NONE, recommend_combos, False),
    ]



def register_domain(registry: "ToolRegistry") -> None:
    """Register all Bhukkad food delivery tools into the registry."""
    for tool in get_food_tools():
        registry.register(tool)
