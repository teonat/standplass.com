"""Unit tests for the mestere index builder.

Synthetic detail files + year JSONs in a temp root — no PDFs, no
fetch. The integration behavior (run-level) lives in
test_parse_result_files.py's MestereIndex class.
"""
import json
import os
import tempfile
import unittest

from mestere_index import build_mestere_index, mestere_path


def comp(cid, **kw):
    base = {
        'id': cid,
        'title': 'Teststevne',
        'startDate': '2025-08-16T00:00:00',
        'organizationName': 'Hokksund Pistolklubb',
        'competitionTypeName': 'Åpent stevne',
        'results': [],
    }
    base.update(kw)
    return base


def detail(cid, ovelser=None, generator='plain-NO', **kw):
    d = {'compId': cid, 'generator': generator, 'ovelser': ovelser or []}
    d.update(kw)
    return d


def row(name, pos=None, club=None, personId=None, sum_=None):
    r = {'name': name}
    if pos is not None:
        r['pos'] = pos
    if club:
        r['club'] = club
    if personId:
        r['personId'] = personId
    if sum_ is not None:
        r['sum'] = sum_
    return r


class MestereIndexBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def build(self, branch, year, comps, details):
        year_dir = os.path.join(self.root, 'public', 'data', branch)
        os.makedirs(year_dir, exist_ok=True)
        with open(os.path.join(year_dir, f'{year}.json'), 'w') as f:
            json.dump({'competitions': comps}, f)
        ddir = os.path.join(self.root, 'public', 'data', 'detaljer',
                            branch, str(year))
        os.makedirs(ddir, exist_ok=True)
        for cid, d in details.items():
            with open(os.path.join(ddir, cid + '.json'), 'w') as f:
                json.dump(d, f)
        return build_mestere_index(branch, year, root=self.root)


class NmClassification(MestereIndexBase):
    def test_nm_comp_type_creates_nm_sections(self):
        d = detail('nm1', [
            {'navn': 'Felt Grov', 'classes': [
                {'klasse': 'M', 'rows': [
                    row('Kari Nordmann', pos=1, club='K1', personId='p1',
                        sum_=300),
                    row('Ola Nordmann', pos=2, club='K2', personId='p2',
                        sum_=295),
                    row('Per Hansen', pos=3, club='K3', sum_=290),
                    row('Ute av pallen', pos=4, club='K4', sum_=280),
                ]},
            ]},
        ])
        index = self.build('felt', 2025,
                           [comp('nm1',
                                 competitionTypeName='Norgesmesterskap')],
                           {'nm1': d})
        self.assertEqual(len(index['comps']), 1)
        entry = index['comps'][0]
        self.assertNotIn('km', entry)
        section = entry['nm'][0]
        self.assertEqual(section['ovelse'], 'Felt Grov')
        self.assertEqual(section['klasse'], 'M')
        self.assertEqual([p['medal'] for p in section['podium']],
                         ['Gull', 'Sølv', 'Bronse'])
        gull = section['podium'][0]
        self.assertEqual(gull['name'], 'Kari Nordmann')
        self.assertEqual(gull['personId'], 'p1')
        self.assertEqual(gull['club'], 'K1')
        self.assertEqual(gull['sum'], 300)

    def test_nm_lag_ovelse_is_team_podium(self):
        d = detail('nm2', [
            {'navn': 'Lag: Felt Grov', 'classes': [
                {'klasse': 'Å', 'rows': [
                    {'name': 'Gull', 'club': 'Fredrikstad SS', 'sum': 300},
                    {'name': 'Sølv', 'club': 'Bærum PK', 'sum': 298},
                ]},
            ]},
        ])
        index = self.build('felt', 2022,
                           [comp('nm2',
                                 competitionTypeName='Norgesmesterskap')],
                           {'nm2': d})
        lag = index['comps'][0]['nmLag'][0]
        self.assertEqual(lag['ovelse'], 'Felt Grov')
        self.assertEqual(lag['klasse'], 'Å')
        self.assertEqual(lag['podium'],
                         [{'medal': 'Gull', 'team': 'Fredrikstad SS',
                           'sum': 300},
                          {'medal': 'Sølv', 'team': 'Bærum PK',
                           'sum': 298}])


class LagOvelseMembers(MestereIndexBase):
    """v15: lag øvelser carry classes with teams, and team podiums
    keep their members ({name, personId?, club?, sum?}, club through
    the comp's API results). Mix-lag øvelser pool their teams under
    the 'Mix' klasse — the existing km/dm convention, now for nm too.
    Row-shaped lag classes keep the fused-row fallback."""

    NM_COMP = comp('nmx', competitionTypeName='Norgesmesterskap',
                  results=[
                      {'personId': 'p1', 'name': 'Tore Vrålstad',
                       'club': 'Greipstad Pistolklubb'},
                      {'personId': 'p2', 'name': 'Kjetil Skogshagen',
                       'club': 'Farris Sportsskyttere'},
                  ])

    def test_nm_lag_teams_carry_members(self):
        d = detail('nmx', [
            {'navn': 'Lag: Felt Fin', 'classes': [
                {'klasse': 'Å', 'teams': [
                    {'medal': 'Gull', 'team': 'Greipstad PK1',
                     'series': [[27, 0]], 'ix': 76, 'sum': 318,
                     'members': [
                         {'name': 'Tore Vrålstad', 'klasse': 'M',
                          'personId': 'p1', 'ix': 26, 'sum': 107},
                         {'name': 'Ukjent Skytter', 'klasse': 'K',
                          'ix': 22, 'sum': 106},
                     ]},
                    {'medal': 'Sølv', 'team': 'Bærum PK',
                     'series': [], 'members': []},
                ]},
            ]},
        ])
        index = self.build('felt', 2024, [self.NM_COMP], {'nmx': d})
        self.assertEqual(len(index['comps']), 1)
        lag = index['comps'][0]['nmLag'][0]
        self.assertEqual(lag['ovelse'], 'Felt Fin')
        self.assertEqual(lag['klasse'], 'Å')
        gull, solv = lag['podium']
        self.assertEqual(gull['team'], 'Greipstad PK1')
        self.assertEqual(gull['club'], 'Greipstad Pistolklubb')
        self.assertEqual(gull.get('members'), [
            {'name': 'Tore Vrålstad', 'klasse': 'M', 'personId': 'p1',
             'club': 'Greipstad Pistolklubb', 'sum': 107},
            {'name': 'Ukjent Skytter', 'klasse': 'K', 'sum': 106},
        ])
        self.assertEqual(solv['medal'], 'Sølv')
        self.assertNotIn('members', solv)

    def test_nm_mix_lag_pools_teams_under_klasse_mix(self):
        d = detail('nmx', [
            {'navn': 'Mix-lag: Felt Fin', 'classes': [
                {'klasse': 'Å', 'teams': [
                    {'medal': 'Gull', 'team': 'Farris SS1',
                     'series': [], 'sum': 198, 'members': [
                         {'name': 'Kjetil Skogshagen', 'personId': 'p2',
                          'klasse': 'V55', 'sum': 101},
                     ]},
                ]},
                {'klasse': 'V', 'teams': [
                    {'medal': 'Sølv', 'team': 'Brumunddal PK',
                     'series': [], 'members': []},
                ]},
            ]},
        ])
        index = self.build('felt', 2024, [self.NM_COMP], {'nmx': d})
        self.assertEqual(len(index['comps']), 1)
        lag = index['comps'][0]['nmLag'][0]
        self.assertEqual(lag['ovelse'], 'Felt Fin')
        self.assertEqual(lag['klasse'], 'Mix')
        gull, solv = lag['podium']
        self.assertEqual(gull['team'], 'Farris SS1')
        self.assertEqual(gull.get('members'), [
            {'name': 'Kjetil Skogshagen', 'klasse': 'V55',
             'personId': 'p2', 'club': 'Farris Sportsskyttere',
             'sum': 101},
        ])
        self.assertNotIn('members', solv)

    def test_km_mix_lag_teams_carry_members(self):
        d = detail('k1', [
            {'navn': 'KM Mix-lag: Felt Fin', 'classes': [
                {'klasse': 'Å', 'teams': [
                    {'medal': 'Gull', 'team': 'Farris SS1',
                     'series': [], 'sum': 198, 'members': [
                         {'name': 'Kjetil Skogshagen', 'personId': 'p2',
                          'klasse': 'V55', 'sum': 101},
                     ]},
                ]},
            ]},
        ])
        index = self.build(
            'felt', 2025,
            [comp('k1', competitionTypeName='Åpent stevne m/KM',
                  results=self.NM_COMP['results'])],
            {'k1': d})
        self.assertEqual(len(index['comps']), 1)
        lag = index['comps'][0]['kmLag'][0]
        self.assertEqual(lag['ovelse'], 'Felt Fin')
        self.assertEqual(lag['klasse'], 'Mix')
        gull = lag['podium'][0]
        self.assertEqual(gull['team'], 'Farris SS1')
        self.assertEqual(gull['club'], 'Farris Sportsskyttere')
        self.assertEqual(gull.get('members'), [
            {'name': 'Kjetil Skogshagen', 'klasse': 'V55',
             'personId': 'p2', 'club': 'Farris Sportsskyttere',
             'sum': 101},
        ])

    def test_km_overlay_lag_teams_carry_members(self):
        d = detail('k2', [], generator='inrX 1.9.0.0',
                   km={'lag': [{'navn': 'KM Lag: Felt Magnum',
                                'klasse': 'Å',
                                'teams': [
                                    {'medal': 'Gull', 'team': 'GPK 1',
                                     'sum': 243, 'members': [
                                         {'name': 'Tore Vrålstad',
                                          'personId': 'p1',
                                          'klasse': 'Å', 'sum': 90},
                                     ]},
                                ]}]})
        index = self.build(
            'felt', 2025,
            [comp('k2', competitionTypeName='Åpent stevne m/KM',
                  results=self.NM_COMP['results'])],
            {'k2': d})
        self.assertEqual(len(index['comps']), 1)
        lag = index['comps'][0]['kmLag'][0]
        self.assertEqual(lag['ovelse'], 'Felt Magnum')
        self.assertEqual(lag['klasse'], 'Å')
        gull = lag['podium'][0]
        self.assertEqual(gull.get('members'), [
            {'name': 'Tore Vrålstad', 'klasse': 'Å', 'personId': 'p1',
             'club': 'Greipstad Pistolklubb', 'sum': 90},
        ])


class KmDmClassification(MestereIndexBase):
    def test_t96_ovelser_excluded_everywhere(self):
        d = detail('t1', [
            {'navn': 'T96 fin (KM - Hordaland)', 'classes': [
                {'klasse': 'Å', 'rows': [
                    row('A', pos=1), row('B', pos=2), row('C', pos=3),
                ]},
            ]},
            {'navn': 'T96 grov', 'classes': [
                {'klasse': 'Å', 'rows': [row('D', pos=1)]},
            ]},
        ])
        index = self.build('bane', 2022,
                           [comp('t1', competitionTypeName='Åpent stevne m/KM')],
                           {'t1': d})
        self.assertEqual(index['comps'], [])
        self.assertEqual([w for w in index['warnings'] if 'T96' in w], [])

    def test_km_mix_lag_is_own_lag_class(self):
        d = detail('m1', [
            {'navn': 'KM Mix-lag: Felt Fin', 'classes': [
                {'klasse': 'Å', 'rows': [
                    {'name': 'Gull SSSK10', 'sum': 205},
                    {'name': 'Sølv Oppdal8', 'sum': 200},
                    {'name': 'Bronse TPK3', 'sum': 190},
                    {'pos': 4, 'name': 'Orkla3', 'sum': 190},
                ]},
            ]},
        ])
        index = self.build('felt', 2025,
                           [comp('m1', competitionTypeName='Åpent stevne m/KM')],
                           {'m1': d})
        section = index['comps'][0]['kmLag'][0]
        self.assertEqual(section['ovelse'], 'Felt Fin')
        self.assertEqual(section['klasse'], 'Mix')
        self.assertEqual(section['podium'], [
            {'medal': 'Gull', 'team': 'SSSK10', 'sum': 205},
            {'medal': 'Sølv', 'team': 'Oppdal8', 'sum': 200},
            {'medal': 'Bronse', 'team': 'TPK3', 'sum': 190},
        ])

    def test_datotid_fused_navn_km_section(self):
        d = detail('f1', [
            {'navn': '1F Finfelt Dato/tid: 11.06.2022 1100 '
                    'Mesterskap: KM Nordland Deltakere: 49', 'classes': [
                {'klasse': 'M', 'rows': [
                    row('A', pos=1), row('B', pos=2), row('C', pos=3),
                ]},
            ]},
        ])
        index = self.build('felt', 2022, [comp('f1')], {'f1': d})
        section = index['comps'][0]['km'][0]
        self.assertEqual(section['ovelse'], '1F Finfelt')
        self.assertEqual(section['klasse'], 'M')
        self.assertEqual(len(section['podium']), 3)

    def test_25m_scope_labels(self):
        d = detail('s1', [
            {'navn': '25m KM - Grov', 'classes': [
                {'klasse': 'V55', 'rows': [
                    row('A', pos=1), row('B', pos=2), row('C', pos=3),
                ]},
            ]},
            {'navn': '25m DM - Spesialrevolver', 'classes': [
                {'klasse': 'Åpen', 'rows': [
                    row('D', pos=1), row('E', pos=2), row('F', pos=3),
                ]},
            ]},
            {'navn': '25m KM -', 'classes': [
                {'klasse': 'Åpen', 'rows': [
                    row('G', pos=1), row('H', pos=2), row('I', pos=3),
                ]},
            ]},
            {'navn': '25m Fin', 'classes': [
                {'klasse': 'Åpen', 'rows': [row('J', pos=1)]},
            ]},
        ])
        index = self.build('bane', 2022,
                           [comp('s1',
                                 competitionTypeName='Åpent stevne m/DM og KM')],
                           {'s1': d})
        entry = index['comps'][0]
        self.assertEqual([s['ovelse'] for s in entry['km']],
                         ['25m Grov', '25m'])
        self.assertEqual([s['ovelse'] for s in entry['dm']],
                         ['25m Spesialrevolver'])
        self.assertIsNone(entry['region'])
        # no classification warnings — only the designed region-less
        # note for a comp with no krets
        self.assertEqual([w for w in index['warnings']
                          if 'region' not in w], [])
        self.assertEqual(len(index['warnings']), 1)

    def test_bare_25m_label_resolves_via_comp_discipline(self):
        comp_silhuett = comp('s2', results=[
            {'name': 'A', 'personId': 'p1',
             'discipline': '25m silhuettpistol'},
            {'name': 'B', 'personId': 'p2',
             'discipline': '25m silhuettpistol'},
        ])
        d = detail('s2', [
            {'navn': '25m KM -', 'classes': [
                {'klasse': 'Åpen', 'rows': [
                    row('A', pos=1), row('B', pos=2), row('C', pos=3),
                ]},
            ]},
        ])
        index = self.build('bane', 2025, [comp_silhuett], {'s2': d})
        entry = index['comps'][0]
        self.assertEqual([s['ovelse'] for s in entry['km']],
                         ['25m silhuettpistol'])

    def test_bare_25m_label_falls_back_when_comp_is_multi_discipline(self):
        comp_multi = comp('s3', results=[
            {'name': 'A', 'personId': 'p1', 'discipline': '25m grovpistol'},
            {'name': 'B', 'personId': 'p2', 'discipline': '25m finpistol'},
        ])
        d = detail('s3', [
            {'navn': '25m KM -', 'classes': [
                {'klasse': 'Åpen', 'rows': [
                    row('A', pos=1), row('B', pos=2), row('C', pos=3),
                ]},
            ]},
        ])
        index = self.build('bane', 2025, [comp_multi], {'s3': d})
        entry = index['comps'][0]
        self.assertEqual([s['ovelse'] for s in entry['km']], ['25m'])

    def test_relisting_pattern_non_t96(self):
        d = detail('r1', [
            {'navn': 'Spesialpistol (KM - Hordaland)', 'classes': [
                {'klasse': 'Å', 'rows': [
                    row('A', pos=1), row('B', pos=2), row('C', pos=3),
                ]},
            ]},
        ])
        index = self.build('bane', 2021, [comp('r1')], {'r1': d})
        section = index['comps'][0]['km'][0]
        self.assertEqual(section['ovelse'], 'Spesialpistol')

    def test_championshipish_unclassified_warns(self):
        d = detail('w1', [
            {'navn': 'KM-Gullcup', 'classes': [
                {'klasse': 'Å', 'rows': [row('A', pos=1)]},
            ]},
        ])
        index = self.build('felt', 2025, [comp('w1')], {'w1': d})
        self.assertEqual(index['comps'], [])
        self.assertTrue(any('KM-Gullcup' in w for w in index['warnings']))

    def test_inrx_sections_still_flow(self):
        d = detail('i1', generator='inrX 1.9.1.0', ovelser=[], **{
            'km': {
                'sections': [
                    {'navn': 'KM: Hurtig Fin', 'klasse': 'Å', 'rows': [
                        {'medal': 'Gull', 'name': 'X', 'club': 'C',
                         'personId': 'p1', 'sum': 285},
                        {'medal': 'Sølv', 'name': 'Y', 'club': 'D'},
                    ]},
                ],
                'lag': [
                    {'navn': 'KM Lag: Hurtig Fin', 'klasse': 'Å', 'teams': [
                        {'medal': 'Gull', 'team': 'GPK 1', 'sum': 287},
                    ]},
                ],
            },
        })
        index = self.build('bane', 2025, [comp('i1')], {'i1': d})
        entry = index['comps'][0]
        section = entry['km'][0]
        self.assertEqual(section['ovelse'], 'Hurtig Fin')
        self.assertEqual(section['podium'][0],
                         {'medal': 'Gull', 'name': 'X', 'personId': 'p1',
                          'club': 'C', 'sum': 285})
        self.assertEqual(entry['kmLag'][0]['podium'],
                         [{'medal': 'Gull', 'team': 'GPK 1', 'sum': 287}])

    def test_inrx_team_podium_gets_club_from_members(self):
        # PDF team names are often abbreviations ('GPK 1'); the comp's
        # API results resolve members to canonical clubs, so the team's
        # club comes from its first resolvable member. No resolvable
        # member → no club (the frontend falls back to the lag name).
        # Members flow through with their own personIds, clubs and sums;
        # a memberless team carries no members key.
        d = detail('i2', generator='inrX 1.9.1.0', ovelser=[], **{
            'km': {
                'sections': [],
                'lag': [
                    {'navn': 'KM Lag: Hurtig Fin', 'klasse': 'Å', 'teams': [
                        {'medal': 'Gull', 'team': 'GPK 1', 'sum': 287, 'members': [
                            {'name': 'A', 'klasse': 'Å', 'ix': 1, 'sum': 100, 'personId': 'p1'},
                            {'name': 'B', 'klasse': 'Å', 'ix': 2, 'sum': 99},
                        ]},
                        {'medal': 'Sølv', 'team': 'TPK3', 'sum': 280, 'members': []},
                    ]},
                ],
            },
        })
        index = self.build('bane', 2025,
                          [comp('i2', results=[
                              {'personId': 'p1', 'club': 'Gjøvik Pistolklubb'},
                          ])],
                          {'i2': d})
        podium = index['comps'][0]['kmLag'][0]['podium']
        self.assertEqual(podium[0], {
            'medal': 'Gull', 'team': 'GPK 1', 'sum': 287,
            'club': 'Gjøvik Pistolklubb',
            'members': [
                {'name': 'A', 'klasse': 'Å', 'personId': 'p1',
                 'club': 'Gjøvik Pistolklubb', 'sum': 100},
                {'name': 'B', 'klasse': 'Å', 'sum': 99},
            ],
        })
        self.assertEqual(podium[1], {'medal': 'Sølv', 'team': 'TPK3', 'sum': 280})


class RegionsAndClubs(MestereIndexBase):
    ROGALAND = '3b444426-1ea5-4c3c-c2af-08d859126e0a'
    SOR_TRONDELAG = '0808e8dc-6a2b-41a0-c2bc-08d859126e0a'

    def test_navn_region_wins_and_warns(self):
        d = detail('r1', [
            {'navn': '1F Finfelt Dato/tid: 11.06.2022 1100 '
                    'Mesterskap: KM Nordland Deltakere: 49', 'classes': [
                {'klasse': 'M', 'rows': [
                    row('A', pos=1), row('B', pos=2),
                ]},
            ]},
        ])
        comp_rogaland = dict(comp('r1'),
                             regionOrganizationId=self.ROGALAND)
        index = self.build('felt', 2022, [comp_rogaland], {'r1': d})
        entry = index['comps'][0]
        self.assertEqual(entry['region'], 'Nordland')
        self.assertEqual(entry['distrikt'], 'Nord-Norge')
        self.assertEqual(len(index['warnings']), 1)
        self.assertIn('Nordland', index['warnings'][0])
        self.assertIn('Rogaland', index['warnings'][0])

    def test_region_falls_back_to_comp(self):
        d = detail('r2', [
            {'navn': 'KM: Felt Grov', 'classes': [
                {'klasse': 'M', 'rows': [row('A', pos=1)]},
            ]},
        ])
        index = self.build('felt', 2022, [comp('r2')], {'r2': d})
        entry = index['comps'][0]
        self.assertIsNone(entry['region'])
        self.assertIsNone(entry['distrikt'])
        self.assertTrue(any('region' in w for w in index['warnings']))

        comp_rogaland = dict(comp('r2'),
                             regionOrganizationId=self.ROGALAND)
        index = self.build('felt', 2022, [comp_rogaland], {'r2': d})
        entry = index['comps'][0]
        self.assertEqual(entry['region'], 'Rogaland')
        self.assertEqual(entry['distrikt'], 'Syd-Norge')
        self.assertEqual(index['warnings'], [])

    def test_dm_navn_region_is_distrikt(self):
        d = detail('r3', [
            {'navn': 'Felt Fin Dato/tid: 11.06.2022 1100 '
                    'Mesterskap: DM Midt-Norge Deltakere: 49', 'classes': [
                {'klasse': 'M', 'rows': [row('A', pos=1)]},
            ]},
        ])
        comp_st = dict(comp('r3'),
                       regionOrganizationId=self.SOR_TRONDELAG)
        index = self.build('felt', 2022, [comp_st], {'r3': d})
        entry = index['comps'][0]
        self.assertEqual(entry['distrikt'], 'Midt-Norge')
        self.assertEqual(entry['region'], 'Sør-Trøndelag')

    def test_dashed_navn_region_normalizes(self):
        d = detail('r4', [
            {'navn': 'Felt Fin (DM - Østlandet-Nord)', 'classes': [
                {'klasse': 'M', 'rows': [row('A', pos=1)]},
            ]},
        ])
        index = self.build('felt', 2022, [comp('r4')], {'r4': d})
        entry = index['comps'][0]
        self.assertEqual(entry['distrikt'], 'Østlandet Nord')

    def test_nm_only_entries_carry_no_region(self):
        d = detail('r5', [
            {'navn': 'Felt Grov', 'classes': [
                {'klasse': 'M', 'rows': [
                    row('A', pos=1), row('B', pos=2), row('C', pos=3),
                ]},
            ]},
        ])
        comp_nm = dict(comp('r5'),
                       competitionTypeName='Norgesmesterskap',
                       regionOrganizationId=self.ROGALAND)
        index = self.build('felt', 2022, [comp_nm], {'r5': d})
        entry = index['comps'][0]
        self.assertNotIn('region', entry)
        self.assertNotIn('distrikt', entry)
        self.assertEqual(index['warnings'], [])

    def test_canonical_club_via_person_id(self):
        comp_api = comp('c1', results=[
            {'name': 'Kari Nordmann', 'personId': 'p1',
             'club': 'API Klubb'},
        ])
        d = detail('c1', [
            {'navn': 'KM: Felt Grov', 'classes': [
                {'klasse': 'M', 'rows': [
                    row('Kari Nordmann', pos=1, club='PDF-klubb',
                        personId='p1', sum_=300),
                    row('Ola Nordmann', pos=2, club='PDF-klubb',
                        sum_=290),
                ]},
            ]},
        ])
        index = self.build('felt', 2025, [comp_api], {'c1': d})
        podium = index['comps'][0]['km'][0]['podium']
        self.assertEqual(podium[0]['club'], 'API Klubb')
        self.assertEqual(podium[1]['club'], 'PDF-klubb')


class Exclusions(MestereIndexBase):
    def test_comp_without_championships_excluded(self):
        d = detail('p1', [
            {'navn': 'Felt Grov', 'classes': [
                {'klasse': 'M', 'rows': [row('A', pos=1)]},
            ]},
        ])
        index = self.build('felt', 2025, [comp('p1')], {'p1': d})
        self.assertEqual(index['comps'], [])
        self.assertEqual(index['warnings'], [])

    def test_mestere_path_shape(self):
        self.assertEqual(mestere_path('felt', 2025),
                         'public/data/felt/mestere-2025.json')


if __name__ == '__main__':
    unittest.main()
