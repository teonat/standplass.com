#!/usr/bin/env python3
"""One-shot migration: per-comp detaljer tree → per-year bundles.

Rebuilds public/data/detaljer as one bundle per branch-year (detaljer/
<branch>/<year>.json, via detaljer_bundles), replacing the per-comp
detail tree that spends nearly the whole Cloudflare file-count budget.
Every per-comp file is read and checked (a present compId must match
the filename stem; quarantine markers carry no compId and key by
their stem),
every scope's bundle is written, then each written bundle is
re-verified — comp count plus per-comp deep-equality with the source
files — and only after every scope verified are the old year
directories removed (branch dirs stay).

One-shot guard: migrate refuses to start when any bundle already
exists. On a mixed tree (bundles plus straggler per-comp files) a
naive re-run would rebuild each bundle from only the stragglers and
clobber it — and its own count check would pass, because the
baseline is whatever it happened to read. The guard makes that state
unreachable.

Recovery: a failure before deletion begins leaves the old tree fully
intact — delete the bundles the run wrote and re-run (bundles are
derived data). A failure during deletion is the opposite state: every
bundle is already written and verified, so do NOT delete them —
remove the remaining old year directories by hand and the migration
is complete (DeletionIncomplete lists them).

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


class DeletionIncomplete(RuntimeError):
    """A migration failure during the deletion phase: every bundle is
    written and verified, but only some old year directories were
    removed. The bundles are the only complete copy at this point —
    they must not be deleted; the remaining directories are removed
    by hand."""


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
    A detail's compId, when present, must match its filename stem —
    the bundle key has to agree with the detail's own id before the
    source file disappears into the bundle. Quarantine markers carry
    no compId; they key by their stem, the comp id the old pipeline
    built their path from (and the key the pipeline itself uses when
    storing markers into bundles)."""
    comps = {}
    for name in sorted(os.listdir(year_dir)):
        if not name.endswith('.json'):
            continue
        path = os.path.join(year_dir, name)
        with open(path, encoding='utf-8') as f:
            detail = json.load(f)
        stem = name[:-len('.json')]
        cid = detail.get('compId')
        if cid is not None and cid != stem:
            raise RuntimeError(
                f'{path}: compId {cid!r} does not match '
                f'filename stem {stem!r}')
        comps[stem] = detail
    return comps


def migrate(root='.'):
    """Migrate the per-comp detaljer tree under root into per-year
    bundles; returns {(branch, year): {'branch', 'year', 'comps',
    'bytes'}} (comps: per-scope comp count, bytes: bundle size).

    All-or-nothing: every scope is read, every bundle written, every
    written bundle re-verified against the source files, and only
    then are the old year directories removed. Failures before that
    deletion — an existing bundle (the one-shot guard), no scopes
    found, a compId that does not match its filename, a verification
    mismatch — raise with the old tree fully intact. A failure during
    the deletion raises DeletionIncomplete instead: every bundle is
    complete and verified, only the old-dir cleanup is partial.
    """
    if has_any_bundle(root):
        raise RuntimeError(
            'bundles already exist under '
            f'{os.path.join(root, DATA_DIR, "detaljer")}; the migration '
            'is one-shot. Delete-and-re-run is safe only when a failed '
            'run deleted nothing — every old year directory still '
            'present (bundles are derived data). If any year directory '
            'is already gone, the bundles are the only complete copy: '
            'keep them and remove the remaining year directories by '
            'hand')

    scopes = [(branch, year, year_dir, _read_comps(year_dir))
              for branch, year, year_dir in _year_dirs(root)]
    if not scopes:
        raise RuntimeError(
            'no per-comp detail year directories found under '
            f'{os.path.join(root, DATA_DIR, "detaljer")} — nothing to '
            'migrate; run from the repo root')

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

    # every scope verified — the old tree can go. A failure from here
    # on means the bundles are the only complete copy: they must NOT
    # be deleted; the remaining directories are removed by hand.
    deleted = []
    try:
        for branch, year, year_dir, comps in scopes:
            shutil.rmtree(year_dir)
            deleted.append((branch, year, comps))
    except (OSError, KeyboardInterrupt) as exc:
        remaining = [year_dir for _b, _y, year_dir, _c in scopes
                     if os.path.isdir(year_dir)]
        raise DeletionIncomplete(
            f'old-directory removal failed partway ({exc!r}); every '
            'bundle is written and verified — do NOT delete them; '
            'remove the remaining old year directories by hand and the '
            'migration is complete (still present: '
            f'{", ".join(remaining)})') from exc

    summary = {}
    for branch, year, comps in deleted:
        summary[(branch, year)] = {
            'branch': branch,
            'year': year,
            'comps': len(comps),
            'bytes': os.path.getsize(bundle_path(branch, year, root=root)),
        }
    return summary


def main(root='.'):
    """Run the migration (repo root by default); returns an exit
    code. Designed failures (RuntimeError) print one line to stderr
    and exit 1; anything unexpected tracebacks."""
    try:
        summary = migrate(root=root)
    except RuntimeError as exc:
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
