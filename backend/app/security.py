"""Security & rate-limiting middleware and auth utilities for Bhukkad.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict
from typing import NamedTuple

from fastapi import HTTPException, Request, status


class RateLimitRecord(NamedTuple):
    timestamps: list[float]


class RateLimiter:
    """In-memory sliding window rate limiter per client IP."""

    def __init__(self, max_requests: int = 40, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._records: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_ip: str) -> tuple[bool, int]:
        now = time.time()
        window_start = now - self.window_seconds
        # Evict old entries
        valid = [ts for ts in self._records[client_ip] if ts > window_start]
        self._records[client_ip] = valid

        if len(valid) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - valid[0])) + 1
            return False, max(1, retry_after)

        self._records[client_ip].append(now)
        return True, 0


# Default rate limiter instances
api_limiter = RateLimiter(max_requests=45, window_seconds=60)
admin_limiter = RateLimiter(max_requests=10, window_seconds=60)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def check_rate_limit(request: Request, limiter: RateLimiter = api_limiter) -> None:
    ip = get_client_ip(request)
    allowed, retry_after = limiter.is_allowed(ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


def verify_admin_auth(request: Request) -> None:
    """Verifies that the request carries a valid admin key or is local."""
    admin_key = os.getenv("ADMIN_API_KEY", "").strip()
    provided_key = (
        request.headers.get("X-Admin-Key")
        or request.headers.get("x-admin-key")
        or ""
    ).strip()

    if admin_key:
        if provided_key != admin_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing X-Admin-Key.",
            )
    else:
        # If no ADMIN_API_KEY is configured in env, allow localhost only or test clients
        ip = get_client_ip(request)
        if ip not in ("127.0.0.1", "::1", "localhost", "testclient"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin endpoints are restricted to localhost unless ADMIN_API_KEY is set.",
            )
