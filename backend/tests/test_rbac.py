from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import app
from backend.db import SessionLocal, init_db
from backend.models import Permission, Role, User
from backend.rbac import ALL_PERMISSIONS, ROLE_MATRIX, has_permission

client = TestClient(app)


def register_user(username, password='strong-password-123'):
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    assert login.status_code == 200
    return {'Authorization': f"Bearer {login.json()['access_token']}"}


def set_role(username, role):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        user.role = role
        db.commit()


def test_seed_roles_and_permissions_are_idempotent():
    init_db()
    with SessionLocal() as db:
        role_names = {r.name for r in db.scalars(select(Role)).all()}
        assert {'admin', 'operator', 'viewer', 'user'} <= role_names
        perm_names = {p.name for p in db.scalars(select(Permission)).all()}
        assert ALL_PERMISSIONS <= perm_names
        admin = db.scalar(select(Role).where(Role.name == 'admin'))
        assert {p.name for p in admin.permissions} == set(ALL_PERMISSIONS)
        init_db()
        assert {r.name for r in db.scalars(select(Role)).all()} == role_names


def test_role_matrix_matches_seeded_permissions():
    with SessionLocal() as db:
        for name, expected in ROLE_MATRIX.items():
            role = db.scalar(select(Role).where(Role.name == name))
            assert role is not None, f"Role {name} not seeded"
            actual = {p.name for p in role.permissions}
            assert actual == set(expected), f"{name}: expected {sorted(expected)} got {sorted(actual)}"


def test_has_permission_reflects_user_role():
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username.isnot(None)).limit(1))
        assert user is not None
        assert has_permission(db, user, 'devices.read')
        assert not has_permission(db, user, 'users.manage')


def test_viewer_cannot_write_but_can_read():
    username = f"rbac-viewer-{uuid4().hex[:8]}"
    headers = register_user(username)
    set_role(username, 'viewer')
    assert client.get('/api/v1/scripts', headers=headers).status_code == 200
    assert client.post('/api/v1/scripts', headers=headers, json={'name': 'x', 'content': 'hi'}).status_code == 403
    assert client.post('/api/v1/devices', headers=headers, json={'name': 'd', 'pico_url': 'http://a', 'api_url': 'http://b'}).status_code == 403
    assert client.post('/api/v1/wifi/configure', headers=headers, json={'ssid': 'wifi', 'password': '12345678'}).status_code == 403


def test_operator_can_write_scripts_but_cannot_manage_users():
    username = f"rbac-op-{uuid4().hex[:8]}"
    headers = register_user(username)
    set_role(username, 'operator')
    assert client.post('/api/v1/scripts', headers=headers, json={'name': 'x', 'content': 'hi'}).status_code == 201
    assert client.get('/api/v1/users', headers=headers).status_code == 403


def test_admin_can_manage_users():
    username = f"rbac-admin-{uuid4().hex[:8]}"
    headers = register_user(username)
    set_role(username, 'admin')
    assert client.post('/api/v1/scripts', headers=headers, json={'name': 'x', 'content': 'hi'}).status_code == 201
    assert client.get('/api/v1/users', headers=headers).status_code == 200


def test_auth_me_returns_permissions_from_db_not_token():
    username = f"rbac-me-{uuid4().hex[:8]}"
    headers = register_user(username)
    me = client.get('/api/v1/auth/me', headers=headers).json()
    assert 'permissions' in me
    assert 'devices.read' in me['permissions']

    set_role(username, 'viewer')
    me_viewer = client.get('/api/v1/auth/me', headers=headers).json()
    assert 'devices.create' not in me_viewer['permissions']
    assert 'devices.read' in me_viewer['permissions']