from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from backend.db import SessionLocal
from backend.models import Script, ScriptVersion
from backend.scripts.repository import ScriptRepository


def create_script(db, name='repo-script'):
    script = Script(id='script-' + uuid4().hex, name=name, content='v1 content')
    db.add(script)
    db.commit()
    db.refresh(script)
    return script


def test_next_version_number_starts_at_one_and_is_monotonic():
    with SessionLocal() as db:
        script = create_script(db)
        repo = ScriptRepository(db)
        assert repo.next_version_number(script.id) == 1
        repo.add_version(ScriptVersion(id='version-' + uuid4().hex, script_id=script.id, version=1, content='a'))
        db.commit()
        assert repo.next_version_number(script.id) == 2


def test_add_version_and_list_versions_in_ascending_order():
    with SessionLocal() as db:
        script = create_script(db)
        repo = ScriptRepository(db)
        repo.add_version(ScriptVersion(id='version-' + uuid4().hex, script_id=script.id, version=2, content='b'))
        repo.add_version(ScriptVersion(id='version-' + uuid4().hex, script_id=script.id, version=1, content='a'))
        db.commit()
        versions = repo.list_versions(script.id)
        assert [v.version for v in versions] == [1, 2]
        assert versions[0].content == 'a'


def test_get_version_returns_matching_snapshot_or_none():
    with SessionLocal() as db:
        script = create_script(db)
        repo = ScriptRepository(db)
        repo.add_version(ScriptVersion(id='version-' + uuid4().hex, script_id=script.id, version=1, content='snapshot'))
        db.commit()
        assert repo.get_version(script.id, 1).content == 'snapshot'
        assert repo.get_version(script.id, 99) is None


def test_duplicate_version_number_within_a_script_is_rejected():
    with SessionLocal() as db:
        script = create_script(db)
        repo = ScriptRepository(db)
        repo.add_version(ScriptVersion(id='version-' + uuid4().hex, script_id=script.id, version=1, content='a'))
        try:
            repo.add_version(ScriptVersion(id='version-' + uuid4().hex, script_id=script.id, version=1, content='dup'))
            db.rollback()
            assert False, 'Expected IntegrityError for duplicate version number'
        except IntegrityError:
            db.rollback()