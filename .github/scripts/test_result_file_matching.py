#!/usr/bin/env python3
"""Tests for .github/scripts/result_file_matching.py — run directly:

    python3 .github/scripts/test_result_file_matching.py
"""

import unittest

from result_file_matching import attach_person_ids, match_stats, normalize

API_RESULTS = [
    {'personId': 'p1', 'name': 'Gustav Tisthamar', 'club': 'Bergen Pistolklubb',
     'discipline': 'Felt Fin', 'class': 'A'},
    {'personId': 'p2', 'name': 'Gustav Tisthamar', 'club': 'Åsane Pistolklubb',
     'discipline': 'Felt Fin', 'class': 'B'},
    {'personId': 'p3', 'name': 'Tore Vrålstad', 'club': 'Greipstad Pistolklubb',
     'discipline': 'Hurtig Sp Pistol', 'class': 'A'},
    {'personId': 'p4', 'name': 'Arne Landsverk', 'club': 'Greipstad Pistolklubb',
     'discipline': 'Hurtig Sp Pistol', 'class': 'A'},
    {'personId': 'p5', 'name': 'Stian Rustøen', 'club': 'Greipstad Pistolklubb',
     'discipline': 'Hurtig Sp Pistol', 'class': 'A'},
]


def ovelse_detail(rows):
    return {'ovelser': [
        {'navn': 'Felt Fin', 'classes': [{'klasse': 'A', 'rows': rows}]},
    ]}


class Normalize(unittest.TestCase):
    def test_folds_case_punctuation_and_whitespace(self):
        self.assertEqual(normalize('  GUSTAV   Tisthamar. '), 'gustav tisthamar')
        self.assertEqual(normalize('Åsane Pistolklubb'), 'åsane pistolklubb')
        self.assertEqual(normalize(''), '')


class SplitNameClub(unittest.TestCase):
    def test_skyttere_club_ending(self):
        from result_file_parse import _split_name_club
        name, club = _split_name_club(
            'Arnstein Skare Melhus Sportsskyttere'.split()
        )
        self.assertEqual(name, 'Arnstein Skare')
        self.assertEqual(club, 'Melhus Sportsskyttere')


class AttachPersonIds(unittest.TestCase):
    def test_case_and_punctuation_variance_matches(self):
        detail = ovelse_detail([
            {'name': 'gustav  TISTHAMAR.', 'club': 'bergen pistolklubb',
             'series': [], 'ix': 1, 'sum': 2},
        ])
        attach_person_ids(detail, API_RESULTS)
        row = detail['ovelser'][0]['classes'][0]['rows'][0]
        self.assertEqual(row['personId'], 'p1')

    def test_same_name_different_clubs_disambiguated_by_club(self):
        detail = ovelse_detail([
            {'name': 'Gustav Tisthamar', 'club': 'Bergen Pistolklubb', 'series': [], 'ix': 1, 'sum': 2},
            {'name': 'Gustav Tisthamar', 'club': 'Åsane Pistolklubb', 'series': [], 'ix': 1, 'sum': 2},
        ])
        attach_person_ids(detail, API_RESULTS)
        rows = detail['ovelser'][0]['classes'][0]['rows']
        self.assertEqual(rows[0]['personId'], 'p1')
        self.assertEqual(rows[1]['personId'], 'p2')

    def test_combined_match_is_independent_of_name_club_split(self):
        # a mis-split row (club word inside name) still matches on the
        # combined region
        detail = ovelse_detail([
            {'name': 'Gustav Tisthamar Bergen', 'club': 'Pistolklubb',
             'series': [], 'ix': 1, 'sum': 2},
        ])
        attach_person_ids(detail, API_RESULTS)
        row = detail['ovelser'][0]['classes'][0]['rows'][0]
        self.assertEqual(row['personId'], 'p1')

    def test_name_only_row_with_ambiguous_name_stays_unmatched(self):
        detail = ovelse_detail([
            {'name': 'Gustav Tisthamar', 'series': [], 'ix': 1, 'sum': 2},
        ])
        attach_person_ids(detail, API_RESULTS)
        row = detail['ovelser'][0]['classes'][0]['rows'][0]
        self.assertNotIn('personId', row)

    def test_typo_stays_unmatched(self):
        detail = ovelse_detail([
            {'name': 'Gustav Tisthamarr', 'club': 'Bergen Pistolklubb',
             'series': [], 'ix': 1, 'sum': 2},
        ])
        attach_person_ids(detail, API_RESULTS)
        row = detail['ovelser'][0]['classes'][0]['rows'][0]
        self.assertNotIn('personId', row)

    def test_region_without_detected_club_matches_combined(self):
        # club endings outside the split vocabulary leave the whole
        # 'name club' region in name — it must still match on the
        # combined key
        api = API_RESULTS + [
            {'personId': 'p9', 'name': 'Arnstein Skare',
             'club': 'Melhus Sportsskyttere', 'discipline': 'd', 'class': 'A'},
        ]
        detail = ovelse_detail([
            {'name': 'Arnstein Skare Melhus Sportsskyttere',
             'series': [], 'ix': 1, 'sum': 2},
        ])
        attach_person_ids(detail, api)
        row = detail['ovelser'][0]['classes'][0]['rows'][0]
        self.assertEqual(row['personId'], 'p9')


class MatchStats(unittest.TestCase):
    def test_counts_across_ovelser_sections_and_lag_members(self):
        detail = {
            'ovelser': [{'navn': 'Felt Fin', 'classes': [{'klasse': 'A', 'rows': [
                {'name': 'Gustav Tisthamar', 'club': 'Bergen Pistolklubb'},
                {'name': 'Gustav Tisthamarr', 'club': 'Bergen Pistolklubb'},
            ]}]}],
            'km': {
                'sections': [{'navn': 'KM: Hurtig Sp Pistol', 'klasse': 'Å', 'rows': [
                    {'name': 'Tore Vrålstad', 'club': 'Greipstad Pistolklubb'},
                ]}],
                'lag': [{'navn': 'KM Lag: Hurtig Sp Pistol', 'klasse': 'Å', 'teams': [
                    {'team': 'GPK 1', 'series': [], 'members': [
                        {'name': 'Tore Vrålstad', 'klasse': 'Å', 'ix': 11, 'sum': 574},
                        {'name': 'Arne Landsverk', 'klasse': 'Å', 'ix': 13, 'sum': 553},
                    ]},
                ]}],
            },
        }
        attach_person_ids(detail, API_RESULTS)
        self.assertEqual(match_stats(detail), (4, 5))


if __name__ == '__main__':
    unittest.main()
