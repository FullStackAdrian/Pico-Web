from backend.scripts.diff import diff_texts


def test_identical_texts_produce_no_changes():
    result = diff_texts("line one\nline two\n", "line one\nline two\n")
    assert result['changed'] is False
    assert result['hunks'] == []


def test_appending_lines_produces_insert_hunk():
    result = diff_texts("line one\n", "line one\nline two\nline three\n")
    assert result['changed'] is True
    assert len(result['hunks']) == 1
    hunk = result['hunks'][0]
    assert hunk['type'] == 'insert'
    assert hunk['new_lines'] == ['line two', 'line three']
    assert hunk['new_start'] == 2
    assert hunk['old_lines'] == []


def test_removing_lines_produces_delete_hunk():
    result = diff_texts("line one\nline two\nline three\n", "line one\n")
    assert result['changed'] is True
    assert len(result['hunks']) == 1
    hunk = result['hunks'][0]
    assert hunk['type'] == 'delete'
    assert hunk['old_lines'] == ['line two', 'line three']
    assert hunk['old_start'] == 2
    assert hunk['new_lines'] == []


def test_modified_line_produces_replace_hunk():
    result = diff_texts("hello world\nkeep me\n", "hello there\nkeep me\n")
    assert result['changed'] is True
    assert len(result['hunks']) == 1
    hunk = result['hunks'][0]
    assert hunk['type'] == 'replace'
    assert hunk['old_lines'] == ['hello world']
    assert hunk['new_lines'] == ['hello there']
    assert hunk['old_start'] == 1
    assert hunk['new_start'] == 1


def test_empty_to_content_counts_as_insert():
    result = diff_texts("", "only line\n")
    assert result['changed'] is True
    assert result['hunks'][0]['type'] == 'insert'
    assert result['hunks'][0]['new_lines'] == ['only line']


def test_multiple_changes_are_all_reported():
    result = diff_texts("a\nb\nc\nd\n", "a\nX\nc\nY\n")
    types = [hunk['type'] for hunk in result['hunks']]
    assert types == ['replace', 'replace']
    assert result['changed'] is True