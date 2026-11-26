#!/usr/bin/env python3
"""Tests for .github/scripts/migrate_detaljer_bundles.py — run directly:

    python3 .github/scripts/test_migrate_detaljer_bundles.py
"""

import json
import os
import tempfile
import unittest

import migrate_detaljer_bundles
from detaljer_bundles import bundle_path, load_bundle, write_bundle_if_changed
from migrate_detaljer_bundles import migrate


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
                    {'name': f'Skytter {comp_id}',
                     'personId': f'p-{comp_id}',
                     'series': [[9, 6], [8, 7]], 'sum': 30},
                ]},
            ]},
        ],
    }


def write_old_tree(root, scopes):
    """Write a synthetic per-comp detaljer tree; scopes is
    {(branch, year): {comp_id: detail}}."""
    for (branch, year), comps in scopes.items():
        year_dir = os.path.join(root, 'public', 'data', 'detaljer',
                                branch, str(year))
        os.makedirs(year_dir)
        for comp_id, comp in comps.items():
            with open(os.path.join(year_dir, f'{comp_id}.json'), 'w',
                      encoding='utf-8') as f:
                json.dump(comp, f, ensure_ascii=False, separators=(',', ':'))


def year_dir(root, branch, year):
    return os.path.join(root, 'public', 'data', 'detaljer',
                        branch, str(year))


class MigrateDetaljerBundles(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def test_migrates_each_scope(self):
        scopes = {
            ('felt', 2023): {'comp-zz': detail('comp-zz'),
                             'comp-aa': detail('comp-aa'),
                             'comp-mm': detail('comp-mm')},
            ('bane', 2024): {'comp-bb': detail('comp-bb'),
                             'comp-aa': detail('comp-aa')},
        }
        write_old_tree(self.root, scopes)

        summary = migrate(root=self.root)

        self.assertEqual(sorted(summary), [('bane', 2024), ('felt', 2023)])
        for (branch, year), comps in scopes.items():
            path = bundle_path(branch, year, root=self.root)
            self.assertTrue(os.path.isfile(path))
            # old year dir removed; branch dir kept, holding just the
            # bundle
            self.assertFalse(os.path.isdir(year_dir(self.root, branch, year)))
            branch_dir = os.path.dirname(path)
            self.assertTrue(os.path.isdir(branch_dir))
            self.assertEqual(os.listdir(branch_dir), [f'{year}.json'])
            self.assertEqual(summary[(branch, year)], {
                'branch': branch,
                'year': year,
                'comps': len(comps),
                'bytes': os.path.getsize(path),
            })

    def test_entries_deep_equal_and_sorted(self):
        scopes = {
            ('felt', 2023): {'comp-zz': detail('comp-zz'),
                             'comp-aa': detail('comp-aa')},
            ('bane', 2024): {'comp-bb': detail('comp-bb')},
        }
        write_old_tree(self.root, scopes)
        # the JSON exactly as it sits in the source files, captured
        # before the migration deletes them
        source = {}
        for (branch, year), comps in scopes.items():
            source[(branch, year)] = {}
            for comp_id in comps:
                with open(os.path.join(year_dir(self.root, branch, year),
                                       f'{comp_id}.json'),
                          encoding='utf-8') as f:
                    source[(branch, year)][comp_id] = json.load(f)

        migrate(root=self.root)

        for (branch, year), files in source.items():
            bundle = load_bundle(bundle_path(branch, year, root=self.root))
            self.assertEqual(list(bundle['comps']), sorted(bundle['comps']))
            self.assertEqual(sorted(bundle['comps']), sorted(files))
            for comp_id, comp in files.items():
                self.assertEqual(bundle['comps'][comp_id], comp)

    def test_refuses_when_bundle_exists(self):
        write_old_tree(self.root, {('felt', 2023):
                                   {'comp-aa': detail('comp-aa')}})
        existing = bundle_path('bane', 2024, root=self.root)
        write_bundle_if_changed(existing, {'comp-old': detail('comp-old')})
        with open(existing, encoding='utf-8') as f:
            before = f.read()

        with self.assertRaises(RuntimeError) as ctx:
            migrate(root=self.root)

        self.assertIn('one-shot', str(ctx.exception))
        # tree untouched: old per-comp file still there, pre-existing
        # bundle unchanged, no new bundle written
        self.assertTrue(os.path.isfile(os.path.join(
            year_dir(self.root, 'felt', 2023), 'comp-aa.json')))
        with open(existing, encoding='utf-8') as f:
            self.assertEqual(f.read(), before)
        self.assertFalse(os.path.exists(
            bundle_path('felt', 2023, root=self.root)))

    def test_comp_id_must_match_filename(self):
        write_old_tree(self.root, {('felt', 2023):
                                   {'comp-aa': detail('comp-aa')}})
        bad_dir = year_dir(self.root, 'bane', 2024)
        os.makedirs(bad_dir)
        with open(os.path.join(bad_dir, 'comp-x.json'), 'w',
                  encoding='utf-8') as f:
            json.dump(detail('comp-y'), f)  # compId ≠ filename stem

        with self.assertRaises(RuntimeError) as ctx:
            migrate(root=self.root)

        self.assertIn('comp-x', str(ctx.exception))
        # nothing deleted, nothing written
        self.assertTrue(os.path.isdir(year_dir(self.root, 'felt', 2023)))
        self.assertTrue(os.path.isfile(os.path.join(bad_dir, 'comp-x.json')))
        self.assertFalse(os.path.exists(
            bundle_path('bane', 2024, root=self.root)))
        self.assertFalse(os.path.exists(
            bundle_path('felt', 2023, root=self.root)))

    def test_no_deletion_on_verification_failure(self):
        scopes = {
            ('felt', 2023): {'comp-aa': detail('comp-aa'),
                             'comp-zz': detail('comp-zz')},
            ('bane', 2024): {'comp-bb': detail('comp-bb')},
        }
        write_old_tree(self.root, scopes)
        real_write = migrate_detaljer_bundles.write_bundle_if_changed
        tampered = []

        def tampering_write(path, comps):
            # write for real, then corrupt the round-trip: mutate one
            # comp in the file the bundle just landed in
            written = real_write(path, comps)
            if not tampered:
                tampered.append(path)
                with open(path, encoding='utf-8') as f:
                    payload = json.load(f)
                comp_id = sorted(payload['comps'])[0]
                payload['comps'][comp_id]['ovelser'] = []
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False,
                              separators=(',', ':'))
            return written

        migrate_detaljer_bundles.write_bundle_if_changed = tampering_write
        try:
            with self.assertRaises(RuntimeError) as ctx:
                migrate(root=self.root)
        finally:
            migrate_detaljer_bundles.write_bundle_if_changed = real_write

        self.assertIn('verification', str(ctx.exception))
        # the error fires before ANY old dir is removed: both scopes'
        # year dirs survive, even though a bundle was written (and
        # failed verification)
        for branch, year in scopes:
            self.assertTrue(os.path.isdir(year_dir(self.root, branch, year)))
        self.assertTrue(tampered and os.path.isfile(tampered[0]))


if __name__ == '__main__':
    unittest.main()
