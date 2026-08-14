import os
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from backend.db import init_db
from backend.routes import router

if os.getenv("ENVIRONMENT", "development") == "production" and (not os.getenv("DATABASE_URL") or not os.getenv("JWT_SECRET") or not os.getenv("ENCRYPTION_KEY")):
    raise RuntimeError("DATABASE_URL, JWT_SECRET and ENCRYPTION_KEY are required in production")
init_db()

app = FastAPI(title="Pico Web API", version="2.0.0")
app.include_router(router, prefix="/api/v1")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed", "details": exc.errors()}})

@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, __: Exception):
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_SERVER_ERROR", "message": "Internal server error"}})

@app.get("/api/v1/health")
def health():
    return {"status": "ok", "capabilities": {"scripts": True, "websocket": True, "authentication": True, "postgresql": True}}
