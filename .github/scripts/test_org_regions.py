"""Tests for the krets/distrikt reference data.

kretser.json is generated once from /organization (fetch_kretser.py)
and committed; DISTRIKTER is the authoritative krets→distrikt table
from skyting.no's org page. These tests pin the two together: every
krets short name must resolve to exactly one distrikt, and the messy
real-world krets name forms must normalize.
"""
import unittest

from org_regions import (
    DISTRIKTER,
    krets_short,
    load_kretser,
    normalize_region,
    resolve_region,
)

ROGALAND_ID = '3b444426-1ea5-4c3c-c2af-08d859126e0a'


class OrgRegions(unittest.TestCase):
    def test_distrikter_covers_exactly_19_kretser(self):
        self.assertEqual(len(DISTRIKTER), 19)

    def test_kretser_json_loads_and_matches_distrikter(self):
        kretser = load_kretser()
        self.assertEqual(len(kretser), 19)
        for guid, entry in kretser.items():
            self.assertIn(entry['short'], DISTRIKTER,
                          f"{entry['name']!r} has no distrikt")
            self.assertTrue(guid and entry['name'] and entry['short'])

    def test_krets_short_handles_messy_name_forms(self):
        self.assertEqual(
            krets_short('Troms Skytterkrets av Norges Sportsskytterforbund'),
            'Troms')
        self.assertEqual(
            krets_short('Sogn og Fjordane Skyttarkrins'), 'Sogn og Fjordane')
        self.assertEqual(
            krets_short('Nord-Trøndelag skytterkrets'), 'Nord-Trøndelag')
        self.assertEqual(krets_short('Rogaland Skytterkrets'), 'Rogaland')

    def test_resolve_region(self):
        self.assertEqual(resolve_region(ROGALAND_ID), ('Rogaland', 'Syd-Norge'))

    def test_resolve_region_unknown_guid(self):
        self.assertEqual(resolve_region('not-a-guid'), (None, None))
        self.assertEqual(resolve_region(None), (None, None))

    def test_normalize_region_collapses_variants(self):
        self.assertEqual(normalize_region('Østlandet-Nord'),
                         normalize_region('østlandet nord'))
        self.assertEqual(normalize_region('Møre_og_Romsdal'),
                         normalize_region('møre og romsdal'))


if __name__ == '__main__':
    unittest.main()
