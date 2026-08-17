from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import app
from backend.db import SessionLocal
from backend.models import AuditLog, User

client = TestClient(app)


def register_login(username=None):
    username = username or f"audit-{uuid4().hex[:10]}"
    password = "strong-password-123"
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    return {'Authorization': f"Bearer {login.json()['access_token']}"}, username, password


def latest_actions(limit=50):
    with SessionLocal() as db:
        return [a.action for a in db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).all()]


def admin_headers(username):
    headers, _, _ = register_login(username)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        user.role = 'admin'
        db.commit()
    return headers


def test_device_create_is_audited_with_resource_id():
    headers, _, _ = register_login()
    created = client.post('/api/v1/devices', headers=headers, json={'name': 'Pico', 'pico_url': 'http://127.0.0.1:80', 'api_url': 'http://127.0.0.1:8000'})
    assert created.status_code == 201
    device_id = created.json()['id']
    with SessionLocal() as db:
        entry = db.scalar(select(AuditLog).where(AuditLog.action == 'DEVICE_CREATED').order_by(AuditLog.id.desc()).limit(1))
        assert entry is not None
        assert entry.resource_id == device_id
        assert entry.success is True
        assert entry.resource == 'devices'


def test_login_failure_is_audited():
    client.post('/api/v1/auth/login', json={'username': f'no-such-{uuid4().hex[:8]}', 'password': 'wrong-password'})
    assert 'LOGIN_FAILED' in latest_actions()


def test_script_execution_and_job_cancel_are_audited():
    headers, _, _ = register_login()
    script = client.post('/api/v1/scripts', headers=headers, json={'name': 'a.txt', 'content': 'HELLO'}).json()
    execute = client.post(f"/api/v1/scripts/{script['id']}/execute", headers=headers, json={})
    assert execute.status_code == 202
    job_id = execute.json()['id']
    client.post(f"/api/v1/jobs/{job_id}/cancel", headers=headers)
    actions = latest_actions()
    assert 'SCRIPT_CREATED' in actions
    assert 'SCRIPT_EXECUTED' in actions
    assert 'JOB_CANCELLED' in actions


def test_audit_entries_never_store_sensitive_data():
    headers, username, password = register_login()
    client.post('/api/v1/wifi/configure', headers=headers, json={'ssid': 'wifi', 'password': 'super-secret-123'})
    with SessionLocal() as db:
        raw = db.execute(select(AuditLog)).scalars().all()
        blob = str(raw)
    assert 'super-secret-123' not in blob
    assert password not in blob


def test_audit_endpoint_requires_admin():
    op_name = f"audit-op-{uuid4().hex[:8]}"
    headers, _, _ = register_login(op_name)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == op_name))
        user.role = 'operator'
        db.commit()
    assert client.get('/api/v1/audit', headers=headers).status_code == 403
    admin = admin_headers(f"audit-admin-{uuid4().hex[:8]}")
    response = client.get('/api/v1/audit', headers=admin)
    assert response.status_code == 200
    assert 'entries' in response.json()


def test_audit_endpoint_is_paginated():
    admin = admin_headers(f"audit-page-{uuid4().hex[:8]}")
    response = client.get('/api/v1/audit?limit=5', headers=admin)
    assert response.status_code == 200
    body = response.json()
    assert len(body['entries']) <= 5
    assert body['total'] >= len(body['entries'])