from fastapi import APIRouter
from backend.script_routes import router as script_router
from backend.device_routes import router as device_router
from backend.auth_routes import router as auth_router
from backend.job_routes import router as job_router
from backend.admin_routes import router as admin_router

router = APIRouter()
router.include_router(script_router)
router.include_router(device_router)
router.include_router(auth_router)
router.include_router(job_router)
router.include_router(admin_router)
