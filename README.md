# Pico Web

Expo/React Native frontend plus a FastAPI backend for managing Pico scripts and devices.

## Architecture

- `frontend/`: complete Expo/React Native application, including routes, source, tests and Expo configuration.
- `backend/`: FastAPI HTTP/WebSocket API with SQLAlchemy persistence and PostgreSQL support.
- `rpi-pico-workspace/`: minimal Raspberry Pi Pico firmware and bundled CircuitPython libraries.

The FastAPI service owns application state, script management, execution history, payloads, device configuration and API orchestration.

## Backend

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set DATABASE_URL, JWT_SECRET and ENCRYPTION_KEY in .env
uvicorn backend.app:app --reload
```

PostgreSQL is configured through `DATABASE_URL`, for example `postgresql+psycopg://pico:pico@localhost:5432/pico_web`. SQLite remains the development/test fallback when `DATABASE_URL` is not set.

Authentication uses short-lived JWT access tokens plus revocable refresh tokens. Passwords are salted and hashed with scrypt. Sensitive stored values such as device endpoints and Wi-Fi passwords are encrypted with Fernet and are never returned as secrets by the relevant write endpoints. Production startup requires `DATABASE_URL`, `JWT_SECRET` and `ENCRYPTION_KEY`.

Run backend tests from the repository root:

```bash
pytest backend/tests -q --cov=backend --cov-report=term-missing
```

The API is versioned under `/api/v1` and exposes script CRUD/content/upload/execute, execution history, device CRUD, payload CRUD, Wi-Fi validation/configuration, authentication (`register`, `login`, `refresh`, `logout`, `me`) and a WebSocket endpoint. REST validation errors use a consistent `error.code` response shape.

## Frontend

```bash
cd frontend
npm install
npx expo start
```

The frontend CI runs from `frontend/` and executes type checking plus the existing Jest/Expo coverage suite.
