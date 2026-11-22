"""Mestere index builder — championship classification at index time.

build_mestere_index reads a branch-year's detail files plus the year
JSON and writes-ready-returns the mestere index (public/data/{branch}/
mestere-{year}.json shape). Classification deliberately lives here,
not in the parsers: NM is comp-typed, which the parse layer cannot
see, and rule changes here never bump PARSER_VERSION.

Rules (spec: 2026-11-22-result-details-frontend-design.md):
1. comp competitionTypeName == 'Norgesmesterskap' → every øvelse is
   an NM section ('Lag: X' øvelser → nmLag).
2. inrX-extracted detail['km']/['dm'] sections and lag flow as-is.
3. Øvelse-navn patterns: 'KM|DM Mix-lag: X' → scopeLag klasse 'Mix';
   'KM: X'/'DM: X' → scope sections; datotid's fused
   '<ovelse> Dato/tid: … Mesterskap: <KM|DM> <region> Deltakere' →
   scope section; '(<KM|DM> - <region>)' re-listings → scope section.
   The region named inside a navn is recorded on the section
   ('region'); resolving entries' krets/distrikt is layered on top
   of that separately.
   Øvelser named 'T96…' never produce sections — T96 is a real øvelse
   but has no official championships (owner ruling, norgesfelt
   analogy), so those re-listings are local labels, not mesterskap.

Podiums are rank 1–3: rows carrying a parse-time medal field pass
through, rows with pos 1/2/3 map to Gull/Sølv/Bronse. Ties print as
the file prints them; nothing is re-derived. Championship-ish øvelse
names that match no rule are collected as warnings (the census signal
for extending the pattern set) instead of passing silently.
"""
import json
import os
import re

DATA_DIR = 'public/data'
MEDALS = ('Gull', 'Sølv', 'Bronse')
POS_TO_MEDAL = {1: 'Gull', 2: 'Sølv', 3: 'Bronse'}
SCOPE_KEYS = ('km', 'kmLag', 'dm', 'dmLag', 'nm', 'nmLag')

_PREFIX = re.compile(r'^(KM|DM)(?: Mix-lag)?:\s*(.+)$')
_FUSED = re.compile(
    r'^(?P<ovelse>.+?)\s+Dato/tid:'
    r'.*?Mesterskap:\s*(?P<scope>KM|DM)\s+(?P<region>.+?)\s+Deltakere')
_RELIST = re.compile(
    r'^(?P<ovelse>.+?)\s*\((?P<scope>KM|DM)\s*-\s*(?P<region>[^)]+)\)$')
_TEAM_NAME = re.compile(r'^(Gull|Sølv|Bronse)(?:\s+(?P<team>.+))?$')
_CHAMPIONSHIPISH = re.compile(r'KM|DM|NM|Mesterskap')


def mestere_path(branch, year, root='.'):
    """Path of the branch-year's mestere index file."""
    return os.path.normpath(
        os.path.join(root, DATA_DIR, branch, f'mestere-{year}.json'))


def _person_podium(rows):
    """Rank 1–3 rows → podium entries; medal field or pos 1/2/3."""
    podium = []
    for r in rows:
        medal = r.get('medal')
        if medal not in MEDALS:
            medal = POS_TO_MEDAL.get(r.get('pos'))
        if not medal:
            continue
        entry = {'medal': medal}
        if r.get('personId'):
            entry['personId'] = r['personId']
        entry['name'] = r['name']
        if r.get('club'):
            entry['club'] = r['club']
        if r.get('sum') is not None:
            entry['sum'] = r['sum']
        podium.append(entry)
    return podium


def _team_podium(rows):
    """Team rows → podium entries. Shapes seen in the wild: the row's
    name is a medal with the team in club ('Gull' + club), the name is
    medal and team fused ('Gull SSSK10'), or a plain pos-ranked team
    name ('Orkla3', pos 4)."""
    podium = []
    for r in rows:
        name = r.get('name') or ''
        medal = team = None
        if name in MEDALS:
            medal, team = name, r.get('club')
        else:
            m = _TEAM_NAME.match(name)
            if m:
                medal, team = m.group(1), m.group('team')
            elif r.get('pos') in POS_TO_MEDAL:
                medal, team = POS_TO_MEDAL[r['pos']], name
        if medal and team:
            podium.append({'medal': medal, 'team': team})
    return podium


def _team_champions(teams):
    """inrX lag teams already carry {medal, team} from parse time."""
    return [{'medal': t['medal'], 'team': t['team']}
            for t in teams if t.get('medal') in MEDALS]


def _sections_from_classes(ovelse_name, classes, podium_fn, region=None):
    sections = []
    for c in classes:
        podium = podium_fn(c.get('rows', []))
        if podium:
            section = {'ovelse': ovelse_name,
                       'klasse': c.get('klasse'),
                       'podium': podium}
            if region:
                section['region'] = region
            sections.append(section)
    return sections


def _classify(detail, comp):
    """(sections dict, warnings) for one comp's detail file."""
    out = {k: [] for k in SCOPE_KEYS}
    warnings = []

    # Rule 2: inrX-extracted championship sections always flow.
    for scope in ('km', 'dm'):
        champ = detail.get(scope) or {}
        for section in champ.get('sections', []):
            podium = _person_podium(section.get('rows', []))
            if podium:
                out[scope].append({
                    'ovelse': re.sub(rf'^{scope.upper()}: ', '',
                                     section['navn']),
                    'klasse': section.get('klasse'),
                    'podium': podium,
                })
        for lag in champ.get('lag', []):
            podium = _team_champions(lag.get('teams', []))
            if podium:
                out[scope + 'Lag'].append({
                    'ovelse': re.sub(rf'^{scope.upper()} Lag: ', '',
                                     lag['navn']),
                    'klasse': lag.get('klasse'),
                    'podium': podium,
                })

    # Rules 1 & 3: the øvelser, comp type first (spec order).
    comp_nm = comp.get('competitionTypeName') == 'Norgesmesterskap'
    for ovelse in detail.get('ovelser', []):
        navn = (ovelse.get('navn') or '').strip()
        if navn.startswith('T96'):
            continue  # no championships in the T96 øvelse (owner ruling)
        classes = ovelse.get('classes', [])

        if comp_nm:
            if navn.startswith('Lag: '):
                out['nmLag'].extend(_sections_from_classes(
                    navn[len('Lag: '):], classes, _team_podium))
            else:
                out['nm'].extend(_sections_from_classes(
                    navn, classes, _person_podium))
            continue

        m = _PREFIX.match(navn)
        if m:
            scope = m.group(1).lower()
            name = m.group(2)
            if 'Mix-lag' in navn:
                pooled = [r for c in classes for r in c.get('rows', [])]
                podium = _team_podium(pooled)
                if podium:
                    out[scope + 'Lag'].append({'ovelse': name,
                                               'klasse': 'Mix',
                                               'podium': podium})
            else:
                out[scope].extend(_sections_from_classes(
                    name, classes, _person_podium))
            continue

        fused = _FUSED.match(navn)
        scope_name = ovelse_name = navn_region = None
        if fused:
            scope_name = fused.group('scope').lower()
            ovelse_name = fused.group('ovelse')
            navn_region = fused.group('region')
        else:
            relist = _RELIST.match(navn)
            if relist:
                scope_name = relist.group('scope').lower()
                ovelse_name = relist.group('ovelse')
                navn_region = relist.group('region')
        if scope_name:
            out[scope_name].extend(_sections_from_classes(
                ovelse_name, classes, _person_podium, region=navn_region))
            continue

        if _CHAMPIONSHIPISH.search(navn):
            warnings.append(f'unclassified championship-ish øvelse: {navn}')
    return out, warnings


def build_mestere_index(branch, year, root='.'):
    """{'year': int, 'comps': [entries], 'warnings': [str]} for a
    branch-year. Comps appear when they have any nm/km/dm section;
    entries carry only the section keys they have."""
    year_file = os.path.join(root, DATA_DIR, branch, f'{year}.json')
    comps = {}
    if os.path.exists(year_file):
        with open(year_file, encoding='utf-8') as f:
            comps = {c['id']: c
                     for c in json.load(f).get('competitions', [])}
    detaljer_dir = os.path.join(root, DATA_DIR, 'detaljer',
                                branch, str(year))
    entries = []
    warnings = []
    if os.path.isdir(detaljer_dir):
        for name in sorted(os.listdir(detaljer_dir)):
            if not name.endswith('.json'):
                continue
            with open(os.path.join(detaljer_dir, name),
                      encoding='utf-8') as f:
                detail = json.load(f)
            if detail.get('generator') == 'quarantined':
                continue
            comp = comps.get(detail.get('compId'))
            if comp is None:
                continue
            sections, comp_warnings = _classify(detail, comp)
            warnings.extend(comp_warnings)
            entry = {
                'compId': comp['id'],
                'date': (comp.get('startDate') or '')[:10],
                'title': comp.get('title'),
                'organizer': comp.get('organizationName'),
            }
            for key in SCOPE_KEYS:
                if sections[key]:
                    entry[key] = sections[key]
            if len(entry) > 4:
                entries.append(entry)
    entries.sort(key=lambda e: (e.get('date') or '', e.get('title') or ''))
    return {'year': int(year), 'comps': entries, 'warnings': warnings}
