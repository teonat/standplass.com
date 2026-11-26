#!/usr/bin/env python3
"""Bundle IO for the per-year detaljer layout.

One bundle per branch-year (public/data/detaljer/<branch>/<year>.json)
replaces the per-comp detail tree, keeping the deployment's file count
bounded. A bundle is a single JSON object, {"comps": {<compId>:
<detail>}}, with the per-comp detail shape unchanged — see the
detaljer year-bundles design spec for the data contract.

Writes go through write_bundle_if_changed: content is compared before
any write, so an unchanged pipeline run produces no git diff; comp ids
are serialized in sorted order, keeping output deterministic and each
re-parsed comp a single surgical diff hunk; and the file is replaced
atomically only after a complete write.

Run tests directly:

    python3 .github/scripts/test_detaljer_bundles.py
"""

import json
import os
import re

DATA_DIR = 'public/data'

# A branch dir entry is a bundle when it is exactly YYYY.json.
_BUNDLE_FILE = re.compile(r'^\d{4}\.json$')


def bundle_path(branch, year, root='.'):
    """Path of a branch-year's detail bundle under the given repo root."""
    return os.path.normpath(os.path.join(
        root, DATA_DIR, 'detaljer', branch, f'{year}.json'
    ))


def load_bundle(path):
    """Parsed bundle at path; {'comps': {}} when the file is missing."""
    if not os.path.exists(path):
        return {'comps': {}}
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def write_bundle_if_changed(path, comps):
    """Write {'comps': comps} to path unless identical content is
    already there; returns True when the file was written.

    Comp ids are serialized in sorted order. The write is atomic —
    a temp file in the same directory is os.replace'd over the
    destination only after a complete write, so a crash can never
    leave a half-written bundle.
    """
    payload = {'comps': {k: comps[k] for k in sorted(comps)}}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            if json.load(f) == payload:
                return False
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.tmp'
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
    return True


def has_any_bundle(root='.'):
    """True when any bundle file (detaljer/<branch>/<year>.json)
    exists under root. The old per-comp tree has no YYYY.json files
    at branch-dir depth, so it does not count — this is the one-shot
    migration's guard against running on a tree that already holds
    bundles."""
    detaljer = os.path.join(root, DATA_DIR, 'detaljer')
    if not os.path.isdir(detaljer):
        return False
    for branch in os.listdir(detaljer):
        branch_dir = os.path.join(detaljer, branch)
        if not os.path.isdir(branch_dir):
            continue
        for name in os.listdir(branch_dir):
            if _BUNDLE_FILE.match(name):
                return True
    return False
