import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import Session, User, WifiConfig
from backend.rbac import WIFI_CONFIGURE, require_permission
from backend.security import create_access_token, create_refresh_token, encrypt, get_current_user, hash_password, verify_password

router = APIRouter()

class WifiIn(BaseModel):
    ssid: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=8, max_length=63)

class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=256)

class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20)

def _client_meta(request: Request) -> tuple[str | None, str | None]:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get('user-agent')
    return ip, (user_agent[:256] if user_agent else None)

def _build_session(db: Session, user: User, ip: str | None, user_agent: str | None) -> tuple[Session, str]:
    refresh, expires = create_refresh_token(user)
    session = Session(
        id='session-' + uuid.uuid4().hex,
        user_id=user.id,
        refresh_token_hash=hashlib.sha256(refresh.encode()).hexdigest(),
        expires_at=expires,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(session)
    return session, refresh

def _serialize_session(session: Session) -> dict:
    return {
        "id": session.id,
        "user_id": session.user_id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "last_used_at": session.last_used_at.isoformat() if session.last_used_at else None,
        "ip": session.ip,
        "user_agent": session.user_agent,
        "active": session.active,
    }

@router.post('/wifi/validate')
def wifi(data: WifiIn, _: User = Depends(require_permission(WIFI_CONFIGURE))):
    return {'valid': True, 'ssid': data.ssid}

@router.post('/wifi/configure')
def configure_wifi(data: WifiIn, _: User = Depends(require_permission(WIFI_CONFIGURE)), db: Session = Depends(get_db)):
    config = WifiConfig(ssid=data.ssid, password_encrypted=encrypt(data.password))
    db.add(config); db.commit()
    return {'accepted': True, 'ssid': data.ssid, 'applied': False}

@router.post('/auth/register', status_code=201)
def register(data: Credentials, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == data.username)):
        raise HTTPException(409, 'User already exists')
    user = User(username=data.username, password_hash=hash_password(data.password))
    db.add(user); db.commit(); db.refresh(user)
    return {'id': user.id, 'username': user.username, 'role': user.role}

@router.post('/auth/login')
def login(data: Credentials, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == data.username))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, 'Invalid credentials', headers={'WWW-Authenticate': 'Bearer'})
    ip, user_agent = _client_meta(request)
    session, refresh = _build_session(db, user, ip, user_agent)
    db.commit(); db.refresh(session)
    access = create_access_token(user, session.id)
    return {'token': access, 'access_token': access, 'refresh_token': refresh, 'token_type': 'bearer', 'expires_in': 30 * 60}

@router.post('/auth/refresh')
def refresh(data: RefreshIn, request: Request, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    stored = db.scalar(select(Session).where(Session.refresh_token_hash == token_hash))
    if not stored or not stored.active:
        raise HTTPException(401, 'Invalid or expired refresh token')
    user = db.get(User, stored.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, 'User is inactive')
    stored.revoked_at = datetime.now(timezone.utc)
    ip, user_agent = _client_meta(request)
    new_session, new_refresh = _build_session(db, user, ip, user_agent)
    db.commit(); db.refresh(new_session)
    access = create_access_token(user, new_session.id)
    return {'token': access, 'access_token': access, 'refresh_token': new_refresh, 'token_type': 'bearer'}

@router.post('/auth/logout', status_code=204)
def logout(data: RefreshIn, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    stored = db.scalar(select(Session).where(Session.refresh_token_hash == token_hash))
    if stored and stored.active:
        stored.revoked_at = datetime.now(timezone.utc)
        db.commit()

@router.get('/auth/sessions')
def sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Session).where(Session.user_id == user.id).order_by(Session.created_at.desc())).all()
    return [_serialize_session(session) for session in rows]

@router.delete('/auth/sessions/{session_id}', status_code=204)
def revoke_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stored = db.get(Session, session_id)
    if not stored or stored.user_id != user.id:
        raise HTTPException(403, 'Cannot revoke this session')
    stored.revoked_at = datetime.now(timezone.utc)
    db.commit()

@router.post('/auth/sessions/revoke-all', status_code=204)
def revoke_all_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    rows = db.scalars(select(Session).where(Session.user_id == user.id, Session.revoked_at.is_(None))).all()
    for session in rows:
        session.revoked_at = now
    db.commit()

@router.get('/auth/me')
def me(user: User = Depends(get_current_user)):
    permissions = sorted(getattr(user, 'permissions', set()))
    return {'id': user.id, 'username': user.username, 'role': user.role, 'permissions': permissions}

@router.websocket('/ws/echo')
async def echo_websocket(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({'type': 'connected', 'timestamp': datetime.now(timezone.utc).isoformat()})
    try:
        while True:
            message = await websocket.receive_json()
            await websocket.send_json({'type': 'ack', 'payload': message, 'timestamp': datetime.now(timezone.utc).isoformat()})
    except WebSocketDisconnect:
        return
