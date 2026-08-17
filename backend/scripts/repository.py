from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import Script, ScriptVersion


class ScriptRepository:
    """Persistence access for scripts and their immutable version snapshots.

    Methods never commit; the caller owns the transaction so multi-step
    operations (version + script update) stay atomic.
    """

    def __init__(self, session: Session):
        self._session = session

    def get_script(self, script_id: str) -> Script | None:
        return self._session.get(Script, script_id)

    def list_versions(self, script_id: str) -> list[ScriptVersion]:
        return list(self._session.scalars(
            select(ScriptVersion)
            .where(ScriptVersion.script_id == script_id)
            .order_by(ScriptVersion.version.asc())
        ).all())

    def get_version(self, script_id: str, version: int) -> ScriptVersion | None:
        return self._session.scalar(
            select(ScriptVersion).where(
                ScriptVersion.script_id == script_id,
                ScriptVersion.version == version,
            )
        )

    def next_version_number(self, script_id: str) -> int:
        highest = self._session.scalar(
            select(func.max(ScriptVersion.version)).where(ScriptVersion.script_id == script_id)
        )
        return (highest or 0) + 1

    def add_version(self, version: ScriptVersion) -> ScriptVersion:
        self._session.add(version)
        self._session.flush()
        return version