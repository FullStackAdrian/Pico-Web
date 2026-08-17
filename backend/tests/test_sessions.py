from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import app
from backend.db import SessionLocal
from backend.models import Session

client = TestClient(app)


def register_login(username=None):
    username = username or f"session-{uuid4().hex[:10]}"
    password = "strong-password-123"
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    assert login.status_code == 200
    body = login.json()
    return {'Authorization': f"Bearer {body['access_token']}"}, body['refresh_token'], body['access_token']


def revoke_session(refresh_token):
    with SessionLocal() as db:
        stored = db.scalar(select(Session).where(Session.refresh_token_hash == __import__('hashlib').sha256(refresh_token.encode()).hexdigest()))
        if stored:
            stored.revoked_at = datetime.now(timezone.utc)
            db.commit()


def expire_session(refresh_token):
    with SessionLocal() as db:
        stored = db.scalar(select(Session).where(Session.refresh_token_hash == __import__('hashlib').sha256(refresh_token.encode()).hexdigest()))
        if stored:
            stored.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            db.commit()


def test_login_creates_a_visible_active_session():
    headers, _, _ = register_login()
    sessions = client.get('/api/v1/auth/sessions', headers=headers)
    assert sessions.status_code == 200
    body = sessions.json()
    assert len(body) == 1
    assert body[0]['active'] is True
    assert body[0]['user_agent'] or body[0]['user_agent'] is None


def test_logout_revokes_session_and_blocks_reuse():
    headers, refresh, access = register_login()
    assert client.post('/api/v1/auth/logout', json={'refresh_token': refresh}).status_code == 204
    assert client.post('/api/v1/auth/refresh', json={'refresh_token': refresh}).status_code == 401
    assert client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {access}'}).status_code == 401


def test_refresh_rotates_and_invalidates_previous_refresh_token():
    headers, refresh, _ = register_login()
    refreshed = client.post('/api/v1/auth/refresh', json={'refresh_token': refresh})
    assert refreshed.status_code == 200
    assert client.post('/api/v1/auth/refresh', json={'refresh_token': refresh}).status_code == 401


def test_revoke_session_endpoint_invalidates_its_access_token():
    headers, refresh, access = register_login()
    sessions = client.get('/api/v1/auth/sessions', headers=headers).json()
    session_id = sessions[0]['id']
    assert client.delete(f'/api/v1/auth/sessions/{session_id}', headers=headers).status_code == 204
    assert client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {access}'}).status_code == 401
    assert client.post('/api/v1/auth/refresh', json={'refresh_token': refresh}).status_code == 401


def test_revoke_all_sessions_invalidates_them():
    base = f"revoke-all-{uuid4().hex[:8]}"
    _, refresh_a, access_a = register_login(base)
    login_b = client.post('/api/v1/auth/login', json={'username': base, 'password': 'strong-password-123'})
    access_b = login_b.json()['access_token']
    headers = {'Authorization': f'Bearer {access_b}'}
    assert client.post('/api/v1/auth/sessions/revoke-all', headers=headers).status_code == 204
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 401
    assert client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {access_a}'}).status_code == 401
    assert client.post('/api/v1/auth/refresh', json={'refresh_token': refresh_a}).status_code == 401


def test_expired_session_is_rejected():
    headers, refresh, access = register_login()
    expire_session(refresh)
    assert client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {access}'}).status_code == 401
    assert client.post('/api/v1/auth/refresh', json={'refresh_token': refresh}).status_code == 401


def test_user_cannot_revoke_another_users_session():
    user_a = f"idor-a-{uuid4().hex[:8]}"
    user_b = f"idor-b-{uuid4().hex[:8]}"
    headers_a, _, _ = register_login(user_a)
    _, _, _ = register_login(user_b)
    with SessionLocal() as db:
        target = db.scalar(select(Session).join(Session.user).where(Session.user.has(username=user_b)).limit(1))
    assert target is not None
    assert client.delete(f"/api/v1/auth/sessions/{target.id}", headers=headers_a).status_code == 403