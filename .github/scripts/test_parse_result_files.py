#!/usr/bin/env python3
"""Tests for .github/scripts/parse_result_files.py — run directly:

    python3 .github/scripts/test_parse_result_files.py
"""

import json
import os
import tempfile
import unittest

from parse_result_files import (
    PARSER_VERSION,
    build_km_index,
    detail_path,
    index_path,
    run,
    run_sweep,
    should_reparse,
    source_hash,
    write_detail,
)

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')


def fixture_bytes(name):
    with open(os.path.join(FIXTURES, name), 'rb') as f:
        return f.read()


def write_year(root, branch, year, comps):
    directory = os.path.join(root, 'public', 'data', branch)
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, f'{year}.json'), 'w') as f:
        json.dump({'competitions': comps}, f)


def make_comp(comp_id, url, results=None):
    return {
        'id': comp_id,
        'title': 'Teststevne',
        'resultFileUrl': url,
        'results': [] if results is None else results,
    }


BANE_PDF_RESULTS = [
    {'name': 'Lars Erik Fjelldal', 'club': 'Stavanger Pistolklubb',
     'personId': 'p1', 'class': 'A', 'discipline': 'T96 Fin'},
    {'name': 'Mirvet Pupovic', 'club': 'Sandnes Pistolklubb',
     'personId': 'p2', 'class': 'A', 'discipline': 'T96 Fin'},
]


class DetailPath(unittest.TestCase):
    def test_path_under_repo_root(self):
        self.assertEqual(
            detail_path('felt', '2026', 'abc'),
            'public/data/detaljer/felt/2026/abc.json',
        )

    def test_path_honors_root(self):
        self.assertEqual(
            detail_path('bane', '2024', 'abc', root='/tmp/x'),
            os.path.join('/tmp/x', 'public/data/detaljer/bane/2024/abc.json'),
        )


class WriteDetail(unittest.TestCase):
    def test_roundtrip_preserves_shape_and_omits_absent_fields(self):
        detail = {
            'compId': 'abc',
            'ovelser': [
                {'navn': 'Felt Fin', 'classes': [
                    {'klasse': 'A', 'rows': [
                        {'pos': 1, 'name': 'X', 'series': [[9, 6]],
                         'ix': 1, 'sum': 2},
                    ]},
                ]},
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'detaljer', 'felt', '2026', 'abc.json')
            write_detail(path, detail)
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        self.assertEqual(data, detail)
        self.assertNotIn(
            'status', data['ovelser'][0]['classes'][0]['rows'][0]
        )


class ShouldReparse(unittest.TestCase):
    def setUp(self):
        self.url = 'https://nsfstorage.blob.core.windows.net/x/y.pdf'
        self.comp = {
            'id': 'abc',
            'resultFileUrl': self.url,
            'results': [{'name': 'A', 'personId': 'p1'}],
        }
        self.existing = {
            'sourceUrl': self.url,
            'sourceHash': source_hash(self.comp, self.url),
            'parserVersion': PARSER_VERSION,
        }

    def test_missing_detail_file(self):
        self.assertTrue(should_reparse(None, self.comp, self.url))

    def test_identical_inputs_are_fresh(self):
        self.assertFalse(should_reparse(self.existing, self.comp, self.url))

    def test_changed_result_file_url(self):
        new_url = 'https://nsfstorage.blob.core.windows.net/x/z.pdf'
        self.assertTrue(should_reparse(self.existing, self.comp, new_url))

    def test_changed_api_results(self):
        changed = dict(self.comp, results=[{'name': 'A', 'personId': 'p2'}])
        self.assertTrue(should_reparse(self.existing, changed, self.url))

    def test_older_parser_version(self):
        older = dict(self.existing, parserVersion=PARSER_VERSION - 1)
        self.assertTrue(should_reparse(older, self.comp, self.url))

    def test_newer_parser_version_stays(self):
        newer = dict(self.existing, parserVersion=PARSER_VERSION + 1)
        self.assertFalse(should_reparse(newer, self.comp, self.url))


class RunOrchestrator(unittest.TestCase):
    PDF_URL = 'https://nsfstorage.blob.core.windows.net/competitionresults/a17c50ce.pdf'

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def fake_fetch(self, url, calls=None):
        if calls is None:
            calls = []
        def _fetch(u):
            calls.append(u)
            if u == self.PDF_URL:
                return fixture_bytes('inrx-bane.pdf'), '"etag-1"'
            return b'not really a pdf', None
        return _fetch, calls

    def test_writes_detail_and_skips_non_pdf(self):
        write_year(self.root, 'felt', '2025', [
            make_comp('comp-a', self.PDF_URL, BANE_PDF_RESULTS),
            make_comp('comp-b', 'https://nsfstorage.blob.core.windows.net/x/y.xls'),
        ])
        fetch, _ = self.fake_fetch(self.PDF_URL)
        summary = run({'full_scan': True, 'year': '2025', 'branch': 'felt',
                       'dry_run': False}, fetch_pdf=fetch, root=self.root)
        path = detail_path('felt', '2025', 'comp-a', root=self.root)
        self.assertTrue(os.path.exists(path))
        with open(path, encoding='utf-8') as f:
            detail = json.load(f)
        self.assertEqual(detail['compId'], 'comp-a')
        self.assertEqual(detail['sourceUrl'], self.PDF_URL)
        self.assertEqual(detail['pdfEtag'], '"etag-1"')
        self.assertEqual(detail['parserVersion'], PARSER_VERSION)
        self.assertTrue(detail['generator'].startswith('inrX'))
        self.assertTrue(detail['ovelser'])
        rows = detail['ovelser'][0]['classes'][0]['rows']
        self.assertEqual(rows[0]['personId'], 'p1')
        self.assertEqual(summary['parsed'], 1)
        self.assertEqual(summary['skipped_non_pdf'], 1)
        self.assertEqual(summary['quarantined'], 0)
        self.assertEqual(summary['matched'], 2)
        self.assertEqual(summary['unmatched'], 6)

    def test_quarantine_marker_written_and_not_retried(self):
        write_year(self.root, 'bane', '2025', [
            make_comp('comp-junk', 'https://nsfstorage.blob.core.windows.net/x/junk.pdf',
                      BANE_PDF_RESULTS),
        ])
        fetch, calls = self.fake_fetch(self.PDF_URL)
        opts = {'full_scan': False, 'year': '2025', 'branch': 'bane',
                'dry_run': False}
        summary = run(opts, fetch_pdf=fetch, root=self.root)
        self.assertEqual(summary['quarantined'], 1)
        self.assertEqual(summary['parsed'], 0)
        path = detail_path('bane', '2025', 'comp-junk', root=self.root)
        with open(path, encoding='utf-8') as f:
            marker = json.load(f)
        self.assertEqual(marker['generator'], 'quarantined')
        self.assertTrue(marker['reason'])
        self.assertEqual(marker['parserVersion'], PARSER_VERSION)
        self.assertEqual(marker['sourceUrl'],
                         'https://nsfstorage.blob.core.windows.net/x/junk.pdf')
        calls_before = len(calls)
        summary2 = run(opts, fetch_pdf=fetch, root=self.root)
        self.assertEqual(len(calls), calls_before)  # no retry
        self.assertEqual(summary2['quarantined'], 1)
        self.assertEqual(summary2['parsed'], 0)

    def test_cross_branch_url_fetched_once_written_twice(self):
        comp = make_comp('comp-dup', self.PDF_URL, BANE_PDF_RESULTS)
        write_year(self.root, 'felt', '2025', [comp])
        write_year(self.root, 'bane', '2025', [comp])
        fetch, calls = self.fake_fetch(self.PDF_URL)
        summary = run({'full_scan': True, 'year': '2025', 'branch': None,
                       'dry_run': False}, fetch_pdf=fetch, root=self.root)
        self.assertEqual(len(calls), 1)
        self.assertTrue(os.path.exists(detail_path('felt', '2025', 'comp-dup', root=self.root)))
        self.assertTrue(os.path.exists(detail_path('bane', '2025', 'comp-dup', root=self.root)))
        self.assertEqual(summary['parsed'], 2)

    def test_dry_run_writes_nothing_but_counts(self):
        write_year(self.root, 'felt', '2025', [
            make_comp('comp-a', self.PDF_URL, BANE_PDF_RESULTS),
        ])
        fetch, _ = self.fake_fetch(self.PDF_URL)
        summary = run({'full_scan': True, 'year': '2025', 'branch': 'felt',
                       'dry_run': True}, fetch_pdf=fetch, root=self.root)
        self.assertFalse(os.path.exists(
            detail_path('felt', '2025', 'comp-a', root=self.root)))
        self.assertEqual(summary['parsed'], 1)
        self.assertEqual(summary['matched'], 2)

    def test_fresh_detail_not_refetched_even_in_full_scan(self):
        write_year(self.root, 'felt', '2025', [
            make_comp('comp-a', self.PDF_URL, BANE_PDF_RESULTS),
        ])
        fetch, calls = self.fake_fetch(self.PDF_URL)
        opts = {'full_scan': True, 'year': '2025', 'branch': 'felt',
                'dry_run': False}
        run(opts, fetch_pdf=fetch, root=self.root)
        summary2 = run(opts, fetch_pdf=fetch, root=self.root)
        self.assertEqual(len(calls), 1)  # fetched only on the first run
        self.assertEqual(summary2['up_to_date'], 1)
        self.assertEqual(summary2['parsed'], 0)

    def test_default_mode_covers_only_recent_years(self):
        from datetime import date
        current = date.today().year
        old_url = self.PDF_URL.replace('a17c50ce', 'b17c50ce')
        write_year(self.root, 'felt', str(current), [make_comp('c-now', self.PDF_URL, BANE_PDF_RESULTS)])
        write_year(self.root, 'felt', str(current - 1), [make_comp('c-prev', old_url, BANE_PDF_RESULTS)])
        write_year(self.root, 'felt', '2021', [make_comp('c-old', self.PDF_URL, BANE_PDF_RESULTS)])
        calls = []

        def fetch(url):
            calls.append(url)
            return fixture_bytes('inrx-bane.pdf'), '"e"'

        summary = run({'full_scan': False, 'year': None, 'branch': 'felt',
                       'dry_run': True}, fetch_pdf=fetch, root=self.root)
        self.assertEqual(summary['parsed'], 2)
        self.assertEqual(len(calls), 2)
        self.assertFalse(os.path.exists(
            detail_path('felt', '2021', 'c-old', root=self.root)))


class KmDmIndex(unittest.TestCase):
    FELT_KM_URL = 'https://nsfstorage.blob.core.windows.net/competitionresults/f2fd227a.pdf'
    BANE_KM_URL = 'https://nsfstorage.blob.core.windows.net/competitionresults/8c9065b4.pdf'
    PLAIN_URL = 'https://nsfstorage.blob.core.windows.net/competitionresults/a17c50ce.pdf'

    @classmethod
    def setUpClass(cls):
        import pdfplumber
        from result_file_parse import parse_result
        from result_file_matching import attach_person_ids
        cls._tmp = tempfile.TemporaryDirectory()
        root = cls._tmp.name
        felt_comp = bane_km_comp = plain_comp = None
        for path in ('public/data/felt/2025.json', 'public/data/bane/2025.json',
                     'public/data/bane/2026.json'):
            for c in json.load(open(path))['competitions']:
                if 'f2fd227a' in (c.get('resultFileUrl') or ''):
                    felt_comp = c
                if '8c9065b4' in (c.get('resultFileUrl') or ''):
                    bane_km_comp = c
                if 'a17c50ce' in (c.get('resultFileUrl') or ''):
                    plain_comp = c
        cls.felt_comp_id = felt_comp['id']
        cls.bane_km_comp_id = bane_km_comp['id']
        cls.plain_comp_id = plain_comp['id']
        write_year(root, 'felt', '2025', [felt_comp])
        write_year(root, 'bane', '2025', [bane_km_comp, plain_comp])
        plain_comp_url = plain_comp['resultFileUrl']

        def fetch(url):
            if 'f2fd227a' in url:
                return fixture_bytes('inrx-felt-km.pdf'), '"e1"'
            if '8c9065b4' in url:
                return fixture_bytes('inrx-bane-km.pdf'), '"e2"'
            if 'a17c50ce' in url:
                return fixture_bytes('inrx-bane.pdf'), '"e3"'
            raise AssertionError(f'unexpected url {url}')

        cls.summary = run({'full_scan': True, 'year': '2025', 'branch': None,
                           'dry_run': False}, fetch_pdf=fetch, root=root)
        cls.root = root

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_run_wrote_both_indexes(self):
        self.assertTrue(os.path.exists(index_path('felt', '2025', root=self.root)))
        self.assertTrue(os.path.exists(index_path('bane', '2025', root=self.root)))
        self.assertGreaterEqual(self.summary.get('indexes_written', 0), 2)

    def test_index_path_shape(self):
        self.assertEqual(
            index_path('felt', '2025'),
            'public/data/felt/km-dm-2025.json',
        )

    def test_felt_dm_champions_with_person_ids(self):
        index = build_km_index('felt', '2025', root=self.root)
        entry = next(c for c in index['comps'] if c['compId'] == self.felt_comp_id)
        self.assertEqual(entry['title'], 'Feltstemne FGMR DM i FGMR')
        self.assertTrue(entry['organizer'])
        self.assertEqual(entry['date'], entry['date'][:10])
        section = next(s for s in entry['dm']
                       if s['ovelse'] == 'Felt Fin' and s['klasse'] == 'M')
        self.assertEqual([c['medal'] for c in section['champions']],
                         ['Gull', 'Sølv', 'Bronse'])
        gull = section['champions'][0]
        self.assertEqual(gull['name'], 'Kjell Jomar Heltne')
        self.assertEqual(gull['club'], 'Florø Pistolklubb')
        self.assertTrue(gull['personId'])
        self.assertNotIn('series', section)

    def test_bane_km_and_lag_champions(self):
        index = build_km_index('bane', '2025', root=self.root)
        entry = next(c for c in index['comps'] if c['compId'] == self.bane_km_comp_id)
        section = next(s for s in entry['km']
                       if s['ovelse'] == 'Hurtig Sp Pistol' and s['klasse'] == 'Å')
        gull = section['champions'][0]
        self.assertEqual(gull['name'], 'Tore Vrålstad')
        self.assertTrue(gull['personId'])
        lag = next(s for s in entry['kmLag'] if s['ovelse'] == 'Hurtig Sp Pistol')
        self.assertEqual(lag['champions'][0], {'medal': 'Gull', 'team': 'GPK 1'})

    def test_comp_without_championships_excluded(self):
        index = build_km_index('bane', '2025', root=self.root)
        comp_ids = {c['compId'] for c in index['comps']}
        self.assertNotIn(self.plain_comp_id, comp_ids)
        self.assertEqual(index['year'], 2025)

    def test_second_run_rewrites_no_indexes(self):
        def fetch(url):
            raise AssertionError('second run must not fetch anything')

        summary = run({'full_scan': True, 'year': '2025', 'branch': None,
                       'dry_run': False}, fetch_pdf=fetch, root=self.root)
        self.assertEqual(summary['parsed'], 0)
        self.assertEqual(summary['up_to_date'], 3)
        self.assertEqual(summary['indexes_written'], 0)


class EtagSweep(unittest.TestCase):
    PDF_URL = 'https://nsfstorage.blob.core.windows.net/competitionresults/a17c50ce-full.pdf'

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name
        write_year(self.root, 'felt', '2025', [
            make_comp('comp-a', self.PDF_URL, BANE_PDF_RESULTS),
        ])

    def tearDown(self):
        self._tmp.cleanup()

    def _run_once(self):
        fetch, _ = None, None

        def plain_fetch(url):
            return fixture_bytes('inrx-bane.pdf'), '"e1"'

        return run({'full_scan': True, 'year': '2025', 'branch': 'felt',
                   'dry_run': False}, fetch_pdf=plain_fetch, root=self.root)

    def _detail(self):
        with open(detail_path('felt', '2025', 'comp-a', root=self.root),
                  encoding='utf-8') as f:
            return json.load(f)

    def test_304_leaves_file_untouched(self):
        self._run_once()
        before = self._detail()

        def conditional(url, etag):
            assert etag == '"e1"'
            return 304, b'', '"e1"'

        summary = run_sweep({'full_scan': True, 'year': '2025', 'branch': 'felt'},
                            fetch_conditional=conditional, root=self.root)
        self.assertEqual(summary['checked'], 1)
        self.assertEqual(summary['changed'], 0)
        self.assertEqual(summary['re-parsed'], 0)
        self.assertEqual(self._detail(), before)

    def test_200_re_parses_and_updates_etag(self):
        self._run_once()

        def conditional(url, etag):
            assert etag == '"e1"'
            return 200, fixture_bytes('inrx-felt.pdf'), '"e2"'

        summary = run_sweep({'full_scan': True, 'year': '2025', 'branch': 'felt'},
                            fetch_conditional=conditional, root=self.root)
        self.assertEqual(summary['changed'], 1)
        self.assertEqual(summary['re-parsed'], 1)
        detail = self._detail()
        self.assertEqual(detail['pdfEtag'], '"e2"')
        names = {r['name'] for o in detail['ovelser'] for c in o['classes']
                 for r in c['rows']}
        self.assertIn('Gustav Tisthamar', names)

    def test_missing_etag_treated_as_changed_once(self):
        self._run_once()
        path = detail_path('felt', '2025', 'comp-a', root=self.root)
        detail = json.load(open(path))
        detail.pop('pdfEtag')
        json.dump(detail, open(path, 'w'))

        def conditional(url, etag):
            assert etag is None
            return 200, fixture_bytes('inrx-bane.pdf'), '"e9"'

        summary = run_sweep({'full_scan': True, 'year': '2025', 'branch': 'felt'},
                            fetch_conditional=conditional, root=self.root)
        self.assertEqual(summary['changed'], 1)
        self.assertEqual(self._detail()['pdfEtag'], '"e9"')

        def now_304(url, etag):
            assert etag == '"e9"'
            return 304, b'', '"e9"'

        summary2 = run_sweep({'full_scan': True, 'year': '2025', 'branch': 'felt'},
                             fetch_conditional=now_304, root=self.root)
        self.assertEqual(summary2['changed'], 0)


if __name__ == '__main__':
    unittest.main()
