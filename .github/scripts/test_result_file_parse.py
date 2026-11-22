#!/usr/bin/env python3
"""Tests for .github/scripts/result_file_parse.py — run directly:

    python3 .github/scripts/test_result_file_parse.py
"""

import json
import os
import unittest

import pdfplumber

from result_file_parse import (
    PARSER_VERSION,
    UnsupportedFormatError,
    detect_family,
    parse_datotid,
    parse_inrx,
    parse_plain_no,
    parse_result,
)

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')

_TEXT_CACHE = {}


def fixture_text(name):
    """Full text of a fixture PDF (pages joined with newlines), cached.

    Extracts at the same tight x_tolerance as parse_result, so family
    detection tests see exactly the text production sees.
    """
    if name not in _TEXT_CACHE:
        with pdfplumber.open(os.path.join(FIXTURES, name)) as pdf:
            _TEXT_CACHE[name] = '\n'.join(
                page.extract_text(x_tolerance=1) or '' for page in pdf.pages
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


def find_row(detail, ovelse, klasse, name):
    for o in detail['ovelser']:
        if o['navn'] == ovelse:
            for c in o['classes']:
                if c['klasse'] == klasse:
                    for r in c['rows']:
                        if r['name'] == name:
                            return r
    raise AssertionError(f'row not found: {ovelse} / {klasse} / {name}')


class ParseInrXFeltOpenSections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_inrx(fixture_text('inrx-felt.pdf'))

    def test_felt_fin_klasse_a_row_1(self):
        row = find_row(self.detail, 'Felt Fin', 'A', 'Gustav Tisthamar')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Bergen Pistolklubb')
        self.assertEqual(row['series'], [
            [9, 6], [10, 6], [10, 6], [11, 5], [10, 2],
            [9, 3], [12, 6], [11, 4], [12, 2], [10, 3],
        ])
        self.assertEqual(row['ix'], 43)
        self.assertEqual(row['sum'], 104)
        self.assertEqual(row['oppr'], 'A')

    def test_dnf_row_keeps_partial_series_and_has_no_pos(self):
        row = find_row(self.detail, 'Felt Fin', 'A', 'Jarle Kvalvik')
        self.assertEqual(row['status'], 'DNF')
        self.assertNotIn('pos', row)
        self.assertEqual(row['series'][0], [9, 6])
        self.assertEqual(row['series'][5], [0, 0])
        self.assertEqual(row['club'], 'Sartor Sportsskytterlag')

    def test_dns_row(self):
        row = find_row(self.detail, 'Felt Fin', 'B', 'Tor Kristian Holst')
        self.assertEqual(row['status'], 'DNS')
        self.assertNotIn('pos', row)

    def test_max_felt_points(self):
        self.assertEqual(
            self.detail['maxFeltPoints'], {'group1': 107, 'group2': 94}
        )

    def test_generator_stamp(self):
        self.assertEqual(self.detail['generator'], 'inrX 1.9.1.0')


class ParseInrXBaneOpenSections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_inrx(fixture_text('inrx-bane.pdf'))

    def test_t96_fin_klasse_a_row_1(self):
        row = find_row(self.detail, 'T96 Fin', 'A', 'Lars Erik Fjelldal')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Stavanger Pistolklubb')
        self.assertEqual(len(row['series']), 16)
        self.assertEqual(row['series'][0], [16, 5])
        self.assertEqual(row['ix'], 51)
        self.assertEqual(row['sum'], 213)
        self.assertEqual(row['premie'], 125)

    def test_dns_row_all_zero_series(self):
        row = find_row(self.detail, 'T96 Fin', 'A', 'Mirvet Pupovic')
        self.assertEqual(row['status'], 'DNS')
        self.assertNotIn('pos', row)
        self.assertEqual(row['series'], [[0, 0]] * 16)
        self.assertEqual(row['sum'], 0)
        self.assertNotIn('premie', row)

    def test_multiple_ovelser(self):
        navn = {o['navn'] for o in self.detail['ovelser']}
        self.assertTrue({'T96 Fin', 'T96 Militær', 'T96 Sp-Pistol'} <= navn)


def find_champ_section(detail, key, navn, klasse):
    for sec in detail[key]['sections']:
        if sec['navn'] == navn and sec['klasse'] == klasse:
            return sec
    raise AssertionError(f'section not found: {key} / {navn} / {klasse}')


def find_champ_lag(detail, key, navn):
    for lag in detail[key]['lag']:
        if lag['navn'] == navn:
            return lag
    raise AssertionError(f'lag not found: {key} / {navn}')


class ParseInrXFeltDmSections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_inrx(fixture_text('inrx-felt-km.pdf'))

    def test_dm_felt_fin_klasse_m_medal_rows(self):
        sec = find_champ_section(self.detail, 'dm', 'DM: Felt Fin', 'M')
        rows = sec['rows']
        self.assertEqual(rows[0]['medal'], 'Gull')
        self.assertEqual(rows[0]['name'], 'Kjell Jomar Heltne')
        self.assertEqual(rows[0]['ix'], 44)
        self.assertEqual(rows[0]['sum'], 101)
        self.assertEqual(rows[1]['medal'], 'Sølv')
        self.assertEqual(rows[1]['name'], 'Geir Atle Bruvik')
        self.assertEqual(rows[2]['medal'], 'Bronse')
        self.assertEqual(rows[2]['name'], 'Per Atle Bjørkum')
        self.assertEqual(rows[3]['pos'], 4)
        self.assertEqual(rows[3]['name'], 'Svein Arne Hagen')

    def test_dm_felt_fin_klasse_m_row_club_with_suffix(self):
        sec = find_champ_section(self.detail, 'dm', 'DM: Felt Fin', 'M')
        row = sec['rows'][3]
        self.assertEqual(row['club'], 'Årdal Sportsskyttarlag - pistol')

    def test_dm_classes_k_and_v55(self):
        k = find_champ_section(self.detail, 'dm', 'DM: Felt Fin', 'K')
        self.assertEqual(k['rows'][0]['medal'], 'Gull')
        self.assertEqual(k['rows'][0]['name'], 'Andrine Hagheim')
        v55 = find_champ_section(self.detail, 'dm', 'DM: Felt Fin', 'V55')
        self.assertEqual(v55['rows'][0]['medal'], 'Gull')
        self.assertEqual(v55['rows'][0]['name'], 'Tor Olav Sande')

    def test_dm_rows_have_ten_stand_pairs(self):
        for sec in self.detail['dm']['sections']:
            for row in sec['rows']:
                self.assertEqual(len(row['series']), 10, row['name'])
                for cell in row['series']:
                    self.assertIsInstance(cell[0], int)
                    self.assertIsInstance(cell[1], int)

    def test_no_km_key_when_only_dm(self):
        self.assertNotIn('km', self.detail)


class ParseInrXBaneKmLagSections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_inrx(fixture_text('inrx-bane-km.pdf'))

    def test_km_hurtig_sp_pistol_klasse_a_medals(self):
        sec = find_champ_section(self.detail, 'km', 'KM: Hurtig Sp Pistol', 'Å')
        rows = sec['rows']
        self.assertEqual(rows[0]['medal'], 'Gull')
        self.assertEqual(rows[0]['name'], 'Tore Vrålstad')
        self.assertEqual(rows[0]['sum'], 574)
        self.assertEqual(rows[1]['medal'], 'Sølv')
        self.assertEqual(rows[1]['name'], 'Robert Ilievski')
        self.assertEqual(rows[2]['medal'], 'Bronse')
        self.assertEqual(rows[2]['name'], 'Stian Rustøen')

    def test_km_lag_team_with_members(self):
        lag = find_champ_lag(self.detail, 'km', 'KM Lag: Hurtig Sp Pistol')
        team = lag['teams'][0]
        self.assertEqual(team['team'], 'GPK 1')
        self.assertEqual(team['medal'], 'Gull')
        self.assertEqual(team['sum'], 1689)
        self.assertEqual(team['ix'], 36)
        self.assertEqual(team['series'][0], [284, None])
        self.assertEqual(
            [m['name'] for m in team['members']],
            ['Tore Vrålstad', 'Stian Rustøen', 'Arne Landsverk'],
        )
        for member in team['members']:
            self.assertEqual(member['klasse'], 'Å')

    def test_lag_second_team_keeps_pos(self):
        lag = find_champ_lag(self.detail, 'km', 'KM Lag: Hurtig Sp Pistol')
        second = lag['teams'][1]
        self.assertEqual(second['team'], 'GPK 2')
        self.assertEqual(second['pos'], 2)
        self.assertNotIn('medal', second)
        self.assertEqual(len(second['members']), 3)

    def test_open_sections_still_parsed_as_ovelser(self):
        navn = {o['navn'] for o in self.detail['ovelser']}
        self.assertIn('Hurtig Sp Pistol', navn)


class ParseInrXLagRobustness(unittest.TestCase):
    def test_fused_team_cells_parse_with_tight_tolerance(self):
        """inrX 1.6.3 lag tables print team cells so close that the
        default text extraction fuses them ('24/13' + '22/3' ->
        '24/1322/3'); the tight x_tolerance keeps them apart."""
        with pdfplumber.open(os.path.join(FIXTURES, 'inrx-felt-fused.pdf')) as pdf:
            detail = parse_result(pdf)
        lag = find_champ_lag(detail, 'km', 'KM Lag: Felt Magnum-2')
        team = lag['teams'][0]
        self.assertEqual(team['team'], 'Rena')
        self.assertEqual(team['medal'], 'Gull')
        self.assertEqual(len(team['series']), 10)
        self.assertEqual(team['series'][0], [24, 13])
        self.assertEqual(team['series'][1], [22, 3])
        self.assertEqual(team['ix'], 91)
        self.assertEqual(team['sum'], 243)
        self.assertEqual(
            [m['name'] for m in team['members']],
            ['Arne Che Sveen', 'Karl Egil Hanevik', 'Arne Granerud'],
        )
        second = lag['teams'][1]
        self.assertEqual(second['team'], 'Brumunddal')
        self.assertEqual(second['pos'], 2)
        self.assertEqual(len(second['series']), 10)

    def test_member_line_before_any_team_is_skipped_not_crashed(self):
        text = '\n'.join([
            'KM Lag: X :: Klasse Å 1 2 3 4 5 6 iX Sum',
            'Ola Nordmann (Å) 11 574',
            'Gull GPK 1 99 98 97 96 95 94 11 574',
            'Per Hansen (Å) 5 200',
        ])
        detail = parse_inrx(text)
        lag = detail['km']['lag'][0]
        self.assertEqual(len(lag['teams']), 1)
        team = lag['teams'][0]
        self.assertEqual(team['team'], 'GPK 1')
        self.assertEqual([m['name'] for m in team['members']], ['Per Hansen'])


class ParsePlainNo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_plain_no(fixture_text('plain-no.pdf'))

    def test_klasse_c_row_1(self):
        row = find_row(self.detail, 'Silhuett', 'C', 'Raymond Thorjussen')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Porsgrunn Pk')
        self.assertEqual(
            row['series'],
            [[95, 0], [92, 1], [82, 2], [90, 3], [83, 2], [63, 0]],
        )
        self.assertEqual(row['ix'], 8)
        self.assertEqual(row['sum'], 505)

    def test_klasse_d_exists(self):
        row = find_row(self.detail, 'Silhuett', 'D', 'Bjørnar Vestnes')
        self.assertEqual(row['pos'], 1)

    def test_ovelse_navn_comes_from_program_header(self):
        self.assertEqual(
            [o['navn'] for o in self.detail['ovelser']], ['Silhuett']
        )

    def test_generator_stamp(self):
        self.assertEqual(self.detail['generator'], 'plain-NO')


class ParsePlainNoDispatch(unittest.TestCase):
    def test_parse_result_routes_plain_no(self):
        path = os.path.join(FIXTURES, 'plain-no.pdf')
        with pdfplumber.open(path) as pdf:
            detail = parse_result(pdf)
        self.assertEqual(detail['generator'], 'plain-NO')
        self.assertTrue(detail['ovelser'])


class ParseDatotid(unittest.TestCase):
    STEVNE = '7F 25m hurtigpistol fin'

    @classmethod
    def setUpClass(cls):
        with pdfplumber.open(os.path.join(FIXTURES, 'datotid.pdf')) as pdf:
            cls.detail = parse_datotid(pdf)

    def test_klasse_b_row_1(self):
        row = find_row(self.detail, self.STEVNE, 'B', 'Sondre Risan Haltvik')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Frosta Salongskytterlag')
        self.assertEqual(
            row['series'],
            [[99, None], [96, None], [95, None],
             [96, None], [98, None], [96, None]],
        )
        self.assertEqual(row['ix'], 20)
        self.assertEqual(row['sum'], 580)
        self.assertEqual(row['oppr'], 'A')
        self.assertEqual(row['mrk'], 'S')
        self.assertEqual(row['premie'], 0)

    def test_series_values_sum_to_row_sum(self):
        """The interleaved pair subtotals are validated then dropped —
        the surviving invariant is that the series values sum to the
        row's total."""
        for ovelse in self.detail['ovelser']:
            for cls in ovelse['classes']:
                for row in cls['rows']:
                    self.assertEqual(
                        sum(cell[0] for cell in row['series']),
                        row['sum'],
                        row['name'],
                    )

    def test_stacked_names_and_clubs(self):
        row = find_row(self.detail, self.STEVNE, 'B', 'Roar Hembre')
        self.assertEqual(row['club'], 'Trondheim Sportsskyttere')
        row = find_row(self.detail, self.STEVNE, 'C', 'Kjell Åke Lappen Andresen')
        self.assertEqual(row['club'], 'Verdal Sportsskytterlag')

    def test_hyphen_continuation_and_four_line_name_block(self):
        row = find_row(
            self.detail, self.STEVNE, 'C', 'Linda-Marie Neshagen Haakonsen'
        )
        self.assertEqual(row['club'], 'Stjørdal sportsskytterklubb')
        self.assertEqual(row['sum'], 485)

    def test_row_count_matches_deltakere(self):
        rows = [r for o in self.detail['ovelser'] for c in o['classes']
                for r in c['rows']]
        self.assertEqual(len(rows), 11)

    def test_every_parsed_pair_is_exact_api_or_known_variant(self):
        from result_file_matching import normalize
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'bane', '2024.json')))
        comp = next(c for c in year['competitions']
                    if c['title'] == 'Romjulskrus hurtigpistol')
        api_pairs = {(normalize(r['name']), normalize(r['club']))
                     for r in comp['results']}
        parsed = {(normalize(r['name']), normalize(r.get('club') or ''))
                  for o in self.detail['ovelser'] for c in o['classes']
                  for r in c['rows']}
        exact = parsed & api_pairs
        self.assertGreaterEqual(len(exact), 8)
        variants = parsed - api_pairs
        self.assertTrue(variants <= {
            ('eva olaug iversen', 'trondheim sportsskyttere'),
            ('håvard haakonsen', 'stjørdal sportsskytterklubb'),
            ('linda marie neshagen haakonsen', 'stjørdal sportsskytterklubb'),
        })


class ParseDatotidDispatch(unittest.TestCase):
    def test_parse_result_routes_datotid(self):
        path = os.path.join(FIXTURES, 'datotid.pdf')
        with pdfplumber.open(path) as pdf:
            detail = parse_result(pdf)
        self.assertEqual(detail['generator'], 'datotid')
        self.assertTrue(detail['ovelser'])


class ParserVersionBump(unittest.TestCase):
    def test_parser_version_is_4(self):
        self.assertEqual(PARSER_VERSION, 4)


class ParseResultDispatch(unittest.TestCase):
    def test_dispatches_inrx_fixture(self):
        path = os.path.join(FIXTURES, 'inrx-bane.pdf')
        with pdfplumber.open(path) as pdf:
            detail = parse_result(pdf)
        self.assertTrue(detail['generator'].startswith('inrX'))
        self.assertTrue(detail['ovelser'])

    def test_unknown_family_raises(self):
        class _Page:
            def extract_text(self, **kwargs):
                return 'no family markers in here'

        class _Pdf:
            pages = [_Page()]

        with self.assertRaises(UnsupportedFormatError):
            parse_result(_Pdf())


if __name__ == '__main__':
    unittest.main()
