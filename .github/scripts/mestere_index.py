"""Mestere index builder — championship classification at index time.

build_mestere_index reads a branch-year's detail bundle plus the year
JSON and writes-ready-returns the mestere index (public/data/{branch}/
mestere-{year}.json shape). Classification deliberately lives here,
not in the parsers: NM is comp-typed, which the parse layer cannot
see, and rule changes here never bump PARSER_VERSION.

Rules (spec: 2026-11-22-result-details-frontend-design.md):
1. comp competitionTypeName == 'Norgesmesterskap' → every øvelse is
   an NM section ('Lag: X' øvelser → nmLag).
2. inrX-extracted detail['km']/['dm'] sections and lag flow as-is.
3. Øvelse-navn patterns: 'KM|DM Mix-lag: X' → scopeLag klasse 'Mix <class>'
   'KM: X'/'DM: X' → scope sections; datotid's fused
   '<ovelse> Dato/tid: … Mesterskap: <KM|DM> <region> Deltakere' →
   scope section; '(<KM|DM> - <region>)' re-listings → scope section;
   '25m <KM|DM> - <disc>' labels → scope section named '25m <disc>'
   (a bare label takes the comp's single API øvelse name, else '25m').
   The region named inside a navn is recorded on the section
   ('region'); resolving entries' krets/distrikt is layered on top
   of that separately.
   Øvelser named 'T96…' never produce sections — T96 is a real øvelse
   but has no official championships (owner ruling, norgesfelt
   analogy), so those re-listings are local labels, not mesterskap.

Podiums are rank 1–3: rows carrying a parse-time medal field pass
through, rows with pos 1/2/3 map to Gull/Sølv/Bronse. Ties print as
the file prints them; nothing is re-derived. Podium clubs are
canonicalized through the comp's API results when the row carries a
personId. Entries with km/dm sections carry a krets region and
distrikt: the region named inside øvelse navns wins over the comp's
regionOrganizationId, with disagreements collected as warnings.
Championship-ish øvelse names that match no rule are collected as
warnings (the census signal for extending the pattern set) instead
of passing silently.
"""
import json
import os
import re

from detaljer_bundles import bundle_path, load_bundle
from org_regions import DISTRIKTER, normalize_region, resolve_region

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
# '25m KM - Grov' / '25m DM - Spesialrevolver' (bare '25m KM -' too):
# leon labels championship øvelser with a mid-navn scope token
_SCOPED = re.compile(
    r'^(?P<prefix>.+?)\s+(?P<scope>KM|DM)\s*-\s*(?P<name>.*)$')
_TEAM_NAME = re.compile(r'^(Gull|Sølv|Bronse)(?:\s+(?P<team>.+))?$')
_CHAMPIONSHIPISH = re.compile(r'KM|DM|NM|Mesterskap')


def mestere_path(branch, year, root='.'):
    """Path of the branch-year's mestere index file."""
    return os.path.normpath(
        os.path.join(root, DATA_DIR, branch, f'mestere-{year}.json'))


def _person_podium(rows, club_map=None):
    """Rank 1–3 rows → podium entries; medal field or pos 1/2/3.
    The club is canonicalized through the comp's API results when
    the row carries a personId (PDF-printed club as fallback)."""
    club_map = club_map or {}
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
        club = club_map.get(r.get('personId')) or r.get('club')
        if club:
            entry['club'] = club
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
            entry = {'medal': medal, 'team': team}
            if r.get('sum') is not None:
                entry['sum'] = r['sum']
            podium.append(entry)
    return podium


def _team_champions(teams, club_map=None):
    """inrX lag teams already carry {medal, team, members} from parse
    time; the team's own sum flows through when the PDF printed one.
    The team's club resolves through the first member whose personId
    the comp's API results carry — PDF team names are often
    abbreviations ('GPK 1'), and members matched to persons give the
    canonical club. No resolvable member → no club; the frontend then
    falls back to the club embedded in the lag name. Members flow
    through as {name, klasse?, personId?, club?, sum?} — the member's
    own printed class, and each member's club through the same
    club_map when the member matched a person."""
    club_map = club_map or {}
    out = []
    for t in teams:
        if t.get('medal') not in MEDALS:
            continue
        entry = {'medal': t['medal'], 'team': t['team']}
        if t.get('sum') is not None:
            entry['sum'] = t['sum']
        members = []
        for m in t.get('members') or []:
            member = {'name': m.get('name')}
            if m.get('klasse'):
                member['klasse'] = m['klasse']
            if m.get('personId'):
                member['personId'] = m['personId']
                club = club_map.get(m['personId'])
                if club:
                    member['club'] = club
            if m.get('sum') is not None:
                member['sum'] = m['sum']
            members.append(member)
        if members:
            entry['members'] = members
            if 'club' not in entry:
                for member in members:
                    if member.get('club'):
                        entry['club'] = member['club']
                        break
        out.append(entry)
    return out


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


def _lag_sections_from_classes(ovelse_name, classes, club_map):
    """Lag-øvelse classes → sections with team podiums. v15 classes
    carry teams (members ride along through _team_champions);
    row-shaped classes fall back to the fused-row team podium so no
    medal is lost in transition."""
    sections = []
    for c in classes:
        if 'teams' in c:
            podium = _team_champions(c['teams'], club_map)
        else:
            podium = _team_podium(c.get('rows', []))
        if podium:
            sections.append({'ovelse': ovelse_name,
                             'klasse': c.get('klasse'),
                             'podium': podium})
    return sections


def _mix_lag_sections(ovelse_name, classes, club_map):
    """Mix-lag øvelser carry one podium per mix class — the class
    (U, Jr, Å…) is the team's registered mix class, each with its own
    Gull/Sølv/Bronse. Pooled under the bare 'Mix' klasse until now,
    which hid which class a team shot in (NM 2026's two gold mix
    teams were a junior and an ungdom team, indistinguishable). A
    classless entry keeps the pooled 'Mix' klasse (older parses
    without class granularity). v15 transition: team-shaped classes
    carry teams, row-shaped fall back to the fused-row team
    podium."""
    sections = []
    unclassed = []
    for c in classes:
        if 'teams' in c:
            podium = _team_champions(c['teams'], club_map)
        else:
            podium = _team_podium(c.get('rows', []))
        if not podium:
            continue
        klasse = c.get('klasse')
        if klasse:
            sections.append({'ovelse': ovelse_name,
                             'klasse': 'Mix ' + klasse,
                             'podium': podium})
        else:
            unclassed.extend(podium)
    if unclassed:
        sections.append({'ovelse': ovelse_name, 'klasse': 'Mix',
                         'podium': unclassed})
    return sections


def _comp_discipline(comp):
    """The comp's single distinct API øvelse name, when unambiguous —
    bare championship labels ('25m KM -') print no discipline, and
    single-øvelse comps (silhuett) can be named from their results."""
    disciplines = {r['discipline'] for r in comp.get('results') or []
                   if r.get('discipline')}
    return disciplines.pop() if len(disciplines) == 1 else None


def _classify(detail, comp):
    """(sections dict, warnings) for one comp's detail file."""
    out = {k: [] for k in SCOPE_KEYS}
    warnings = []
    club_map = {r['personId']: r['club']
                for r in comp.get('results') or []
                if r.get('personId') and r.get('club')}

    def person_podium(rows):
        return _person_podium(rows, club_map)

    # Rule 2: inrX-extracted championship sections always flow.
    for scope in ('km', 'dm'):
        champ = detail.get(scope) or {}
        for section in champ.get('sections', []):
            podium = person_podium(section.get('rows', []))
            if podium:
                out[scope].append({
                    'ovelse': re.sub(rf'^{scope.upper()}: ', '',
                                     section['navn']),
                    'klasse': section.get('klasse'),
                    'podium': podium,
                })
        for lag in champ.get('lag', []):
            podium = _team_champions(lag.get('teams', []), club_map)
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
                out['nmLag'].extend(_lag_sections_from_classes(
                    navn[len('Lag: '):], classes, club_map))
            elif navn.startswith('Mix-lag: '):
                out['nmLag'].extend(_mix_lag_sections(
                    navn[len('Mix-lag: '):], classes, club_map))
            else:
                out['nm'].extend(_sections_from_classes(
                    navn, classes, person_podium))
            continue

        m = _PREFIX.match(navn)
        if m:
            scope = m.group(1).lower()
            name = m.group(2)
            if 'Mix-lag' in navn:
                out[scope + 'Lag'].extend(_mix_lag_sections(
                    name, classes, club_map))
            else:
                out[scope].extend(_sections_from_classes(
                    name, classes, person_podium))
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
                ovelse_name, classes, person_podium, region=navn_region))
            continue

        scoped = _SCOPED.match(navn)
        if scoped:
            # '25m KM - Grov' → '25m Grov'; a bare '25m KM -' prints
            # no discipline, so it takes the comp's single API øvelse
            # name when unambiguous (silhuett comps), else the prefix
            prefix = scoped.group('prefix')
            name = scoped.group('name').strip()
            ovelse_name = f'{prefix} {name}' if name else (
                _comp_discipline(comp) or prefix)
            out[scoped.group('scope').lower()].extend(_sections_from_classes(
                ovelse_name, classes, person_podium))
            continue

        if _CHAMPIONSHIPISH.search(navn):
            warnings.append(f'unclassified championship-ish øvelse: {navn}')
    return out, warnings


def _match_name(name, candidates):
    """The candidate whose normalized form equals name's, or None."""
    norm = normalize_region(name)
    for candidate in candidates:
        if normalize_region(candidate) == norm:
            return candidate
    return None


def _entry_region(sections, comp):
    """(region, distrikt, warnings) for an entry's km/dm sections.

    The region named inside øvelse navns wins over the comp's
    regionOrganizationId: km navns name a krets, dm navns a distrikt.
    A navn/comp disagreement warns but does not override. NM-only
    entries carry no region at all."""
    warnings = []
    if not any(sections.get(k) for k in ('km', 'kmLag', 'dm', 'dmLag')):
        return None, None, warnings
    navn_krets = next((s['region'] for k in ('km', 'kmLag')
                       for s in sections.get(k, [])
                       if s.get('region')), None)
    navn_distrikt = next((s['region'] for k in ('dm', 'dmLag')
                          for s in sections.get(k, [])
                          if s.get('region')), None)
    comp_region, comp_distrikt = resolve_region(
        comp.get('regionOrganizationId'))
    region = distrikt = None
    if navn_krets:
        region = _match_name(navn_krets, DISTRIKTER) or navn_krets
        distrikt = DISTRIKTER.get(region)
    if navn_distrikt:
        distrikt = _match_name(
            navn_distrikt, set(DISTRIKTER.values())) or navn_distrikt
    if comp_region:
        if region is None:
            region = comp_region
        elif normalize_region(region) != normalize_region(comp_region):
            warnings.append(f'region disagreement: øvelse says {region}, '
                            f'comp region is {comp_region}')
    if comp_distrikt and distrikt is None:
        distrikt = comp_distrikt
    if distrikt is None and region is not None:
        distrikt = DISTRIKTER.get(region)
    if region is None:
        warnings.append('championship comp without region: '
                        f'{comp.get("title") or comp["id"]}')
    return region, distrikt, warnings


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
    bundle = load_bundle(bundle_path(branch, year, root=root))
    entries = []
    warnings = []
    if bundle['comps']:
        for comp_id in sorted(bundle['comps']):
            detail = bundle['comps'][comp_id]
            if detail.get('generator') == 'quarantined':
                continue
            comp = comps.get(detail.get('compId'))
            if comp is None:
                continue
            sections, comp_warnings = _classify(detail, comp)
            warnings.extend(comp_warnings)
            region, distrikt, region_warnings = _entry_region(
                sections, comp)
            warnings.extend(region_warnings)
            entry = {
                'compId': comp['id'],
                'date': (comp.get('startDate') or '')[:10],
                'title': comp.get('title'),
                'organizer': comp.get('organizationName'),
            }
            if any(sections.get(k) for k in ('km', 'kmLag', 'dm', 'dmLag')):
                entry['region'] = region
                entry['distrikt'] = distrikt
            for key in SCOPE_KEYS:
                if sections[key]:
                    entry[key] = sections[key]
            if len(entry) > 4:
                entries.append(entry)
    entries.sort(key=lambda e: (e.get('date') or '', e.get('title') or ''))
    return {'year': int(year), 'comps': entries, 'warnings': warnings}
