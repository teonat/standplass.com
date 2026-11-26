#!/usr/bin/env python3
"""Tests for .github/scripts/detaljer_bundles.py — run directly:

    python3 .github/scripts/test_detaljer_bundles.py
"""

import json
import os
import tempfile
import unittest

from detaljer_bundles import (
    bundle_path,
    has_any_bundle,
    load_bundle,
    write_bundle_if_changed,
)


def detail(comp_id):
    """Minimal but nested per-comp detail, shaped like the parse
    pipeline's output."""
    return {
        'compId': comp_id,
        'generator': 'plain-NO',
        'sourceUrl': ('https://nsfstorage.blob.core.windows.net/'
                      f'resultfiles/{comp_id}.pdf'),
        'sourceHash': f'sha256-{comp_id}',
        'pdfEtag': '"etag-1"',
        'parsedAt': '2026-11-27T08:00:00Z',
        'parserVersion': 1,
        'ovelser': [
            {'navn': 'Felt Fin', 'classes': [
                {'klasse': 'A', 'rows': [
                    {'name': 'Kari Nordmann', 'personId': 'p1',
                     'series': [[9, 6], [8, 7]], 'sum': 30},
                ]},
            ]},
        ],
    }


class BundlePath(unittest.TestCase):
    def test_bundle_path_shape(self):
        self.assertTrue(bundle_path('felt', 2026, root='/x').endswith(
            'detaljer/felt/2026.json'))
        self.assertEqual(
            bundle_path('felt', 2026),
            os.path.join('public', 'data', 'detaljer', 'felt', '2026.json'))


class LoadBundle(unittest.TestCase):
    def test_load_bundle_missing_file_gives_empty(self):
        self.assertEqual(load_bundle('/nonexistent.json'), {'comps': {}})


class WriteBundle(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def test_write_then_load_round_trip(self):
        comps = {'comp-zz': detail('comp-zz'), 'comp-aa': detail('comp-aa')}
        path = bundle_path('felt', 2026, root=self.root)
        self.assertTrue(write_bundle_if_changed(path, comps))
        loaded = load_bundle(path)
        self.assertEqual(loaded['comps']['comp-aa'], comps['comp-aa'])
        self.assertEqual(loaded['comps']['comp-zz'], comps['comp-zz'])
        with open(path, encoding='utf-8') as f:
            on_disk = json.load(f)
        self.assertEqual(list(on_disk['comps']), ['comp-aa', 'comp-zz'])

    def test_write_unchanged_returns_false_and_leaves_file(self):
        path = bundle_path('bane', 2025, root=self.root)
        comps = {'comp-aa': detail('comp-aa'), 'comp-zz': detail('comp-zz')}
        self.assertTrue(write_bundle_if_changed(path, comps))
        with open(path, 'rb') as f:
            before = f.read()
        reordered = {'comp-zz': comps['comp-zz'], 'comp-aa': comps['comp-aa']}
        self.assertFalse(write_bundle_if_changed(path, reordered))
        with open(path, 'rb') as f:
            self.assertEqual(f.read(), before)

    def test_write_changed_returns_true(self):
        path = bundle_path('felt', 2026, root=self.root)
        comps = {'comp-aa': detail('comp-aa')}
        self.assertTrue(write_bundle_if_changed(path, comps))
        comps['comp-mm'] = detail('comp-mm')
        self.assertTrue(write_bundle_if_changed(path, comps))
        self.assertEqual(sorted(load_bundle(path)['comps']),
                         ['comp-aa', 'comp-mm'])

    def test_no_temp_files_left_behind(self):
        path = bundle_path('bane', 2024, root=self.root)
        self.assertTrue(write_bundle_if_changed(
            path, {'comp-aa': detail('comp-aa')}))
        self.assertFalse(write_bundle_if_changed(
            path, {'comp-aa': detail('comp-aa')}))
        self.assertTrue(write_bundle_if_changed(
            path, {'comp-aa': detail('comp-aa'),
                   'comp-zz': detail('comp-zz')}))
        self.assertEqual(os.listdir(os.path.dirname(path)), ['2024.json'])


class HasAnyBundle(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def test_has_any_bundle(self):
        self.assertFalse(has_any_bundle(root=self.root))
        # the old per-comp layout (detaljer/<branch>/<year>/<comp>.json)
        # must not count as a bundle
        old = os.path.join(self.root, 'public', 'data', 'detaljer',
                           'felt', '2026', 'comp-aa.json')
        os.makedirs(os.path.dirname(old))
        with open(old, 'w') as f:
            json.dump(detail('comp-aa'), f)
        self.assertFalse(has_any_bundle(root=self.root))
        self.assertTrue(write_bundle_if_changed(
            bundle_path('felt', 2026, root=self.root),
            {'comp-aa': detail('comp-aa')}))
        self.assertTrue(has_any_bundle(root=self.root))


if __name__ == '__main__':
    unittest.main()
