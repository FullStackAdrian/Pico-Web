from fastapi import APIRouter
from backend.script_routes import router as script_router
from backend.device_routes import router as device_router
from backend.auth_routes import router as auth_router

router = APIRouter()
router.include_router(script_router)
router.include_router(device_router)
router.include_router(auth_router)
