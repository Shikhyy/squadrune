"""
middleware/rate_limit.py — Simple in-memory rate limiter

Limits requests per IP per minute. Applies to /runs POST and /verify POST.
Uses a sliding window counter stored in a module-level dict.

Config via env var: RATE_LIMIT_PER_MINUTE (default: 10)
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_MINUTE", "10"))
WINDOW_SECONDS = 60

# ip -> deque of request timestamps within the window
_request_log: dict[str, deque] = defaultdict(deque)

# Endpoints to rate-limit (method, path prefix)
_LIMITED_ROUTES = {
    ("POST", "/runs"),
    ("POST", "/verify"),
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        method = request.method
        path = request.url.path

        # Only apply to limited routes
        is_limited = any(m == method and path.startswith(p) for m, p in _LIMITED_ROUTES)
        if not is_limited:
            return await call_next(request)

        # Identify client by IP (or X-Forwarded-For behind a proxy)
        client_ip = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )

        key = f"{client_ip}:{method}:{path.split('/')[1]}"
        now = time.monotonic()
        window = _request_log[key]

        # Evict timestamps outside the current window
        while window and window[0] < now - WINDOW_SECONDS:
            window.popleft()

        if len(window) >= RATE_LIMIT:
            retry_after = int(WINDOW_SECONDS - (now - window[0])) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Too many requests. Limit: {RATE_LIMIT} per minute.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        window.append(now)
        response = await call_next(request)

        # Add rate limit headers to every response on these routes
        response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT)
        response.headers["X-RateLimit-Remaining"] = str(RATE_LIMIT - len(window))
        response.headers["X-RateLimit-Reset"] = str(int(now + WINDOW_SECONDS))
        return response
