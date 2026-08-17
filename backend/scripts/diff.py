from difflib import SequenceMatcher
from typing import Any


def diff_texts(old: str, new: str) -> dict[str, Any]:
    """Return a structured, line-level diff between two script contents.

    The result is a dictionary with the original contents plus a list of hunks
    describing every changed region. Each hunk carries the affected line ranges
    and the removed/added lines so clients can render an editor-style diff.
    """
    old_lines = old.splitlines()
    new_lines = new.splitlines()
    matcher = SequenceMatcher(None, old_lines, new_lines)

    hunks = []
    old_cursor = 1
    new_cursor = 1
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            old_cursor += i2 - i1
            new_cursor += j2 - j1
            continue
        hunks.append({
            'type': tag,
            'old_start': old_cursor,
            'old_end': i2,
            'new_start': new_cursor,
            'new_end': j2,
            'old_lines': old_lines[i1:i2],
            'new_lines': new_lines[j1:j2],
        })
        old_cursor += i2 - i1
        new_cursor += j2 - j1

    return {
        'old': old,
        'new': new,
        'changed': len(hunks) > 0,
        'hunks': hunks,
    }