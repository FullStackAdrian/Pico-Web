from backend.db import SessionLocal
from backend.scripts.service import ScriptNotFoundError, ScriptService, VersionNotFoundError


def create_script(service, name='svc-script', content='v1', tags=None, category='Cat'):
    return service.create_script(name=name, content=content, tags=tags or ['a'], category=category)


def test_create_script_records_version_one():
    with SessionLocal() as db:
        service = ScriptService(db)
        script = create_script(service, content='hello')
        assert script['currentVersion'] == 1
        versions = service.list_versions(script['id'])
        assert len(versions) == 1
        assert versions[0]['version'] == 1
        assert versions[0]['content'] == 'hello'


def test_update_creates_new_version_only_when_content_changes():
    with SessionLocal() as db:
        service = ScriptService(db)
        script = create_script(service, content='v1')
        updated = service.update_script(script['id'], {'content': 'v2'})
        assert updated['currentVersion'] == 2
        versions = service.list_versions(script['id'])
        assert [v['version'] for v in versions] == [1, 2]

        unchanged = service.update_script(script['id'], {'content': 'v2'})
        assert unchanged['currentVersion'] == 2
        assert len(service.list_versions(script['id'])) == 2

        renamed = service.update_script(script['id'], {'name': 'renamed'})
        assert renamed['name'] == 'renamed'
        assert renamed['currentVersion'] == 2
        assert len(service.list_versions(script['id'])) == 2


def test_rollback_copies_previous_version_and_preserves_history():
    with SessionLocal() as db:
        service = ScriptService(db)
        script = create_script(service, content='v1')
        service.update_script(script['id'], {'content': 'v2'})
        service.update_script(script['id'], {'content': 'v3'})
        rolled = service.rollback(script['id'], 1)
        assert rolled['content'] == 'v1'
        assert rolled['currentVersion'] == 4
        versions = service.list_versions(script['id'])
        assert [v['version'] for v in versions] == [1, 2, 3, 4]
        assert versions[-1]['content'] == 'v1'


def test_missing_script_and_version_raise_domain_errors():
    with SessionLocal() as db:
        service = ScriptService(db)
        try:
            service.get_script('script-missing')
            assert False, 'Expected ScriptNotFoundError'
        except ScriptNotFoundError:
            pass

        script = create_script(service)
        try:
            service.get_version(script['id'], 99)
            assert False, 'Expected VersionNotFoundError'
        except VersionNotFoundError:
            pass


def test_diff_between_versions_reports_changes():
    with SessionLocal() as db:
        service = ScriptService(db)
        script = create_script(service, content='one\ntwo\n')
        service.update_script(script['id'], {'content': 'one\ntwo!\n'})
        result = service.diff_versions(script['id'], 1, 2)
        assert result['changed'] is True
        assert result['hunks'][0]['type'] == 'replace'


def test_diff_against_current_state():
    with SessionLocal() as db:
        service = ScriptService(db)
        script = create_script(service, content='one\n')
        service.update_script(script['id'], {'content': 'one\ntwo\n'})
        result = service.diff_versions(script['id'], 1, None)
        assert result['changed'] is True
        assert result['hunks'][0]['type'] == 'insert'