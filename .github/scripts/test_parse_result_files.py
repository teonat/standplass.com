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
    should_reparse,
    source_hash,
    write_detail,
)


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


if __name__ == '__main__':
    unittest.main()
