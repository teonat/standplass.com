#!/usr/bin/env python3
"""One-shot migration: per-comp detaljer tree → per-year bundles.

Rebuilds public/data/detaljer as one bundle per branch-year (detaljer/
<branch>/<year>.json, via detaljer_bundles), replacing the per-comp
detail tree that spends nearly the whole Cloudflare file-count budget.
Every per-comp file is read and checked (compId == filename stem),
every scope's bundle is written, then each written bundle is
re-verified — comp count plus per-comp deep-equality with the source
files — and only after every scope verified are the old year
directories removed (branch dirs stay). A failure at any step deletes
nothing.

One-shot guard: migrate refuses to start when any bundle already
exists. On a mixed tree (bundles plus straggler per-comp files) a
naive re-run would rebuild each bundle from only the stragglers and
clobber it — and its own count check would pass, because the
baseline is whatever it happened to read. The guard makes that state
unreachable.

Recovery from a failed run: delete any bundles it managed to write
and re-run — bundles are derived data, and the old tree is the source
of truth until it has been verified and replaced.

Run from the repo root:

    python3 .github/scripts/migrate_detaljer_bundles.py

Tests:

    python3 .github/scripts/test_migrate_detaljer_bundles.py
"""

import json
import os
import shutil
import sys

from detaljer_bundles import (
    DATA_DIR,
    bundle_path,
    has_any_bundle,
    load_bundle,
    write_bundle_if_changed,
)


def _year_dirs(root):
    """[(branch, year, dir)] for every detaljer/<branch>/<year>/
    directory, in (branch, year) order. A non-year directory inside a
    branch dir is an error, not a skip — anything silently skipped
    here would be data the bundles never see."""
    detaljer = os.path.join(root, DATA_DIR, 'detaljer')
    scopes = []
    if not os.path.isdir(detaljer):
        return scopes
    for branch in sorted(os.listdir(detaljer)):
        branch_dir = os.path.join(detaljer, branch)
        if not os.path.isdir(branch_dir):
            continue
        for name in sorted(os.listdir(branch_dir)):
            path = os.path.join(branch_dir, name)
            if not os.path.isdir(path):
                continue
            if not name.isdigit():
                raise RuntimeError(
                    f'{path}: not a year directory — the migration only '
                    'understands detaljer/<branch>/<year>/ trees')
            scopes.append((branch, int(name), path))
    return scopes


def _read_comps(year_dir):
    """{compId: detail} for every per-comp *.json in a year dir.
    Each detail's compId must equal its filename stem — the bundle key
    has to agree with the detail's own id before the source file
    disappears into the bundle."""
    comps = {}
    for name in sorted(os.listdir(year_dir)):
        if not name.endswith('.json'):
            continue
        path = os.path.join(year_dir, name)
        with open(path, encoding='utf-8') as f:
            detail = json.load(f)
        stem = name[:-len('.json')]
        if detail.get('compId') != stem:
            raise RuntimeError(
                f'{path}: compId {detail.get("compId")!r} does not match '
                f'filename stem {stem!r}')
        comps[stem] = detail
    return comps


def migrate(root='.'):
    """Migrate the per-comp detaljer tree under root into per-year
    bundles; returns {(branch, year): {'branch', 'year', 'comps',
    'bytes'}} (comps: per-scope comp count, bytes: bundle size).

    All-or-nothing: every scope is read, every bundle written, every
    written bundle re-verified against the source files, and only
    then are the old year directories removed. Any failure — an
    existing bundle (the one-shot guard), a compId that does not
    match its filename, a verification mismatch — raises before
    anything is deleted.
    """
    if has_any_bundle(root):
        raise RuntimeError(
            'bundles already exist under '
            f'{os.path.join(root, DATA_DIR, "detaljer")}; the migration '
            'is one-shot — delete them first (they are derived data; '
            'the old tree is the source of truth)')

    scopes = [(branch, year, year_dir, _read_comps(year_dir))
              for branch, year, year_dir in _year_dirs(root)]

    # write every scope's bundle first; nothing is deleted until all
    # of them verify
    for branch, year, _year_dir, comps in scopes:
        write_bundle_if_changed(bundle_path(branch, year, root=root), comps)

    # re-verify: reload each written bundle and compare it against
    # what was read from the source files
    for branch, year, _year_dir, comps in scopes:
        path = bundle_path(branch, year, root=root)
        loaded = load_bundle(path)['comps']
        if len(loaded) != len(comps):
            raise RuntimeError(
                f'{path}: verification failed — {len(loaded)} comps in '
                f'the written bundle, {len(comps)} in the source tree; '
                'nothing has been deleted')
        for comp_id, source in comps.items():
            if comp_id not in loaded:
                raise RuntimeError(
                    f'{path}: verification failed — comp {comp_id} is '
                    'missing from the written bundle; nothing has been '
                    'deleted')
            if loaded[comp_id] != source:
                raise RuntimeError(
                    f'{path}: verification failed — comp {comp_id} '
                    'differs from its source file; nothing has been '
                    'deleted')

    # every scope verified — the old tree can go
    summary = {}
    for branch, year, year_dir, comps in scopes:
        shutil.rmtree(year_dir)
        summary[(branch, year)] = {
            'branch': branch,
            'year': year,
            'comps': len(comps),
            'bytes': os.path.getsize(bundle_path(branch, year, root=root)),
        }
    return summary


def main():
    """Run the migration from the repo root; returns an exit code."""
    try:
        summary = migrate()
    except Exception as exc:
        print(f'migration failed: {exc}', file=sys.stderr)
        return 1
    for stats in summary.values():
        print(f"{stats['branch']}/{stats['year']}: "
              f"{stats['comps']} comps, {stats['bytes']} bytes")
    total = sum(stats['comps'] for stats in summary.values())
    print(f'{len(summary)} scopes, {total} comps migrated')
    return 0


if __name__ == '__main__':
    sys.exit(main())
