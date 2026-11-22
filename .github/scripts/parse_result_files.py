#!/usr/bin/env python3
"""Parse organizer result files into per-comp detail JSON.

Orchestrates the parsers in result_file_parse.py and the person matcher
in result_file_matching.py over the competitions in the scraped year
JSONs, writing detail files under public/data/detaljer/ and slim KM/DM
indexes per year. Detail files are additive: existing year JSONs are
never modified.

Run tests directly:

    python3 .github/scripts/test_parse_result_files.py
"""

import hashlib
import io
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests

import pdfplumber

from result_file_parse import PARSER_VERSION, UnsupportedFormatError, parse_result
from result_file_matching import attach_person_ids, match_stats

DATA_DIR = 'public/data'

REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; standplass-scraper/1.0; +https://standplass.com/)',
}

FETCH_SPACING_SECONDS = 0.25

_YEAR_FILE = re.compile(r'^\d{4}$')


def detail_path(branch, year, comp_id, root='.'):
    """Path of a comp's detail file under the given repo root."""
    return os.path.normpath(os.path.join(
        root, DATA_DIR, 'detaljer', branch, year, f'{comp_id}.json'
    ))


def source_hash(comp, url):
    """Hash of the result file URL plus the comp's API results — the
    inputs whose change means the stored detail is stale."""
    canonical = json.dumps(
        comp.get('results') or [],
        sort_keys=True,
        ensure_ascii=False,
        separators=(',', ':'),
    )
    blob = url + '\n' + canonical
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()


def should_reparse(existing, comp, url):
    """True when no detail exists, a source input changed, or the
    stored file predates the current parser version. Quarantine markers
    carry the same fields, so they are retried only on version bumps."""
    if existing is None:
        return True
    if existing.get('sourceHash') != source_hash(comp, url):
        return True
    if existing.get('parserVersion', 0) < PARSER_VERSION:
        return True
    return False


def load_detail(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def index_path(branch, year, root='.'):
    """Path of a year's slim KM/DM champions index."""
    return os.path.normpath(os.path.join(
        root, DATA_DIR, branch, f'km-dm-{year}.json'
    ))


_MEDALS = ('Gull', 'Sølv', 'Bronse')


def _person_champions(rows):
    champions = []
    for row in rows:
        if row.get('medal') not in _MEDALS:
            continue
        entry = {'medal': row['medal']}
        if row.get('personId'):
            entry['personId'] = row['personId']
        entry['name'] = row['name']
        if row.get('club'):
            entry['club'] = row['club']
        champions.append(entry)
    return champions


def _team_champions(teams):
    return [
        {'medal': team['medal'], 'team': team['team']}
        for team in teams
        if team.get('medal') in _MEDALS
    ]


def build_km_index(branch, year, root='.'):
    """Slim per-year index of championship results, champions only.

    Reads the branch's detail files for the year and the year JSON
    for comp metadata (title, date, organizer). Comps without
    championship sections are excluded.
    """
    year_file = os.path.join(root, DATA_DIR, branch, f'{year}.json')
    comps = {}
    if os.path.exists(year_file):
        with open(year_file, encoding='utf-8') as f:
            data = json.load(f)
        comps = {c['id']: c for c in data.get('competitions', [])}
    detaljer_dir = os.path.join(root, DATA_DIR, 'detaljer', branch, year)
    entries = []
    if os.path.isdir(detaljer_dir):
        for name in sorted(os.listdir(detaljer_dir)):
            if not name.endswith('.json'):
                continue
            with open(os.path.join(detaljer_dir, name), encoding='utf-8') as f:
                detail = json.load(f)
            if detail.get('generator') == 'quarantined':
                continue
            comp = comps.get(detail.get('compId'))
            if comp is None:
                continue
            entry = {
                'compId': comp['id'],
                'date': (comp.get('startDate') or '')[:10],
                'title': comp.get('title'),
                'organizer': comp.get('organizationName'),
            }
            for scope in ('km', 'dm'):
                champ = detail.get(scope) or {}
                sections = []
                for section in champ.get('sections', []):
                    champions = _person_champions(section.get('rows', []))
                    if champions:
                        sections.append({
                            'ovelse': re.sub(rf'^{scope.upper()}: ', '', section['navn']),
                            'klasse': section['klasse'],
                            'champions': champions,
                        })
                if sections:
                    entry[scope] = sections
                lags = []
                for lag in champ.get('lag', []):
                    champions = _team_champions(lag.get('teams', []))
                    if champions:
                        lags.append({
                            'ovelse': re.sub(rf'^{scope.upper()} Lag: ', '', lag['navn']),
                            'klasse': lag['klasse'],
                            'champions': champions,
                        })
                if lags:
                    entry[scope + 'Lag'] = lags
            if any(k in entry for k in ('km', 'dm', 'kmLag', 'dmLag')):
                entries.append(entry)
    entries.sort(key=lambda e: (e.get('date') or '', e.get('title') or ''))
    return {'year': int(year), 'comps': entries}


def write_detail(path, detail):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(detail, f, ensure_ascii=False, separators=(',', ':'))


def fetch_pdf(url):
    """Download a result file; returns (content, etag or None)."""
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=60)
    response.raise_for_status()
    return response.content, response.headers.get('ETag')


_default_fetch_pdf = fetch_pdf


def _year_files(branch, root):
    directory = os.path.join(root, DATA_DIR, branch)
    if not os.path.isdir(directory):
        return []
    names = sorted(
        n for n in os.listdir(directory)
        if _YEAR_FILE.match(n[:-5] if n.endswith('.json') else '')
    )
    return [os.path.join(directory, n) for n in names]


def collect_targets(opts, root):
    """(branch, year, comp) tuples for every comp with a result file,
    filtered by the run's options.

    Without full_scan or a year filter only the current and previous
    year are processed (the scrape window analog); full_scan widens to
    every year for backfills.
    """
    branch = opts.get('branch')
    branches = [branch] if branch else ['felt', 'bane']
    year_filter = opts.get('year')
    current_year = datetime.now(timezone.utc).year
    targets = []
    for branch_name in branches:
        for path in _year_files(branch_name, root):
            year = os.path.basename(path)[:-5]
            if year_filter and year != str(year_filter):
                continue
            if not year_filter and not opts.get('full_scan'):
                if int(year) < current_year - 1:
                    continue
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
            for comp in data.get('competitions', []):
                if comp.get('resultFileUrl'):
                    targets.append((branch_name, year, comp))
    return targets


def _parse_and_write(comp, url, content, etag, path, summary, dry_run):
    """Parse fetched content, attach person ids, stamp, and write the
    detail file (or a quarantine marker). Counts into summary."""
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            detail = parse_result(pdf)
    except UnsupportedFormatError as exc:
        detail = None
        reason = f'unsupported family: {exc}'
    except Exception as exc:  # noqa: BLE001 — parse failures quarantine
        detail = None
        reason = f'parse error: {exc}'
    if detail is None:
        if not dry_run:
            write_detail(path, {
                'generator': 'quarantined',
                'reason': reason,
                'parserVersion': PARSER_VERSION,
                'sourceUrl': url,
                'sourceHash': source_hash(comp, url),
            })
        summary['quarantined'] += 1
        summary['quarantine_list'].append(
            (path.split(os.sep)[-3], path.split(os.sep)[-2], comp['id'], reason)
        )
        return False
    attach_person_ids(detail, comp.get('results') or [])
    matched, total = match_stats(detail)
    summary['matched'] += matched
    summary['unmatched'] += total - matched
    detail['compId'] = comp['id']
    detail['sourceUrl'] = url
    detail['sourceHash'] = source_hash(comp, url)
    if etag:
        detail['pdfEtag'] = etag
    detail['parsedAt'] = datetime.now(timezone.utc).isoformat()
    detail['parserVersion'] = PARSER_VERSION
    if not dry_run:
        write_detail(path, detail)
    summary['parsed'] += 1
    generator = detail['generator']
    summary['by_family'][generator] = summary['by_family'].get(generator, 0) + 1
    return True


def fetch_conditional(url, etag):
    """Conditional GET: returns (status, content, etag or None)."""
    headers = dict(REQUEST_HEADERS)
    if etag:
        headers['If-None-Match'] = etag
    response = requests.get(url, headers=headers, timeout=60)
    return response.status_code, response.content, response.headers.get('ETag')


_default_fetch_conditional = fetch_conditional


def _write_indexes(targets, summary, root, dry_run):
    """Regenerate the slim KM/DM indexes for every (branch, year) the
    targets touched; write only when the content actually changes so
    daily runs produce no churn. A year whose comps all lost their
    championship sections has its index emptied rather than left
    stale, but years that never had an index get no empty file."""
    summary['indexes_written'] = 0
    if dry_run:
        return
    scopes = sorted({(branch, year) for branch, year, _ in targets})
    for branch, year in scopes:
        index = build_km_index(branch, year, root=root)
        path = index_path(branch, year, root=root)
        if not index['comps'] and not os.path.exists(path):
            continue
        existing = None
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                existing = json.load(f)
        if existing != index:
            write_detail(path, index)
            summary['indexes_written'] += 1


def run_sweep(opts, *, fetch_conditional=None, root='.'):
    """Weekly freshness sweep: conditional-GET every parsed PDF and
    re-parse the ones organizers replaced behind the same URL.

    Detail files without a stored etag are fetched once and gain one.
    """
    if fetch_conditional is None:
        fetch_conditional = _default_fetch_conditional
    summary = {
        'checked': 0,
        'changed': 0,
        're-parsed': 0,
        'parsed': 0,
        'quarantined': 0,
        'failed': 0,
        'matched': 0,
        'unmatched': 0,
        'by_family': {},
        'quarantine_list': [],
    }
    fetched_any = False
    targets = list(collect_targets(opts, root))
    for branch, year, comp in targets:
        url = comp['resultFileUrl']
        if not url.lower().split('?')[0].endswith('.pdf'):
            continue
        path = detail_path(branch, year, comp['id'], root=root)
        if not os.path.exists(path):
            continue
        existing = load_detail(path)
        if existing.get('generator') == 'quarantined':
            continue
        if fetched_any:
            time.sleep(FETCH_SPACING_SECONDS)
        fetched_any = True
        try:
            status, content, etag = fetch_conditional(url, existing.get('pdfEtag'))
        except Exception as exc:  # noqa: BLE001 — network errors are run output
            summary['failed'] += 1
            print(f'  sweep fetch failed {url}: {exc}')
            continue
        summary['checked'] += 1
        if status == 304:
            continue
        if status != 200:
            # a deleted or erroring blob is a fetch failure, not
            # "unchanged" — deletions must be observable in the summary
            summary['failed'] += 1
            print(f'  sweep unexpected status {status} for {url}')
            continue
        summary['changed'] += 1
        if _parse_and_write(comp, url, content, etag, path, summary,
                            opts.get('dry_run')):
            summary['re-parsed'] += 1
    _write_indexes(targets, summary, root, opts.get('dry_run'))
    return summary


def run(opts, *, fetch_pdf=None, root='.'):
    """Parse result files for the targeted comps; returns a summary.

    Downloads go through the injectable fetch_pdf (the default hits
    the network with the house user agent); identical URLs are fetched
    once per run and written to every branch that lists them.
    """
    if fetch_pdf is None:
        fetch_pdf = _default_fetch_pdf
    summary = {
        'parsed': 0,
        'quarantined': 0,
        'skipped_non_pdf': 0,
        'up_to_date': 0,
        'failed': 0,
        'matched': 0,
        'unmatched': 0,
        'by_family': {},
        'quarantine_list': [],
    }
    fetch_cache = {}

    def cached_fetch(url):
        if url not in fetch_cache:
            if fetch_cache:
                time.sleep(FETCH_SPACING_SECONDS)
            fetch_cache[url] = fetch_pdf(url)
        return fetch_cache[url]

    targets = list(collect_targets(opts, root))
    for branch, year, comp in targets:
        url = comp['resultFileUrl']
        if not url.lower().split('?')[0].endswith('.pdf'):
            summary['skipped_non_pdf'] += 1
            continue
        path = detail_path(branch, year, comp['id'], root=root)
        existing = load_detail(path) if os.path.exists(path) else None
        if existing is not None:
            if existing.get('generator') == 'quarantined':
                if existing.get('parserVersion', 0) >= PARSER_VERSION:
                    summary['quarantined'] += 1
                    continue
            elif not should_reparse(existing, comp, url):
                summary['up_to_date'] += 1
                continue
        try:
            content, etag = cached_fetch(url)
        except Exception as exc:  # noqa: BLE001 — network errors are run output
            summary['failed'] += 1
            print(f'  fetch failed {url}: {exc}')
            continue
        _parse_and_write(comp, url, content, etag, path, summary,
                         opts.get('dry_run'))

    _write_indexes(targets, summary, root, opts.get('dry_run'))
    return summary


def main():
    year_env = os.environ.get('YEAR', '0') or '0'
    year_filter = str(int(year_env)) if int(year_env) else None
    opts = {
        'full_scan': os.environ.get('FULL_SCAN', 'false').lower() == 'true',
        'year': year_filter,
        'branch': os.environ.get('BRANCH') or None,
        'dry_run': os.environ.get('DRY_RUN', 'false').lower() == 'true',
    }
    if os.environ.get('SWEEP', 'false').lower() == 'true':
        # the weekly sweep covers every year — replacements can hit
        # long-settled comps too
        opts['full_scan'] = True
        summary = run_sweep(opts)
        print()
        print(f"checked: {summary['checked']}, changed: {summary['changed']}, "
              f"re-parsed: {summary['re-parsed']}, failed: {summary['failed']}")
        for branch, year, comp_id, reason in summary['quarantine_list']:
            print(f'  quarantined {branch}/{year}/{comp_id}: {reason}')
        if summary['failed']:
            sys.exit(1)
        return
    summary = run(opts)

    matched = summary['matched']
    person_rows = matched + summary['unmatched']
    rate = matched / person_rows * 100 if person_rows else 100.0
    print()
    print(f"parsed: {summary['parsed']} "
          f"(up to date: {summary['up_to_date']})")
    print(f"quarantined: {summary['quarantined']}, "
          f"non-pdf skipped: {summary['skipped_non_pdf']}, "
          f"failed: {summary['failed']}")
    print(f'person match: {matched}/{person_rows} ({rate:.1f}%)')
    for generator, count in sorted(summary['by_family'].items()):
        print(f'  {generator}: {count}')
    for branch, year, comp_id, reason in summary['quarantine_list']:
        print(f'  quarantined {branch}/{year}/{comp_id}: {reason}')
    if summary['failed']:
        sys.exit(1)


if __name__ == '__main__':
    main()
