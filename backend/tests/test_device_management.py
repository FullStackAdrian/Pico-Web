from uuid import uuid4
from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def auth_headers():
    username = f"device-{uuid4().hex[:10]}"
    password = "strong-password-123"
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    assert login.status_code == 200
    return {'Authorization': f"Bearer {login.json()['access_token']}"}


def create_device(headers, name='Test Pico'):
    response = client.post('/api/v1/devices', headers=headers, json={
        'name': name,
        'pico_url': 'http://192.168.1.20',
        'api_url': 'http://192.168.1.20:8080',
        'group_name': 'lab',
        'tags': ['Test', 'Lab', 'test'],
    })
    assert response.status_code == 201
    return response.json()


def test_device_crud_groups_and_filters():
    headers = auth_headers()
    device = create_device(headers)
    device_id = device['id']
    assert device['status'] == 'unknown'
    assert device['tags'] == ['test', 'lab']
    assert client.get('/api/v1/devices', headers=headers).status_code == 200
    assert len(client.get('/api/v1/devices?group=lab', headers=headers).json()) >= 1
    assert len(client.get('/api/v1/devices?tag=test', headers=headers).json()) >= 1
    assert len(client.get('/api/v1/devices?search=Test', headers=headers).json()) >= 1
    assert 'lab' in client.get('/api/v1/devices/groups', headers=headers).json()
    updated = client.patch(f'/api/v1/devices/{device_id}', headers=headers, json={'tags': ['Production'], 'group_name': 'prod'})
    assert updated.status_code == 200
    assert updated.json()['tags'] == ['production']
    assert updated.json()['group_name'] == 'prod'
    assert client.get(f'/api/v1/devices/{device_id}', headers=headers).status_code == 200
    assert client.delete(f'/api/v1/devices/{device_id}', headers=headers).status_code == 204
    assert client.get(f'/api/v1/devices/{device_id}', headers=headers).status_code == 404


def test_device_heartbeat_metrics_and_online_state():
    headers = auth_headers()
    device = create_device(headers, 'Telemetry Pico')
    response = client.post(f"/api/v1/devices/{device['id']}/heartbeat", headers=headers, json={
        'firmware': '1.5.2',
        'uptime_seconds': 1234,
        'free_memory': 65536,
        'temperature_c': 41.5,
        'wifi_rssi': -52,
    })
    assert response.status_code == 200
    body = response.json()
    assert body['device']['status'] == 'online'
    assert body['device']['firmware'] == '1.5.2'
    assert body['metrics']['free_memory'] == 65536
    metrics = client.get(f"/api/v1/devices/{device['id']}/metrics", headers=headers)
    assert metrics.status_code == 200
    assert metrics.json()['temperature_c'] == 41.5


def test_device_validation_and_missing_resources():
    headers = auth_headers()
    invalid = client.post('/api/v1/devices', headers=headers, json={'name': '', 'pico_url': 'not-a-url', 'api_url': 'http://localhost'})
    assert invalid.status_code == 422
    assert invalid.json()['error']['code'] == 'VALIDATION_ERROR'
    assert client.get('/api/v1/devices/missing', headers=headers).status_code == 404
    assert client.patch('/api/v1/devices/missing', headers=headers, json={'name': 'x'}).status_code == 404
    assert client.post('/api/v1/devices/missing/heartbeat', headers=headers, json={}).status_code == 404
    assert client.get('/api/v1/devices/missing/metrics', headers=headers).status_code == 404
