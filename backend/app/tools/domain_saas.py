"""Pluggable Domain Suite: SaaS Catalog & Cart Tools.

These 11 tools provide e-commerce and SaaS product capabilities (cart math,
pricing, annual discounts, tier lookups). They are registered into the tool
registry as a modular domain extension.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.tools.registry import ToolRegistry, ToolSpec


def get_saas_tools() -> list["ToolSpec"]:
    """Returns the list of ToolSpec items for the SaaS catalog domain."""
    from app.tools import handlers as H
    from app.tools.registry import ToolSpec, _schema, _NONE

    return [
        ToolSpec("add_to_cart",
                 "Add a product (and optional tier + seat count) to the cart.",
                 _schema({"product": {"type": "string", "description": "Product name or id, e.g. 'CRM Pro' or 'crm'."},
                          "tier": {"type": "string", "description": "Tier name like Starter/Professional. Optional."},
                          "seats": {"type": "integer", "description": "Number of seats. Default 1."}},
                         ["product"]),
                 H.add_to_cart, True),
        ToolSpec("cart_total", "Get the cart's current monthly total and line items.",
                 _NONE, H.cart_total, True),
        ToolSpec("annual_pricing", "Compute the cart's price billed annually.",
                 _NONE, H.annual_pricing, True),
        ToolSpec("savings_annual_vs_monthly",
                 "Compute rupee and percentage savings of paying annually vs monthly for the cart.",
                 _NONE, H.savings_annual_vs_monthly, True),
        ToolSpec("sort_products", "Sort all products by starting price.",
                 _schema({"order": {"type": "string", "enum": ["asc", "desc"],
                                    "description": "asc = increasing, desc = decreasing."}}),
                 H.sort_products, False),
        ToolSpec("top_k_expensive", "Get the top-k most expensive products by starting price.",
                 _schema({"k": {"type": "integer", "description": "How many products. Default 5."}}),
                 H.top_k_expensive, False),
        ToolSpec("remove_item", "Remove a single product line from the cart.",
                 _schema({"product": {"type": "string"}, "tier": {"type": "string"}}, ["product"]),
                 H.remove_item, True),
        ToolSpec("checkout_item", "Check out a single product line from the cart.",
                 _schema({"product": {"type": "string"}, "tier": {"type": "string"}}, ["product"]),
                 H.checkout_item, True),
        ToolSpec("clear_cart", "Remove all items from the cart.", _NONE, H.clear_cart, True),
        ToolSpec("checkout", "Check out the entire cart.", _NONE, H.checkout, True),
        ToolSpec("product_info", "Look up a product's tiers, prices, and details.",
                 _schema({"product": {"type": "string"}}, ["product"]),
                 H.product_info, False),
    ]


def register_domain(registry: "ToolRegistry") -> None:
    """Register all SaaS tools into the provided registry instance."""
    for tool in get_saas_tools():
        registry.register(tool)
