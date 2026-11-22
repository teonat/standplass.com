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
                         [{'medal': 'Gull', 'team': 'Fredrikstad SS'},
                          {'medal': 'Sølv', 'team': 'Bærum PK'}])


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
            {'medal': 'Gull', 'team': 'SSSK10'},
            {'medal': 'Sølv', 'team': 'Oppdal8'},
            {'medal': 'Bronse', 'team': 'TPK3'},
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
                        {'medal': 'Gull', 'team': 'GPK 1'},
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
                         [{'medal': 'Gull', 'team': 'GPK 1'}])


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
