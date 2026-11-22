#!/usr/bin/env python3
"""Join parsed result-file rows to the personIds in scraped API results.

The PDFs print only name and club; the join population is the same
competition's API results (personId, name, club, discipline, class).
Matching is exact after normalization (casefold, punctuation stripped,
whitespace collapsed) — never fuzzy: a row that does not match stays
without a personId and is skipped by person-keyed consumers.

Run tests directly:

    python3 .github/scripts/test_result_file_matching.py
"""


def normalize(s):
    """Casefold, strip punctuation, collapse whitespace."""
    if not s:
        return ''
    folded = s.casefold()
    cleaned = ''.join(
        ch if ch.isalnum() or ch.isspace() else ' ' for ch in folded
    )
    return ' '.join(cleaned.split())


def _lookups(api_results):
    by_combined = {}
    by_name = {}
    for result in api_results:
        person_id = result.get('personId')
        if not person_id:
            continue
        name = result.get('name') or ''
        club = result.get('club') or ''
        by_combined.setdefault(normalize(f'{name} {club}'), set()).add(person_id)
        by_name.setdefault(normalize(name), set()).add(person_id)
    return by_combined, by_name


def _match(name, club, by_combined, by_name):
    if club:
        ids = by_combined.get(normalize(f'{name} {club}'))
    else:
        # the split found no club, so name holds the whole 'name club'
        # region — try it as the combined key before anything else
        ids = by_combined.get(normalize(name))
    if ids:
        return next(iter(ids)) if len(ids) == 1 else None
    ids = by_name.get(normalize(name), set())
    if len(ids) == 1:
        return next(iter(ids))
    return None


def _iter_person_rows(detail):
    """Yield every row that represents one person, across the detail."""
    for ovelse in detail.get('ovelser', []):
        for cls in ovelse['classes']:
            yield from cls['rows']
    for key in ('km', 'dm'):
        champ = detail.get(key)
        if not champ:
            continue
        for section in champ.get('sections', []):
            yield from section['rows']
        for lag in champ.get('lag', []):
            for team in lag['teams']:
                yield from team.get('members', [])


def attach_person_ids(detail, api_results):
    """Set personId on matched rows, in place. Lag members match on the
    name alone (they carry no club), so an ambiguous name stays unmatched."""
    by_combined, by_name = _lookups(api_results)
    for row in _iter_person_rows(detail):
        person_id = _match(row.get('name'), row.get('club'), by_combined, by_name)
        if person_id:
            row['personId'] = person_id


def match_stats(detail):
    """(matched_rows, total_rows) over every person row in the detail."""
    matched = 0
    total = 0
    for row in _iter_person_rows(detail):
        total += 1
        if row.get('personId'):
            matched += 1
    return matched, total
