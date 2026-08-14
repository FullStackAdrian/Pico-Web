import time
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import app
from backend.job_system import job_system

client = TestClient(app)


def auth_headers(client_instance=client):
    username = f"jobs-{uuid4().hex[:10]}"
    password = "strong-password-123"
    assert client_instance.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client_instance.post('/api/v1/auth/login', json={'username': username, 'password': password})
    assert login.status_code == 200
    return {'Authorization': f"Bearer {login.json()['access_token']}"}


def create_script(headers, name='job-script', client_instance=client):
    response = client_instance.post('/api/v1/scripts', headers=headers, json={'name': name, 'content': 'HELLO'})
    assert response.status_code == 201
    return response.json()['id']


def wait_for_state(headers, job_id, expected, timeout=3, client_instance=client):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        response = client_instance.get(f'/api/v1/jobs/{job_id}', headers=headers)
        assert response.status_code == 200
        last = response.json()['status']
        if last in expected:
            return last
        time.sleep(0.02)
    raise AssertionError(f'job did not reach {expected}; last state={last}')


def test_create_job_is_queued_and_has_lifecycle_fields():
    headers = auth_headers()
    script_id = create_script(headers)

    response = client.post('/api/v1/jobs', headers=headers, json={'script_id': script_id})
    assert response.status_code == 202
    job = response.json()
    assert job['id'].startswith('job-')
    assert job['script_id'] == script_id
    assert job['status'] in {'queued', 'running', 'succeeded'}
    assert job['created_at']
    assert 'started_at' in job
    assert 'finished_at' in job
    assert 'error' in job

    assert wait_for_state(headers, job['id'], {'succeeded'}) == 'succeeded'


def test_multiple_jobs_are_enqueued_and_history_is_persistent():
    headers = auth_headers()
    script_ids = [create_script(headers, f'job-{i}') for i in range(3)]

    response = client.post('/api/v1/jobs/batch', headers=headers, json={'script_ids': script_ids})
    assert response.status_code == 202
    jobs = response.json()['jobs']
    assert len(jobs) == 3
    assert {job['script_id'] for job in jobs} == set(script_ids)

    for job in jobs:
        assert wait_for_state(headers, job['id'], {'succeeded'}) == 'succeeded'

    history = client.get('/api/v1/jobs', headers=headers)
    assert history.status_code == 200
    assert {job['id'] for job in history.json()} >= {job['id'] for job in jobs}


def test_job_can_target_a_device_and_execution_history_references_job():
    headers = auth_headers()
    script_id = create_script(headers, 'device-job')
    device = client.post(
        '/api/v1/devices',
        headers=headers,
        json={'name': 'Job Pico', 'pico_url': 'http://127.0.0.1:80', 'api_url': 'http://127.0.0.1:8000'},
    )
    assert device.status_code == 201
    device_id = device.json()['id']

    response = client.post('/api/v1/jobs', headers=headers, json={'script_id': script_id, 'device_id': device_id})
    assert response.status_code == 202
    job_id = response.json()['id']
    assert wait_for_state(headers, job_id, {'succeeded'}) == 'succeeded'

    history = client.get('/api/v1/executions', headers=headers)
    assert history.status_code == 200
    execution = next(item for item in history.json() if item['script_id'] == script_id)
    assert execution['device_id'] == device_id
    assert execution['job_id'] == job_id


def test_job_websocket_emits_state_changes():
    """Exercise WebSocket delivery deterministically without coupling it to worker timing."""
    with client.websocket_connect('/api/v1/ws') as websocket:
        connected = websocket.receive_json()
        assert connected['type'] == 'connected'

        job_id = f'job-{uuid4().hex}'
        for status in ('queued', 'running', 'succeeded'):
            job_system.events.publish({'type': 'job', 'job_id': job_id, 'status': status})

        events = [websocket.receive_json(), websocket.receive_json(), websocket.receive_json()]
        assert [event['status'] for event in events] == ['queued', 'running', 'succeeded']
        assert all(event['job_id'] == job_id for event in events)
