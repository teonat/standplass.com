#!/usr/bin/env python3
"""Tests for .github/scripts/birthyears.py — run directly:

    python3 .github/scripts/test_birthyears.py
"""

import json
import os
import sys
import tempfile
import unittest

from birthyears import (
    extract_birthyears,
    load_birthyears,
    merge_birthyears,
    save_birthyears,
)


class MergeWriteRules(unittest.TestCase):
    def test_write_rules(self):
        existing = {'a': 1985, 'b': None, 'c': 1990}
        updates = {'a': 1986, 'b': 1991, 'c': None, 'd': 2000, 'e': None}
        self.assertEqual(
            merge_birthyears(existing, updates),
            {'a': 1985, 'b': 1991, 'c': 1990, 'd': 2000, 'e': None},
        )
        # a: value not overwritten by value; b: null upgraded by value;
        # c: value not overwritten by null; d: absent -> value; e: absent -> null.

    def test_merge_returns_new_dict_and_sorts_keys(self):
        existing = {'z': 1980}
        updates = {'a': 1985}
        merged = merge_birthyears(existing, updates)
        self.assertEqual(list(merged.keys()), ['a', 'z'])
        self.assertEqual(existing, {'z': 1980}, 'inputs are not mutated')


class Extract(unittest.TestCase):
    def test_missing_personid_skipped_null_birthyear_recorded(self):
        rows = [
            {'personId': 'p1', 'birthYear': 1985},
            {'personId': 'p2'},
            {'personId': 'p3', 'birthYear': None},
            {'birthYear': 1990},
        ]
        self.assertEqual(
            extract_birthyears(rows),
            {'p1': 1985, 'p2': None, 'p3': None},
        )

    def test_empty_input(self):
        self.assertEqual(extract_birthyears([]), {})


class FileIO(unittest.TestCase):
    def test_roundtrip_sorted_compact(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'birthyears.json')
            data = {'zz': 1975, 'aa': None, 'mm': 1990}
            save_birthyears(path, data)

            with open(path, encoding='utf-8') as f:
                raw = f.read()
            # compact: no space after separators, single trailing newline at most
            self.assertNotIn('": ', raw)
            self.assertNotIn(', "', raw.replace('{"', '', 1))  # no spaces between entries
            # keys in sorted order in the raw text
            aa = raw.index('"aa"')
            mm = raw.index('"mm"')
            zz = raw.index('"zz"')
            self.assertTrue(aa < mm < zz)

            self.assertEqual(load_birthyears(path), data)

    def test_load_missing_path_returns_empty(self):
        self.assertEqual(load_birthyears('/nonexistent/birthyears.json'), {})

    def test_load_corrupt_file_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'birthyears.json')
            with open(path, 'w', encoding='utf-8') as f:
                f.write('{not valid json')
            self.assertEqual(load_birthyears(path), {})


if __name__ == '__main__':
    unittest.main()
