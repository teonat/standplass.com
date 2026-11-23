#!/usr/bin/env python3
"""Tests for .github/scripts/result_detail_census.py — run directly:

    python3 .github/scripts/test_result_detail_census.py
"""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout

from result_detail_census import (
    census_corpus,
    census_detail,
    diff_reports,
    main,
)


def _ovelse(navn, classes):
    return {'navn': navn, 'classes': classes}


class CensusDetail(unittest.TestCase):
    """One synthetic detail per check: the check fires on the defect
    shape and stays silent on the healthy shape."""

    def test_fused_comma_row(self):
        detail = {'ovelser': [_ovelse('Felt Fin', [
            {'klasse': 'A', 'rows': [
                {'name': 'Rune Hammer Aron Skytterklubb, Drammen'},
                {'name': 'Per Kulbraaten',
                 'club': 'Lillestrøm Og Omegn Pistolklubb'},
            ]},
        ])]}
        findings = census_detail(detail)['fused_comma']
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['name'],
                         'Rune Hammer Aron Skytterklubb, Drammen')

    def test_team_line_parsed_as_person(self):
        detail = {'ovelser': [_ovelse('25m Finpistol', [
            {'klasse': 'U14', 'rows': [
                {'name': 'Tysnes SSK 1 Ronnie Borgen(457) Steffen',
                 'club': 'Tysnes SSK'},
            ]},
        ])]}
        self.assertEqual(
            len(census_detail(detail)['team_lines_as_persons']), 1)

    def test_club_word_stuck_in_name(self):
        detail = {'ovelser': [_ovelse('Felt Fin', [
            {'klasse': 'A', 'rows': [
                {'name': 'Dag Kristiansen Stord Pistolklubb'},
            ]},
        ])]}
        self.assertEqual(
            len(census_detail(detail)['club_words_in_name']), 1)

    def test_ovelse_deltakere_mismatch(self):
        detail = {'ovelser': [_ovelse('Felt Fin', [
            {'klasse': 'A', 'rows': [{'name': 'A'}] * 16}])]}
        detail['ovelser'][0]['deltakere'] = 17
        findings = census_detail(detail)['deltakere_mismatch']
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['printed'], 17)
        self.assertEqual(findings[0]['parsed'], 16)

    def test_matching_deltakere_is_clean(self):
        detail = {'ovelser': [_ovelse('Felt Fin', [
            {'klasse': 'A', 'rows': [{'name': 'A'}] * 17}])]}
        detail['ovelser'][0]['deltakere'] = 17
        self.assertEqual(census_detail(detail)['deltakere_mismatch'], [])

    def test_file_level_deltakere_mismatch(self):
        # leon prints one count for the whole file
        detail = {'generator': 'leon', 'deltakere': 10,
                  'ovelser': [_ovelse('X', [
                      {'klasse': 'A', 'rows': [{'name': 'A'}] * 8}])]}
        self.assertEqual(
            len(census_detail(detail)['deltakere_mismatch']), 1)

    def test_champ_section_deltakere_mismatch(self):
        detail = {'km': {'sections': [
            {'navn': 'KM: 25m Finpistol', 'klasse': 'Å',
             'deltakere': 16, 'rows': [{'name': 'A'}] * 10},
            {'navn': 'KM: 25m Finpistol', 'klasse': 'V55',
             'deltakere': 16, 'rows': [{'name': 'B'}] * 2},
        ]}}
        findings = census_detail(detail)['deltakere_mismatch']
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['printed'], 16)
        self.assertEqual(findings[0]['parsed'], 12)

    def test_empty_ovelse(self):
        detail = {'ovelser': [
            _ovelse('Tom øvelse', [{'klasse': 'A', 'rows': []}]),
            _ovelse('Full øvelse',
                    [{'klasse': 'A', 'rows': [{'name': 'A'}]}]),
        ]}
        findings = census_detail(detail)['empty_ovelser']
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['ovelse'], 'Tom øvelse')

    def test_duplicate_rows_within_one_class(self):
        rows = [{'name': 'Ola Nordmann', 'club': 'Tysnes SSK'},
                {'name': 'Ola Nordmann', 'club': 'Tysnes SSK'},
                {'name': 'Ola Nordmann', 'club': 'Odda PK'}]
        detail = {'ovelser': [_ovelse('X', [{'klasse': 'A', 'rows': rows}])]}
        findings = census_detail(detail)['duplicate_rows']
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]['count'], 2)

    def test_same_person_in_two_classes_is_not_a_duplicate(self):
        row = {'name': 'Ola Nordmann', 'club': 'Tysnes SSK'}
        detail = {'ovelser': [_ovelse('X', [
            {'klasse': 'A', 'rows': [dict(row)]},
            {'klasse': 'B', 'rows': [dict(row)]},
        ])]}
        self.assertEqual(census_detail(detail)['duplicate_rows'], [])

    def test_sum_below_ix(self):
        detail = {'ovelser': [_ovelse('X', [{'klasse': 'A', 'rows': [
            {'name': 'A', 'sum': 5, 'ix': 10},
            {'name': 'B', 'sum': 12, 'ix': 2},
        ]}])]}
        self.assertEqual(len(census_detail(detail)['sum_lt_ix']), 1)

    def test_champ_rows_get_the_name_checks(self):
        detail = {'km': {'sections': [
            {'navn': 'KM: X', 'klasse': 'Å',
             'rows': [{'name': 'Fused, Club'}]}]}}
        self.assertEqual(len(census_detail(detail)['fused_comma']), 1)

    def test_lag_members_get_the_name_checks(self):
        detail = {'km': {'lag': [
            {'navn': 'KM Lag: X', 'klasse': 'Å', 'teams': [
                {'team': 'T 1', 'members': [{'name': 'Ola(500)'}]}]}]}}
        self.assertEqual(
            len(census_detail(detail)['team_lines_as_persons']), 1)

    def test_champ_duplicate_rows(self):
        row = {'name': 'Ola', 'club': 'K'}
        detail = {'km': {'sections': [
            {'navn': 'KM: X', 'klasse': 'Å', 'rows': [dict(row), dict(row)]}]}}
        self.assertEqual(len(census_detail(detail)['duplicate_rows']), 1)


class CensusCorpus(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = os.path.join(self._tmp.name, 'data')
        os.makedirs(os.path.join(self.root, 'detaljer', 'bane', '2021'))
        os.makedirs(os.path.join(self.root, 'bane'))

    def tearDown(self):
        self._tmp.cleanup()

    def _write_detail(self, comp_id, detail):
        with open(os.path.join(self.root, 'detaljer', 'bane', '2021',
                               f'{comp_id}.json'), 'w',
                  encoding='utf-8') as f:
            json.dump(detail, f)

    def _write_year(self, comps):
        with open(os.path.join(self.root, 'bane', '2021.json'), 'w',
                  encoding='utf-8') as f:
            json.dump({'competitions': comps}, f)

    def _write_index(self, comp_ids):
        with open(os.path.join(self.root, 'bane', 'mestere-2021.json'),
                  'w', encoding='utf-8') as f:
            json.dump({'year': 2021,
                       'comps': [{'compId': cid} for cid in comp_ids],
                       'warnings': []}, f)

    def test_champ_titled_comp_without_sections(self):
        self._write_year([
            {'id': 'c1', 'title': 'NM i 25m'},
            {'id': 'c2', 'title': 'KM Hordaland'},
            {'id': 'c3', 'title': '2109ppk52 Silhuett'},
        ])
        self._write_detail('c1', {
            'compId': 'c1', 'generator': 'datotid',
            'ovelser': [_ovelse('X', [
                {'klasse': 'A', 'rows': [{'name': 'A'}]}])],
        })
        self._write_detail('c2', {
            'compId': 'c2', 'generator': 'blinken 3.0.15',
            'km': {'sections': [{'navn': 'KM: X', 'klasse': 'Å',
                                 'rows': [{'name': 'B'}]}]},
        })
        self._write_index(['c2'])
        champ = census_corpus(self.root)['champ_titled_unindexed']
        self.assertEqual(champ['count'], 1)
        self.assertEqual(champ['by_reason'], {'no-sections': 1})
        self.assertEqual(champ['by_generator'], {'datotid': 1})

    def test_champ_titled_comp_with_sections_but_unindexed(self):
        self._write_year([{'id': 'c1', 'title': 'KM X'}])
        self._write_detail('c1', {
            'compId': 'c1', 'generator': 'blinken 3',
            'km': {'sections': [{'navn': 'KM: X', 'klasse': 'Å',
                                 'rows': [{'name': 'B'}]}]},
        })
        self._write_index([])
        champ = census_corpus(self.root)['champ_titled_unindexed']
        self.assertEqual(champ['by_reason'], {'sections-unindexed': 1})

    def test_champ_titled_comp_without_detail_file(self):
        self._write_year([{'id': 'c1', 'title': 'DM X'}])
        self._write_index([])
        champ = census_corpus(self.root)['champ_titled_unindexed']
        self.assertEqual(champ['by_reason'], {'no-detail': 1})

    def test_quarantined_champ_titled_comp(self):
        self._write_year([{'id': 'c1', 'title': 'NM X'}])
        self._write_detail('c1', {'compId': 'c1',
                                   'generator': 'quarantined'})
        self._write_index([])
        champ = census_corpus(self.root)['champ_titled_unindexed']
        self.assertEqual(champ['by_reason'], {'quarantined': 1})

    def test_checks_and_coverage_aggregate_across_files(self):
        self._write_year([{'id': 'c1', 'title': '2109ppk52 Silhuett'}])
        self._write_detail('c1', {
            'compId': 'c1', 'generator': 'inrX 1',
            'ovelser': [_ovelse('X', [{'klasse': 'A', 'rows': [
                {'name': 'Ola Nordmann', 'club': 'K', 'personId': 'p1'},
                {'name': 'Kari Nordmann', 'club': 'K'},
                {'name': 'Fused, Tail'},
            ]}])],
        })
        report = census_corpus(self.root)
        self.assertEqual(report['files'], 1)
        self.assertEqual(report['checks']['fused_comma']['count'], 1)
        self.assertEqual(
            report['checks']['fused_comma']['samples'][0]['file'],
            'detaljer/bane/2021/c1.json')
        self.assertEqual(report['champ_titled_unindexed']['count'], 0)
        cov = report['coverage_worst'][0]
        self.assertEqual((cov['matched'], cov['persons']), (1, 3))


class DiffAndMain(unittest.TestCase):
    def test_diff_reports_counts_the_delta(self):
        before = census_detail({'ovelser': [_ovelse('X', [
            {'klasse': 'A', 'rows': [{'name': 'Clean'}]}])]})
        after = census_detail({'ovelser': [_ovelse('X', [
            {'klasse': 'A', 'rows': [{'name': 'Clean'},
                                     {'name': 'Fused, Tail'}]}])]})
        self.assertEqual(
            diff_reports(before, after)['fused_comma'],
            {'before': 0, 'after': 1, 'delta': 1})

    def test_save_baseline_then_diff(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = os.path.join(tmp, 'data')
            os.makedirs(os.path.join(root, 'detaljer', 'bane', '2021'))
            os.makedirs(os.path.join(root, 'bane'))
            with open(os.path.join(root, 'bane', '2021.json'), 'w',
                      encoding='utf-8') as f:
                json.dump({'competitions': []}, f)
            detail_path = os.path.join(root, 'detaljer', 'bane', '2021',
                                       'c1.json')
            with open(detail_path, 'w', encoding='utf-8') as f:
                json.dump({'compId': 'c1', 'generator': 'inrX 1',
                           'ovelser': [_ovelse('X', [
                               {'klasse': 'A', 'rows': [
                                   {'name': 'Clean'}]}])]}, f)
            baseline = os.path.join(tmp, 'baseline.json')
            with redirect_stdout(io.StringIO()):
                main(['--data-dir', root, '--save-baseline', baseline])
            with open(detail_path, 'w', encoding='utf-8') as f:
                json.dump({'compId': 'c1', 'generator': 'inrX 1',
                           'ovelser': [_ovelse('X', [
                               {'klasse': 'A', 'rows': [
                                   {'name': 'Clean'},
                                   {'name': 'Fused, Tail'}]}])]}, f)
            buf = io.StringIO()
            with redirect_stdout(buf):
                main(['--data-dir', root, '--diff', baseline, '--json'])
            delta = json.loads(buf.getvalue())
            self.assertEqual(delta['fused_comma']['delta'], 1)


if __name__ == '__main__':
    unittest.main()
