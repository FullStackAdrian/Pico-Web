import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import ApiKey, User
from backend.rbac import API_KEYS_MANAGE, API_KEYS_READ, require_permission

router = APIRouter()

KEY_PREFIX = "pk_live_"
KEY_TTL_DAYS = 365


class ApiKeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    scopes: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None


def _hash_key(raw_key: str) -> str:
    import hashlib
    return "sha256$" + hashlib.sha256(raw_key.encode()).hexdigest()


def _serialize(api_key: ApiKey) -> dict:
    return {
        "id": api_key.id,
        "name": api_key.name,
        "description": api_key.description,
        "prefix": api_key.prefix,
        "scopes": api_key.scopes or [],
        "created_at": api_key.created_at.isoformat() if api_key.created_at else None,
        "expires_at": api_key.expires_at.isoformat() if api_key.expires_at else None,
        "last_used_at": api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        "revoked_at": api_key.revoked_at.isoformat() if api_key.revoked_at else None,
    }


@router.post('/api-keys', status_code=201)
def create_api_key(data: ApiKeyIn, user: User = Depends(require_permission(API_KEYS_MANAGE)), db: Session = Depends(get_db)):
    secret = secrets.token_urlsafe(32)
    raw_key = f"{KEY_PREFIX}{secret}"
    api_key = ApiKey(
        id="apikey-" + uuid.uuid4().hex,
        name=data.name,
        description=data.description,
        key_hash=_hash_key(raw_key),
        prefix=raw_key[:16],
        user_id=user.id,
        scopes=data.scopes,
        expires_at=data.expires_at or (datetime.now(timezone.utc) + timedelta(days=KEY_TTL_DAYS)),
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    body = _serialize(api_key)
    body["key"] = raw_key
    return body


@router.get('/api-keys')
def list_api_keys(_: User = Depends(require_permission(API_KEYS_READ)), db: Session = Depends(get_db)):
    return [_serialize(api_key) for api_key in db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())).all()]


@router.delete('/api-keys/{api_key_id}', status_code=204)
def revoke_api_key(api_key_id: str, _: User = Depends(require_permission(API_KEYS_MANAGE)), db: Session = Depends(get_db)):
    api_key = db.get(ApiKey, api_key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.revoked_at = datetime.now(timezone.utc)
    db.commit()