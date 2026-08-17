from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.job_system import job_system, serialize_job
from backend.models import Device, Job, User
from backend.rbac import JOBS_CANCEL, JOBS_CREATE, JOBS_READ, require_permission
from backend.security import get_current_user

router = APIRouter()


class JobIn(BaseModel):
    script_id: str = Field(min_length=1, max_length=64)
    device_id: str | None = Field(default=None, max_length=64)


class BatchJobIn(BaseModel):
    script_ids: list[str] = Field(min_length=1, max_length=100)
    device_id: str | None = Field(default=None, max_length=64)


def _validate_device(db: Session, device_id: str | None):
    if device_id and not db.get(Device, device_id):
        raise HTTPException(status_code=404, detail="Device not found")


@router.post('/jobs', status_code=202)
def create_job(data: JobIn, _: User = Depends(require_permission(JOBS_CREATE)), db: Session = Depends(get_db)):
    _validate_device(db, data.device_id)
    try:
        job = job_system.enqueue(data.script_id, data.device_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return serialize_job(job)


@router.post('/jobs/batch', status_code=202)
def create_batch(data: BatchJobIn, _: User = Depends(require_permission(JOBS_CREATE)), db: Session = Depends(get_db)):
    _validate_device(db, data.device_id)
    jobs = []
    try:
        for script_id in data.script_ids:
            jobs.append(job_system.enqueue(script_id, data.device_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"jobs": [serialize_job(job) for job in jobs]}


@router.get('/jobs')
def list_jobs(_: User = Depends(require_permission(JOBS_READ)), db: Session = Depends(get_db)):
    return [serialize_job(job) for job in db.scalars(select(Job).order_by(Job.created_at.desc())).all()]


@router.get('/jobs/{job_id}')
def get_job(job_id: str, _: User = Depends(require_permission(JOBS_READ)), db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)


@router.post('/jobs/{job_id}/cancel')
def cancel_job(job_id: str, _: User = Depends(require_permission(JOBS_CANCEL))):
    job = job_system.cancel(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)
