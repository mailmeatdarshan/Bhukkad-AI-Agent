"""Pure markdown renderers: catalog data in -> markdown string out for Bhukkad Food Delivery.
"""
from __future__ import annotations

from typing import Any


def _money(v: Any) -> str:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return str(v)
    return f"₹{int(n)}" if n == int(n) else f"₹{n:.2f}"


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {i}" for i in items)


def render_company(company: dict) -> str:
    lines = [f"# {company.get('name', 'Bhukkad')} (Company Overview)", ""]
    if company.get("legalName"):
        lines.append(f"**Legal name:** {company['legalName']}  ")
    if company.get("tagline"):
        lines.append(f"**Tagline:** {company['tagline']}  ")
    if company.get("founded"):
        lines.append(f"**Founded:** {company['founded']}  ")
    if company.get("hq"):
        lines.append(f"**HQ:** {company['hq']}  ")
    lines.append("")
    for key in ("about", "mission"):
        if company.get(key):
            lines += [f"## {key.title()}", company[key], ""]
    stats = company.get("stats") or {}
    if stats:
        lines.append("## Kitchen Network & Delivery Stats")
        lines += [f"- **{k}:** {v}" for k, v in stats.items()]
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def render_families(categories: list[dict], products: list[dict]) -> str:
    lines = ["# Bhukkad Food Menu Categories", ""]
    by_cat: dict[str, list[str]] = {}
    for p in products:
        diet = "🟢 [Veg]" if p.get("is_veg") else "🔴 [Non-Veg]"
        by_cat.setdefault(p.get("categoryId", ""), []).append(f"{p.get('name')} {diet}")
    for c in categories:
        lines.append(f"## {c.get('name')} (`{c.get('id')}`)")
        if c.get("description"):
            lines.append(f"_{c['description']}_\n")
        members = by_cat.get(c.get("id"), [])
        lines.append(_bullets(members) if members else "_No dishes listed._")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _tier_table(tiers: list[dict]) -> str:
    rows = ["| Portion / Size | Price | Serves |", "| --- | --- | --- |"]
    for t in tiers:
        mo = _money(t.get("priceMonthly", 0))
        rows.append(f"| {t.get('name')} | {mo} | {t.get('unit', '1 person')} |")
    return "\n".join(rows)


def render_product(p: dict) -> str:
    diet_tag = "🟢 VEGETARIAN" if p.get("is_veg") else "🔴 NON-VEGETARIAN"
    lines = [f"# {p.get('name')} ({diet_tag})", ""]
    lines.append(f"**Category:** {p.get('category')} (`{p.get('categoryId')}`)  ")
    lines.append(f"**Dish ID:** `{p.get('id')}`  ")
    if p.get("rating"):
        lines.append(f"**Rating:** ⭐ {p['rating']} / 5.0  ")
    if p.get("calories"):
        lines.append(f"**Calories:** 🔥 {p['calories']}  ")
    if p.get("prepTimeMins"):
        lines.append(f"**Preparation Time:** ⏱️ {p['prepTimeMins']} minutes  ")
    lines.append("")
    
    if p.get("allergens") is not None:
        allergens = p.get("allergens")
        allergen_str = ", ".join(allergens) if allergens else "None (Safe/Allergen-Free)"
        lines.append(f"**Allergen Notice:** ⚠️ {allergen_str}")
        lines.append("")

    if p.get("description"):
        lines += ["## Description", p["description"], ""]

    if p.get("tiers"):
        lines += ["## Portion Sizes & Prices", _tier_table(p["tiers"]), ""]

    return "\n".join(lines).strip() + "\n"


def render_pricing(products: list[dict]) -> str:
    lines = [
        "# Bhukkad Menu Price List",
        "",
        "Overview of all dishes and starting prices across categories.",
        "",
        "| Dish Name | Category | Dietary Type | Starting Price |",
        "| --- | --- | --- | --- |",
    ]
    for p in products:
        diet = "Veg 🟢" if p.get("is_veg") else "Non-Veg 🔴"
        tiers = p.get("tiers") or []
        price = _money(tiers[0].get("priceMonthly", 0)) if tiers else "₹0"
        lines.append(f"| {p.get('name')} | {p.get('category')} | {diet} | {price} |")
    lines.append("")
    return "\n".join(lines).strip() + "\n"


def render_monthly_vs_annual(products: list[dict]) -> str:
    # Used for Combo savings & Value deals
    lines = [
        "# Value Deals & Meal Combos",
        "",
        "Save up to 30% with Bhukkad curated value combos and feast bundles.",
        "",
    ]
    combos = [p for p in products if p.get("categoryId") == "combos"]
    for c in combos:
        lines.append(f"## {c.get('name')}")
        lines.append(f"{c.get('description', '')}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def render_faq(products: list[dict]) -> str:
    lines = [
        "# Bhukkad Frequently Asked Questions (FAQ)",
        "",
        "## Delivery & Timings",
        "- **Q: How fast is delivery?**  \nA: Average delivery time is 28–30 minutes across all active delivery zones.",
        "- **Q: Do you deliver late at night?**  \nA: Yes! Bhukkad cloud kitchens operate until 3:00 AM every night.",
        "- **Q: What is the delivery fee?**  \nA: ₹40, or FREE on orders above ₹500, or with coupon `FREEDEL`.",
        "",
        "## Food Quality, Dietary & Refunds",
        "- **Q: What if my food arrives cold or damaged?**  \nA: Bhukkad provides a 100% instant refund or immediate free replacement under our Fresh & Hot Guarantee.",
        "- **Q: Are vegetarian meals prepared separately?**  \nA: Yes, our kitchens have dedicated pure-veg prep stations and cookware.",
        "- **Q: Is the chicken Halal?**  \nA: Yes, 100% certified fresh Halal chicken is used for all non-vegetarian dishes.",
        "",
    ]
    return "\n".join(lines).strip() + "\n"


def render_refund(policies: dict) -> str:
    refund = policies.get("refunds", {})
    lines = [
        "# Bhukkad Fresh Food & Refund Policy",
        "",
        f"- **Cold/Damaged Food Guarantee:** {refund.get('coldFood', '100% instant refund')}",
        f"- **Cancellation Policy:** {refund.get('cancellation', 'Free within 90s')}",
        f"- **Spill-Proof Packaging:** {refund.get('spillGuarantee', 'Tamper-evident packaging')}",
        "",
    ]
    return "\n".join(lines).strip() + "\n"


def render_terms(policies: dict) -> str:
    deliv = policies.get("delivery", {})
    diet = policies.get("dietary", {})
    coupons = policies.get("coupons", [])
    
    lines = [
        "# Bhukkad Terms, Delivery Policies & Active Coupons",
        "",
        "## Delivery Policies & Speed Guarantee",
        f"- **Average Delivery Time:** {deliv.get('avgDeliveryTime', '30 mins')}",
        f"- **Late Delivery Guarantee:** {deliv.get('expressGuarantee', 'Credit if >40 mins')}",
        f"- **Delivery Radius:** {deliv.get('deliveryRadius', '8 km')}",
        f"- **Midnight Delivery:** {deliv.get('midnightService', 'Until 3:00 AM')}",
        f"- **Delivery Fee:** {deliv.get('deliveryFee', '₹40')}",
        "",
        "## Dietary & Allergen Standards",
        f"- **Pure Veg Segregation:** {diet.get('pureVegKitchens', 'Separate cookware')}",
        f"- **Halal Assurance:** {diet.get('halal', '100% Halal certified')}",
        f"- **Allergen Labeling:** {diet.get('allergens', 'Nut/Gluten/Dairy tags')}",
        "",
        "## Active Discount Coupons & Promo Codes",
    ]
    for c in coupons:
        lines.append(f"- **`{c.get('code')}`**: {c.get('description')} (Min order: {_money(c.get('minOrder', 0))})")
    lines.append("")
    return "\n".join(lines).strip() + "\n"
