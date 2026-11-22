#!/usr/bin/env python3
"""Tests for .github/scripts/result_file_parse.py — run directly:

    python3 .github/scripts/test_result_file_parse.py
"""

import os
import unittest

import pdfplumber

from result_file_parse import detect_family

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')

_TEXT_CACHE = {}


def fixture_text(name):
    """Full text of a fixture PDF (pages joined with newlines), cached."""
    if name not in _TEXT_CACHE:
        with pdfplumber.open(os.path.join(FIXTURES, name)) as pdf:
            _TEXT_CACHE[name] = '\n'.join(
                page.extract_text() or '' for page in pdf.pages
            )
    return _TEXT_CACHE[name]


class DetectFamily(unittest.TestCase):
    def test_inrx_bane_fixture(self):
        self.assertEqual(detect_family(fixture_text('inrx-bane.pdf')), 'inrX')

    def test_inrx_felt_fixture(self):
        self.assertEqual(detect_family(fixture_text('inrx-felt.pdf')), 'inrX')

    def test_inrx_felt_km_fixture(self):
        self.assertEqual(detect_family(fixture_text('inrx-felt-km.pdf')), 'inrX')

    def test_inrx_bane_km_fixture(self):
        self.assertEqual(detect_family(fixture_text('inrx-bane-km.pdf')), 'inrX')

    def test_plain_no_fixture(self):
        self.assertEqual(detect_family(fixture_text('plain-no.pdf')), 'plain-NO')

    def test_datotid_fixture(self):
        self.assertEqual(detect_family(fixture_text('datotid.pdf')), 'datotid')

    def test_text_without_markers_is_unknown(self):
        self.assertEqual(detect_family('arbitrary text with no markers'), 'unknown')


if __name__ == '__main__':
    unittest.main()
