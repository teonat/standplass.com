#!/usr/bin/env python3
"""Scrape banepistol competition results from NSF API and write data/bane/{year}.json."""

import calendar
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

FIRST_YEAR = 2021
NSF_BASE = 'https://nsfapi.azurewebsites.net'
SKYTING_BASE = 'https://app.skyting.no/api'
OUTPUT_DIR = 'public/data/bane'

FULL_SCAN = os.environ.get('FULL_SCAN', 'false').lower() == 'true'
YEAR_FILTER = int(os.environ.get('YEAR', '0') or '0')

SESSION = requests.Session()
SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (compatible; KSS-nettsted-scraper/1.0; +https://kongsvinger-sportsskyttere.no/)',
    'Accept': 'application/json',
    'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
})


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _get(url, params=None, timeout=45, max_retries=10):
    """GET with exponential-backoff retry on ReadTimeout and 5xx errors."""
    wait = 10
    for attempt in range(max_retries):
        try:
            r = SESSION.get(url, params=params, timeout=timeout)
            r.raise_for_status()
            return r
        except (requests.exceptions.ReadTimeout, requests.exceptions.HTTPError) as e:
            is_retryable = isinstance(e, requests.exceptions.ReadTimeout) or (
                isinstance(e, requests.exceptions.HTTPError) and
                e.response is not None and e.response.status_code >= 500
            )
            if is_retryable and attempt < max_retries - 1:
                print(f'  {type(e).__name__} (attempt {attempt + 1}/{max_retries}), retrying in {wait}s…',
                      file=sys.stderr, flush=True)
                time.sleep(wait)
                wait *= 2
            else:
                raise


def fetch_branchlist():
    r = _get(f'{NSF_BASE}/query/branchlist')
    return r.json()


def fetch_all_competitions(year, branch_id, group_ids):
    all_items = []
    for month in range(1, 13):
        if month == 1:
            month_start = f'ge:{year - 1}-12-31T23:00:00.000Z'
        else:
            prev_month = month - 1
            last_day_prev = calendar.monthrange(year, prev_month)[1]
            month_start = f'ge:{year}-{prev_month:02d}-{last_day_prev:02d}T23:00:00.000Z'

        last_day = calendar.monthrange(year, month)[1]
        month_end = f'le:{year}-{month:02d}-{last_day:02d}T22:59:59.999Z'

        print(f'  Fetching {year}-{month:02d}…', flush=True)
        page, month_items = 0, []
        while True:
            r = _get(
                f'{NSF_BASE}/query/competitionlist',
                params={
                    'pageIndex': page,
                    'pageSize': 50,
                    'orderBy': 'startDate:asc',
                    'startDate': [month_start, month_end],
                    'branches': f'in:{json.dumps([branch_id])}',
                    'disciplineGroups': f'in:{json.dumps(group_ids)}',
                },
            )
            data = r.json()
            month_items.extend(data.get('items', []))
            if not data.get('paging', {}).get('hasNextPage', False):
                break
            page += 1
            time.sleep(1.0)

        if month_items:
            print(f'    {len(month_items)} competitions', flush=True)
        all_items.extend(month_items)
    return all_items


def fetch_resultlist(competition_id):
    r = _get(
        f'{SKYTING_BASE}/query/resultlist',
        params={
            'competitionId': f'eq:{competition_id}',
            'noPaging': 'true',
        },
    )
    r.raise_for_status()
    return r.json().get('items', [])


# ---------------------------------------------------------------------------
# Branch/discipline discovery
# ---------------------------------------------------------------------------

def build_mappings(branchlist_data):
    """Return (pistol_branch_id, group_ids, discipline_names, class_names)."""
    pistol_branch = None
    for branch in branchlist_data.get('items', []):
        if branch.get('name', '').lower() == 'pistol':
            pistol_branch = branch
            break

    if not pistol_branch:
        print('ERROR: Pistol branch not found in branchlist', file=sys.stderr)
        sys.exit(1)

    pistol_branch_id = pistol_branch['id']

    # Build class_names: strip branch prefix from class name
    class_names = {}
    for cls in pistol_branch.get('classes', []):
        raw_name = cls.get('name', '')
        clean_name = raw_name.split('\\')[-1].split('/')[-1]
        class_names[cls['id']] = clean_name

    # Discipline groups to include in bane scraping (match the BANE array in resultatliste-klubb.js)
    BANE_GROUP_NAMES = {'Fin-/grovpistol', 'Hurtig', 'Standardpistol', 'Silhuettpistol', 'T96'}

    # Build discipline_names and find relevant group IDs (bane groups)
    discipline_names = {}
    group_ids = []

    for grp in pistol_branch.get('disciplineGroups', []):
        grp_name = grp.get('name', '')

        # Collect all disciplines from this group
        for disc in grp.get('disciplines', []):
            if not disc.get('deleted', False):
                discipline_names[disc['id']] = disc['name']

        if grp_name in BANE_GROUP_NAMES:
            group_ids.append(grp['id'])
            print(f'Found bane group: "{grp_name}" ({grp["id"]})', flush=True)

    if not group_ids:
        print('ERROR: No bane disciplineGroups found under Pistol branch — cannot continue', file=sys.stderr)
        sys.exit(1)

    return pistol_branch_id, group_ids, discipline_names, class_names


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def load_year_file(year):
    path = os.path.join(OUTPUT_DIR, f'{year}.json')
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f'WARNING: Could not load {path}: {e} — starting fresh', file=sys.stderr)
    return None


def save_year_file(year, data):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, f'{year}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    return path


def should_process_year(year, file_data):
    """Process current year always. Process previous years until 28 days after their end."""
    current_year = datetime.now(timezone.utc).year
    if year == current_year:
        return True
    cutoff = datetime(year + 1, 1, 28, tzinfo=timezone.utc)
    last_checked = (file_data or {}).get('lastChecked')
    if not last_checked:
        return True
    last_checked_dt = datetime.fromisoformat(last_checked.replace('Z', '+00:00'))
    return last_checked_dt < cutoff


def build_competition(comp, all_results, discipline_names, class_names):
    results = []
    for r in all_results:
        results.append({
            'personId': r.get('personId'),
            'name': r.get('fullName') or '',
            'club': r.get('organizationName') or '',
            'discipline': discipline_names.get(r.get('disciplineId'), r.get('disciplineName') or ''),
            'class': class_names.get(r.get('classId'), r.get('className') or ''),
            'position': r.get('position'),
            'score': r.get('score'),
            'rankingScore': r.get('rankingScore'),
        })
    return {
        'id': comp['id'],
        'title': comp.get('title'),
        'competitionNumber': None,
        'startDate': comp.get('startDate'),
        'endDate': comp.get('endDate'),
        'facilityName': comp.get('facilityName'),
        'organizationName': comp.get('organizationName'),
        'competitionTypeName': comp.get('competitionTypeName'),
        'applicableForClassification': comp.get('applicableForClassification'),
        'status': comp.get('status'),
        'deepLink': f'https://app.skyting.no/p/c/{comp["id"]}/details',
        'resultFileUrl': comp.get('resultFileUrl'),
        'results': results,
    }


def merge_competitions(old_list, new_list):
    """Merge by id; new takes precedence. Returns sorted newest-first."""
    by_id = {c['id']: c for c in (old_list or [])}
    by_id.update({c['id']: c for c in new_list})
    return sorted(by_id.values(), key=lambda c: c.get('startDate', ''), reverse=True)


def _parse_start(iso):
    if not iso:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_year(year, pistol_branch_id, group_ids, discipline_names, class_names, now):
    print(f'\nProcessing year {year}…', flush=True)

    file_data = load_year_file(year)

    if not FULL_SCAN and not should_process_year(year, file_data):
        print(f'  Skipping {year} (last confirmed complete: {file_data.get("lastChecked", "unknown")})', flush=True)
        return

    if file_data is None:
        file_data = {
            'lastUpdated': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'lastChecked': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'season': year,
            'processedCompetitionIds': [],
            'competitions': [],
        }

    processed_ids = set(file_data.get('processedCompetitionIds', []))

    if FULL_SCAN:
        print('  Full scan mode: resetting processedIds', flush=True)
        processed_ids = set()

    # Fetch competition list for this year
    print(f'  Fetching competition list for {year}…', flush=True)
    competitions = fetch_all_competitions(year, pistol_branch_id, group_ids)
    print(f'  Found {len(competitions)} competitions total', flush=True)
    time.sleep(1.0)

    # Rolling 28-day window: re-queue recently published competitions even if
    # previously processed, so post-publication corrections are picked up.
    if not FULL_SCAN:
        cutoff_recent = now - timedelta(days=28)
        recent_ids = {
            c['id'] for c in competitions
            if _parse_start(c.get('startDate', '')) >= cutoff_recent
        }
        requeued = recent_ids & processed_ids
        if requeued:
            processed_ids -= requeued
            print(f'  Rolling window: re-queuing {len(requeued)} recently published competition(s)', flush=True)

    # Filter to those with results and not yet processed
    candidates = [
        c for c in competitions
        if c.get('hasResult', False) and c['id'] not in processed_ids
    ]
    print(f'  {len(candidates)} competitions to process (hasResult=true, not yet processed)', flush=True)

    new_competitions = []
    for comp in candidates:
        comp_title = comp.get('title', comp['id'])
        print(f'  Fetching results for: {comp_title}…', flush=True)
        try:
            results = fetch_resultlist(comp['id'])
            print(f'    {len(results)} results', flush=True)
            if results:
                new_competitions.append(
                    build_competition(comp, results, discipline_names, class_names)
                )
            processed_ids.add(comp['id'])
        except Exception as e:
            print(f'  ERROR fetching resultlist for {comp["id"]} ({comp_title}): {e}', file=sys.stderr)
            # Do NOT add to processed_ids — will retry on next run
        time.sleep(1.0)

    # Merge into existing competitions list
    file_data['competitions'] = merge_competitions(
        file_data.get('competitions', []),
        new_competitions,
    )
    file_data['processedCompetitionIds'] = sorted(processed_ids)
    file_data['lastChecked'] = now.strftime('%Y-%m-%dT%H:%M:%SZ')

    if new_competitions:
        file_data['lastUpdated'] = now.strftime('%Y-%m-%dT%H:%M:%SZ')

    path = save_year_file(year, file_data)
    total_results = sum(len(c.get('results', [])) for c in file_data['competitions'])
    print(
        f'  Written {path}: {len(file_data["competitions"])} competitions, '
        f'{total_results} results',
        flush=True,
    )


def main():
    now = datetime.now(timezone.utc)

    print('Fetching branch/discipline mappings…', flush=True)
    branchlist_data = fetch_branchlist()
    time.sleep(1.0)

    pistol_branch_id, group_ids, discipline_names, class_names = build_mappings(branchlist_data)
    print(
        f'Pistol branch: {pistol_branch_id}, '
        f'group IDs: {group_ids}, '
        f'{len(discipline_names)} disciplines, '
        f'{len(class_names)} classes',
        flush=True,
    )

    current_year = now.year
    years = list(range(FIRST_YEAR, current_year + 1))

    if YEAR_FILTER:
        if YEAR_FILTER in years:
            years = [YEAR_FILTER]
        else:
            print(f'ERROR: YEAR={YEAR_FILTER} is outside valid range {FIRST_YEAR}–{current_year}', file=sys.stderr)
            sys.exit(1)

    failed = []
    for year in years:
        try:
            process_year(year, pistol_branch_id, group_ids, discipline_names, class_names, now)
        except Exception as e:
            print(f'ERROR processing year {year}: {e}', file=sys.stderr, flush=True)
            failed.append(year)

    if failed:
        print(f'\nFailed years: {failed}', file=sys.stderr, flush=True)
        sys.exit(1)
    print('\nDone.', flush=True)


if __name__ == '__main__':
    main()
