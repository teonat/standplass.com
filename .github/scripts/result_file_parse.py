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
PARSER_VERSION = 3

_INRX_FOOTER = re.compile(r'inrX\s*\d+\.\d+')
_INRX_STAMP = re.compile(r'inrX (\d+(?:\.\d+)*)')
_MAX_FELT = re.compile(r'Maks poeng felt gr\. (\d+): (\d+)')
_TABLE_HEADER = re.compile(r'^(.+?) :: Klasse (.+)$')
_SERIES_CELL = re.compile(r'^(\d+)(?:/(\d+))?$')
_PREMIE_CELL = re.compile(r'^\*?(\d+)$')
_LAG_MEMBER = re.compile(r'^(?P<name>.+) \((?P<klasse>[^)]+)\) (?P<ix>\d+) (?P<sum>\d+)$')

_MEDALS = ('Gull', 'Sølv', 'Bronse')

# inrX rows print name and club as one space-joined region with no
# delimiter; the club is anchored by its suffix word.
_CLUB_ENDINGS = (
    'klubb', 'klubben', 'lag', 'laget', 'selskap', 'samvirket', 'skyttere',
)
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
    """Dispatch an open pdfplumber PDF to its family parser.

    Text extraction uses a tight x_tolerance: some generators print
    table cells nearly touching, and the default tolerance fuses them
    into unparseable tokens ('24/13' '22/3' -> '24/1322/3').
    """
    text = '\n'.join(
        page.extract_text(x_tolerance=1) or '' for page in pdf.pages
    )
    family = detect_family(text)
    if family == 'inrX':
        return parse_inrx(text)
    if family == 'plain-NO':
        return parse_plain_no(text)
    raise UnsupportedFormatError(f'unrecognized result file family: {family}')


_PLAINNO_KLASSE = re.compile(r'^Klasse\s+(.+?)(?:\s+-\s+.+)?$')
_PLAINNO_ROW = re.compile(
    r'^(?P<pos>\d+)\s+(?P<region>.+?)\s+'
    r'(?P<cells>(?:\d+\s+\d+x,\s+)+)(?P<sum>\d+)\s+(?P<ix>\d+)x$'
)


def parse_plain_no(text):
    """Parse plain-Norwegian-family text (2021-era) into the detail shape.

    Rows print 'NN Mx,' series cells and end with a sum + total-x cell;
    the øvelse name comes from the 'Program :' header and classes from
    'Klasse <X> - <øvelse>' lines.
    """
    detail = {'generator': 'plain-NO'}
    program = re.search(r'^Program\s*:\s*(.+)$', text, re.MULTILINE)
    ovelse = {'navn': program.group(1).strip() if program else 'Ukjent',
              'classes': []}
    current = None
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        klasse = _PLAINNO_KLASSE.match(line)
        if klasse:
            current = {'klasse': klasse.group(1).strip(), 'rows': []}
            ovelse['classes'].append(current)
            continue
        if current is None:
            continue
        row = _parse_plain_no_row(line)
        if row is not None:
            current['rows'].append(row)
    detail['ovelser'] = [ovelse] if ovelse['classes'] else []
    return detail


def _parse_plain_no_row(line):
    match = _PLAINNO_ROW.match(line)
    if not match:
        return None
    cells = [
        [int(score), int(inner)]
        for score, inner in re.findall(r'(\d+)\s+(\d+)x', match.group('cells'))
    ]
    name, club = _split_name_club(match.group('region').split())
    row = {'pos': int(match.group('pos'))}
    row['name'] = name
    if club:
        row['club'] = club
    row['series'] = cells
    row['ix'] = int(match.group('ix'))
    row['sum'] = int(match.group('sum'))
    return row


def _split_name_club(tokens):
    """Split a row's pre-series region into (name, club).

    The club is anchored on its suffix word (…klubb, …lag, …selskap),
    taking the word before it as the place part and anything after it
    (e.g. ' - pistol' disambiguators) along. The split only has to be
    reasonable: the person matcher joins rows against the API results
    and canonicalizes both fields there, so unmatched rows are the
    only consumers of this heuristic.
    """
    if not tokens:
        return '', None
    for i in range(len(tokens) - 1, -1, -1):
        low = tokens[i].lower()
        if low.endswith(_CLUB_ENDINGS) or low in _CLUB_ACRONYMS:
            start = max(0, i - 1)
            name = ' '.join(tokens[:start])
            if name:
                return name, ' '.join(tokens[start:])
            break
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


def _parse_row(line, n_series, has_oppr, has_premie, allow_medal=False):
    """Parse one table row; returns None for lines that are not rows."""
    tokens = line.split()
    if len(tokens) < n_series + 3:
        return None
    row = {}
    if allow_medal and tokens[0] in _MEDALS:
        row['medal'] = tokens[0]
        tokens = tokens[1:]
    elif tokens[0].isdigit():
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


def _parse_lag_line(line, n_series, entry):
    """Parse a Lag-table line: a member line or a team-totals line."""
    member = _LAG_MEMBER.match(line)
    if member:
        if not entry['teams']:
            return  # member line before any team row: skip, never crash
        entry['teams'][-1]['members'].append({
            'name': member.group('name').strip(),
            'klasse': member.group('klasse'),
            'ix': int(member.group('ix')),
            'sum': int(member.group('sum')),
        })
        return
    tokens = line.split()
    team = {}
    if tokens[0] in _MEDALS:
        team['medal'] = tokens[0]
        tokens = tokens[1:]
    elif tokens[0].isdigit():
        team['pos'] = int(tokens[0])
        tokens = tokens[1:]
    else:
        return
    need = n_series + 2
    if len(tokens) < need + 1:
        return
    cells = [_SERIES_CELL.match(t) for t in tokens[-need:]]
    if not all(cells):
        return
    if not (tokens[-1].isdigit() and tokens[-2].isdigit()):
        return
    team['team'] = ' '.join(tokens[:-need])
    team['series'] = [
        [int(c.group(1)), int(c.group(2)) if c.group(2) else None]
        for c in cells[:-2]
    ]
    team['ix'] = int(tokens[-2])
    team['sum'] = int(tokens[-1])
    team['members'] = []
    entry['teams'].append(team)


def _champ_entry(entries, navn, klasse, rows_key):
    """Reuse the last entry when a page break repeats the same table."""
    if entries and entries[-1]['navn'] == navn and entries[-1]['klasse'] == klasse:
        return entries[-1]
    entry = {'navn': navn, 'klasse': klasse, rows_key: []}
    entries.append(entry)
    return entry


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
    champs = {
        'km': {'sections': [], 'lag': []},
        'dm': {'sections': [], 'lag': []},
    }
    current = None  # ('rows', entry, n, has_oppr, has_premie) | ('lag', entry, n)
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        header = _parse_table_header(line)
        if header:
            navn, klasse, n_series, trailing_cols = header
            has_oppr = 'Oppr' in trailing_cols
            has_premie = 'Premie' in trailing_cols
            if navn.startswith('KM Lag: ') or navn.startswith('DM Lag: '):
                champ = champs['km' if navn.startswith('KM') else 'dm']
                entry = _champ_entry(champ['lag'], navn, klasse, 'teams')
                current = ('lag', entry, n_series)
            elif navn.startswith('KM: ') or navn.startswith('DM: '):
                champ = champs['km' if navn.startswith('KM') else 'dm']
                entry = _champ_entry(champ['sections'], navn, klasse, 'rows')
                current = ('rows', entry, n_series, has_oppr, has_premie, True)
            else:
                ovelse = by_navn.get(navn)
                if ovelse is None:
                    ovelse = {'navn': navn, 'classes': []}
                    by_navn[navn] = ovelse
                    ovelser.append(ovelse)
                classes = ovelse['classes']
                if classes and classes[-1]['klasse'] == klasse:
                    class_dict = classes[-1]
                else:
                    class_dict = {'klasse': klasse, 'rows': []}
                    classes.append(class_dict)
                current = (
                    'rows', class_dict, n_series, has_oppr, has_premie, False,
                )
            continue
        if current is None:
            continue
        if current[0] == 'lag':
            _parse_lag_line(line, current[2], current[1])
        else:
            _, sink, n_series, has_oppr, has_premie, allow_medal = current
            row = _parse_row(line, n_series, has_oppr, has_premie, allow_medal)
            if row is not None:
                sink['rows'].append(row)
    detail['ovelser'] = ovelser
    for key, champ in champs.items():
        if champ['sections'] or champ['lag']:
            detail[key] = {
                k: v for k, v in champ.items() if v
            }
    return detail
