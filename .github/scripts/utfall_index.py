"""Utfall index builder — per-person DNS/DNF/DSQ history at index time.

build_utfall_index reads a branch-year's detail files plus the year
JSON and returns the utfall index (the public/data/{branch}/
utfall-{year}.json shape). Statuses live only in the parsed files —
the API results carry none.

Rules (spec: 2026-11-26-skammekroken-design.md):
1. Every stevne, all six homes: ovelser[].classes[].rows[],
   ovelser[].classes[].teams[], km/dm .sections[].rows[], km/dm
   .lag[].teams[]. T96 øvelser are included — unlike the mestere
   classification, nothing here is championship-only.
2. Individual rows need status AND personId; team rows with a status
   expand to one entry per member with a personId, carrying the lag
   marker and the team's name.
3. km/dm entries keep their championship-prefixed øvelse
   ('KM: Felt Sp-Pistol') — the prefix is what keeps the mesterskap
   visible on the wall (owner ruling 6).
4. Dedup (owner ruling 6): within one comp, a km/dm-section entry
   matching an øvelser entry (same personId, same status, same øvelse
   after stripping the 'KM: '/'DM: ' prefix) replaces it — the
   championship face stays, the normal-start twin is dropped. Team
   rows never dedup (zero measured overlap).
5. The comps map joins the year-JSON comp (title, startDate as date,
   resultFileUrl when present) — the same field the resultfile modal
   reads for its PDF fallback.

utfall_census walks the same files and reports the raw home counts
plus the built index's totals, so index coverage stays reconcilable:
entries = ovelser_pid + km_pid + dm_pid − deduped + team_members.
"""
import json
import os
import re

DATA_DIR = 'public/data'
_SCOPE_PREFIX = re.compile(r'^(?:KM|DM):\s*')


def utfall_path(branch, year, root='.'):
    """Path of the branch-year's utfall index file."""
    return os.path.normpath(
        os.path.join(root, DATA_DIR, branch, f'utfall-{year}.json'))


def _year_comps(branch, year, root):
    """The year JSON's competitions keyed by id (the mestere loader)."""
    year_file = os.path.join(root, DATA_DIR, branch, f'{year}.json')
    if not os.path.exists(year_file):
        return {}
    with open(year_file, encoding='utf-8') as f:
        return {c['id']: c for c in json.load(f).get('competitions', [])}


def _individual_rows(detail):
    """(home, ovelse, klasse, row) for every status-carrying individual
    row — the øvelser classes and the km/dm sections."""
    for ovelse in detail.get('ovelser') or []:
        navn = (ovelse.get('navn') or '').strip()
        for cls in ovelse.get('classes') or []:
            for r in cls.get('rows') or []:
                if isinstance(r, dict) and r.get('status'):
                    yield ('ovelser', navn, cls.get('klasse'), r)
    for scope in ('km', 'dm'):
        champ = detail.get(scope) or {}
        for section in champ.get('sections') or []:
            navn = (section.get('navn') or '').strip()
            for r in section.get('rows') or []:
                if isinstance(r, dict) and r.get('status'):
                    yield (scope, navn, section.get('klasse'), r)


def _team_rows(detail):
    """(home, navn, klasse, team) for every status-carrying team row —
    the øvelser lag classes and the km/dm lag sections."""
    for ovelse in detail.get('ovelser') or []:
        navn = (ovelse.get('navn') or '').strip()
        for cls in ovelse.get('classes') or []:
            for t in cls.get('teams') or []:
                if isinstance(t, dict) and t.get('status'):
                    yield ('ovelser', navn, cls.get('klasse'), t)
    for scope in ('km', 'dm'):
        champ = detail.get(scope) or {}
        for lag in champ.get('lag') or []:
            navn = (lag.get('navn') or '').strip()
            for t in lag.get('teams') or []:
                if isinstance(t, dict) and t.get('status'):
                    yield (scope, navn, lag.get('klasse'), t)


def _row_entry(cid, ovelse, klasse, status):
    e = {'compId': cid, 'ovelse': ovelse, 'status': status}
    if klasse:
        e['klasse'] = klasse
    return e


def _team_entry(cid, ovelse, klasse, status, team):
    e = _row_entry(cid, ovelse, klasse, status)
    e['lag'] = True
    if team is not None:
        e['team'] = team
    return e


def _scan(branch, year, root):
    """(comps, persons, counts) for a branch-year — one walk over the
    detail files, deduped per rule 4."""
    comps_by_id = _year_comps(branch, year, root)
    detaljer_dir = os.path.join(root, DATA_DIR, 'detaljer',
                                 branch, str(year))
    counts = {'ovelser_rows': 0, 'ovelser_pid': 0,
              'km_rows': 0, 'km_pid': 0,
              'dm_rows': 0, 'dm_pid': 0,
              'lag_teams': 0, 'team_members': 0, 'deduped': 0}
    persons = {}
    comps = {}
    if not os.path.isdir(detaljer_dir):
        return comps, persons, counts
    for name in sorted(os.listdir(detaljer_dir)):
        if not name.endswith('.json'):
            continue
        with open(os.path.join(detaljer_dir, name),
                  encoding='utf-8') as f:
            detail = json.load(f)
        if detail.get('generator') == 'quarantined':
            continue
        comp = comps_by_id.get(detail.get('compId'))
        if comp is None:
            continue
        cid = comp['id']

        per_home = {'ovelser': [], 'km': [], 'dm': []}
        for home, navn, klasse, r in _individual_rows(detail):
            counts[home + '_rows'] += 1
            if not r.get('personId'):
                continue
            counts[home + '_pid'] += 1
            per_home[home].append(
                (r['personId'], _row_entry(cid, navn, klasse,
                                            r['status'])))

        # Rule 4: a km/dm twin replaces the øvelser entry it matches
        # (same person, same status, same øvelse after prefix-strip).
        km_keys = {(pid, e['status'], _SCOPE_PREFIX.sub('', e['ovelse']))
                   for scope in ('km', 'dm')
                   for pid, e in per_home[scope]}
        kept = [(pid, e) for pid, e in per_home['ovelser']
                if (pid, e['status'], e['ovelse']) not in km_keys]
        counts['deduped'] += len(per_home['ovelser']) - len(kept)
        kept += [pe for scope in ('km', 'dm') for pe in per_home[scope]]

        for home, navn, klasse, t in _team_rows(detail):
            counts['lag_teams'] += 1
            for m in t.get('members') or []:
                if not (isinstance(m, dict) and m.get('personId')):
                    continue
                counts['team_members'] += 1
                kept.append((m['personId'],
                             _team_entry(cid, navn, klasse, t['status'],
                                         t.get('team'))))

        if not kept:
            continue
        comps[cid] = {'title': comp.get('title'),
                      'date': (comp.get('startDate') or '')[:10]}
        if comp.get('resultFileUrl'):
            comps[cid]['resultFileUrl'] = comp['resultFileUrl']
        for pid, e in kept:
            persons.setdefault(pid, []).append(e)

    for entries in persons.values():
        entries.sort(key=lambda e: (e['compId'], e['ovelse']))
        entries.sort(key=lambda e: comps[e['compId']]['date'],
                     reverse=True)
    return comps, persons, counts


def build_utfall_index(branch, year, root='.'):
    """{'year': int, 'comps': {compId: {title, date, resultFileUrl?}},
    'persons': {personId: [entry, …]}} for a branch-year."""
    comps, persons, _ = _scan(branch, year, root)
    return {'year': int(year), 'comps': comps, 'persons': persons}


def utfall_census(branch, year, root='.'):
    """Raw home counts plus the built index's totals for one
    branch-year — the reconciliation tool."""
    comps, persons, counts = _scan(branch, year, root)
    counts['entries'] = sum(len(v) for v in persons.values())
    counts['persons'] = len(persons)
    return counts
