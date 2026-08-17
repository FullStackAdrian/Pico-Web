import asyncio
import os
from queue import Empty
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import HTTPException
from backend.db import init_db
from backend.job_system import job_system
from backend.routes import router
from backend.audit import AuditMiddleware
from backend.rate_limit import RateLimitMiddleware
from backend.security import authenticate_websocket

if os.getenv("ENVIRONMENT", "development") == "production" and (not os.getenv("DATABASE_URL") or not os.getenv("JWT_SECRET") or not os.getenv("ENCRYPTION_KEY")):
    raise RuntimeError("DATABASE_URL, JWT_SECRET and ENCRYPTION_KEY are required in production")
init_db()

app = FastAPI(title="Pico Web API", version="2.3.0")
app.include_router(router, prefix="/api/v1")
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AuditMiddleware)

@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    code_by_status = {400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 422: "UNPROCESSABLE_ENTITY"}
    return JSONResponse(status_code=exc.status_code, headers=exc.headers, content={"error": {"code": code_by_status.get(exc.status_code, "HTTP_ERROR"), "message": message}})

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed", "details": exc.errors()}})

@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, __: Exception):
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_SERVER_ERROR", "message": "Internal server error"}})

@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    user = authenticate_websocket(websocket)
    if user is None:
        await websocket.close(code=4401)
        return
    client_queue = job_system.events.subscribe()
    try:
        await websocket.send_json({"type": "connected"})
        while True:
            try:
                event = client_queue.get_nowait()
            except Empty:
                await asyncio.sleep(0.01)
                continue
            await websocket.send_json(event)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        job_system.events.unsubscribe(client_queue)

@app.get("/api/v1/health")
def health():
    return {"status": "ok", "capabilities": {"scripts": True, "jobs": True, "queue": True, "websocket": True, "authentication": True, "postgresql": True, "device_management": True, "heartbeat": True, "metrics": True, "groups": True}}
