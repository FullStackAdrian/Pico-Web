import hashlib
import json
import re
from typing import Any

from backend.db import SessionLocal
from backend.models import ApiKey, AuditLog

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# (method, regex) -> action. Path segments after /api/v1 are used.
_ACTION_RULES: list[tuple[str, str, str]] = [
    ("POST", r"^/api/v1/auth/login$", "LOGIN_SUCCESS"),
    ("POST", r"^/api/v1/auth/register$", "USER_REGISTERED"),
    ("POST", r"^/api/v1/auth/refresh$", "TOKEN_REFRESHED"),
    ("POST", r"^/api/v1/auth/logout$", "SESSION_REVOKED"),
    ("POST", r"^/api/v1/auth/sessions/revoke-all$", "SESSION_REVOKED"),
    ("DELETE", r"^/api/v1/auth/sessions/[^/]+$", "SESSION_REVOKED"),
    ("POST", r"^/api/v1/api-keys$", "API_KEY_CREATED"),
    ("DELETE", r"^/api/v1/api-keys/[^/]+$", "API_KEY_REVOKED"),
    ("POST", r"^/api/v1/devices$", "DEVICE_CREATED"),
    ("PUT", r"^/api/v1/devices/[^/]+$", "DEVICE_UPDATED"),
    ("PATCH", r"^/api/v1/devices/[^/]+$", "DEVICE_UPDATED"),
    ("DELETE", r"^/api/v1/devices/[^/]+$", "DEVICE_DELETED"),
    ("POST", r"^/api/v1/devices/[^/]+/heartbeat$", "DEVICE_HEARTBEAT"),
    ("POST", r"^/api/v1/scripts$", "SCRIPT_CREATED"),
    ("POST", r"^/api/v1/scripts/upload$", "SCRIPT_CREATED"),
    ("PUT", r"^/api/v1/scripts/[^/]+$", "SCRIPT_UPDATED"),
    ("DELETE", r"^/api/v1/scripts/[^/]+$", "SCRIPT_DELETED"),
    ("POST", r"^/api/v1/scripts/[^/]+/execute$", "SCRIPT_EXECUTED"),
    ("POST", r"^/api/v1/scripts/[^/]+/rollback$", "SCRIPT_ROLLED_BACK"),
    ("POST", r"^/api/v1/jobs$", "JOB_CREATED"),
    ("POST", r"^/api/v1/jobs/batch$", "JOB_CREATED"),
    ("POST", r"^/api/v1/jobs/[^/]+/cancel$", "JOB_CANCELLED"),
    ("PATCH", r"^/api/v1/users/[^/]+$", "ROLE_CHANGED"),
    ("POST", r"^/api/v1/payloads$", "PAYLOAD_CREATED"),
    ("DELETE", r"^/api/v1/payloads/[^/]+$", "PAYLOAD_DELETED"),
    ("POST", r"^/api/v1/wifi/configure$", "WIFI_CONFIGURED"),
    ("POST", r"^/api/v1/wifi/validate$", "WIFI_VALIDATED"),
]


def _action_for(method: str, path: str) -> str | None:
    for rule_method, rule_path, action in _ACTION_RULES:
        if method == rule_method and re.match(rule_path, path):
            return action
    return None


def _resource_for(path: str) -> str | None:
    segments = [s for s in path.split("/") if s]
    if len(segments) < 3 or segments[0] != "api":
        return None
    return segments[2]


def _actor_from_headers(headers: dict[str, str]) -> tuple[int | None, str | None, str | None]:
    """Return (user_id, api_key_id, session_id) from the request headers."""
    auth = headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            from jose import jwt as jose_jwt
            from backend.security import JWT_SECRET, JWT_ALGORITHM
            payload = jose_jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return int(payload["sub"]), None, payload.get("sid")
        except Exception:
            return None, None, None
    api_key = headers.get("x-api-key")
    if api_key:
        try:
            digest = "sha256$" + hashlib.sha256(api_key.encode()).hexdigest()
            with SessionLocal() as db:
                stored = db.query(ApiKey).filter(ApiKey.key_hash == digest).first()
            if stored:
                return stored.user_id, stored.id, None
        except Exception:
            return None, None, None
    return None, None, None


class AuditMiddleware:
    """Record a curated audit trail for mutating API requests.

    Only action, resource and identity metadata are stored. Request/response
    bodies are never persisted, so secrets can never leak into the audit log.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        path = scope.get("path", "")
        action = _action_for(method, path)
        if action is None:
            await self.app(scope, receive, send)
            return

        raw_headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        user_id, api_key_id, session_id = _actor_from_headers(raw_headers)
        ip = raw_headers.get("x-forwarded-for", "").split(",")[0].strip() or (scope.get("client") or ("",))[0]
        user_agent = raw_headers.get("user-agent")

        status_code = [0]
        body_chunks: list[bytes] = []

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 0)
            elif message["type"] == "http.response.body":
                body_chunks.append(message.get("body", b""))
            await send(message)

        await self.app(scope, receive, send_wrapper)

        success = 200 <= status_code[0] < 400
        if action == "LOGIN_SUCCESS" and not success:
            action = "LOGIN_FAILED"
        if not success:
            action = f"{action}_FAILED" if not action.endswith("_FAILED") and action != "LOGIN_FAILED" else action

        resource_id = self._extract_resource_id(path, method, body_chunks)
        try:
            self._write(user_id, api_key_id, session_id, action, _resource_for(path), resource_id, success, ip, user_agent)
        except Exception:
            pass

    def _extract_resource_id(self, path: str, method: str, body_chunks: list[bytes]) -> str | None:
        match = re.search(r"/[^/]+/([^/]+)(?:/[^/]+)?$", path)
        if method == "DELETE" and match:
            return match.group(1)
        if body_chunks:
            try:
                payload = json.loads(b"".join(body_chunks).decode("utf-8"))
                if isinstance(payload, dict):
                    entity_id = payload.get("id") or payload.get("job_id")
                    if entity_id:
                        return str(entity_id)
            except (ValueError, UnicodeDecodeError):
                return None
        return None

    def _write(self, user_id, api_key_id, session_id, action, resource, resource_id, success, ip, user_agent):
        with SessionLocal() as db:
            db.add(AuditLog(
                user_id=user_id,
                api_key_id=api_key_id,
                session_id=session_id,
                action=action,
                resource=resource,
                resource_id=resource_id,
                success=success,
                ip=ip,
                user_agent=(user_agent or "")[:256] or None,
                details={"method": action.split("_")[0]},
            ))
            db.commit()