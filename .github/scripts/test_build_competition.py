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


class ChangedCompIds(unittest.TestCase):
    """The listing-diff requeue: a processed competition is re-fetched
    when its live listing entry changed materially — results attached
    late (resultFileUrl), renames, results added or removed. Immaterial
    changes (a moved date) do not re-fetch. The listing is fetched on
    every run anyway, so the diff itself is free.
    """

    STORED = {'id': 'c1', 'title': 'Teststevne', 'hasResult': True,
              'resultFileUrl': None, 'startDate': '2025-01-01'}

    def _changed(self, listed):
        return scrape_stevneresultater.changed_comp_ids(
            [listed], {self.STORED['id']: self.STORED})

    def test_result_file_url_appearing_requeues(self):
        listed = dict(self.STORED, resultFileUrl='https://example.com/r.pdf')
        self.assertEqual(self._changed(listed), {'c1'})

    def test_title_change_requeues(self):
        listed = dict(self.STORED, title='Teststevne 2025')
        self.assertEqual(self._changed(listed), {'c1'})

    def test_has_result_flip_requeues(self):
        listed = dict(self.STORED, hasResult=False)
        self.assertEqual(self._changed(listed), {'c1'})

    def test_identical_entry_does_not_requeue(self):
        self.assertEqual(self._changed(dict(self.STORED)), set())

    def test_start_date_only_change_does_not_requeue(self):
        listed = dict(self.STORED, startDate='2025-02-01')
        self.assertEqual(self._changed(listed), set())

    def test_stored_missing_comp_is_not_reported(self):
        # brand-new comps are the normal not-yet-processed path, not a
        # material change
        listed = {'id': 'c9', 'title': 'Nytt stevne', 'hasResult': True}
        self.assertEqual(scrape_stevneresultater.changed_comp_ids(
            [listed], {}), set())


if __name__ == '__main__':
    unittest.main()
