"""Krets/distrikt reference data for the mestere index layer.

`kretser.json` (generated once from /organization by fetch_kretser.py
and committed) maps each krets GUID to its full and short name.
`DISTRIKTER` is the authoritative krets→distrikt grouping from
skyting.no's org page (19 kretser, 6 distrikter) — no API carries this
hierarchy. Refresh kretser.json with `just update-kretser` when NSF
reorganizes; staleness is caught by the mestere builder's
navn-region vs comp-region cross-check.
"""
import json
import os
import re

# 19 krets short names → 6 distrikter, per skyting.no/organisasjon/
# klubber-og-kretser ("Kretsene er fordelt på disse distriktene").
DISTRIKTER = {
    'Nordland': 'Nord-Norge',
    'Troms': 'Nord-Norge',
    'Finnmark': 'Nord-Norge',
    'Nord-Trøndelag': 'Midt-Norge',
    'Sør-Trøndelag': 'Midt-Norge',
    'Møre og Romsdal': 'Midt-Norge',
    'Hordaland': 'Vest-Norge',
    'Sogn og Fjordane': 'Vest-Norge',
    'Rogaland': 'Syd-Norge',
    'Vest-Agder': 'Syd-Norge',
    'Østre Agder': 'Syd-Norge',
    'Telemark': 'Østlandet Sør',
    'Vestfold': 'Østlandet Sør',
    'Buskerud': 'Østlandet Sør',
    'Akershus': 'Østlandet Nord',
    'Oslo': 'Østlandet Nord',
    'Østfold': 'Østlandet Nord',
    'Hedmark': 'Østlandet Nord',
    'Oppland': 'Østlandet Nord',
}

KRETSER_JSON = os.path.join(os.path.dirname(__file__), 'kretser.json')

# Real-world name suffixes seen in /organization, longest first so the
# loop below converges ('Troms Skytterkrets av Norges
# Sportsskytterforbund' → 'Troms'; note 'Skyttarkrins' spelling).
_SUFFIXES = (
    ' av norges sportsskytterforbund',
    ' skytterkrets',
    ' skyttarkrins',
)


def krets_short(full_name):
    """'Nord-Trøndelag skytterkrets' → 'Nord-Trøndelag' etc."""
    name = (full_name or '').strip()
    changed = True
    while changed:
        changed = False
        low = name.lower()
        for suffix in _SUFFIXES:
            if low.endswith(suffix):
                name = name[:len(name) - len(suffix)].rstrip()
                changed = True
                break
    return name


def load_kretser():
    """{guid: {'name': full, 'short': short}} from kretser.json."""
    with open(KRETSER_JSON, encoding='utf-8') as f:
        return json.load(f)


def resolve_region(region_org_id):
    """(krets short name, distrikt) for a comp's regionOrganizationId,
    or (None, None) when unknown/absent."""
    if not region_org_id:
        return (None, None)
    entry = load_kretser().get(region_org_id)
    if not entry:
        return (None, None)
    short = entry['short']
    return (short, DISTRIKTER.get(short))


def normalize_region(s):
    """Casefold, strip -/_ as spaces, collapse whitespace — so
    'Østlandet-Nord' (øvelse navn) matches 'Østlandet Nord' (table)."""
    return re.sub(r'\s+', ' ', re.sub(r'[-_/]+', ' ', (s or '').casefold())).strip()


if __name__ == '__main__':
    print(f'{len(DISTRIKTER)} kretser, '
          f'{len(set(DISTRIKTER.values()))} distrikter')
