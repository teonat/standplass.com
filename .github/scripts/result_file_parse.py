#!/usr/bin/env python3
"""Parse organizer result files (PDFs) from skyting.no competitions.

Result files live on NSF's Azure blob storage (resultFileUrl on each
competition in the scraped year JSONs). Three generator families cover
the corpus; detect_family classifies extracted text, and per-family
parsers (added incrementally) turn it into the detail-file shape.

Run tests directly:

    python3 .github/scripts/test_result_file_parse.py
"""

import re

# Bump when parsing behavior changes: stored detail files carry the
# version they were parsed with, and older files are re-parsed.
PARSER_VERSION = 1

_INRX_FOOTER = re.compile(r'inrX\s*\d+\.\d+')
_INRX_STAMP = re.compile(r'inrX (\d+(?:\.\d+)*)')
_MAX_FELT = re.compile(r'Maks poeng felt gr\. (\d+): (\d+)')
_TABLE_HEADER = re.compile(r'^(.+?) :: Klasse (.+)$')
_SERIES_CELL = re.compile(r'^(\d+)(?:/(\d+))?$')
_PREMIE_CELL = re.compile(r'^\*?(\d+)$')

# inrX rows print name and club as one space-joined region with no
# delimiter; the club is anchored by its suffix word.
_CLUB_ENDINGS = ('klubb', 'klubben', 'lag', 'laget', 'selskap', 'samvirket')
_CLUB_ACRONYMS = {'pk', 'sl', 'il', 'sk', 'ss', 'gsl'}


class UnsupportedFormatError(Exception):
    """Raised when a result file matches no known generator family."""


def detect_family(text):
    """Classify a result file's text into its generator family.

    Returns 'inrX', 'plain-NO', 'datotid', or 'unknown' (anything we
    cannot recognize is quarantined by the caller, never guessed at).
    """
    if _INRX_FOOTER.search(text) or ':: Klasse' in text:
        return 'inrX'
    if 'Dato/tid:' in text and (
        'Stevnenummer' in text or 'file:///C:/resultat' in text
    ):
        return 'datotid'
    if 'Stevne :' in text and 'Program :' in text:
        return 'plain-NO'
    return 'unknown'


def parse_result(pdf):
    """Dispatch an open pdfplumber PDF to its family parser."""
    text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
    family = detect_family(text)
    if family == 'inrX':
        return parse_inrx(text)
    raise UnsupportedFormatError(f'unrecognized result file family: {family}')


def _split_name_club(tokens):
    """Split a row's pre-series region into (name, club).

    The split only has to be reasonable: the person matcher joins rows
    against the API results and canonicalizes both fields there, so
    unmatched rows are the only consumers of this heuristic.
    """
    if not tokens:
        return '', None
    last = tokens[-1].lower()
    if last.endswith(_CLUB_ENDINGS) or last in _CLUB_ACRONYMS:
        club_len = 2 if len(tokens) >= 3 else 1
        return ' '.join(tokens[:-club_len]), ' '.join(tokens[-club_len:])
    return ' '.join(tokens), None


def _parse_table_header(line):
    """Parse '<øvelse> :: Klasse <klasse> 1 2 … N iX Sum [cols]'.

    Returns (øvelse, klasse, n_series, trailing_cols) or None. The
    series enumeration always counts 1..N, which separates it from
    class names that contain digits (Åpen-2, V55, …).
    """
    match = _TABLE_HEADER.match(line)
    if not match:
        return None
    ovelse = match.group(1).strip()
    tokens = match.group(2).split()
    if 'iX' not in tokens:
        return None
    ix_at = tokens.index('iX')
    trailing_cols = tokens[ix_at:]
    head = tokens[:ix_at]
    n_series = 0
    expected = None
    while head:
        token = head[-1]
        if not token.isdigit():
            break
        if expected is None:
            expected = int(token)
        if expected < 1 or int(token) != expected:
            break
        head.pop()
        n_series += 1
        expected -= 1
    if n_series == 0 or expected != 0 or not head:
        return None
    return ovelse, ' '.join(head), n_series, trailing_cols


def _parse_row_tail(tokens, n_series, has_oppr, with_premie):
    """Pop the known tail off a row; returns None when it does not fit.

    Returns (premie, oppr, ix, sum, series_cells, region_tokens).
    """
    rest = list(tokens)
    premie = None
    oppr = None
    if with_premie:
        match = _PREMIE_CELL.match(rest[-1])
        if not match:
            return None
        premie = int(match.group(1))
        rest.pop()
    if has_oppr and not rest[-1].isdigit():
        oppr = rest[-1]
        rest.pop()
    if len(rest) < n_series + 3:  # region (>=1 word) + series + ix + sum
        return None
    sum_tok, ix_tok = rest[-1], rest[-2]
    if not (sum_tok.isdigit() and ix_tok.isdigit()):
        return None
    series_toks = rest[len(rest) - n_series - 2: len(rest) - 2]
    cells = []
    for token in series_toks:
        match = _SERIES_CELL.match(token)
        if not match:
            return None
        cells.append([int(match.group(1)),
                      int(match.group(2)) if match.group(2) else None])
    region = rest[:len(rest) - n_series - 2]
    if not region:
        return None
    return premie, oppr, int(ix_tok), int(sum_tok), cells, region


def _parse_row(line, n_series, has_oppr, has_premie):
    """Parse one table row; returns None for lines that are not rows."""
    tokens = line.split()
    if len(tokens) < n_series + 3:
        return None
    row = {}
    if tokens[0].isdigit():
        row['pos'] = int(tokens[0])
        tokens = tokens[1:]
    if tokens[-1] in ('DNF', 'DNS'):
        row['status'] = tokens[-1]
        tokens = tokens[:-1]
    attempts = [True, False] if has_premie else [False]
    for with_premie in attempts:
        tail = _parse_row_tail(tokens, n_series, has_oppr, with_premie)
        if tail is not None:
            break
    if tail is None:
        return None
    premie, oppr, ix, total, cells, region = tail
    name, club = _split_name_club(region)
    if not name:
        return None
    row['name'] = name
    if club:
        row['club'] = club
    row['series'] = cells
    row['ix'] = ix
    row['sum'] = total
    if oppr:
        row['oppr'] = oppr
    if premie is not None:
        row['premie'] = premie
    return row


def parse_inrx(text):
    """Parse inrX-generator text into the detail-file shape."""
    detail = {}
    stamp = _INRX_STAMP.search(text)
    detail['generator'] = 'inrX ' + stamp.group(1) if stamp else 'inrX'
    max_felt = {
        f'group{m.group(1)}': int(m.group(2))
        for m in _MAX_FELT.finditer(text)
    }
    if max_felt:
        detail['maxFeltPoints'] = max_felt

    ovelser = []
    by_navn = {}
    current = None  # (class dict to append rows to, n_series, has_oppr, has_premie)
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        header = _parse_table_header(line)
        if header:
            navn, klasse, n_series, trailing_cols = header
            ovelse = by_navn.get(navn)
            if ovelse is None:
                ovelse = {'navn': navn, 'classes': []}
                by_navn[navn] = ovelse
                ovelser.append(ovelse)
            classes = ovelse['classes']
            if classes and classes[-1]['klasse'] == klasse:
                # page-break repetition of the same table: continue it
                class_dict = classes[-1]
            else:
                class_dict = {'klasse': klasse, 'rows': []}
                classes.append(class_dict)
            current = (
                class_dict,
                n_series,
                'Oppr' in trailing_cols,
                'Premie' in trailing_cols,
            )
            continue
        if current is None:
            continue
        row = _parse_row(line, current[1], current[2], current[3])
        if row is not None:
            current[0]['rows'].append(row)
    detail['ovelser'] = ovelser
    return detail
