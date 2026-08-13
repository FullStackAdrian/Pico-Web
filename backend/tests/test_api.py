from fastapi.testclient import TestClient

from backend.app import app


client = TestClient(app)


def test_health_and_capabilities():
    response = client.get('/api/v1/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['capabilities']['scripts'] is True
    assert body['capabilities']['websocket'] is True


def test_script_crud_and_content():
    created = client.post('/api/v1/scripts', json={
        'name': 'demo.txt', 'content': 'HELLO', 'tags': ['demo'], 'category': 'test'
    })
    assert created.status_code == 201
    script = created.json()
    script_id = script['id']
    assert script['content'] == 'HELLO'

    listed = client.get('/api/v1/scripts')
    assert listed.status_code == 200
    assert any(item['id'] == script_id for item in listed.json())

    fetched = client.get(f'/api/v1/scripts/{script_id}')
    assert fetched.status_code == 200
    assert fetched.json()['content'] == 'HELLO'

    updated = client.put(f'/api/v1/scripts/{script_id}', json={'name': 'updated.txt', 'content': 'WORLD'})
    assert updated.status_code == 200
    assert updated.json()['content'] == 'WORLD'

    deleted = client.delete(f'/api/v1/scripts/{script_id}')
    assert deleted.status_code == 204
    assert client.get(f'/api/v1/scripts/{script_id}').status_code == 404


def test_script_upload_and_execute_are_audited():
    uploaded = client.post('/api/v1/scripts/upload', json={
        'name': 'payload.txt', 'content': 'STRING hello', 'tags': [], 'category': 'payload'
    })
    assert uploaded.status_code == 201
    script = uploaded.json()

    execution = client.post(f"/api/v1/scripts/{script['id']}/execute", json={'device_id': None})
    assert execution.status_code == 202
    assert execution.json()['script_id'] == script['id']

    history = client.get('/api/v1/executions')
    assert history.status_code == 200
    assert any(item['script_id'] == script['id'] for item in history.json())


def test_devices_and_payloads():
    device = client.post('/api/v1/devices', json={
        'name': 'Pico', 'pico_url': 'http://127.0.0.1:80', 'api_url': 'http://127.0.0.1:8000'
    })
    assert device.status_code == 201
    device_id = device.json()['id']
    assert client.get('/api/v1/devices').status_code == 200
    assert client.get(f'/api/v1/devices/{device_id}').status_code == 200

    payload = client.post('/api/v1/payloads', json={
        'name': 'Office', 'description': 'Demo payload', 'tags': ['demo']
    })
    assert payload.status_code == 201
    payload_id = payload.json()['id']
    assert client.get('/api/v1/payloads').status_code == 200
    assert client.delete(f'/api/v1/payloads/{payload_id}').status_code == 204


def test_wifi_validation_and_authentication():
    assert client.post('/api/v1/wifi/validate', json={'ssid': 'wifi', 'password': 'short'}).status_code == 422
    assert client.post('/api/v1/wifi/validate', json={'ssid': 'wifi', 'password': '12345678'}).status_code == 200
    register = client.post('/api/v1/auth/register', json={'username': 'tester', 'password': 'strong-password'})
    assert register.status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': 'tester', 'password': 'strong-password'})
    assert login.status_code == 200
    assert login.json()['token']
