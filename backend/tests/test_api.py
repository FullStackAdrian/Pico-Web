from uuid import uuid4
from fastapi.testclient import TestClient

from backend.app import app
from backend.db import SessionLocal
from backend.models import Device, WifiConfig
from backend.security import decrypt, hash_password, verify_password

client = TestClient(app)


def auth_headers():
    username = f"tester-{uuid4().hex[:10]}"
    password = "strong-password-123"
    register = client.post('/api/v1/auth/register', json={'username': username, 'password': password})
    assert register.status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    assert login.status_code == 200
    body = login.json()
    assert body['access_token'] and body['refresh_token']
    return {'Authorization': f"Bearer {body['access_token']}"}, body['refresh_token']


def test_health_and_capabilities():
    response = client.get('/api/v1/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['capabilities']['authentication'] is True
    assert body['capabilities']['postgresql'] is True


def test_auth_register_login_me_refresh_logout_and_errors():
    username = f"auth-{uuid4().hex[:8]}"
    password = 'strong-password-123'
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 409
    assert client.post('/api/v1/auth/login', json={'username': username, 'password': 'wrong-password'}).status_code == 401
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    assert login.status_code == 200
    body = login.json()
    headers = {'Authorization': f"Bearer {body['access_token']}"}
    assert client.get('/api/v1/auth/me', headers=headers).json()['username'] == username
    assert client.get('/api/v1/auth/me').status_code == 401
    refreshed = client.post('/api/v1/auth/refresh', json={'refresh_token': body['refresh_token']})
    assert refreshed.status_code == 200
    assert client.post('/api/v1/auth/refresh', json={'refresh_token': body['refresh_token']}).status_code == 401
    assert client.post('/api/v1/auth/logout', json={'refresh_token': refreshed.json()['refresh_token']}).status_code == 204


def test_invalid_bearer_token_is_401():
    response = client.get('/api/v1/scripts', headers={'Authorization': 'Bearer invalid'})
    assert response.status_code == 401


def test_script_crud_execute_and_history():
    headers, _ = auth_headers()
    created = client.post('/api/v1/scripts', headers=headers, json={'name': 'demo.txt', 'content': 'HELLO', 'tags': ['demo'], 'category': 'test'})
    assert created.status_code == 201
    script = created.json(); script_id = script['id']
    assert client.get('/api/v1/scripts', headers=headers).status_code == 200
    assert client.get(f'/api/v1/scripts/{script_id}', headers=headers).json()['content'] == 'HELLO'
    assert client.get('/api/v1/scripts/missing', headers=headers).status_code == 404
    updated = client.put(f'/api/v1/scripts/{script_id}', headers=headers, json={'name': 'updated.txt', 'content': 'WORLD'})
    assert updated.status_code == 200 and updated.json()['content'] == 'WORLD'
    execution = client.post(f'/api/v1/scripts/{script_id}/execute', headers=headers, json={'device_id': None})
    assert execution.status_code == 202
    assert any(x['script_id'] == script_id for x in client.get('/api/v1/executions', headers=headers).json())
    assert client.delete(f'/api/v1/scripts/{script_id}', headers=headers).status_code == 204
    assert client.get(f'/api/v1/scripts/{script_id}', headers=headers).status_code == 404


def test_script_upload_validation_and_delete_missing():
    headers, _ = auth_headers()
    invalid = client.post('/api/v1/scripts', headers=headers, json={'name': ''})
    assert invalid.status_code == 422
    assert invalid.json()['error']['code'] == 'VALIDATION_ERROR'
    uploaded = client.post('/api/v1/scripts/upload', headers=headers, json={'name': 'payload.txt', 'content': 'STRING hello'})
    assert uploaded.status_code == 201
    assert client.delete('/api/v1/scripts/missing', headers=headers).status_code == 404


def test_devices_and_payloads_are_persistent_and_sensitive_fields_are_encrypted():
    headers, _ = auth_headers()
    device = client.post('/api/v1/devices', headers=headers, json={'name': 'Pico', 'pico_url': 'http://127.0.0.1:80', 'api_url': 'http://127.0.0.1:8000'})
    assert device.status_code == 201
    device_id = device.json()['id']
    assert client.get('/api/v1/devices', headers=headers).status_code == 200
    assert client.get(f'/api/v1/devices/{device_id}', headers=headers).json()['name'] == 'Pico'
    assert client.put(f'/api/v1/devices/{device_id}', headers=headers, json={'name': 'Pico 2', 'pico_url': 'http://127.0.0.1:81', 'api_url': 'http://127.0.0.1:8001'}).status_code == 200
    assert client.get('/api/v1/devices/missing', headers=headers).status_code == 404
    assert client.delete(f'/api/v1/devices/{device_id}', headers=headers).status_code == 204
    assert client.delete('/api/v1/devices/missing', headers=headers).status_code == 404

    payload = client.post('/api/v1/payloads', headers=headers, json={'name': 'Office', 'description': 'Demo payload', 'tags': ['demo']})
    assert payload.status_code == 201
    payload_id = payload.json()['id']
    assert client.get('/api/v1/payloads', headers=headers).status_code == 200
    assert client.delete(f'/api/v1/payloads/{payload_id}', headers=headers).status_code == 204
    assert client.delete('/api/v1/payloads/missing', headers=headers).status_code == 404


def test_wifi_validation_and_encryption_at_rest():
    headers, _ = auth_headers()
    assert client.post('/api/v1/wifi/validate', headers=headers, json={'ssid': 'wifi', 'password': 'short'}).status_code == 422
    assert client.post('/api/v1/wifi/validate', headers=headers, json={'ssid': 'wifi', 'password': '12345678'}).status_code == 200
    configured = client.post('/api/v1/wifi/configure', headers=headers, json={'ssid': 'wifi', 'password': 'secret-password'})
    assert configured.status_code == 200
    assert 'password' not in configured.json()
    with SessionLocal() as db:
        row = db.query(WifiConfig).order_by(WifiConfig.id.desc()).first()
        assert row and row.password_encrypted != 'secret-password'
        assert decrypt(row.password_encrypted) == 'secret-password'
        device = db.query(Device).first()
        if device:
            assert device.pico_url_encrypted.startswith('gAAAA')


def test_passwords_are_salted_and_never_stored_plaintext():
    stored = hash_password('correct-password')
    assert stored != 'correct-password'
    assert verify_password('correct-password', stored)
    assert not verify_password('wrong-password', stored)
    assert hash_password('correct-password') != stored


def test_websocket_roundtrip():
    with client.websocket_connect('/api/v1/ws') as websocket:
        assert websocket.receive_json()['type'] == 'connected'
        websocket.send_json({'hello': 'world'})
        assert websocket.receive_json()['type'] == 'ack'
