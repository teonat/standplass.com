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
import json
import os

from result_file_parse import PARSER_VERSION

DATA_DIR = 'public/data'


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


def write_detail(path, detail):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(detail, f, ensure_ascii=False, separators=(',', ':'))
