from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import app
from backend.db import SessionLocal
from backend.models import ApiKey, User

client = TestClient(app)


def register(username):
    password = "strong-password-123"
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    return {'Authorization': f"Bearer {login.json()['access_token']}"}, password


def admin_headers(username):
    headers, _ = register(username)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        user.role = 'admin'
        db.commit()
    return headers


def create_key(headers, name=None, scopes=None):
    name = name or f"key-{uuid4().hex[:8]}"
    response = client.post('/api/v1/api-keys', headers=headers, json={'name': name, 'scopes': scopes or ['scripts.read']})
    assert response.status_code == 201
    return response.json()


def test_create_api_key_returns_secret_only_once():
    headers = admin_headers(f"key-admin-{uuid4().hex[:8]}")
    body = create_key(headers, name='CI Deploy', scopes=['scripts.read', 'jobs.read'])
    assert body['key'].startswith('pk_live_')
    assert body['name'] == 'CI Deploy'
    assert 'expires_at' in body
    with SessionLocal() as db:
        stored = db.get(ApiKey, body['id'])
        assert stored is not None
        assert body['key'] not in stored.key_hash
        assert stored.key_hash.startswith('sha256$')
        assert body['key'].startswith(stored.prefix)


def test_api_key_authenticates_with_scoped_permissions():
    headers = admin_headers(f"key-scope-{uuid4().hex[:8]}")
    body = create_key(headers, scopes=['scripts.read'])
    key = body['key']

    assert client.get('/api/v1/scripts', headers={'X-API-Key': key}).status_code == 200
    assert client.post('/api/v1/scripts', headers={'X-API-Key': key}, json={'name': 'x', 'content': 'hi'}).status_code == 403

    with SessionLocal() as db:
        stored = db.get(ApiKey, body['id'])
        assert stored.last_used_at is not None


def test_api_key_listing_never_leaks_the_secret():
    headers = admin_headers(f"key-list-{uuid4().hex[:8]}")
    body = create_key(headers, name='Listed Key')
    listing = client.get('/api/v1/api-keys', headers=headers)
    assert listing.status_code == 200
    assert listing.json()[0]['name'] == 'Listed Key'
    assert 'key' not in listing.json()[0]
    assert body['key'] not in str(listing.json())


def test_revoked_api_key_is_rejected():
    headers = admin_headers(f"key-revoke-{uuid4().hex[:8]}")
    body = create_key(headers)
    key = body['key']
    assert client.get('/api/v1/scripts', headers={'X-API-Key': key}).status_code == 200
    assert client.delete(f"/api/v1/api-keys/{body['id']}", headers=headers).status_code == 204
    assert client.get('/api/v1/scripts', headers={'X-API-Key': key}).status_code == 401


def test_expired_api_key_is_rejected():
    from datetime import datetime, timedelta, timezone
    headers = admin_headers(f"key-expired-{uuid4().hex[:8]}")
    body = create_key(headers)
    key = body['key']
    with SessionLocal() as db:
        stored = db.scalar(select(ApiKey).where(ApiKey.id == body['id']))
        stored.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert client.get('/api/v1/scripts', headers={'X-API-Key': key}).status_code == 401


def test_invalid_api_key_is_rejected():
    assert client.get('/api/v1/scripts', headers={'X-API-Key': 'pk_live_invalid'}).status_code == 401


def test_only_admins_can_manage_api_keys():
    username = f"key-nonadmin-{uuid4().hex[:8]}"
    headers, _ = register(username)
    assert client.get('/api/v1/api-keys', headers=headers).status_code == 403
    assert client.post('/api/v1/api-keys', headers=headers, json={'name': 'x'}).status_code == 403


def test_sessions_endpoints_reject_api_key_authentication():
    headers = admin_headers(f"key-session-{uuid4().hex[:8]}")
    body = create_key(headers, scopes=['api_keys.manage', 'users.manage'])
    key = body['key']
    assert client.get('/api/v1/auth/sessions', headers={'X-API-Key': key}).status_code == 403