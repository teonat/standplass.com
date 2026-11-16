#!/usr/bin/env python3
"""Shared birth-year collection logic for the scrapers and the one-time
backfill script.

The resultlist API returns `birthYear` on every result row. This module
owns the storage format and write rules for the per-family
`public/data/<family>/birthyears.json` files:

    {"<personId>": 1985, "<personId>": null}

- `null` means "polled, but the API has no birth year for this person" —
  recorded so they are never re-polled forever, and distinguishable from
  "not yet collected" (absent).
- Write rules: absent -> record whatever the poll returns (value or
  null); null -> may be upgraded to a value by a later poll (the API
  gained or corrected data); an existing value -> never overwritten
  (first write wins; corrections go through a forced re-run).
- Keys are sorted on save for stable git diffs; JSON is compact like the
  year files.
- The files carry personId keys only — no names or other person
  attributes (repo hygiene: names live in the results files).

See docs/superpowers/specs/2026-11-16-birthyear-data-design.md.
"""

import json
import os
import sys


def load_birthyears(path):
    """Load a birthyear file; missing or corrupt file -> {} (warn on corrupt)."""
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f'WARNING: Could not load {path}: {e} — starting fresh', file=sys.stderr)
        return {}


def merge_birthyears(existing, updates):
    """Apply the write rules to `updates` on top of `existing`; returns a new
    dict with keys in sorted order. Inputs are not mutated."""
    merged = dict(existing)
    for person_id, year in updates.items():
        if merged.get(person_id) is None:
            # absent, or null upgraded by whatever the poll returned
            merged[person_id] = year
        # an existing value is never overwritten (first write wins)
    return {k: merged[k] for k in sorted(merged)}


def save_birthyears(path, data):
    """Write compact JSON with sorted keys (caller passes data through
    merge_birthyears/slice_family for sorting; this re-sorts for safety)."""
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({k: data[k] for k in sorted(data)}, f, ensure_ascii=False,
                  separators=(',', ':'))


def extract_birthyears(resultlist_items):
    """personId -> birthYear (None when absent/null) from resultlist rows.

    Rows without a personId are skipped; non-None birthYear values are
    stored verbatim (the API gives ints; anything else passes through).
    """
    out = {}
    for row in resultlist_items or []:
        person_id = row.get('personId')
        if not person_id:
            continue
        out[person_id] = row.get('birthYear')
    return out
