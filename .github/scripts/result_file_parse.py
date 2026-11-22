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
PARSER_VERSION = 10

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
_CLUB_ACRONYMS = {'pk', 'sl', 'il', 'sk', 'ss', 'ssk', 'ssl', 'gsl'}
# club names may carry multi-word place parts: 'Horten og Omegn PK'
# (a connector pair) and 'Nedre Eiker PK' (a place-forming prefix)
_CLUB_PLACE_PREFIXES = {
    'nedre', 'øvre', 'søndre', 'nordre', 'østre', 'vestre',
}


class UnsupportedFormatError(Exception):
    """Raised when a result file matches no known generator family."""


def detect_family(text):
    """Classify a result file's text into its generator family.

    Returns 'inrX', 'plain-NO', 'datotid', or 'unknown' (anything we
    cannot recognize is quarantined by the caller, never guessed at).
    """
    if _INRX_FOOTER.search(text) or ':: Klasse' in text:
        return 'inrX'
    if 'Arrangert av' in text and 'Event #' in text:
        return 'blinken'
    if 'Pl. Navn Klubb' in text:
        return 'leon'
    if 'Stevnet er approbert' in text:
        return 't96'
    if 'MLRes' in text or 'www.megalink.no' in text:
        return 'megalink'
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
    if family == 'blinken':
        return parse_blinken(text)
    if family == 'leon':
        return parse_leon(text)
    if family == 't96':
        return parse_t96(text)
    if family == 'megalink':
        return parse_megalink(text)
    if family == 'plain-NO':
        return parse_plain_no(text)
    if family == 'datotid':
        return parse_datotid(pdf)
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
    (e.g. ' - pistol' disambiguators) along. Multi-word place parts
    are absorbed too: a connector pair ('Horten og Omegn PK') and a
    place-forming prefix ('Nedre Eiker PK'). The split only has to be
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
            while start >= 2 and tokens[start - 1].lower() == 'og':
                start -= 2
            while (start >= 1
                   and tokens[start - 1].lower() in _CLUB_PLACE_PREFIXES):
                start -= 1
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


_DATOTID_STEVNE = re.compile(r'^Stevne:\s*(.+?)\s*Maks poengsum', re.MULTILINE)
_DATOTID_KLASSE = re.compile(r'^Klasse\s+(\S+)')

# The datotid generator lays names and clubs out as stacked word
# columns beside each result row; these x0 ranges separate them.
_DATOTID_NAME_X = (43, 102)
_DATOTID_CLUB_X = (102, 200)
# Name/club words sit at most two stacked lines (about 20pt) from
# their row; class headers and page headers are 30pt+ away.
_DATOTID_ROW_WINDOW = 25


def parse_datotid(pdf):
    """Parse the 'Dato/tid' generator family from word coordinates.

    Its text layer interleaves columns, so rows are rebuilt from word
    positions: result rows are the lines starting with a position
    number at the far left, names and clubs are the stacked words in
    the two columns beside them (assigned to the nearest row), and
    the series run carries interleaved pair subtotals which are
    validated (a + b == subtotal) and dropped.
    """
    detail = {'generator': 'datotid'}
    texts = []
    classes = []
    current = None
    for page in pdf.pages:
        texts.append(page.extract_text() or '')
        words = page.extract_words(
            x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False
        )
        lines = {}
        for word in words:
            lines.setdefault(round(word['top'] / 3), []).append(word)
        number_lines = []  # {'top', 'pos', 'tail', 'names', 'club'}
        taken = set()
        for key in sorted(lines):
            line = sorted(lines[key], key=lambda w: w['x0'])
            first = line[0]
            tail = [w for w in line if w['x0'] >= 200]
            if (
                first['text'].isdigit()
                and first['x0'] < 44
                and len(tail) >= 5
                and current is not None
            ):
                number_lines.append({
                    'top': first['top'],
                    'pos': int(first['text']),
                    'tail': tail,
                    # names/clubs printed inline on the row itself
                    'names': [w for w in line
                              if _DATOTID_NAME_X[0] <= w['x0'] < _DATOTID_NAME_X[1]],
                    'club': [w for w in line
                             if _DATOTID_CLUB_X[0] <= w['x0'] < _DATOTID_CLUB_X[1]],
                    'class': current,
                })
                taken.update(id(w) for w in line)
                continue
            joined = ' '.join(w['text'] for w in line)
            klasse = _DATOTID_KLASSE.match(joined)
            if klasse and len(tail) >= 2:
                if classes and classes[-1]['klasse'] == klasse.group(1):
                    current = classes[-1]
                else:
                    current = {'klasse': klasse.group(1), 'rows': []}
                    classes.append(current)
                taken.update(id(w) for w in line)
        if not number_lines:
            continue
        for word in words:
            if id(word) in taken:
                continue
            x0 = word['x0']
            if _DATOTID_NAME_X[0] <= x0 < _DATOTID_NAME_X[1]:
                pool = 'names'
            elif _DATOTID_CLUB_X[0] <= x0 < _DATOTID_CLUB_X[1]:
                pool = 'club'
            else:
                continue
            nearest = min(
                number_lines,
                key=lambda row: abs(word['top'] - row['top']),
            )
            if abs(word['top'] - nearest['top']) <= _DATOTID_ROW_WINDOW:
                nearest[pool].append(word)
        for row in number_lines:
            parsed = _parse_datotid_tail(row['tail'])
            if parsed is None:
                continue
            series, ix, total, oppr, mrk, premie = parsed
            entry = {'pos': row['pos']}
            name = _join_stacked(row['names'])
            if not name:
                continue
            entry['name'] = name
            club = _join_stacked(row['club'])
            if club:
                entry['club'] = club
            entry['series'] = series
            entry['ix'] = ix
            entry['sum'] = total
            if oppr:
                entry['oppr'] = oppr
            if mrk:
                entry['mrk'] = mrk
            if premie is not None:
                entry['premie'] = premie
            row['class']['rows'].append(entry)

    stevne = _DATOTID_STEVNE.search('\n'.join(texts))
    navn = stevne.group(1).strip() if stevne else 'Ukjent'
    detail['ovelser'] = [
        {'navn': navn, 'classes': classes}
    ] if classes else []
    return detail


def _join_stacked(words):
    """Join y-sorted stacked words; a trailing hyphen continues onto
    the next line ('Linda-' + 'Marie' -> 'Linda-Marie')."""
    text = ''
    for word in sorted(words, key=lambda w: w['top']):
        if not text:
            text = word['text']
        elif text.endswith('-'):
            text += word['text']
        else:
            text += ' ' + word['text']
    return text


def _parse_datotid_tail(tail_words):
    """Parse a datotid row's tail: series values with interleaved pair
    subtotals, then InnerX, sum, and the Oppr/Mrk/Premie columns.

    Returns (series, ix, sum, oppr, mrk, premie) or None when the
    arithmetic does not hold — subtotals must equal the pair sum.
    """
    tokens = [w['text'] for w in sorted(tail_words, key=lambda w: w['x0'])]
    numbers = []
    rest = []
    for i, token in enumerate(tokens):
        if token.isdigit():
            numbers.append(int(token))
        else:
            rest = tokens[i:]
            break
    premie = None
    if rest and re.fullmatch(r'\d+\*?', rest[-1]):
        premie = int(rest[-1].rstrip('*'))
        rest = rest[:-1]
    oppr = rest[0] if len(rest) >= 1 else None
    mrk = rest[1] if len(rest) >= 2 else None
    if len(rest) > 2:
        return None
    if len(numbers) < 5 or (len(numbers) - 2) % 3 != 0:
        return None
    body = numbers[:-2]
    series = []
    for i in range(0, len(body), 3):
        a, b, subtotal = body[i:i + 3]
        if a + b != subtotal:
            return None
        series.append([a, None])
        series.append([b, None])
    return series, numbers[-2], numbers[-1], oppr, mrk, premie


_BLINKEN_OVELSE = re.compile(r'^(.+?) Max poeng\s*:\s*\d+\s*$')
_BLINKEN_CODE = re.compile(r'^\d+[A-Z]+\s*-\s*')
_BLINKEN_KLASSE = re.compile(
    r'^Klasse (\S+) Klubb ((?:\d+ )+)X OS Total Mrk OR Premie\s*$'
)
_BLINKEN_DELTAKERE = re.compile(r'^Deltakere\s*:\s*(\d+)\s*$')
_BLINKEN_VERSION = re.compile(r'Blinken \(V([\d.]+)')
_BLINKEN_LETTER = re.compile(r'[A-Z]')


def parse_blinken(text):
    """Parse the Blinken generator ('Arrangert av' header, 'Event #').

    Class headers enumerate the stand columns, so the series count is
    read per class; classes continue across page breaks, where the
    øvelse header and the interrupted class header repeat. The øvelse
    code prefix ('1F - ', '7SP - ') is stripped from the name.
    """
    detail = {}
    stamp = _BLINKEN_VERSION.search(text)
    detail['generator'] = f'blinken {stamp.group(1)}' if stamp else 'blinken'
    ovelser = []
    by_navn = {}
    sink = None
    n_series = 0
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        ovelse = _BLINKEN_OVELSE.match(line)
        if ovelse:
            navn = _BLINKEN_CODE.sub('', ovelse.group(1)).strip()
            current = by_navn.get(navn)
            if current is None:
                current = {'navn': navn, 'classes': []}
                by_navn[navn] = current
                ovelser.append(current)
            sink = None
            continue
        klasse = _BLINKEN_KLASSE.match(line)
        if klasse:
            n_series = len(klasse.group(2).split())
            current = ovelser[-1] if ovelser else None
            if current is None:
                continue
            classes = current['classes']
            if classes and classes[-1]['klasse'] == klasse.group(1):
                sink = classes[-1]
            else:
                sink = {'klasse': klasse.group(1), 'rows': []}
                classes.append(sink)
            continue
        deltakere = _BLINKEN_DELTAKERE.match(line)
        if deltakere and ovelser:
            by_navn[ovelser[-1]['navn']]['deltakere'] = int(
                deltakere.group(1)
            )
            continue
        if sink is None:
            continue
        row = _parse_blinken_row(line, n_series)
        if row is not None:
            sink['rows'].append(row)
    detail['ovelser'] = ovelser
    return detail


_BLINKEN_PERSON_CLASS = re.compile(r'^(?:M|K|J|U|Å|V\d{2,3})$')


def _strip_blinken_person_class(name):
    """Strip a fused person-class token from a Blinken row name.

    Some Blinken versions print a person-class column (M/K/Å/V55…)
    between the name and the club. The club-anchored split leaves
    that token glued to the name ('Ove Humlestøl M'), which breaks
    person matching for the whole file. Only a token that leaves at
    least one name word is stripped, and only in blinken rows — the
    øvelse-level klasse (A–D) is parsed from the table header and is
    never affected.
    """
    parts = name.split()
    if len(parts) >= 2 and _BLINKEN_PERSON_CLASS.fullmatch(parts[-1]):
        return ' '.join(parts[:-1])
    return name


def _parse_blinken_row(line, n_series):
    """Parse one Blinken table row; None for lines that are not rows.

    Row shape: 'pos name club series… X Total [Mrk letters]
    [kr premie] [DNF|DNS]'. Ranked rows must satisfy the series-sum
    == Total arithmetic; DNF/DNS rows print no Total.
    """
    tokens = line.split()
    if not tokens or not n_series:
        return None
    row = {}
    if tokens[0] == '-':
        tokens = tokens[1:]
    elif tokens[0].isdigit():
        row['pos'] = int(tokens[0])
        tokens = tokens[1:]
    else:
        return None
    status = None
    if tokens[-1] in ('DNF', 'DNS'):
        status = tokens[-1]
        tokens = tokens[:-1]
    premie = None
    if len(tokens) >= 2 and tokens[-2] == 'kr':
        try:
            amount = float(tokens[-1].replace(',', '.'))
        except ValueError:
            return None
        premie = int(amount) if amount.is_integer() else amount
        tokens = tokens[:-2]
    letters = []
    while tokens and _BLINKEN_LETTER.fullmatch(tokens[-1]):
        letters.append(tokens.pop())
    if letters:
        row['mrk'] = ' '.join(reversed(letters))
    count = None
    for candidate, has_total in ((n_series + 2, True), (n_series + 1, False)):
        if len(tokens) < candidate + 1:
            continue
        if not all(t.isdigit() for t in tokens[-candidate:]):
            continue
        if has_total:
            if sum(int(t) for t in tokens[-candidate:-2]) != int(tokens[-1]):
                continue
        elif status is None:
            continue  # a ranked row always prints a Total
        count = candidate
        break
    if count is None:
        return None
    if count == n_series + 2:
        series = [int(t) for t in tokens[-count:-2]]
        row['ix'] = int(tokens[-2])
        row['sum'] = int(tokens[-1])
    else:
        series = [int(t) for t in tokens[-count:-1]]
        row['ix'] = int(tokens[-1])
    name, club = _split_name_club(tokens[:-count])
    name = _strip_blinken_person_class(name)
    if not name:
        return None
    row['name'] = name
    if club:
        row['club'] = club
    row['series'] = [[value, None] for value in series]
    if status:
        row['status'] = status
    if premie is not None:
        row['premie'] = premie
    return row


_LEON_HEADER = re.compile(r'^Pl\. Navn Klubb (.+) (\S+)$')
_LEON_DELTAGERE = re.compile(r'^Antall deltagere:\s*(\d+)$')
_LEON_STAR = re.compile(r'^\((\d+)\*\)$')


def parse_leon(text):
    """Parse the Leon generator ('Pl. Navn Klubb' tables, Kongsberg
    Target System electronics).

    Column names vary by program ('10s-1 … 6s-2 Hurtig',
    'Pre. 1 … Due. 3 VM') — the series count is the number of
    enumerated columns before the trailing block name, and the block
    name ('hurtig', 'vm') keys the extra series carried beside the
    scored ones. The line before each table header is the section
    title '<øvelse> <klasse>'. No totals are printed; the API's score
    field equals the sum of the enumerated columns.
    """
    detail = {'generator': 'leon'}
    ovelser = []
    by_navn = {}
    sink = None
    n_series = 0
    block = None
    prev = None
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        header = _LEON_HEADER.match(line)
        if header:
            # column names can span tokens ('Pre. 1'); every series
            # column ends in a digit, the block name does not
            n_series = sum(
                1 for token in header.group(1).split()
                if token[-1].isdigit()
            )
            block = header.group(2).casefold()
            title = (prev or '').split()
            if len(title) >= 2:
                navn = ' '.join(title[:-1])
                klasse = title[-1]
                current = by_navn.get(navn)
                if current is None:
                    current = {'navn': navn, 'classes': []}
                    by_navn[navn] = current
                    ovelser.append(current)
                classes = current['classes']
                if classes and classes[-1]['klasse'] == klasse:
                    sink = classes[-1]
                else:
                    sink = {'klasse': klasse, 'rows': []}
                    classes.append(sink)
            prev = None
            continue
        deltakere = _LEON_DELTAGERE.match(line)
        if deltakere:
            detail['deltakere'] = int(deltakere.group(1))
            prev = None
            continue
        row = _parse_leon_row(line, n_series, block)
        if row is not None:
            if sink is not None:
                sink['rows'].append(row)
            prev = None
            continue
        prev = line
    detail['ovelser'] = ovelser
    return detail


def _parse_leon_row(line, n_series, block):
    """Parse one Leon row: 'N. name club series… <block>… (N*)'.

    The parenthesized star count ends every row. Returns None for
    lines that are not rows.
    """
    tokens = line.split()
    if not tokens or not tokens[0].endswith('.'):
        return None
    if not tokens[0][:-1].isdigit() or not n_series:
        return None
    star = _LEON_STAR.match(tokens[-1])
    if not star:
        return None
    body = tokens[1:-1]
    start = next((i for i, t in enumerate(body) if t.isdigit()), None)
    if start is None or start < 1:
        return None
    numbers = body[start:]
    if not all(t.isdigit() for t in numbers):
        return None
    if len(numbers) < n_series + 1:
        return None
    name, club = _split_name_club(body[:start])
    if not name:
        return None
    row = {'pos': int(tokens[0][:-1]), 'name': name}
    if club:
        row['club'] = club
    row['series'] = [[int(v), None] for v in numbers[:n_series]]
    row['sum'] = sum(int(v) for v in numbers[:n_series])
    row['ix'] = int(star.group(1))
    extra = numbers[n_series:]
    if extra:
        row[block] = [[int(v), None] for v in extra]
    return row


_T96_OVELSE = re.compile(r'^Kaliber (.+?)(?: Deltakere:\s*(\d+))?$')
_T96_KLASSE = re.compile(r'^Klasse (.+)$')
_T96_STARTENDE = re.compile(r'^Startende totalt:\s*(\d+)$')
_T96_VERSION = re.compile(r'T96 \(V([\d.]+)')


def parse_t96(text):
    """Parse the T96 generator ('Stevnet er approbert' header, Haugesund
    Pistolklubb & Eirik Apeland).

    Column headers are interleaved letter salad, but rows are clean
    lines: 'pos name club' then meter-range triples (Treff, Figur,
    Inner), a componentwise totals triple, the total, and premie.
    Series cells carry [treff+figur+inner, inner] per range — the
    values sum to the API-verified total. '(KM - …)' championship
    re-listings are kept as separate øvelser with no Deltakere line;
    no medals are derived from positions.
    """
    detail = {}
    stamp = _T96_VERSION.search(text)
    detail['generator'] = f't96 {stamp.group(1)}' if stamp else 't96'
    ovelser = []
    by_navn = {}
    sink = None
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        ovelse = _T96_OVELSE.match(line)
        if ovelse:
            navn = ovelse.group(1).strip()
            current = by_navn.get(navn)
            if current is None:
                current = {'navn': navn, 'classes': []}
                by_navn[navn] = current
                ovelser.append(current)
            if ovelse.group(2):
                current['deltakere'] = int(ovelse.group(2))
            sink = None
            continue
        klasse = _T96_KLASSE.match(line)
        if klasse and ovelser:
            classes = ovelser[-1]['classes']
            if classes and classes[-1]['klasse'] == klasse.group(1):
                sink = classes[-1]
            else:
                sink = {'klasse': klasse.group(1), 'rows': []}
                classes.append(sink)
            continue
        startende = _T96_STARTENDE.match(line)
        if startende:
            detail['deltakere'] = int(startende.group(1))
            continue
        row = _parse_t96_row(line)
        if row is not None and sink is not None:
            sink['rows'].append(row)
    detail['ovelser'] = ovelser
    return detail


def _parse_t96_row(line):
    """Parse one T96 row: 'pos name club <triples>… totals total premie'.

    The trailing digit run holds (Treff, Figur, Inner) triples per
    meter range, a componentwise totals triple, the total (equal to
    the API score) and the premie. Returns None for non-rows.
    """
    tokens = line.split()
    if not tokens or not tokens[0].isdigit():
        return None
    end = len(tokens)
    while end > 1 and tokens[end - 1].isdigit():
        end -= 1
    numbers = [int(t) for t in tokens[end:]]
    region = tokens[1:end]
    if not region or len(numbers) < 8:
        return None
    premie = numbers[-1]
    total = numbers[-2]
    triples = numbers[:-2]
    if len(triples) % 3 or len(triples) < 6:
        return None
    groups = [triples[i:i + 3] for i in range(0, len(triples), 3)]
    totals = groups[-1]
    ranges = groups[:-1]
    for i in range(3):
        if sum(g[i] for g in ranges) != totals[i]:
            return None
    if sum(totals) != total:
        return None
    name, club = _split_name_club(region)
    if not name:
        return None
    row = {'pos': int(tokens[0]), 'name': name}
    if club:
        row['club'] = club
    row['series'] = [
        [sum(g), g[2]] for g in ranges
    ]
    row['ix'] = totals[2]
    row['sum'] = total
    row['premie'] = premie
    return row


_MEGA_PERSON = re.compile(
    r'^(\d+) (\d+) (.+) ([A-Z]\d*) (\d+s) (\d+) (\d+) (\d+)$'
)
_MEGA_GROUP = re.compile(r'^(\d+s) (\d+) (\d+) (\d+)$')
_MEGA_END = re.compile(r'^(\d+s) (\d+) (\d+) (\d+) (\d+)- (\d+)x$')
_MEGA_END_FUSED = re.compile(r'^(\d+s) (\d+) (\d+) (\d+) (\d+)-(\d+)x$')


def parse_megalink(text):
    """Parse the Megalink RESULTATER shape ('MLRes - www.megalink.no').

    Persons print as a group of lines: the first carries placement,
    start number, SURNAME-first name, club, class and the first timed
    series group ('10s v1 v2 subtotal'); the last carries the total
    ('552- 8x' — total, tiebreak dash, inner count; a two-digit count
    fuses with the dash, '557-11x'). The championship
    'Resultatliste med premiering' shape is a different grammar and
    raises, so it quarantines with an explicit reason.
    """
    if 'INDIVIDUELL' not in text:
        raise UnsupportedFormatError(
            'megalink shape without an INDIVIDUELL resultater table '
            '(championship premiering shape not supported)'
        )
    detail = {'generator': 'megalink'}
    classes = {}
    current = None

    def finalize(person, total, ix):
        groups = person['groups']
        for v1, v2, sub in groups:
            if v1 + v2 != sub:
                return
        if sum(sub for _, _, sub in groups) != total:
            return
        region = person['region']
        surname = region[0].capitalize()
        given, club = _split_name_club(region[1:])
        if not given:
            return
        row = {'pos': person['pos'], 'name': f'{given} {surname}'}
        if club:
            row['club'] = club
        row['series'] = [
            [v, None] for v1, v2, _ in groups for v in (v1, v2)
        ]
        row['ix'] = ix
        row['sum'] = total
        bucket = classes.setdefault(person['klasse'], [])
        bucket.append(row)

    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        person = _MEGA_PERSON.match(line)
        if person:
            current = {
                'pos': int(person.group(1)),
                'region': person.group(3).split(),
                'klasse': person.group(4),
                'groups': [(
                    int(person.group(6)), int(person.group(7)),
                    int(person.group(8)),
                )],
            }
            continue
        if current is None:
            continue
        end = _MEGA_END.match(line) or _MEGA_END_FUSED.match(line)
        if end:
            current['groups'].append((
                int(end.group(2)), int(end.group(3)), int(end.group(4)),
            ))
            finalize(current, int(end.group(5)), int(end.group(6)))
            current = None
            continue
        group = _MEGA_GROUP.match(line)
        if group:
            current['groups'].append((
                int(group.group(2)), int(group.group(3)),
                int(group.group(4)),
            ))
    detail['ovelser'] = [
        {'navn': 'Individuell',
         'classes': [{'klasse': k, 'rows': rows}
                     for k, rows in classes.items()]}
    ] if classes else []
    return detail


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
                # open øvelser print championship podiums with the
                # medal as the first word — strip it on person
                # øvelser; Lag/Mix-lag øvelser are team tables whose
                # first word is the printed medal-team shape
                is_lag = 'lag: ' in navn.lower()
                current = (
                    'rows', class_dict, n_series, has_oppr, has_premie,
                    not is_lag,
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
