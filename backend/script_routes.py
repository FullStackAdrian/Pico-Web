from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.job_system import job_system, serialize_job
from backend.models import Execution
from backend.rbac import EXECUTIONS_READ, SCRIPTS_CREATE, SCRIPTS_DELETE, SCRIPTS_DIFF, SCRIPTS_EXECUTE, SCRIPTS_READ, SCRIPTS_ROLLBACK, SCRIPTS_UPDATE, SCRIPTS_VERSIONS, require_permission
from backend.security import get_current_user
from backend.scripts.service import ScriptNotFoundError, ScriptService, VersionNotFoundError

router = APIRouter()

class ScriptIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    category: str = "Uncategorized"

class ScriptUpdate(BaseModel):
    name: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    category: str | None = None

class ExecuteIn(BaseModel):
    device_id: str | None = None
    version: int | None = Field(default=None, ge=1)

class RollbackIn(BaseModel):
    version: int = Field(ge=1)

@router.get('/scripts')
def list_scripts(_: object = Depends(require_permission(SCRIPTS_READ)), db: Session = Depends(get_db)):
    return ScriptService(db).list_scripts()

@router.post('/scripts', status_code=201)
def create_script(data: ScriptIn, _: object = Depends(require_permission(SCRIPTS_CREATE)), db: Session = Depends(get_db)):
    return ScriptService(db).create_script(name=data.name, content=data.content, tags=data.tags, category=data.category)

@router.post('/scripts/upload', status_code=201)
def upload_script(data: ScriptIn, _: object = Depends(require_permission(SCRIPTS_CREATE)), db: Session = Depends(get_db)):
    return ScriptService(db).create_script(name=data.name, content=data.content, tags=data.tags, category=data.category)

@router.get('/scripts/{i}')
def get_script(i: str, _: object = Depends(require_permission(SCRIPTS_READ)), db: Session = Depends(get_db)):
    try:
        return ScriptService(db).get_script(i)
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.put('/scripts/{i}')
def update_script(i: str, data: ScriptUpdate, _: object = Depends(require_permission(SCRIPTS_UPDATE)), db: Session = Depends(get_db)):
    try:
        return ScriptService(db).update_script(i, data.model_dump(exclude_none=True))
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.delete('/scripts/{i}', status_code=204)
def delete_script(i: str, _: object = Depends(require_permission(SCRIPTS_DELETE)), db: Session = Depends(get_db)):
    try:
        ScriptService(db).delete_script(i)
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post('/scripts/{i}/execute', status_code=202)
def execute(i: str, data: ExecuteIn, _: object = Depends(require_permission(SCRIPTS_EXECUTE)), db: Session = Depends(get_db)):
    try:
        ScriptService(db).get_script(i)
        if data.version is not None:
            ScriptService(db).get_version(i, data.version)
        job = job_system.enqueue(i, data.device_id, script_version=data.version)
    except (ScriptNotFoundError, VersionNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return serialize_job(job)

@router.get('/scripts/{i}/versions')
def list_versions(i: str, _: object = Depends(require_permission(SCRIPTS_VERSIONS)), db: Session = Depends(get_db)):
    try:
        return ScriptService(db).list_versions(i)
    except ScriptNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get('/scripts/{i}/versions/{version}')
def get_version(i: str, version: int, _: object = Depends(require_permission(SCRIPTS_VERSIONS)), db: Session = Depends(get_db)):
    try:
        return ScriptService(db).get_version(i, version)
    except (ScriptNotFoundError, VersionNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.post('/scripts/{i}/rollback')
def rollback_script(i: str, data: RollbackIn, _: object = Depends(require_permission(SCRIPTS_ROLLBACK)), db: Session = Depends(get_db)):
    try:
        return ScriptService(db).rollback(i, data.version)
    except (ScriptNotFoundError, VersionNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get('/scripts/{i}/diff')
def diff_script(i: str, from_version: int = Query(alias='from'), to: int | None = None, _: object = Depends(require_permission(SCRIPTS_DIFF)), db: Session = Depends(get_db)):
    try:
        return ScriptService(db).diff_versions(i, from_version, to)
    except (ScriptNotFoundError, VersionNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get('/executions')
def history(_: object = Depends(require_permission(EXECUTIONS_READ)), db: Session = Depends(get_db)):
    return [{"id": x.id, "job_id": x.job_id, "script_id": x.script_id, "script_name": x.script_name, "script_version": x.script_version, "started_at": x.started_at.isoformat(), "duration_ms": x.duration_ms, "success": x.success, "error": x.error, "device_id": x.device_id} for x in db.scalars(select(Execution).order_by(Execution.started_at.desc())).all()]