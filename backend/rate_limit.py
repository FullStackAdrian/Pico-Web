import hashlib
import time
from abc import ABC, abstractmethod
from threading import Lock

from fastapi import Request
from starlette.responses import JSONResponse

LOGIN_LIMIT, LOGIN_WINDOW = 5, 300
REGISTER_LIMIT, REGISTER_WINDOW = 3, 3600
REFRESH_LIMIT, REFRESH_WINDOW = 20, 60
GENERAL_LIMIT, GENERAL_WINDOW = 120, 60
API_KEY_LIMIT, API_KEY_WINDOW = 300, 60

_SKIP_PATHS = {"/api/v1/health"}


class RateLimiter(ABC):
    """Interface for rate limiting. Swap the in-memory implementation for Redis
    without touching any endpoint or dependency."""

    @abstractmethod
    def hit(self, key: str, limit: int, window_seconds: int) -> bool:
        """Record a hit for key. Return True if allowed, False if over limit."""

    @abstractmethod
    def reset(self) -> None:
        """Clear all state (used by tests and health checks)."""


class InMemoryRateLimiter(RateLimiter):
    def __init__(self) -> None:
        self._lock = Lock()
        self._buckets: dict[tuple[str, int, int], list[float]] = {}

    def hit(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        bucket_key = (key, limit, window_seconds)
        with self._lock:
            timestamps = [t for t in self._buckets.get(bucket_key, []) if t > now - window_seconds]
            if len(timestamps) >= limit:
                self._buckets[bucket_key] = timestamps
                return False
            timestamps.append(now)
            self._buckets[bucket_key] = timestamps
            return True

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


rate_limiter = InMemoryRateLimiter()


def _identity(request: Request) -> str:
    api_key = request.headers.get('x-api-key')
    if api_key:
        digest = hashlib.sha256(api_key.encode()).hexdigest()[:16]
        return f"key:{digest}"
    auth = request.headers.get('authorization', '')
    if auth.startswith('Bearer '):
        try:
            from jose import jwt as jose_jwt
            payload = jose_jwt.get_unverified_claims(auth[7:])
            subject = payload.get('sub')
            if subject:
                return f"user:{subject}"
        except Exception:
            pass
    ip = request.client.host if request.client else 'unknown'
    return f"ip:{ip}"


def _rate_limit_response() -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": {"code": "RATE_LIMITED", "message": "Rate limit exceeded"}},
    )


class RateLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if not path.startswith("/api/v1") or path in _SKIP_PATHS:
            await self.app(scope, receive, send)
            return

        raw_headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        client = scope.get("client") or ("unknown", None)
        request = _AsgiRequest(raw_headers, client[0])

        method = scope.get("method", "").upper()
        identity = _identity(request)

        if method == "POST" and path == "/api/v1/auth/login":
            key, limit, window = f"login:{identity}", LOGIN_LIMIT, LOGIN_WINDOW
        elif method == "POST" and path == "/api/v1/auth/register":
            key, limit, window = f"register:{identity}", REGISTER_LIMIT, REGISTER_WINDOW
        elif method == "POST" and path == "/api/v1/auth/refresh":
            key, limit, window = f"refresh:{identity}", REFRESH_LIMIT, REFRESH_WINDOW
        elif raw_headers.get("x-api-key"):
            key, limit, window = f"apikey:{identity}", API_KEY_LIMIT, API_KEY_WINDOW
        else:
            key, limit, window = f"general:{identity}", GENERAL_LIMIT, GENERAL_WINDOW

        if not rate_limiter.hit(key, limit, window):
            response = _rate_limit_response()
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


class _AsgiRequest:
    """Minimal Request stand-in with the headers and ip the identity helper needs."""

    def __init__(self, headers: dict[str, str], host: str):
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.client = type("Client", (), {"host": host})()