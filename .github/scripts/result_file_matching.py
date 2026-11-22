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
    club_words = {}
    club_tokens = {}
    for result in api_results:
        person_id = result.get('personId')
        if not person_id:
            continue
        name = result.get('name') or ''
        club = result.get('club') or ''
        by_combined.setdefault(normalize(f'{name} {club}'), set()).add(person_id)
        by_name.setdefault(normalize(name), set()).add(person_id)
        club_words[person_id] = set(normalize(club).split())
        club_tokens[person_id] = normalize(club).split()
    return by_combined, by_name, club_words, club_tokens


def _club_tail_aligns(stripped, club_tokens):
    """True when the stripped name tokens read as a suffix of the
    club: each stripped token is one club token, the initial of one
    ('s' for 'skytterklubb'), or the concatenated initials of a run
    ('nop' for 'norske offiserers pistolklubb')."""
    def align(si, ci):
        if si == len(stripped):
            return ci == len(club_tokens)
        for end in range(ci + 1, len(club_tokens) + 1):
            group = club_tokens[ci:end]
            if len(group) == 1:
                ok = stripped[si] == group[0] or stripped[si] == group[0][0]
            else:
                ok = stripped[si] == ''.join(t[0] for t in group)
            if ok and align(si + 1, end):
                return True
        return False
    return any(align(0, start) for start in range(len(club_tokens)))


def _match(name, club, by_combined, by_name, club_words, club_tokens):
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
    if not ids and ' ' in name.strip():
        words = name.strip().split()
        # The name/club split can strand the club's place word at the
        # end of the name (PDF 'Kristiansand Garnisons Pistolklubb' vs
        # API club 'Kristiansand Pistolskyttere'). Trim exactly one
        # trailing word, and only accept it when that word occurs in
        # the candidate's API club — a misspelled surname never does.
        trimmed = ' '.join(words[:-1])
        dropped = normalize(words[-1])
        trimmed_ids = by_name.get(normalize(trimmed), set())
        if len(trimmed_ids) == 1:
            person_id = next(iter(trimmed_ids))
            if dropped in club_words.get(person_id, set()):
                return person_id
        # An abbreviated or unsplittable club can also ride the name
        # region whole ('… Aron S. Drammen' for API club 'Aron
        # Skytterklubb, Drammen'; '… NOP-Bergen' for 'Norske Offiserers
        # Pistolklubb Bergen'). Strip a trailing token run when it
        # reads as a suffix of a candidate's club — the tail itself
        # disambiguates same-named candidates, and stays unmatched
        # when more than one candidate's club fits.
        norm_words = normalize(name).split()
        for length in (2, 3, 4):
            if len(norm_words) <= length:
                break
            rest = ' '.join(norm_words[:-length])
            hits = [
                person_id
                for person_id in by_name.get(rest, set())
                if _club_tail_aligns(
                    norm_words[-length:],
                    club_tokens.get(person_id, []),
                )
            ]
            if len(hits) == 1:
                return hits[0]
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
    by_combined, by_name, club_words, club_tokens = _lookups(api_results)
    for row in _iter_person_rows(detail):
        person_id = _match(
            row.get('name'), row.get('club'),
            by_combined, by_name, club_words, club_tokens,
        )
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
