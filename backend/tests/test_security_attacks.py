from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import app
from backend.db import SessionLocal
from backend.models import User

client = TestClient(app)


def register_login(username=None):
    username = username or f"sec-{uuid4().hex[:10]}"
    password = "strong-password-123"
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    return {'Authorization': f"Bearer {login.json()['access_token']}"}, username


def set_role(username, role):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        user.role = role
        db.commit()


def create_device(headers):
    response = client.post('/api/v1/devices', headers=headers, json={'name': 'Pico', 'pico_url': 'http://127.0.0.1:80', 'api_url': 'http://127.0.0.1:8000'})
    assert response.status_code == 201
    return response.json()['id']


def test_viewer_cannot_delete_devices_or_execute_jobs():
    headers, username = register_login()
    set_role(username, 'viewer')
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        user.role = 'admin'
        db.commit()
    admin_headers, admin_user = register_login()
    set_role(admin_user, 'admin')
    device_id = create_device(admin_headers)

    viewer_headers, viewer_user = register_login()
    set_role(viewer_user, 'viewer')
    assert client.delete(f'/api/v1/devices/{device_id}', headers=viewer_headers).status_code == 403
    script = client.post('/api/v1/scripts', headers=admin_headers, json={'name': 's', 'content': 'HELLO'}).json()
    assert client.post(f"/api/v1/scripts/{script['id']}/execute", headers=viewer_headers, json={}).status_code == 403


def test_operator_cannot_manage_users_roles_permissions_or_audit():
    headers, username = register_login()
    set_role(username, 'operator')
    assert client.get('/api/v1/users', headers=headers).status_code == 403
    assert client.get('/api/v1/roles', headers=headers).status_code == 403
    assert client.get('/api/v1/permissions', headers=headers).status_code == 403
    assert client.get('/api/v1/audit', headers=headers).status_code == 403
    assert client.get('/api/v1/api-keys', headers=headers).status_code == 403


def test_user_cannot_escalate_their_own_role():
    headers, username = register_login()
    with SessionLocal() as db:
        me = db.scalar(select(User).where(User.username == username))
        assert client.patch(f'/api/v1/users/{me.id}', headers=headers, json={'role': 'admin'}).status_code == 403
        db.refresh(me)
        assert me.role != 'admin'


def test_user_cannot_revoke_another_users_api_key():
    admin_headers, admin_user = register_login()
    set_role(admin_user, 'admin')
    key = client.post('/api/v1/api-keys', headers=admin_headers, json={'name': f'k-{uuid4().hex[:6]}'}).json()
    headers, _ = register_login()
    assert client.delete(f"/api/v1/api-keys/{key['id']}", headers=headers).status_code == 403


def test_websocket_requires_valid_session():
    with TestClient(app) as test_client:
        with test_client.websocket_connect('/api/v1/ws') as websocket:
            code = websocket.receive()
            assert code.get('code') in (4401, 1008)
        try:
            with test_client.websocket_connect('/api/v1/ws?token=invalid') as websocket:
                websocket.receive_json()
                assert False, 'Unauthenticated websocket should be rejected'
        except Exception:
            pass


def test_websocket_accepts_valid_session_token():
    headers, _ = register_login()
    token = headers['Authorization'].split(' ')[1]
    with TestClient(app) as test_client:
        with test_client.websocket_connect(f'/api/v1/ws?token={token}') as websocket:
            connected = websocket.receive_json()
            assert connected['type'] == 'connected'