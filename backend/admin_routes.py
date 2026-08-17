from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import AuditLog, Permission, Role, User
from backend.rbac import (
    AUDIT_READ,
    PERMISSIONS_READ,
    ROLES_READ,
    USERS_MANAGE,
    USERS_READ,
    require_permission,
)

router = APIRouter()


class UserPatch(BaseModel):
    role: str | None = Field(default=None, min_length=1, max_length=32)
    is_active: bool | None = None


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "roles": [ur.role.name for ur in user.user_roles],
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.get('/users')
def list_users(_: User = Depends(require_permission(USERS_READ)), db: Session = Depends(get_db)):
    return [serialize_user(user) for user in db.scalars(select(User).order_by(User.created_at)).all()]


@router.get('/users/{user_id}')
def get_user(user_id: int, _: User = Depends(require_permission(USERS_READ)), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_user(user)


@router.patch('/users/{user_id}')
def update_user(user_id: int, data: UserPatch, _: User = Depends(require_permission(USERS_MANAGE)), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.role is not None:
        role = db.scalar(select(Role).where(Role.name == data.role))
        if not role:
            raise HTTPException(status_code=422, detail="Unknown role")
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.get('/roles')
def list_roles(_: User = Depends(require_permission(ROLES_READ)), db: Session = Depends(get_db)):
    return [
        {"name": role.name, "description": role.description, "permissions": sorted(p.name for p in role.permissions)}
        for role in db.scalars(select(Role).order_by(Role.name)).all()
    ]


@router.get('/permissions')
def list_permissions(_: User = Depends(require_permission(PERMISSIONS_READ)), db: Session = Depends(get_db)):
    return sorted(p.name for p in db.scalars(select(Permission).order_by(Permission.name)).all())


def serialize_audit_entry(entry: AuditLog) -> dict:
    return {
        "id": entry.id,
        "user": entry.user.username if entry.user else None,
        "api_key_id": entry.api_key_id,
        "action": entry.action,
        "resource": entry.resource,
        "resource_id": entry.resource_id,
        "success": entry.success,
        "ip": entry.ip,
        "user_agent": entry.user_agent,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


@router.get('/audit')
def audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_permission(AUDIT_READ)),
    db: Session = Depends(get_db),
):
    total = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    entries = db.scalars(
        select(AuditLog).order_by(AuditLog.id.desc()).limit(limit).offset(offset)
    ).all()
    return {
        "entries": [serialize_audit_entry(entry) for entry in entries],
        "total": total,
        "limit": limit,
        "offset": offset,
    }