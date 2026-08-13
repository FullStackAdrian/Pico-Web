from fastapi import FastAPI

from backend.routes import router

app = FastAPI(title="Pico Web API", version="1.0.0")
app.include_router(router, prefix="/api/v1")


@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "capabilities": {
            "scripts": True,
            "websocket": True,
        },
    }
