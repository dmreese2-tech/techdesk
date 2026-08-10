#!/usr/bin/env python3
"""
Dry-run for the job-title -> department mapping in
supabase/16-departments-pass2.sql.

Why this exists: the CASE in that migration is order-dependent in a way that is
easy to get wrong and impossible to see by reading. Every title where "director"
is a *modifier* — Technical Director, Social Media Director, Projections
Director, Music Director — must be settled before the rule matching "director"
as a *job*, or the broad rule swallows it. Running this caught two such bugs
before the migration touched live data.

This is a copy of the SQL logic, not the SQL itself, so it can drift. If you
change the CASE in the migration, change it here and re-run. The value is in
having somewhere to add a title and see where it lands without a database.

    python3 tools/dept-title-mapping-test.py
"""

import re
import sys

# Mirrors the CASE in 16-departments-pass2.sql, in order. None = deliberately
# unmatched, meaning "report this person, do not guess".
RULES = [
    # Must not be caught by the broad "director" rule below.
    (r'technical director|^td$', None),
    (r'produc', None),
    # Specific domains.
    (r'light|lx|projection', 'electrics'),
    (r'sound|audio', 'sound'),
    (r'compos|music|band|orchestr|conduct', 'band'),
    (r'scenic|paint|carpent|set build|set design', 'scenic'),
    (r'prop', 'props'),
    (r'costum|wardrobe|hair|makeup|make-up|dress', 'wardrobe'),
    (r'stage manager|^asm$|^sm$|deck', 'sm'),
    (r'rigg|^fly', 'rigging'),
    # Back office BEFORE directing: 'Social Media Director' is not a director.
    (r'box office|social media|marketing|photograph|publicity|front of house|'
     r'house manager|program|graphic', 'back_office'),
    # The broad one, last.
    (r'director|choreograph|intimacy|fight|dramaturg|assistant to', 'directing'),
]

# Titles that were unmatched on the live run and placed by
# 17-departments-leadership.sql instead. Expected to be None here.
LEADERSHIP = {'Producer', 'Co-Producer', 'Technical Director', 'General Manager'}


def dept_for_title(title):
    if not title:
        return None
    low = title.lower()
    for pattern, dept in RULES:
        if re.search(pattern, low):
            return dept
    return None


# (title, expected) — expected None means "should be reported, not guessed".
CASES = [
    ('Director', 'directing'),
    ('Assistant Director', 'directing'),
    ('Choreographer', 'directing'),
    ('Fight Choreographer', 'directing'),
    ('Intimacy Coordinator', 'directing'),
    ('Dramaturg', 'directing'),
    ('Lighting Designer', 'electrics'),
    ('Light Board Op', 'electrics'),
    ('Projections Director/Op', 'electrics'),   # not directing
    ('Sound Designer', 'sound'),
    ('Sound Op', 'sound'),
    ('Original Composition', 'band'),
    ('Music Director', 'band'),                # not directing
    ('Scenic Painter', 'scenic'),
    ('Props Creator', 'props'),
    ('Costume Designer', 'wardrobe'),
    ('Dresser', 'wardrobe'),
    ('Stage Manager', 'sm'),
    ('Assistant Stage Manager', 'sm'),
    ('Rigger', 'rigging'),
    ('Box Office Manager', 'back_office'),
    ('Social Media Director', 'back_office'),   # not directing
    ('Photographer', 'back_office'),
    ('Program Designer', 'back_office'),
    ('Producer', None),
    ('Co-Producer', None),
    ('Technical Director', None),
    ('General Manager', None),
]


def main():
    failures = []
    for title, expected in CASES:
        got = dept_for_title(title)
        ok = got == expected
        if not ok:
            failures.append((title, expected, got))
        flag = '   ' if ok else 'FAIL'
        shown = got or 'UNMATCHED (reported)'
        note = ''
        if got is None and title in LEADERSHIP:
            note = '  -> leadership, via migration 17'
        print(f'{flag} {title:28} -> {shown}{note}')

    print()
    if failures:
        print(f'{len(failures)} mismatch(es):')
        for title, expected, got in failures:
            print(f'  {title}: expected {expected}, got {got}')
        return 1
    print(f'All {len(CASES)} titles map as intended.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
