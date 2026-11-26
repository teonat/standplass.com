"""Unit tests for the utfall index builder.

Synthetic detail files + year JSONs in a temp root — no PDFs, no
fetch. The integration behavior (run-level) lives in
test_parse_result_files.py's UtfallIndex class.
"""
import json
import os
import tempfile
import unittest

from utfall_index import build_utfall_index, utfall_census, utfall_path


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


def row(name, status=None, club=None, personId=None):
    r = {'name': name}
    if club:
        r['club'] = club
    if personId:
        r['personId'] = personId
    if status:
        r['status'] = status
    return r


class UtfallIndexBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def setup_year(self, branch, year, comps, details):
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

    def build(self, branch, year, comps, details):
        self.setup_year(branch, year, comps, details)
        return build_utfall_index(branch, year, root=self.root)


class Paths(UtfallIndexBase):
    def test_utfall_path(self):
        self.assertEqual(
            utfall_path('bane', 2024, root=self.root),
            os.path.join(self.root, 'public', 'data', 'bane',
                         'utfall-2024.json'))


class IndividualRows(UtfallIndexBase):
    def test_individual_rows_indexed_by_personid(self):
        d = detail('c1', [
            {'navn': 'Felt Fin', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari Nordmann', status='DNS', club='K1',
                        personId='p1'),
                    row('Ola Nordmann', status='DNS', club='K2'),
                    row('Per Hansen', club='K3', personId='p3'),
                ]},
            ]},
        ])
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(index['comps'], {'c1': {
            'title': 'Teststevne', 'date': '2025-08-16'}})
        self.assertEqual(index['persons'], {'p1': [{
            'compId': 'c1', 'ovelse': 'Felt Fin', 'klasse': 'A',
            'status': 'DNS'}]})


class KmDmSections(UtfallIndexBase):
    def test_km_dm_sections_included_with_prefixed_labels(self):
        d = detail('c1', [], km={'sections': [
            {'navn': 'KM: Felt Sp-Pistol', 'klasse': 'A', 'rows': [
                row('Kari', status='DNF', personId='p1')]}]},
                   dm={'sections': [
                       {'navn': 'DM: Felt Fin', 'klasse': 'B', 'rows': [
                           row('Ola', status='DSQ', personId='p2')]}]})
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(index['persons'], {
            'p1': [{'compId': 'c1', 'ovelse': 'KM: Felt Sp-Pistol',
                    'klasse': 'A', 'status': 'DNF'}],
            'p2': [{'compId': 'c1', 'ovelse': 'DM: Felt Fin',
                    'klasse': 'B', 'status': 'DSQ'}]})


class LagTeams(UtfallIndexBase):
    def test_km_dm_lag_teams_expand_to_members(self):
        d = detail('c1', [], km={'lag': [
            {'navn': 'KM Lag: Felt Fin', 'klasse': 'Å', 'teams': [
                {'team': 'SSSK 1', 'status': 'DNS', 'members': [
                    {'name': 'A', 'personId': 'p1'},
                    {'name': 'B'}]}]}]})
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(index['persons'], {'p1': [{
            'compId': 'c1', 'ovelse': 'KM Lag: Felt Fin', 'klasse': 'Å',
            'status': 'DNS', 'lag': True, 'team': 'SSSK 1'}]})

    def test_ovelser_lag_teams_expand_to_members(self):
        d = detail('c1', [
            {'navn': 'Lag: Felt Fin', 'classes': [
                {'klasse': 'Å', 'teams': [
                    {'team': 'K1', 'status': 'DNF', 'members': [
                        {'name': 'A', 'personId': 'p1'},
                        {'name': 'B'}]}]}]}])
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(index['persons'], {'p1': [{
            'compId': 'c1', 'ovelse': 'Lag: Felt Fin', 'klasse': 'Å',
            'status': 'DNF', 'lag': True, 'team': 'K1'}]})


class Dedup(UtfallIndexBase):
    def test_double_registration_keeps_km_face(self):
        d = detail('c1', [
            {'navn': 'Felt Sp-Pistol', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari', status='DNF', personId='p1')]}]},
        ], km={'sections': [
            {'navn': 'KM: Felt Sp-Pistol', 'klasse': 'B', 'rows': [
                row('Kari', status='DNF', personId='p1')]}]})
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(index['persons'], {'p1': [{
            'compId': 'c1', 'ovelse': 'KM: Felt Sp-Pistol',
            'klasse': 'B', 'status': 'DNF'}]})

    def test_dedup_requires_same_status(self):
        d = detail('c1', [
            {'navn': 'Felt Sp-Pistol', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari', status='DNS', personId='p1')]}]},
        ], km={'sections': [
            {'navn': 'KM: Felt Sp-Pistol', 'klasse': 'B', 'rows': [
                row('Kari', status='DNF', personId='p1')]}]})
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(len(index['persons']['p1']), 2)
        self.assertEqual({e['status'] for e in index['persons']['p1']},
                         {'DNS', 'DNF'})


class Scope(UtfallIndexBase):
    def test_t96_ovelser_included(self):
        d = detail('c1', [
            {'navn': 'T96 Finfelt', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari', status='DNS', personId='p1')]}]}])
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(index['persons']['p1'][0]['ovelse'],
                         'T96 Finfelt')

    def test_comps_map_joins_year_json(self):
        d1 = detail('c1', [
            {'navn': 'Felt Fin', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari', status='DNS', personId='p1')]}]}])
        d2 = detail('cX', [
            {'navn': 'Felt Fin', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Ola', status='DNS', personId='p2')]}]}])
        index = self.build('felt', 2025, [
            comp('c1', title='Stevne 1',
                 resultFileUrl='https://example.com/r.pdf',
                 startDate='2025-06-01T00:00:00'),
            comp('other')], {'c1': d1, 'cX': d2})
        self.assertEqual(index['comps'], {'c1': {
            'title': 'Stevne 1', 'date': '2025-06-01',
            'resultFileUrl': 'https://example.com/r.pdf'}})
        self.assertNotIn('p2', index['persons'])

    def test_entries_sorted_date_desc(self):
        d1 = detail('c1', [
            {'navn': 'Felt Fin', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari', status='DNS', personId='p1')]}]}])
        d2 = detail('c2', [
            {'navn': 'Felt Grov', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari', status='DNF', personId='p1')]}]}])
        index = self.build('felt', 2025, [
            comp('c1', startDate='2025-06-01T00:00:00'),
            comp('c2', startDate='2025-08-16T00:00:00')],
            {'c1': d1, 'c2': d2})
        self.assertEqual([e['compId'] for e in index['persons']['p1']],
                         ['c2', 'c1'])

    def test_quarantined_detail_skipped(self):
        d = detail('c1', [
            {'navn': 'Felt Fin', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('Kari', status='DNS', personId='p1')]}]}],
                   generator='quarantined')
        index = self.build('felt', 2025, [comp('c1')], {'c1': d})
        self.assertEqual(index, {'year': 2025, 'comps': {},
                                  'persons': {}})

    def test_empty_year_returns_empty_index(self):
        year_dir = os.path.join(self.root, 'public', 'data', 'felt')
        os.makedirs(year_dir)
        with open(os.path.join(year_dir, '2025.json'), 'w') as f:
            json.dump({'competitions': [comp('c1')]}, f)
        index = build_utfall_index('felt', 2025, root=self.root)
        self.assertEqual(index, {'year': 2025, 'comps': {},
                                 'persons': {}})


class Census(UtfallIndexBase):
    def test_census_counts(self):
        d = detail('c1', [
            {'navn': 'Felt Sp-Pistol', 'classes': [
                {'klasse': 'A', 'rows': [
                    row('K', status='DNF', personId='p1'),
                    row('O', status='DNS')]}]},
        ], km={
            'sections': [
                {'navn': 'KM: Felt Sp-Pistol', 'klasse': 'B', 'rows': [
                    row('K', status='DNF', personId='p1')]}],
            'lag': [
                {'navn': 'KM Lag: Felt Fin', 'klasse': 'Å', 'teams': [
                    {'team': 'T1', 'status': 'DNS', 'members': [
                        {'name': 'M', 'personId': 'p2'},
                        {'name': 'N'}]}]}]})
        self.setup_year('felt', 2025, [comp('c1')], {'c1': d})
        census = utfall_census('felt', 2025, root=self.root)
        self.assertEqual(census, {
            'ovelser_rows': 2, 'ovelser_pid': 1,
            'km_rows': 1, 'km_pid': 1,
            'dm_rows': 0, 'dm_pid': 0,
            'lag_teams': 1, 'team_members': 1,
            'deduped': 1, 'entries': 2, 'persons': 2})


if __name__ == '__main__':
    unittest.main()
