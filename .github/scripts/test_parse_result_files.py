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
    detail_path,
    run,
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


if __name__ == '__main__':
    unittest.main()
