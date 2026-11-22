"""One-off generator for kretser.json (the committed krets reference
data org_regions.py consumes). Run via `just update-kretser`.
"""
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(__file__))
from org_regions import DISTRIKTER, krets_short  # noqa: E402
from parse_result_files import REQUEST_HEADERS  # noqa: E402

NSF_ORG_URL = 'https://nsfapi.azurewebsites.net/organization?pageSize=600'
OUT = os.path.join(os.path.dirname(__file__), 'kretser.json')


def main():
    r = requests.get(NSF_ORG_URL, headers=REQUEST_HEADERS, timeout=60)
    r.raise_for_status()
    kretser = {}
    for org in r.json():
        if org.get('organizationFederationType') != 2:
            continue
        short = krets_short(org['organizationName'])
        if short not in DISTRIKTER:
            raise SystemExit(
                f'unknown krets {org["organizationName"]!r} (short '
                f'{short!r}) — update DISTRIKTER in org_regions.py first')
        kretser[org['id']] = {
            'name': org['organizationName'],
            'short': short,
        }
    missing = set(DISTRIKTER) - {e['short'] for e in kretser.values()}
    if missing:
        raise SystemExit(f'kretser missing from /organization: {sorted(missing)}')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(kretser.items())), f, ensure_ascii=False,
                  indent=2)
        f.write('\n')
    print(f'{len(kretser)} kretser written to {OUT}')


if __name__ == '__main__':
    main()
