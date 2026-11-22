"""Tests for the regionOrganizationId backfill's pure core.

patch_year_data is the only logic worth unit-testing: given a parsed
year JSON and an {compId: regionOrganizationId} map from the
competitionlist API, patch comps in place and report how many were
patched. Idempotent: comps already carrying a non-null value are
left alone so re-runs rewrite nothing.
"""
import copy
import unittest

from backfill_comp_regions import patch_year_data


def year_data():
    return {
        'meta': {'processedIds': ['a', 'b', 'c']},
        'competitions': [
            {'id': 'a', 'title': 'Allerede satt', 'regionOrganizationId': 'old-rid'},
            {'id': 'b', 'title': 'Mangler'},
            {'id': 'c', 'title': 'Eksplisitt null', 'regionOrganizationId': None},
            {'id': 'd', 'title': 'Ikke i API-svaret'},
        ],
    }


class PatchYearData(unittest.TestCase):
    def setUp(self):
        self.data = year_data()
        self.map = {'a': 'new-rid', 'b': 'rid-b', 'c': 'rid-c', 'x': 'rid-x'}

    def test_adds_field_for_matched_comp(self):
        count = patch_year_data(self.data, self.map)
        self.assertEqual(count, 2)
        by_id = {c['id']: c for c in self.data['competitions']}
        self.assertEqual(by_id['b']['regionOrganizationId'], 'rid-b')

    def test_upgrades_none_to_value(self):
        patch_year_data(self.data, self.map)
        by_id = {c['id']: c for c in self.data['competitions']}
        self.assertEqual(by_id['c']['regionOrganizationId'], 'rid-c')

    def test_skips_already_set_comp(self):
        patch_year_data(self.data, self.map)
        by_id = {c['id']: c for c in self.data['competitions']}
        self.assertEqual(by_id['a']['regionOrganizationId'], 'old-rid')

    def test_ignores_unknown_ids(self):
        patch_year_data(self.data, self.map)
        by_id = {c['id']: c for c in self.data['competitions']}
        self.assertNotIn('regionOrganizationId', by_id['d'])

    def test_idempotent_second_run(self):
        first = patch_year_data(self.data, self.map)
        second = patch_year_data(self.data, self.map)
        self.assertEqual((first, second), (2, 0))

    def test_leaves_other_structure_untouched(self):
        snapshot = copy.deepcopy(self.data)
        patch_year_data(self.data, self.map)
        self.assertEqual(self.data['meta'], snapshot['meta'])
        self.assertEqual(len(self.data['competitions']), 4)


if __name__ == '__main__':
    unittest.main()
