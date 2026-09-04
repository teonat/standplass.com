#!/usr/bin/env python3
"""Scrape norgesfelt.no and write public/data/norgesfelt.json."""

import json
import os
import sys
import time
import datetime
import requests
from bs4 import BeautifulSoup

BASE_URL = 'https://www.norgesfelt.no/index.php/results'
OUTPUT_FILE = 'public/data/norgesfelt.json'

DISCIPLINES = [
    'Finfelt',
    'Grovfelt',
    'Militærfelt',
    'Militærfelt-Rp',
    'Revolverfelt',
    'Revolverfelt-Rp',
    'Spesialpistol',
    'Spesialrevolver',
]

SESSION = requests.Session()
SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (compatible; KSS-nettsted-scraper/1.0; +https://kongsvinger-sportsskyttere.no/)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
})


def to_int(val):
    try:
        return int(str(val).strip().replace('\xa0', '').replace('.', '').replace(',', ''))
    except (ValueError, AttributeError):
        return 0


# Column indexes are positional, not CSS-class-based -- the site's own
# classes are mis-offset from the actual columns. Individual: 0 rank,
# 1 date, 2 competition number, 3 discipline name, 4 shooter name, 5 club,
# 6 points (actual score, no separate "max possible" column exists),
# 7 innertreff (tiebreaker).
def parse_individual(html, disc_key):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return [], disc_key
    rows = tables[0].find_all('tr')
    results = []
    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 8:
            continue
        rank_text = cells[0].get_text(strip=True)
        if not rank_text.isdigit():
            continue
        disc_name = cells[3].get_text(strip=True)
        entry = {
            'rank': int(rank_text),
            'date': cells[1].get_text(strip=True),
            'name': cells[4].get_text(strip=True),
            'club': cells[5].get_text(strip=True),
            'points': to_int(cells[6].get_text(strip=True)),
            'innertreff': to_int(cells[7].get_text(strip=True)),
        }
        results.append(entry)
        if not disc_key and disc_name:
            disc_key = disc_name
    return results, disc_key


# Total: 0 rank, 1 discipline name, 2 shooter name, 3 club, 4 points (sum),
# 5 innertreff (sum).
def parse_total(html):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return []
    rows = tables[0].find_all('tr')
    results = []
    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 6:
            continue
        rank_text = cells[0].get_text(strip=True)
        if not rank_text.isdigit():
            continue
        entry = {
            'rank': int(rank_text),
            'name': cells[2].get_text(strip=True),
            'club': cells[3].get_text(strip=True),
            'points': to_int(cells[4].get_text(strip=True)),
            'innertreff': to_int(cells[5].get_text(strip=True)),
        }
        results.append(entry)
    return results


def load_existing():
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return None


def fetch_page(ovelse):
    url = f'{BASE_URL}?ovelse={ovelse}'
    resp = SESSION.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


def fetch_with_retry(ovelse, max_attempts=2):
    last_html = ''
    for attempt in range(1, max_attempts + 1):
        try:
            html = fetch_page(ovelse)
        except Exception as e:
            print(f'  ERROR fetching {ovelse} (attempt {attempt}/{max_attempts}): {e}', file=sys.stderr)
            if attempt < max_attempts:
                time.sleep(5)
            continue

        soup = BeautifulSoup(html, 'html.parser')

        # norgesfelt.no runs Imunify360, which IP-blocks known datacenter
        # ranges (GitHub Actions runners included) -- confirmed via DNS/
        # hosting lookup, not a JS challenge, so a headless browser
        # wouldn't help here either. Detect by title and fail fast instead
        # of waiting out a timeout.
        title = soup.find('title')
        title_text = title.get_text(strip=True).lower() if title else ''
        if 'one moment' in title_text or 'just a moment' in title_text:
            print(
                f'  BLOCKED: {ovelse} attempt {attempt}/{max_attempts} - '
                f'challenge page (title: "{title.get_text(strip=True) if title else ""}")',
                file=sys.stderr,
            )
            last_html = html
            if attempt < max_attempts:
                print('  Retrying in 5s...', file=sys.stderr)
                time.sleep(5)
            continue

        has_data = any(
            cells[0].get_text(strip=True).isdigit()
            for table in soup.find_all('table')
            for row in table.find_all('tr')
            for cells in [row.find_all('td')]
            if cells
        )
        if has_data:
            return html

        print(
            f'  WARNING: {ovelse} attempt {attempt}/{max_attempts} returned no data rows. '
            f'title={repr(title.get_text(strip=True) if title else "none")}',
            file=sys.stderr,
        )
        last_html = html
        if attempt < max_attempts:
            print('  Retrying in 5s...', file=sys.stderr)
            time.sleep(5)

    return last_html


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    data = {
        'lastUpdated': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'season': now.year,
        'disciplines': {},
    }

    total_individual = 0

    for disc in DISCIPLINES:
        print(f'Fetching {disc} (individual)...', flush=True)
        try:
            html = fetch_with_retry(disc)
            individual, disc_key = parse_individual(html, disc)
            key = disc_key if disc_key else disc
        except Exception as e:
            print(f'  ERROR processing {disc}: {e}', file=sys.stderr)
            individual, key = [], disc

        print(f'Fetching {disc} (total)...', flush=True)
        try:
            html_total = fetch_with_retry(disc + 'Total')
            total = parse_total(html_total)
        except Exception as e:
            print(f'  ERROR processing {disc}Total: {e}', file=sys.stderr)
            total = []

        data['disciplines'][key] = {'individual': individual, 'total': total}
        total_individual += len(individual)
        print(f'  {key}: {len(individual)} individual, {len(total)} total', flush=True)

    # Never overwrite good existing data with an empty result -- a full
    # 0-row run means every discipline hit the Imunify360 block (or the
    # workflow-level retry already exhausted its 3 attempts), not that the
    # season genuinely has zero results.
    if total_individual == 0:
        existing = load_existing()
        if existing and existing.get('disciplines'):
            print('WARNING: all disciplines returned 0 results - keeping existing JSON.', file=sys.stderr)
        else:
            print('WARNING: all disciplines returned 0 results and no existing data.', file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Written {OUTPUT_FILE} ({total_individual} individual results across {len(data["disciplines"])} disciplines)')


if __name__ == '__main__':
    main()
