from fastapi import FastAPI
from backend.routes import router
app = FastAPI(title='Pico Web API', version='1.0.0')
app.include_router(router, prefix='/api/v1')
