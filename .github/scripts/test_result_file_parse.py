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
    _parse_blinken_row,
    _parse_leon_row,
    detect_family,
    parse_blinken,
    parse_datotid,
    parse_inrx,
    parse_leon,
    parse_megalink,
    parse_plain_no,
    parse_result,
    parse_t96,
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

    def test_blinken_fixtures(self):
        self.assertEqual(
            detect_family(fixture_text('blinken-felt.pdf')), 'blinken')
        self.assertEqual(
            detect_family(fixture_text('blinken-bane.pdf')), 'blinken')

    def test_leon_fixtures(self):
        self.assertEqual(
            detect_family(fixture_text('leon-fgmrs.pdf')), 'leon')
        self.assertEqual(
            detect_family(fixture_text('leon-vm.pdf')), 'leon')

    def test_t96_fixtures(self):
        self.assertEqual(
            detect_family(fixture_text('t96-open.pdf')), 't96')
        self.assertEqual(
            detect_family(fixture_text('t96-km.pdf')), 't96')

    def test_megalink_fixtures(self):
        self.assertEqual(
            detect_family(fixture_text('megalink-resultater.pdf')),
            'megalink')
        self.assertEqual(
            detect_family(fixture_text('megalink-fused.pdf')), 'megalink')
        self.assertEqual(
            detect_family(fixture_text('megalink-nm.pdf')), 'megalink')

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


class ParseInrXMedalRows(unittest.TestCase):
    """inrX open øvelser print championship podiums with the medal as
    the first word ('Gull <name> <club> …'); NM comps carry all their
    results this way, so without the strip every podium row fails
    person matching and no mestere nm sections appear. Person øvelser
    now strip the medal into a row field (the KM/DM tables always
    did); Lag/Mix-lag øvelser keep the printed team shape — their
    rows are team rows. Multi-word club place parts ('Horten og
    Omegn PK', 'Nedre Eiker PK') used to leak into the name; the
    split now absorbs the connector pair and place-forming prefix.

    Fixture: comp 620ff3da (felt 2025, NM Spesialrevolver &
    Spesialpistol), inrX 1.9.1.0."""

    @classmethod
    def setUpClass(cls):
        cls.detail = parse_inrx(fixture_text('inrx-nm-medal.pdf'))

    def test_person_ovelse_strips_medal_into_row_field(self):
        row = find_row(self.detail, 'Felt Sp-Pistol', 'U', 'Philip Thorshaug')
        self.assertEqual(row['medal'], 'Gull')
        self.assertNotIn('pos', row)
        self.assertEqual(row['name'], 'Philip Thorshaug')
        self.assertEqual(row['club'], 'Horten og Omegn Pistolklubb')

    def test_og_connector_place_part_stays_in_club(self):
        row = find_row(self.detail, 'Felt Sp-Revolver', 'U',
                       'Lucas Sebastian Sivertsen-Ekdahl')
        self.assertEqual(row['medal'], 'Bronse')
        self.assertEqual(row['club'], 'Horten og Omegn Pistolklubb')

    def test_directional_place_prefix_stays_in_club(self):
        rows = [r for c in next(o['classes'] for o in self.detail['ovelser']
                               if o['navn'] == 'Felt Sp-Pistol')
                for r in c['rows'] if r.get('name') == 'Kjetil Bromark']
        medal_row = next(r for r in rows if r.get('medal') == 'Bronse')
        self.assertEqual(medal_row['club'], 'Nedre Eiker Pistolklubb 8/5')
        pos_row = find_row(self.detail, 'Felt Sp-Revolver', 'Å',
                           'Kjetil Bromark')
        self.assertEqual(pos_row['pos'], 43)
        self.assertEqual(pos_row['club'], 'Nedre Eiker Pistolklubb')
        self.assertNotIn('medal', pos_row)

    def test_plain_two_word_club_split_unchanged(self):
        row = find_row(self.detail, 'Felt Sp-Revolver', 'Å', 'Tore Vrålstad')
        self.assertEqual(row['medal'], 'Gull')
        self.assertEqual(row['name'], 'Tore Vrålstad')
        self.assertEqual(row['club'], 'Greipstad Pistolklubb')

    def test_lag_ovelse_keeps_printed_team_shape(self):
        row = find_row(self.detail, 'Lag: Felt Sp-Pistol', 'Å', 'Gull')
        self.assertNotIn('medal', row)
        self.assertEqual(row['name'], 'Gull')
        self.assertEqual(row['club'], 'Brumunddal Pistolklubb 1 SP-Pistol')

    def test_mix_lag_ovelse_keeps_printed_team_shape(self):
        row = find_row(self.detail, 'Mix-lag: Felt Sp-Pistol', 'Å', 'Gull')
        self.assertNotIn('medal', row)
        self.assertEqual(row['name'], 'Gull')
        self.assertEqual(row['club'], 'Bjørkelangen Pistolklubb SP-Pistol')

    def test_place_prefix_rules_on_synthetic_text(self):
        text = '\n'.join([
            'Felt Grov :: Klasse Å 1 2 3 4 5 6 7 8 9 10 iX Sum',
            'Gull Per Hansen Tønsberg og Omegn PK 10/5 10/5 10/5 10/5'
            ' 10/5 10/5 10/5 10/5 10/5 10/5 55 505',
            '1 Kari Nordmann Øvre Eiker SK 10/5 10/5 10/5 10/5 10/5'
            ' 10/5 10/5 10/5 10/5 10/5 55 505',
        ])
        detail = parse_inrx(text)
        gull = find_row(detail, 'Felt Grov', 'Å', 'Per Hansen')
        self.assertEqual(gull['medal'], 'Gull')
        self.assertEqual(gull['club'], 'Tønsberg og Omegn PK')
        pos = find_row(detail, 'Felt Grov', 'Å', 'Kari Nordmann')
        self.assertEqual(pos['club'], 'Øvre Eiker SK')


class ParseInrxOmskTail(unittest.TestCase):
    """inrX 1.9.x felt-NM files print trailing columns the row grammar
    rejected: an omsk column the header may name 'Omsk' (the parser
    only knew 'Oppr') or omit entirely while rows still carry the
    letter, sometimes with a count ('A 4'), star-prefixed prizes
    ('*2229') and prize-less letter tails ('… 55 C'). Every normal row
    failed the tail grammar and was silently dropped — only the DNS/DNF
    listing parsed — so whole championships produced empty podiums and
    vanished from the mestere index (the felt-NM Fin/Grov/Revolver/
    Militær comps).

    Fixture: comp 02afbbe1 (felt 2024, NM Feltpistol - Finpistol),
    inrX 1.9.0.0 — 473 starters, all in the Felt Fin øvelse."""

    @classmethod
    def setUpClass(cls):
        cls.detail = parse_inrx(fixture_text('inrx-omsk-tail.pdf'))

    def ovelse(self):
        return next(o for o in self.detail['ovelser']
                    if o['navn'] == 'Felt Fin')

    def test_letter_between_sum_and_premie_parses(self):
        # class U headers print 'iX Sum Premie' — no oppr column —
        # yet the rows carry the letter anyway
        row = find_row(self.detail, 'Felt Fin', 'U', 'Nikolai Rico Hansen')
        self.assertEqual(row['medal'], 'Gull')
        self.assertEqual(row['name'], 'Nikolai Rico Hansen')
        self.assertEqual(row['club'], 'Kongsvinger Sportsskyttere')
        self.assertEqual(row['ix'], 18)
        self.assertEqual(row['sum'], 95)
        self.assertEqual(row['oppr'], 'B')
        self.assertEqual(row['premie'], 315)
        self.assertEqual(row['series'][0], [9, 0])

    def test_letter_without_premie_parses(self):
        # '… 5 55 C': the prize is simply not printed for low rows
        row = find_row(self.detail, 'Felt Fin', 'U', 'Marco Hardeland')
        self.assertEqual(row['pos'], 4)
        self.assertEqual(row['sum'], 55)
        self.assertEqual(row['oppr'], 'C')
        self.assertNotIn('premie', row)

    def test_omsk_count_pair_with_star_prize(self):
        # 'A 4 *2229': letter + count + star-prefixed prize; the count
        # has no schema slot and is dropped, the star is stripped
        row = find_row(self.detail, 'Felt Fin', 'M', 'Simon Øyvind Sørfosbog')
        self.assertEqual(row['medal'], 'Gull')
        self.assertEqual(row['sum'], 107)
        self.assertEqual(row['oppr'], 'A')
        self.assertEqual(row['premie'], 2229)

    def test_omsk_count_pair_with_plain_prize(self):
        # 'B 2 600': the count reads as its own token between the
        # letter and the prize — the prize stays the last token
        row = find_row(self.detail, 'Felt Fin', 'K', 'Kasia Røe')
        self.assertEqual(row['medal'], 'Sølv')
        self.assertEqual(row['sum'], 102)
        self.assertEqual(row['oppr'], 'B')
        self.assertEqual(row['premie'], 600)

    def test_dnf_rows_still_parse(self):
        row = find_row(self.detail, 'Felt Fin', 'M', 'Gustav Tisthamar')
        self.assertEqual(row['status'], 'DNF')
        self.assertEqual(row['sum'], 49)

    def test_full_coverage_deltakere(self):
        # the comp prints 'Deltakere / Starter: 473 / 473' and Felt Fin
        # is the whole person program — the silent-drop signature this
        # fixture pins must never come back
        classes = self.ovelse()['classes']
        counts = {c['klasse']: len(c['rows']) for c in classes}
        self.assertEqual(counts, {'U': 9, 'Jk': 4, 'Jm': 4, 'K': 57,
                                   'M': 220, 'V55': 105, 'V65': 49,
                                   'V73': 25})
        self.assertEqual(sum(counts.values()), 473)


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


class ParseBlinken(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_blinken(fixture_text('blinken-felt.pdf'))

    def test_generator_and_ovelser(self):
        self.assertEqual(self.detail['generator'], 'blinken 3.0.15')
        self.assertEqual(
            [o['navn'] for o in self.detail['ovelser']],
            ['Fin felt', 'Grov felt', 'Militær felt', 'Revolver felt'],
        )

    def test_klasse_a_row_1(self):
        row = find_row(self.detail, 'Fin felt', 'A', 'Eirik Djønne')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Odda PK')
        self.assertEqual(
            row['series'],
            [[11, None], [11, None], [11, None], [11, None], [11, None],
             [10, None], [8, None], [11, None], [11, None], [12, None]],
        )
        self.assertEqual(row['ix'], 41)
        self.assertEqual(row['sum'], 107)
        self.assertEqual(row['mrk'], 'G')

    def test_series_values_sum_to_row_sum(self):
        for ovelse in self.detail['ovelser']:
            for cls in ovelse['classes']:
                for row in cls['rows']:
                    if 'sum' in row:
                        self.assertEqual(
                            sum(cell[0] for cell in row['series']),
                            row['sum'],
                            row['name'],
                        )

    def test_row_counts_match_deltakere(self):
        counts = {o['navn']: o['deltakere'] for o in self.detail['ovelser']}
        self.assertEqual(
            counts, {'Fin felt': 31, 'Grov felt': 17,
                     'Militær felt': 30, 'Revolver felt': 20},
        )
        for ovelse in self.detail['ovelser']:
            rows = sum(len(c['rows']) for c in ovelse['classes'])
            self.assertEqual(rows, ovelse['deltakere'], ovelse['navn'])

    def test_class_continues_across_page_break(self):
        klasse_a = next(c for o in self.detail['ovelser']
                        if o['navn'] == 'Grov felt'
                        for c in o['classes'] if c['klasse'] == 'A')
        self.assertEqual([r['pos'] for r in klasse_a['rows']], [1, 2, 3, 4, 5])
        klasse_c = next(c for o in self.detail['ovelser']
                        if o['navn'] == 'Militær felt'
                        for c in o['classes'] if c['klasse'] == 'C')
        self.assertEqual(len(klasse_c['rows']), 13)

    def test_dnf_row_keeps_partial_series_without_sum(self):
        row = find_row(self.detail, 'Fin felt', 'B', 'Geir Sivertsen')
        self.assertEqual(row['status'], 'DNF')
        self.assertEqual(row['series'],
                         [[11, None], [10, None], [8, None], [11, None]]
                         + [[0, None]] * 6)
        self.assertEqual(row['ix'], 0)
        self.assertNotIn('sum', row)
        self.assertNotIn('pos', row)

    def test_dns_row(self):
        row = find_row(self.detail, 'Fin felt', 'B', 'Jina Seo-Larsen')
        self.assertEqual(row['status'], 'DNS')
        self.assertEqual(row['series'], [[0, None]] * 10)
        self.assertEqual(row['ix'], 0)

    def test_multi_letter_mrk(self):
        row = find_row(self.detail, 'Grov felt', 'B', 'Dag Arild Hansen')
        self.assertEqual(row['mrk'], 'G A')
        row = find_row(self.detail, 'Fin felt', 'A', 'Morten Sleire')
        self.assertEqual(row['mrk'], 'S B')

    def test_rows_match_api_person_ids(self):
        """Blinken prints abbreviated clubs ('Odda PK' where the API has
        'Odda Pistolklubb'), so matching rides the name-unique fallback
        and the club-tail strip. The 16 unmatched rows: DNS/DNF
        participants the API omits and 'Ole-Christian' hyphen-style
        name variants."""
        from result_file_matching import attach_person_ids, match_stats
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'felt', '2022.json')))
        comp = next(c for c in year['competitions']
                    if c['id'].startswith('2f879487'))
        attach_person_ids(self.detail, comp['results'])
        matched, total = match_stats(self.detail)
        self.assertEqual(total, 98)  # 31 + 17 + 30 + 20 deltakere
        self.assertEqual(matched, 82)


class ParseBlinkenBane(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_blinken(fixture_text('blinken-bane.pdf'))

    def test_ovelser_and_series_count(self):
        self.assertEqual(
            [o['navn'] for o in self.detail['ovelser']],
            ['25m Hurtig spesialpistol', '25m Hurtig spesialrevolver'],
        )
        row = find_row(self.detail, '25m Hurtig spesialpistol', 'A',
                       'Gisle Enge')
        self.assertEqual(len(row['series']), 12)
        self.assertEqual(row['ix'], 12)
        self.assertEqual(row['sum'], 560)
        self.assertEqual(row['mrk'], 'B')

    def test_row_counts_match_deltakere(self):
        for ovelse in self.detail['ovelser']:
            rows = sum(len(c['rows']) for c in ovelse['classes'])
            self.assertEqual(rows, ovelse['deltakere'], ovelse['navn'])


class ParseBlinkenRowTail(unittest.TestCase):
    def test_kr_premie(self):
        row = _parse_blinken_row(
            '1 Test Person Oslo PK 11 11 11 11 11 10 8 11 11 12 '
            '41 107 G kr 311,50', 10)
        self.assertIsNotNone(row)
        self.assertEqual(row['premie'], 311.5)
        self.assertEqual(row['mrk'], 'G')
        row = _parse_blinken_row(
            '2 Annen Person Oslo PK 11 11 11 11 11 10 8 11 11 12 '
            '41 107 kr 311.00', 10)
        self.assertEqual(row['premie'], 311)
        self.assertEqual(row['name'], 'Annen Person')


class ParseBlinkenDispatch(unittest.TestCase):
    def test_parse_result_routes_blinken(self):
        with pdfplumber.open(os.path.join(FIXTURES, 'blinken-bane.pdf')) as pdf:
            detail = parse_result(pdf)
        self.assertTrue(detail['generator'].startswith('blinken'))
        self.assertTrue(detail['ovelser'])


class ParseLeon(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_leon(fixture_text('leon-fgmrs.pdf'))

    def test_generator_and_deltagere(self):
        self.assertEqual(self.detail['generator'], 'leon')
        self.assertEqual(self.detail['deltakere'], 19)

    def test_ovelser_and_classes(self):
        self.assertEqual(
            [(o['navn'], [c['klasse'] for c in o['classes']])
             for o in self.detail['ovelser']],
            [('25m Fin', ['C', 'D']), ('25m Revolver', ['C']),
             ('25m Spesialpistol', ['C'])],
        )

    def test_row_pins(self):
        row = find_row(self.detail, '25m Fin', 'C', 'Jan Petter Wiger')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Hokksund PK')
        self.assertEqual(
            row['series'],
            [[74, None], [70, None], [75, None],
             [69, None], [48, None], [52, None]],
        )
        self.assertEqual(row['sum'], 388)
        self.assertEqual(row['ix'], 1)
        self.assertEqual(row['hurtig'],
                         [[3, None], [8, None], [8, None]])

    def test_abbreviated_club_is_split_off(self):
        # 'Aron S. Drammen' (Aron Skytterklubb, Drammen) has no
        # club-suffix word; the medial single initial between two
        # words marks it as an abbreviated club
        row = find_row(self.detail, '25m Fin', 'D', 'Håvard Ellingsen')
        self.assertEqual(row['name'], 'Håvard Ellingsen')
        self.assertEqual(row['club'], 'Aron S. Drammen')
        self.assertEqual(row['sum'], 530)

    def test_row_count_matches_deltagere(self):
        rows = [r for o in self.detail['ovelser'] for c in o['classes']
                for r in c['rows']]
        self.assertEqual(len(rows), self.detail['deltakere'])

    def test_sums_equal_api_scores(self):
        """sum = the enumerated series columns — the API's own score
        field confirms it for every matched row. The one unmatched
        row: 'Rune Finstad Oslo Komm.Tj.M. SKL' — 'Komm.Tj.M.'
        truncates inside compound words, which no exact rule reads."""
        from result_file_matching import attach_person_ids
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'bane', '2021.json')))
        comp = next(c for c in year['competitions']
                    if '7e11a2b0' in (c.get('resultFileUrl') or ''))
        attach_person_ids(self.detail, comp['results'])
        by_pid = {r['personId']: r for r in comp['results']}
        checked = 0
        for ovelse in self.detail['ovelser']:
            for cls in ovelse['classes']:
                for row in cls['rows']:
                    if row.get('personId'):
                        self.assertEqual(
                            row['sum'],
                            by_pid[row['personId']]['score'],
                            row['name'],
                        )
                        checked += 1
        self.assertGreaterEqual(checked, 18)


class ParseLeonVm(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_leon(fixture_text('leon-vm.pdf'))

    def test_columns_and_block_name(self):
        self.assertEqual(
            [(o['navn'], [c['klasse'] for c in o['classes']])
             for o in self.detail['ovelser']],
            [('25m Fin', ['B', 'C', 'D']), ('25m Grov', ['B'])],
        )
        row = find_row(self.detail, '25m Fin', 'B', 'Jan Olaf Sandvik')
        self.assertEqual(row['club'], 'Kongsberg PK')
        self.assertEqual(
            row['series'],
            [[81, None], [77, None], [73, None],
             [81, None], [73, None], [80, None]],
        )
        self.assertEqual(row['sum'], 465)
        self.assertEqual(row['ix'], 4)
        self.assertEqual(row['vm'], [[4, None], [6, None], [5, None]])

    def test_row_count_matches_deltagere(self):
        rows = [r for o in self.detail['ovelser'] for c in o['classes']
                for r in c['rows']]
        self.assertEqual(len(rows), self.detail['deltakere'])
        self.assertEqual(self.detail['deltakere'], 10)

    def test_sums_equal_api_scores(self):
        from result_file_matching import attach_person_ids
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'bane', '2021.json')))
        comp = next(c for c in year['competitions']
                    if '7c7b5693' in (c.get('resultFileUrl') or ''))
        attach_person_ids(self.detail, comp['results'])
        by_pid = {r['personId']: r for r in comp['results']}
        checked = 0
        for ovelse in self.detail['ovelser']:
            for cls in ovelse['classes']:
                for row in cls['rows']:
                    if row.get('personId'):
                        self.assertEqual(
                            row['sum'],
                            by_pid[row['personId']]['score'],
                            row['name'],
                        )
                        checked += 1
        self.assertGreaterEqual(checked, 9)


class ParseLeonDispatch(unittest.TestCase):
    def test_parse_result_routes_leon(self):
        with pdfplumber.open(os.path.join(FIXTURES, 'leon-fgmrs.pdf')) as pdf:
            detail = parse_result(pdf)
        self.assertEqual(detail['generator'], 'leon')
        self.assertTrue(detail['ovelser'])


class ParseT96(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_t96(fixture_text('t96-open.pdf'))

    def test_generator_and_comp_totals(self):
        self.assertEqual(self.detail['generator'], 't96 2.0.4')
        self.assertEqual(self.detail['deltakere'], 30)

    def test_ovelser_with_deltakere(self):
        self.assertEqual(
            [(o['navn'], o['deltakere']) for o in self.detail['ovelser']],
            [('T96 fin', 11), ('T96 grov', 7), ('T96 militær', 2),
             ('T96 revolver', 6), ('T96 spesialpistol', 3),
             ('T96 spesialrevolver', 1)],
        )

    def test_row_pins(self):
        row = find_row(self.detail, 'T96 fin', 'Å', 'Jakob Kråkevik')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Odda PK')
        # series cells are [treff+figur+inner, inner] per meter range
        self.assertEqual(row['series'],
                         [[92, 27], [83, 20], [47, 9]])
        self.assertEqual(row['ix'], 56)
        self.assertEqual(row['sum'], 222)
        self.assertEqual(row['premie'], 187)

    def test_row_counts_match_deltakere(self):
        for ovelse in self.detail['ovelser']:
            rows = sum(len(c['rows']) for c in ovelse['classes'])
            self.assertEqual(rows, ovelse['deltakere'], ovelse['navn'])
        total = sum(o['deltakere'] for o in self.detail['ovelser'])
        self.assertEqual(total, self.detail['deltakere'])

    def test_totals_triple_is_componentwise_sum(self):
        for ovelse in self.detail['ovelser']:
            for cls in ovelse['classes']:
                for row in cls['rows']:
                    values = [cell[0] for cell in row['series']]
                    inners = [cell[1] for cell in row['series']]
                    self.assertEqual(sum(values), row['sum'], row['name'])
                    self.assertEqual(sum(inners), row['ix'], row['name'])

    def test_sums_equal_api_scores(self):
        """The API's score field equals every matched row's sum. The 5
        unmatched rows are name variants: 'Kenneth E. Kristoffersen'
        (API 'Kenneth Eliussen Kristoffersen') and 'Edvin Heggland'
        (API 'Edvin Martin Heggland') — abbreviated and missing middle
        names stay unmatched by design."""
        from result_file_matching import attach_person_ids
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'bane', '2021.json')))
        comp = next(c for c in year['competitions']
                    if '8e9190b9' in (c.get('resultFileUrl') or ''))
        attach_person_ids(self.detail, comp['results'])
        # one API row per person per øvelse — key by both
        by_pid = {(r['personId'], r['discipline']): r
                  for r in comp['results']}
        checked = 0
        for ovelse in self.detail['ovelser']:
            for cls in ovelse['classes']:
                for row in cls['rows']:
                    if row.get('personId'):
                        api = by_pid.get(
                            (row['personId'], ovelse['navn']))
                        if api is None:
                            continue
                        self.assertEqual(
                            row['sum'], api['score'], row['name'])
                        checked += 1
        self.assertGreaterEqual(checked, 25)


class ParseT96Km(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_t96(fixture_text('t96-km.pdf'))

    def test_generator_and_km_ovelser(self):
        self.assertEqual(self.detail['generator'], 't96 2.0.5')
        self.assertEqual(self.detail['deltakere'], 12)
        # the '(KM - Hordaland)' re-listings are separate øvelser
        # without a Deltakere line of their own
        self.assertEqual(
            [(o['navn'], [c['klasse'] for c in o['classes']])
             for o in self.detail['ovelser']],
            [('T96 fin', ['Å']), ('T96 grov', ['Å']),
             ('T96 fin (KM - Hordaland)', ['Å']),
             ('T96 grov (KM - Hordaland)', ['Å'])],
        )
        for ovelse in self.detail['ovelser']:
            if ovelse['navn'].endswith(')'):
                self.assertNotIn('deltakere', ovelse)
            else:
                self.assertIn('deltakere', ovelse)

    def test_km_rows_mirror_open_rows(self):
        row = find_row(self.detail, 'T96 fin (KM - Hordaland)', 'Å',
                       'Gisle Enge')
        self.assertEqual(row['sum'], 238)
        self.assertEqual(row['series'], [[101, 35], [81, 20], [56, 12]])


class ParseT96Dispatch(unittest.TestCase):
    def test_parse_result_routes_t96(self):
        with pdfplumber.open(os.path.join(FIXTURES, 't96-open.pdf')) as pdf:
            detail = parse_result(pdf)
        self.assertEqual(detail['generator'], 't96 2.0.4')
        self.assertTrue(detail['ovelser'])


class ParseBlinkenClassColumn(unittest.TestCase):
    """Some Blinken versions print a person-class column (M/K/Å/V55…)
    between name and club; the club-anchored split used to leave it
    glued to the name, breaking person matching for the whole file.
    Fixture: comp f6a4c5c4 (felt 2022), blinken 3.0.18 layout."""

    @classmethod
    def setUpClass(cls):
        cls.detail = parse_blinken(fixture_text('blinken-class.pdf'))

    def test_class_token_stripped_from_names(self):
        row = find_row(self.detail, 'Militær felt', 'B', 'Ove Humlestøl')
        self.assertEqual(row['club'], 'Sartor SSL')
        row = find_row(self.detail, 'Militær felt', 'C', 'Anette Christensen')
        self.assertEqual(row['club'], 'Åsane PK')

    def test_no_fused_class_tokens_remain(self):
        pat = __import__('re').compile(r'^(?:M|K|J|U|Å|V\d{2,3})$')
        for o in self.detail['ovelser']:
            for c in o['classes']:
                for r in c['rows']:
                    parts = r['name'].split()
                    self.assertFalse(
                        len(parts) >= 2 and pat.fullmatch(parts[-1]),
                        r['name'])

    def test_øvelse_level_klasse_untouched(self):
        classes = {c['klasse'] for c in
                   self.detail['ovelser'][0]['classes']}
        self.assertTrue(classes & {'A', 'B', 'C', 'D'})

    def test_matched_person_ids(self):
        """Post-fix membership: 41 of 51 rows match; the misses are the
        missing-middle-name ceiling (e.g. PDF 'Ove Humlestøl' vs API
        'Ove Ingar Humlestøl') and PDF-only people."""
        from result_file_matching import attach_person_ids
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'felt', '2022.json')))
        comp = next(c for c in year['competitions']
                    if '82600911' in (c.get('resultFileUrl') or ''))
        attach_person_ids(self.detail, comp['results'])
        rows = [r for o in self.detail['ovelser']
                for c in o['classes'] for r in c['rows']]
        matched = sum(1 for r in rows if r.get('personId'))
        self.assertGreaterEqual(matched, 40)
        row = find_row(self.detail, 'Militær felt', 'C', 'Anette Christensen')
        self.assertTrue(row.get('personId'))


class ParseBlinkenNopClub(unittest.TestCase):
    """Blinken (and t96) rows print 'Norske Offiserers
    Pistolklubb' branches as 'NOP-Bergen' / 'NOP Voss' — a
    prefix-anchored club with no suffix word, so the club-anchored
    split left it glued to the name and every NOP row failed person
    matching. The split now recognizes a leading NOP token as the
    club start; the person-class token still strips after the club
    split. Fixture: comp 39fb6515 (felt 2022, Felt FGRMSPSR),
    blinken 3.0.18 — carries both spellings and both branches."""

    @classmethod
    def setUpClass(cls):
        cls.detail = parse_blinken(fixture_text('blinken-nop.pdf'))

    def test_hyphen_branch_becomes_club(self):
        row = find_row(self.detail, 'Fin felt', 'B', 'Johnny Aslaksen')
        self.assertEqual(row['name'], 'Johnny Aslaksen')
        self.assertEqual(row['club'], 'NOP-Bergen')

    def test_spaced_branch_becomes_club(self):
        row = find_row(self.detail, 'Fin felt', 'C', 'Stig Aldal')
        self.assertEqual(row['name'], 'Stig Aldal')
        self.assertEqual(row['club'], 'NOP Voss')

    def test_class_token_still_strips_after_club_split(self):
        row = find_row(self.detail, 'Spesialrevolver felt', 'A',
                       'Johnny Aslaksen')
        self.assertEqual(row['name'], 'Johnny Aslaksen')
        self.assertEqual(row['club'], 'NOP-Bergen')

    def test_no_fused_nop_tokens_remain(self):
        for o in self.detail['ovelser']:
            for c in o['classes']:
                for r in c['rows']:
                    self.assertNotIn('NOP', r['name'], r['name'])
                    if r.get('club'):
                        self.assertTrue('NOP' in r['club'] or r['club'] != '',
                                        r['club'])

    def test_matched_person_ids(self):
        from result_file_matching import attach_person_ids
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'felt', '2022.json')))
        comp = next(c for c in year['competitions']
                    if '6abc23a5' in (c.get('resultFileUrl') or ''))
        attach_person_ids(self.detail, comp['results'])
        row = find_row(self.detail, 'Fin felt', 'C', 'Stig Aldal')
        self.assertEqual(row.get('personId'),
                         'ea269560-3f20-4c41-0e6c-08d87c24af2c')
        row = find_row(self.detail, 'Fin felt', 'B', 'Johnny Aslaksen')
        self.assertEqual(row.get('personId'),
                         '43edbbe0-ecf7-48d1-0a94-08d87c24af2c')


class LeonClubAbbreviations(unittest.TestCase):
    """Leon files print clubs with no suffix anchor word: 'Aron S.
    Drammen' (Aron Skytterklubb, Drammen — the single largest fused
    shape), 'Farris Sp.Sk.' (Farris Sportsskyttere), 'Oslo Komm.Tj.M.
    SKL' (Oslo Kommunale Tjenestemenns Skytterlag), 'Tofte og Hurum
    SKL'. The anchored split left them fused into the name, so every
    such row failed person matching. Rules: a dot-separated
    abbreviation token marks the club, starting one word before it —
    and it must run before the suffix anchor, because 'SKL' is now
    an acronym and would otherwise split 'Oslo Komm.Tj.M. SKL'
    mid-club; a medial single initial between two words marks an
    abbreviated club as the last three tokens, but only when a name
    remainder survives, so a bare 'Per S. Hansen' stays whole.

    Fixtures: comps 00bd1727 + 08788bcb (bane 2021, Hurtig alle
    FGMRSPSR)."""

    @classmethod
    def setUpClass(cls):
        cls.abbrev = parse_leon(fixture_text('leon-club-abbrev.pdf'))
        cls.oslo = parse_leon(fixture_text('leon-oslo-komm.pdf'))

    def test_medial_initial_is_abbreviated_club(self):
        row = find_row(self.abbrev, '25m Fin', 'B', 'Rune Hammer')
        self.assertEqual(row['name'], 'Rune Hammer')
        self.assertEqual(row['club'], 'Aron S. Drammen')

    def test_dotted_abbreviation_is_club(self):
        row = find_row(self.abbrev, '25m Fin', 'B',
                       'Bjørn Johannes Øyestaul')
        self.assertEqual(row['name'], 'Bjørn Johannes Øyestaul')
        self.assertEqual(row['club'], 'Farris Sp.Sk.')

    def test_dotted_beats_acronym_anchor(self):
        row = find_row(self.oslo, '25m Fin', 'B', 'Rune Finstad')
        self.assertEqual(row['name'], 'Rune Finstad')
        self.assertEqual(row['club'], 'Oslo Komm.Tj.M. SKL')

    def test_suffix_anchored_clubs_unchanged(self):
        row = find_row(self.abbrev, '25m Fin', 'B', 'Gunnar Lier')
        self.assertEqual(row['name'], 'Gunnar Lier')
        self.assertEqual(row['club'], 'Oslo Feltskyttere')

    def test_og_connector_with_skl_acronym(self):
        row = _parse_leon_row(
            '2. Per Hansen Tofte og Hurum SKL 90 88 91 92 93 5 5 5 (7*)',
            5, 'vm')
        self.assertEqual(row['name'], 'Per Hansen')
        self.assertEqual(row['club'], 'Tofte og Hurum SKL')

    def test_bare_initial_name_stays_whole(self):
        row = _parse_leon_row(
            '1. Per S. Hansen 90 88 91 92 93 5 5 5 (7*)', 5, 'vm')
        self.assertEqual(row['name'], 'Per S. Hansen')
        self.assertNotIn('club', row)

    def test_matched_person_ids(self):
        from result_file_matching import attach_person_ids
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'bane', '2021.json')))
        comp = next(c for c in year['competitions']
                    if '9f95a954' in (c.get('resultFileUrl') or ''))
        attach_person_ids(self.abbrev, comp['results'])
        row = find_row(self.abbrev, '25m Fin', 'B', 'Rune Hammer')
        self.assertEqual(row.get('personId'),
                         'de0b653f-6763-41a7-94e5-08d87b5318bf')


class ParseMegalink(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_megalink(fixture_text('megalink-resultater.pdf'))

    def test_generator_and_ovelse(self):
        self.assertEqual(self.detail['generator'], 'megalink')
        self.assertEqual([o['navn'] for o in self.detail['ovelser']],
                         ['Individuell'])

    def test_row_pins(self):
        row = find_row(self.detail, 'Individuell', 'C', 'Sigurd Nes')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['club'], 'Åsane Pk')
        self.assertEqual(
            row['series'],
            [[96, None], [91, None], [91, None],
             [93, None], [91, None], [90, None]],
        )
        self.assertEqual(row['ix'], 8)
        self.assertEqual(row['sum'], 552)

    def test_surname_first_names_are_flipped(self):
        row = find_row(self.detail, 'Individuell', 'B',
                       'Frank Henning Lillebuen')
        self.assertEqual(row['club'], 'Bergen Pk')
        self.assertEqual(row['sum'], 540)
        self.assertEqual(row['ix'], 7)

    def test_ssl_club_splits(self):
        row = find_row(self.detail, 'Individuell', 'B', 'Arild Hårklau')
        self.assertEqual(row['club'], 'Sartor SSL')

    def test_group_arithmetic_holds(self):
        for cls in self.detail['ovelser'][0]['classes']:
            for row in cls['rows']:
                self.assertEqual(
                    sum(cell[0] for cell in row['series']),
                    row['sum'], row['name'])

    def test_row_count(self):
        rows = [r for c in self.detail['ovelser'][0]['classes']
                for r in c['rows']]
        self.assertEqual(len(rows), 12)

    def test_sums_equal_api_scores(self):
        """sum = the Totalt column, API-verified for every matched row.
        The 2 unmatched rows are missing-middle-name variants ('Tor
        Ensrud' vs API 'Tor Magne Ensrud', 'Torgeir Ringstad' vs API
        'Torgeir Blaker Ringstad')."""
        from result_file_matching import attach_person_ids
        year = json.load(open(os.path.join(
            os.path.dirname(__file__), '..', '..', 'public', 'data',
            'bane', '2021.json')))
        comp = next(c for c in year['competitions']
                    if 'ace609df' in (c.get('resultFileUrl') or ''))
        attach_person_ids(self.detail, comp['results'])
        by_pid = {r['personId']: r for r in comp['results']}
        checked = 0
        for cls in self.detail['ovelser'][0]['classes']:
            for row in cls['rows']:
                if row.get('personId'):
                    self.assertEqual(
                        row['sum'], by_pid[row['personId']]['score'],
                        row['name'])
                    checked += 1
        self.assertGreaterEqual(checked, 10)


class ParseMegalinkFused(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detail = parse_megalink(fixture_text('megalink-fused.pdf'))

    def test_fused_total_and_ix_token(self):
        # a two-digit x-count fuses with the total: '557-11x'
        row = find_row(self.detail, 'Individuell', 'B',
                       'Frank Henning Lillebuen')
        self.assertEqual(row['pos'], 1)
        self.assertEqual(row['sum'], 557)
        self.assertEqual(row['ix'], 11)


class ParseMegalinkNmShape(unittest.TestCase):
    def test_championship_shape_raises_unsupported(self):
        with self.assertRaises(UnsupportedFormatError):
            parse_megalink(fixture_text('megalink-nm.pdf'))


class ParseMegalinkDispatch(unittest.TestCase):
    def test_parse_result_routes_megalink(self):
        with pdfplumber.open(os.path.join(
                FIXTURES, 'megalink-resultater.pdf')) as pdf:
            detail = parse_result(pdf)
        self.assertEqual(detail['generator'], 'megalink')
        self.assertTrue(detail['ovelser'])

    def test_parse_result_quarantines_nm_shape(self):
        with pdfplumber.open(os.path.join(FIXTURES, 'megalink-nm.pdf')) as pdf:
            with self.assertRaises(UnsupportedFormatError):
                parse_result(pdf)


class ParserVersionBump(unittest.TestCase):
    def test_parser_version_is_13(self):
        self.assertEqual(PARSER_VERSION, 13)


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
