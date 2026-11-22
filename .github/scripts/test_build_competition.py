"""Tests for the comp-record builders in both scrapers.

The builders are pure functions of (comp, all_results, mappings) —
these tests pin the regionOrganizationId passthrough that the
mestere index layer depends on for region resolution.
"""
import unittest

import scrape_bane
import scrape_stevneresultater

COMP = {
    'id': 'c1',
    'title': 'Teststevne',
    'startDate': '2025-01-01T00:00:00',
    'organizationName': 'Klubben',
    'regionOrganizationId': 'rid-1',
}


class BuildCompetitionRegion(unittest.TestCase):
    def test_felt_passes_region_through(self):
        rec = scrape_stevneresultater.build_competition(COMP, [], {}, {})
        self.assertEqual(rec['regionOrganizationId'], 'rid-1')

    def test_bane_passes_region_through(self):
        rec = scrape_bane.build_competition(COMP, [], {}, {})
        self.assertEqual(rec['regionOrganizationId'], 'rid-1')

    def test_missing_region_is_none(self):
        rec = scrape_bane.build_competition({'id': 'c2'}, [], {}, {})
        self.assertIsNone(rec['regionOrganizationId'])


if __name__ == '__main__':
    unittest.main()
