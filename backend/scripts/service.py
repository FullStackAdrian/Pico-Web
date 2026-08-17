import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models import Script, ScriptVersion
from backend.scripts.diff import diff_texts
from backend.scripts.repository import ScriptRepository

VERSIONED_FIELDS = ("content", "tags", "category")


def utcnow():
    return datetime.now(timezone.utc)


def serialize_script(script: Script) -> dict[str, Any]:
    return {
        "id": script.id,
        "name": script.name,
        "content": script.content,
        "tags": script.tags or [],
        "category": script.category,
        "currentVersion": script.current_version,
        "createdAt": script.created_at.isoformat() if script.created_at else None,
        "updatedAt": script.updated_at.isoformat() if script.updated_at else None,
        "source": script.source,
    }


def serialize_version(version: ScriptVersion) -> dict[str, Any]:
    return {
        "id": version.id,
        "scriptId": version.script_id,
        "version": version.version,
        "content": version.content,
        "tags": version.tags or [],
        "category": version.category,
        "createdAt": version.created_at.isoformat() if version.created_at else None,
    }


class ScriptNotFoundError(Exception):
    pass


class VersionNotFoundError(Exception):
    pass


class ScriptService:
    """Business rules for script versioning, rollback and diffing.

    The service owns the transaction for multi-step operations and delegates
    persistence to ScriptRepository so it never touches SQLAlchemy directly.
    """

    def __init__(self, session: Session):
        self._session = session
        self._repo = ScriptRepository(session)

    def create_script(self, name: str, content: str = "", tags: list | None = None, category: str = "Uncategorized") -> dict:
        script = Script(
            id="script-" + uuid.uuid4().hex,
            name=name,
            content=content,
            tags=tags or [],
            category=category,
            current_version=1,
        )
        self._session.add(script)
        self._session.flush()
        self._repo.add_version(ScriptVersion(
            id="version-" + uuid.uuid4().hex,
            script_id=script.id,
            version=1,
            content=content,
            tags=tags or [],
            category=category,
        ))
        self._session.commit()
        self._session.refresh(script)
        return serialize_script(script)

    def get_script(self, script_id: str) -> dict:
        return serialize_script(self._require_script(script_id))

    def list_scripts(self) -> list[dict]:
        return [serialize_script(script) for script in self._repo.list_scripts()]

    def delete_script(self, script_id: str) -> None:
        script = self._require_script(script_id)
        self._session.delete(script)
        self._session.commit()

    def update_script(self, script_id: str, changes: dict) -> dict:
        script = self._require_script(script_id)
        versioned_changed = any(
            field in changes and changes[field] != getattr(script, field)
            for field in VERSIONED_FIELDS
        )
        for key, value in changes.items():
            setattr(script, key, value)
        if versioned_changed:
            script.current_version = self._repo.next_version_number(script_id)
            self._repo.add_version(ScriptVersion(
                id="version-" + uuid.uuid4().hex,
                script_id=script_id,
                version=script.current_version,
                content=script.content,
                tags=script.tags or [],
                category=script.category,
            ))
        script.updated_at = utcnow()
        self._session.commit()
        self._session.refresh(script)
        return serialize_script(script)

    def rollback(self, script_id: str, version: int) -> dict:
        self._require_script(script_id)
        target = self._repo.get_version(script_id, version)
        if not target:
            raise VersionNotFoundError(f"Version {version} not found for script {script_id}")
        return self.update_script(script_id, {
            "content": target.content,
            "tags": target.tags or [],
            "category": target.category,
        })

    def list_versions(self, script_id: str) -> list[dict]:
        self._require_script(script_id)
        return [serialize_version(version) for version in self._repo.list_versions(script_id)]

    def get_version(self, script_id: str, version: int) -> dict:
        target = self._repo.get_version(script_id, version)
        if not target:
            raise VersionNotFoundError(f"Version {version} not found for script {script_id}")
        return serialize_version(target)

    def diff_versions(self, script_id: str, from_version: int, to_version: int | None = None) -> dict:
        from_snapshot = self._repo.get_version(script_id, from_version)
        if not from_snapshot:
            raise VersionNotFoundError(f"Version {from_version} not found for script {script_id}")
        if to_version is None:
            to_content = self._require_script(script_id).content
        else:
            to_snapshot = self._repo.get_version(script_id, to_version)
            if not to_snapshot:
                raise VersionNotFoundError(f"Version {to_version} not found for script {script_id}")
            to_content = to_snapshot.content
        return diff_texts(from_snapshot.content, to_content)

    def _require_script(self, script_id: str) -> Script:
        script = self._repo.get_script(script_id)
        if not script:
            raise ScriptNotFoundError(f"Script {script_id} not found")
        return script