"""One-off backfill: patch regionOrganizationId into existing year JSONs.

The scrapers persist regionOrganizationId for comps they process
(commit "feat: persist region organization id in scraped comps"), but
comps already stored — everything the daily incremental no longer
re-scrapes — only get the field from this script. It walks
/query/competitionlist month-paged per year (no branch or discipline
filters, so one pass serves both branches), builds {compId:
regionOrganizationId}, and patches public/data/{felt,bane}/{year}.json
in place. Idempotent: comps already carrying a non-null value are
skipped, so re-runs rewrite nothing.

Run once via `just backfill-comp-regions` (after the full parse scan
has finished, to keep year-file writes tidy). The API answers every
comp with its region, so this needs no comp list of its own.
"""
import calendar
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

from parse_result_files import DATA_DIR, REQUEST_HEADERS

NSF_BASE = 'https://nsfapi.azurewebsites.net'
FIRST_YEAR = 2021
BRANCHES = ('felt', 'bane')


def patch_year_data(data, region_by_id):
    """Patch regionOrganizationId into a parsed year JSON, in place.

    Adds the field to comps that lack it and upgrades explicit nulls;
    comps already carrying a non-null value are left alone (the daily
    scraper keeps those fresh). Returns how many comps were patched.
    """
    patched = 0
    for comp in data.get('competitions', []):
        comp_id = comp.get('id')
        region = region_by_id.get(comp_id)
        if region is None or comp.get('regionOrganizationId'):
            continue
        comp['regionOrganizationId'] = region
        patched += 1
    return patched


def _get(url, params=None, timeout=45, max_retries=5):
    last_error = None
    for attempt in range(max_retries):
        try:
            r = requests.get(url, params=params, headers=REQUEST_HEADERS,
                             timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last_error = e
            wait = 2 ** attempt
            print(f'  Request failed ({e}); retrying in {wait}s…',
                  file=sys.stderr, flush=True)
            time.sleep(wait)
    raise RuntimeError(f'GET failed after {max_retries} attempts: {url}') from last_error


def fetch_region_map(year):
    """All comps' {id: regionOrganizationId} for a year, month-paged.

    Uses the same date-window encoding as the scrapers' competition
    walk (UTC-instant boundaries), with no branch or disciplineGroup
    filters — every comp regardless of branch is collected here.
    """
    region_by_id = {}
    for month in range(1, 13):
        if month == 1:
            month_start = f'ge:{year - 1}-12-31T23:00:00.000Z'
        else:
            prev_month = month - 1
            last_day_prev = calendar.monthrange(year, prev_month)[1]
            month_start = f'ge:{year}-{prev_month:02d}-{last_day_prev:02d}T23:00:00.000Z'
        last_day = calendar.monthrange(year, month)[1]
        month_end = f'le:{year}-{month:02d}-{last_day}T22:59:59.999Z'

        page = 0
        while True:
            data = _get(
                f'{NSF_BASE}/query/competitionlist',
                params={
                    'pageIndex': page,
                    'pageSize': 50,
                    'orderBy': 'startDate:asc',
                    'startDate': [month_start, month_end],
                },
            )
            for comp in data.get('items', []):
                region = comp.get('regionOrganizationId')
                if region:
                    region_by_id[comp['id']] = region
            if not data.get('paging', {}).get('hasNextPage', False):
                break
            page += 1
            time.sleep(0.25)
        time.sleep(0.25)
    return region_by_id


def save_year_file(path, data):
    # Compact separators match the scrapers' save_year_file so the
    # rewrite's diff is only the added fields.
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


def main():
    current_year = datetime.now(timezone.utc).year
    total_patched = 0
    for year in range(FIRST_YEAR, current_year + 1):
        print(f'{year}: fetching competition list…', flush=True)
        region_by_id = fetch_region_map(year)
        print(f'  {len(region_by_id)} comps with a region from the API',
              flush=True)
        for branch in BRANCHES:
            path = os.path.join(DATA_DIR, branch, f'{year}.json')
            if not os.path.exists(path):
                continue
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
            patched = patch_year_data(data, region_by_id)
            if patched:
                save_year_file(path, data)
            print(f'  {branch}: {patched} comps patched', flush=True)
            total_patched += patched
    print(f'\nDone. {total_patched} comps patched across all years.',
          flush=True)


if __name__ == '__main__':
    main()
