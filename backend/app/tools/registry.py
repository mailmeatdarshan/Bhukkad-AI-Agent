"""Dynamic Tool Registry: JSON-schema specs + extensible dispatch.

Provides a modular ToolRegistry class for registering, introspecting, and
dispatching tools to OpenAI and Gemini LLM provider formats.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.tools import handlers as H


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict          # JSON schema (properties the model fills)
    handler: Callable
    needs_session: bool = False
    category: str = "general" # "general" | "saas" | "custom"


def _schema(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or []}


_NONE = _schema({})


class ToolRegistry:
    """Dynamic container for tool specifications and dispatch logic."""

    def __init__(self):
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        self._tools[spec.name] = spec

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    def get(self, name: str) -> ToolSpec | None:
        return self._tools.get(name)

    def list_tools(self) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "category": t.category,
                "needs_session": t.needs_session,
            }
            for t in self._tools.values()
        ]

    def enabled_specs(self, enabled: list[str] | None = None) -> list[ToolSpec]:
        if enabled is None:
            return list(self._tools.values())
        allow = set(enabled)
        return [t for t in self._tools.values() if t.name in allow]

    @staticmethod
    def openai_schema(specs: list[ToolSpec]) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in specs
        ]

    @staticmethod
    def gemini_schema(specs: list[ToolSpec]) -> list[dict]:
        decls = []
        for t in specs:
            fn = {"name": t.name, "description": t.description}
            if t.parameters.get("properties"):
                fn["parameters"] = t.parameters
            decls.append(fn)
        return [{"function_declarations": decls}]

    def dispatch(self, name: str, args: dict, session_id: str) -> dict:
        spec = self._tools.get(name)
        if not spec:
            return {"error": f"Unknown tool '{name}'."}
        kwargs = dict(args or {})
        try:
            if spec.needs_session:
                return spec.handler(session_id, **kwargs)
            return spec.handler(**kwargs)
        except TypeError as e:
            return {"error": f"Bad arguments for {name}: {e}"}
        except Exception as e:  # never crash the turn on a tool error
            return {"error": f"Tool {name} failed: {e}"}


# ---- Default Global Registry ----
default_registry = ToolRegistry()

# 1. Register General Platform Tools
default_registry.register(
    ToolSpec(
        "get_current_time",
        "Get current UTC date and time.",
        _schema({"timezone": {"type": "string", "description": "Optional timezone identifier. Default UTC."}}),
        H.get_current_time,
        needs_session=False,
        category="general",
    )
)
default_registry.register(
    ToolSpec(
        "calculate_expression",
        "Evaluate a basic arithmetic math expression (e.g. '120 * 12 * 0.8').",
        _schema({"expression": {"type": "string", "description": "The math expression to evaluate."}}, ["expression"]),
        H.calculate_expression,
        needs_session=False,
        category="general",
    )
)

# 2. Register Pluggable Bhukkad Food Ordering Suite
from app.tools import domain_food
domain_food.register_domain(default_registry)



# ---- Module-level Proxy Functions (Backward Compatibility) ----
def register_tool(spec: ToolSpec) -> None:
    default_registry.register(spec)


def list_tools() -> list[dict]:
    return default_registry.list_tools()


def enabled_specs(enabled: list[str] | None = None) -> list[ToolSpec]:
    return default_registry.enabled_specs(enabled)


def openai_schema(specs: list[ToolSpec]) -> list[dict]:
    return ToolRegistry.openai_schema(specs)


def gemini_schema(specs: list[ToolSpec]) -> list[dict]:
    return ToolRegistry.gemini_schema(specs)


def dispatch(name: str, args: dict, session_id: str) -> dict:
    return default_registry.dispatch(name, args, session_id)

