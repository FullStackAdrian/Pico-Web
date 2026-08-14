from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.job_system import job_system, serialize_job
from backend.models import Execution, Script
from backend.security import get_current_user

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

def serialize_script(x: Script):
    return {"id": x.id, "name": x.name, "content": x.content, "tags": x.tags, "category": x.category, "createdAt": x.created_at.isoformat(), "updatedAt": x.updated_at.isoformat(), "source": x.source}

def get_script_or_404(db: Session, script_id: str):
    script = db.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    return script

@router.get('/scripts')
def list_scripts(_: object = Depends(get_current_user), db: Session = Depends(get_db)):
    return [serialize_script(x) for x in db.scalars(select(Script).order_by(Script.created_at.desc())).all()]

@router.post('/scripts', status_code=201)
def create_script(data: ScriptIn, _: object = Depends(get_current_user), db: Session = Depends(get_db)):
    script = Script(id='script-' + uuid.uuid4().hex, name=data.name, content=data.content, tags=data.tags, category=data.category)
    db.add(script); db.commit(); db.refresh(script)
    return serialize_script(script)

@router.post('/scripts/upload', status_code=201)
def upload_script(data: ScriptIn, user: object = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_script(data, user, db)

@router.get('/scripts/{i}')
def get_script(i: str, _: object = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize_script(get_script_or_404(db, i))

@router.put('/scripts/{i}')
def update_script(i: str, data: ScriptUpdate, _: object = Depends(get_current_user), db: Session = Depends(get_db)):
    script = get_script_or_404(db, i)
    for key, value in data.model_dump(exclude_none=True).items(): setattr(script, key, value)
    script.updated_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(script)
    return serialize_script(script)

@router.delete('/scripts/{i}', status_code=204)
def delete_script(i: str, _: object = Depends(get_current_user), db: Session = Depends(get_db)):
    script = get_script_or_404(db, i); db.delete(script); db.commit()

@router.post('/scripts/{i}/execute', status_code=202)
def execute(i: str, data: ExecuteIn, _: object = Depends(get_current_user), db: Session = Depends(get_db)):
    get_script_or_404(db, i)
    try:
        job = job_system.enqueue(i, data.device_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return serialize_job(job)

@router.get('/executions')
def history(_: object = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": x.id, "job_id": x.job_id, "script_id": x.script_id, "script_name": x.script_name, "started_at": x.started_at.isoformat(), "duration_ms": x.duration_ms, "success": x.success, "error": x.error, "device_id": x.device_id} for x in db.scalars(select(Execution).order_by(Execution.started_at.desc())).all()]
