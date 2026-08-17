import hashlib
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.models import RefreshToken, User, WifiConfig
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

@router.post('/wifi/validate')
def wifi(data: WifiIn, _: User = Depends(get_current_user)):
    return {'valid': True, 'ssid': data.ssid}

@router.post('/wifi/configure')
def configure_wifi(data: WifiIn, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
def login(data: Credentials, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == data.username))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, 'Invalid credentials', headers={'WWW-Authenticate': 'Bearer'})
    access = create_access_token(user)
    refresh, expires = create_refresh_token(user)
    db.add(RefreshToken(token_hash=hashlib.sha256(refresh.encode()).hexdigest(), user_id=user.id, expires_at=expires))
    db.commit()
    return {'token': access, 'access_token': access, 'refresh_token': refresh, 'token_type': 'bearer', 'expires_in': 30 * 60}

@router.post('/auth/refresh')
def refresh(data: RefreshIn, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not stored or stored.revoked or stored.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, 'Invalid or expired refresh token')
    stored.revoked = True
    user = db.get(User, stored.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, 'User is inactive')
    access = create_access_token(user)
    new_refresh, expires = create_refresh_token(user)
    db.add(RefreshToken(token_hash=hashlib.sha256(new_refresh.encode()).hexdigest(), user_id=user.id, expires_at=expires))
    db.commit()
    return {'token': access, 'access_token': access, 'refresh_token': new_refresh, 'token_type': 'bearer'}

@router.post('/auth/logout', status_code=204)
def logout(data: RefreshIn, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if stored:
        stored.revoked = True; db.commit()

@router.get('/auth/me')
def me(user: User = Depends(get_current_user)):
    return {'id': user.id, 'username': user.username, 'role': user.role}

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
