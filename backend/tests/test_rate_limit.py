from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import app
from backend.rate_limit import rate_limiter

client = TestClient(app)


def register(username, password='strong-password-123'):
    return client.post('/api/v1/auth/register', json={'username': username, 'password': password})


def login(username, password='wrong-password-1'):
    return client.post('/api/v1/auth/login', json={'username': username, 'password': password})


def test_login_rate_limit_returns_429_after_five_attempts():
    username = f"rl-login-{uuid4().hex[:8]}"
    assert register(username).status_code == 201
    for _ in range(5):
        assert login(username).status_code == 401
    assert login(username).status_code == 429


def test_register_rate_limit_returns_429_after_three_per_hour():
    base = f"rl-reg-{uuid4().hex[:8]}"
    assert register(base).status_code == 201
    assert register(base + '1').status_code == 201
    assert register(base + '2').status_code == 201
    assert register(base + '3').status_code == 429


def test_refresh_rate_limit_returns_429_after_twenty_per_minute():
    username = f"rl-refresh-{uuid4().hex[:8]}"
    password = 'strong-password-123'
    assert register(username).status_code == 201
    token = login(username, password).json()['refresh_token']
    for _ in range(20):
        response = client.post('/api/v1/auth/refresh', json={'refresh_token': token})
        assert response.status_code == 200
        token = response.json()['refresh_token']
    assert client.post('/api/v1/auth/refresh', json={'refresh_token': token}).status_code == 429


def test_general_api_rate_limit_returns_429():
    username = f"rl-general-{uuid4().hex[:8]}"
    password = 'strong-password-123'
    assert register(username).status_code == 201
    access = login(username, password).json()['access_token']
    headers = {'Authorization': f'Bearer {access}'}
    for _ in range(120):
        assert client.get('/api/v1/scripts', headers=headers).status_code == 200
    assert client.get('/api/v1/scripts', headers=headers).status_code == 429