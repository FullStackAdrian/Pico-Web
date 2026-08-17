from typing import Iterable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import SessionLocal
from backend.models import Permission, Role, User

DEVICES_READ = "devices.read"
DEVICES_CREATE = "devices.create"
DEVICES_UPDATE = "devices.update"
DEVICES_DELETE = "devices.delete"

SCRIPTS_READ = "scripts.read"
SCRIPTS_CREATE = "scripts.create"
SCRIPTS_UPDATE = "scripts.update"
SCRIPTS_EXECUTE = "scripts.execute"
SCRIPTS_DELETE = "scripts.delete"
SCRIPTS_VERSIONS = "scripts.versions"
SCRIPTS_DIFF = "scripts.diff"
SCRIPTS_ROLLBACK = "scripts.rollback"

JOBS_READ = "jobs.read"
JOBS_CREATE = "jobs.create"
JOBS_CANCEL = "jobs.cancel"
EXECUTIONS_READ = "executions.read"

USERS_READ = "users.read"
USERS_MANAGE = "users.manage"
ROLES_READ = "roles.read"
ROLES_MANAGE = "roles.manage"
PERMISSIONS_READ = "permissions.read"
PERMISSIONS_MANAGE = "permissions.manage"

AUDIT_READ = "audit.read"
API_KEYS_READ = "api_keys.read"
API_KEYS_MANAGE = "api_keys.manage"
FIRMWARE_MANAGE = "firmware.manage"
WIFI_CONFIGURE = "wifi.configure"

PAYLOADS_READ = "payloads.read"
PAYLOADS_CREATE = "payloads.create"
PAYLOADS_UPDATE = "payloads.update"
PAYLOADS_DELETE = "payloads.delete"

ALL_PERMISSIONS = frozenset({
    DEVICES_READ, DEVICES_CREATE, DEVICES_UPDATE, DEVICES_DELETE,
    SCRIPTS_READ, SCRIPTS_CREATE, SCRIPTS_UPDATE, SCRIPTS_EXECUTE, SCRIPTS_DELETE,
    SCRIPTS_VERSIONS, SCRIPTS_DIFF, SCRIPTS_ROLLBACK,
    JOBS_READ, JOBS_CREATE, JOBS_CANCEL, EXECUTIONS_READ,
    USERS_READ, USERS_MANAGE, ROLES_READ, ROLES_MANAGE, PERMISSIONS_READ, PERMISSIONS_MANAGE,
    AUDIT_READ, API_KEYS_READ, API_KEYS_MANAGE, FIRMWARE_MANAGE, WIFI_CONFIGURE,
    PAYLOADS_READ, PAYLOADS_CREATE, PAYLOADS_UPDATE, PAYLOADS_DELETE,
})

_ADMIN_ONLY = frozenset({
    USERS_READ, USERS_MANAGE, ROLES_READ, ROLES_MANAGE,
    PERMISSIONS_READ, PERMISSIONS_MANAGE, AUDIT_READ,
    API_KEYS_READ, API_KEYS_MANAGE, FIRMWARE_MANAGE,
})

ROLE_MATRIX: dict[str, frozenset[str]] = {
    "admin": ALL_PERMISSIONS,
    "operator": frozenset({
        DEVICES_READ, DEVICES_CREATE, DEVICES_UPDATE,
        SCRIPTS_READ, SCRIPTS_CREATE, SCRIPTS_UPDATE, SCRIPTS_EXECUTE,
        SCRIPTS_VERSIONS, SCRIPTS_DIFF, SCRIPTS_ROLLBACK,
        JOBS_READ, JOBS_CREATE, JOBS_CANCEL, EXECUTIONS_READ,
        WIFI_CONFIGURE,
        PAYLOADS_READ, PAYLOADS_CREATE, PAYLOADS_UPDATE, PAYLOADS_DELETE,
    }),
    "viewer": frozenset({
        DEVICES_READ, SCRIPTS_READ, SCRIPTS_VERSIONS, SCRIPTS_DIFF,
        JOBS_READ, EXECUTIONS_READ, PAYLOADS_READ,
    }),
    "user": ALL_PERMISSIONS - _ADMIN_ONLY,
}

ROLE_DESCRIPTIONS = {
    "admin": "Full access including users, roles, permissions, audit and API keys",
    "operator": "Manages devices, scripts and jobs but cannot delete devices or manage the system",
    "viewer": "Read-only access to devices, scripts and jobs",
    "user": "Legacy default role retaining full operational access",
}


def seed_rbac() -> None:
    """Create roles, permissions and role-permission links idempotently."""
    with SessionLocal() as db:
        existing_perms = {p.name: p for p in db.scalars(select(Permission)).all()}
        for name in ALL_PERMISSIONS:
            if name not in existing_perms:
                perm = Permission(name=name)
                db.add(perm)
                existing_perms[name] = perm
        db.flush()

        existing_roles = {r.name: r for r in db.scalars(select(Role)).all()}
        for name, permissions in ROLE_MATRIX.items():
            role = existing_roles.get(name)
            if role is None:
                role = Role(name=name, description=ROLE_DESCRIPTIONS.get(name, ""))
                db.add(role)
                db.flush()
                existing_roles[name] = role
            granted = {p.name for p in role.permissions}
            for permission_name in permissions:
                if permission_name not in granted:
                    role.permissions.append(existing_perms[permission_name])
        db.commit()


def get_permissions_for_user(db: Session, user: User) -> set[str]:
    role_names: set[str] = set()
    if user.role:
        role_names.add(user.role)
    role_names.update(ur.role.name for ur in user.user_roles)
    if not role_names:
        return set()
    rows = db.execute(
        select(Permission.name)
        .join(Role.permissions)
        .where(Role.name.in_(role_names))
    ).scalars().all()
    return set(rows)


def has_permission(db: Session, user: User, permission: str) -> bool:
    return permission in get_permissions_for_user(db, user)


def require_permission(permission: str):
    """Dependency factory requiring a specific permission for the request."""
    from backend.security import get_current_user  # deferred to avoid import cycle

    def dependency(user: User = Depends(get_current_user)) -> User:
        if permission not in getattr(user, "permissions", set()):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return dependency


def iter_permissions() -> Iterable[str]:
    return iter(sorted(ALL_PERMISSIONS))