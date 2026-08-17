from uuid import uuid4
import time

from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def auth_headers():
    username = f"ver-{uuid4().hex[:10]}"
    password = "strong-password-123"
    assert client.post('/api/v1/auth/register', json={'username': username, 'password': password}).status_code == 201
    login = client.post('/api/v1/auth/login', json={'username': username, 'password': password})
    assert login.status_code == 200
    return {'Authorization': f"Bearer {login.json()['access_token']}"}


def create_script(headers, name='versioned-script', content='v1', tags=None, category='cat'):
    response = client.post('/api/v1/scripts', headers=headers, json={
        'name': name, 'content': content, 'tags': tags or ['a'], 'category': category,
    })
    assert response.status_code == 201
    return response.json()


def test_script_versions_list_and_single_get():
    headers = auth_headers()
    script = create_script(headers, content='one\ntwo\n')
    client.put(f"/api/v1/scripts/{script['id']}", headers=headers, json={'content': 'one\ntwo!\n'})

    versions = client.get(f"/api/v1/scripts/{script['id']}/versions", headers=headers)
    assert versions.status_code == 200
    assert [v['version'] for v in versions.json()] == [1, 2]

    single = client.get(f"/api/v1/scripts/{script['id']}/versions/2", headers=headers)
    assert single.status_code == 200
    assert single.json()['content'] == 'one\ntwo!\n'
    assert single.json()['version'] == 2


def test_script_diff_between_versions_and_against_current():
    headers = auth_headers()
    script = create_script(headers, content='one\ntwo\n')
    client.put(f"/api/v1/scripts/{script['id']}", headers=headers, json={'content': 'one\ntwo!\n'})

    diff = client.get(f"/api/v1/scripts/{script['id']}/diff?from=1&to=2", headers=headers)
    assert diff.status_code == 200
    assert diff.json()['changed'] is True
    assert diff.json()['hunks'][0]['type'] == 'replace'

    against_current = client.get(f"/api/v1/scripts/{script['id']}/diff?from=1", headers=headers)
    assert against_current.status_code == 200
    assert against_current.json()['changed'] is True


def test_script_rollback_restores_previous_version_and_preserves_history():
    headers = auth_headers()
    script = create_script(headers, content='v1')
    client.put(f"/api/v1/scripts/{script['id']}", headers=headers, json={'content': 'v2'})
    client.put(f"/api/v1/scripts/{script['id']}", headers=headers, json={'content': 'v3'})

    rollback = client.post(f"/api/v1/scripts/{script['id']}/rollback", headers=headers, json={'version': 1})
    assert rollback.status_code == 200
    assert rollback.json()['content'] == 'v1'
    assert rollback.json()['currentVersion'] == 4

    versions = client.get(f"/api/v1/scripts/{script['id']}/versions", headers=headers).json()
    assert [v['version'] for v in versions] == [1, 2, 3, 4]
    assert versions[-1]['content'] == 'v1'


def test_script_versions_and_diff_errors():
    headers = auth_headers()
    assert client.get('/api/v1/scripts/script-missing/versions', headers=headers).status_code == 404

    script = create_script(headers)
    assert client.get(f"/api/v1/scripts/{script['id']}/versions/99", headers=headers).status_code == 404
    assert client.post(f"/api/v1/scripts/{script['id']}/rollback", headers=headers, json={'version': 99}).status_code == 404
    assert client.get(f"/api/v1/scripts/{script['id']}/diff?from=99&to=1", headers=headers).status_code == 404

    invalid = client.post(f"/api/v1/scripts/{script['id']}/rollback", headers=headers, json={})
    assert invalid.status_code == 422
    assert invalid.json()['error']['code'] == 'VALIDATION_ERROR'


def wait_for_execution(headers, script_id, timeout=3):
    deadline = time.time() + timeout
    while time.time() < deadline:
        history = client.get('/api/v1/executions', headers=headers).json()
        matches = [x for x in history if x['script_id'] == script_id]
        if matches:
            return matches[0]
        time.sleep(0.02)
    raise AssertionError(f'No execution recorded for script {script_id}')


def test_execute_a_specific_script_version_records_it_in_job_and_execution():
    headers = auth_headers()
    script = create_script(headers, content='v1')
    client.put(f"/api/v1/scripts/{script['id']}", headers=headers, json={'content': 'v2'})

    response = client.post(f"/api/v1/scripts/{script['id']}/execute", headers=headers, json={'version': 1})
    assert response.status_code == 202
    job = response.json()
    assert job['script_version'] == 1

    execution = wait_for_execution(headers, script['id'])
    assert execution['script_version'] == 1
    assert execution['success'] is True


def test_execute_without_version_records_no_version():
    headers = auth_headers()
    script = create_script(headers, content='v1')

    response = client.post(f"/api/v1/scripts/{script['id']}/execute", headers=headers, json={})
    assert response.status_code == 202
    assert response.json()['script_version'] is None

    execution = wait_for_execution(headers, script['id'])
    assert execution['script_version'] is None


def test_execute_with_unknown_version_is_404():
    headers = auth_headers()
    script = create_script(headers)
    response = client.post(f"/api/v1/scripts/{script['id']}/execute", headers=headers, json={'version': 99})
    assert response.status_code == 404