# Pico Web

Expo/React Native frontend plus a lightweight FastAPI backend for managing Pico scripts and devices.

## Architecture

- `frontend/`: complete Expo/React Native application, including routes, source, tests and Expo configuration.
- `backend/`: FastAPI HTTP/WebSocket API.
- `rpi-pico-workspace/`: minimal Raspberry Pi Pico firmware and bundled CircuitPython libraries.

The Pico firmware remains minimal: the FastAPI service owns application state, script management, execution history, payloads, device configuration and API orchestration.

## Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.app:app --reload
```

Run backend tests from the repository root:

```bash
pytest backend/tests -q --cov=backend --cov-report=term-missing
```

The API is versioned under `/api/v1` and exposes script CRUD/content/upload/execute, execution history, device CRUD, payload CRUD, Wi-Fi validation/configuration, authentication and a WebSocket endpoint.

## Frontend

```bash
cd frontend
npm install
npx expo start
```

The frontend CI runs from `frontend/` and executes type checking plus the existing Jest/Expo coverage suite.
