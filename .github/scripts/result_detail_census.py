#!/usr/bin/env python3
"""Local-only detail census: point at silent partial parses.

Walks the parsed detail files plus the comp year JSONs and reports
anomaly checks — printed-vs-parsed deltakere counts, person names
that swallowed their club (comma tails, club words) or a whole lag
team line (digits, parentheses), empty øvelser, duplicate rows,
sum < ix, and championship-titled comps that never reached the
mestere index (bucketed by why: no detail file, quarantined, no
championship sections, or sections the index did not pick up).

A pointing tool, not a gate: it is wired into no workflow and never
fails a build (owner ruling 2026-11-23). Run it by hand after a
re-parse or when investigating a report:

    .venv/bin/python .github/scripts/result_detail_census.py
    … --json                     machine-readable report
    … --save-baseline PATH       local file, never committed
    … --diff PATH                drift vs a saved baseline, as a delta
"""

import argparse
import json
import os
import re
import sys

from result_file_parse import _CLUB_ACRONYMS, _CLUB_ENDINGS

CHAMP_TITLE = re.compile(r'\b(KM|DM|NM)\b')
_TEAM_LINE_NAME = re.compile(r'[\d(]')
CHECKS = (
    'deltakere_mismatch', 'fused_comma', 'team_lines_as_persons',
    'club_words_in_name', 'sum_lt_ix', 'empty_ovelser', 'duplicate_rows',
)


def _club_word_in(name):
    """A club word left inside a person name by a failed split."""
    for token in name.split():
        low = token.lower().rstrip(',.')
        if low.endswith(_CLUB_ENDINGS) or low in _CLUB_ACRONYMS:
            return True
    return False


def _iter_rows(detail):
    """(scope, klasse, row) over stevne class rows and championship
    section rows — the person rows."""
    for ovelse in detail.get('ovelser') or []:
        for cls in ovelse.get('classes') or []:
            for row in cls.get('rows') or []:
                yield ovelse.get('navn'), cls.get('klasse'), row
    for key in ('km', 'dm'):
        champ = detail.get(key) or {}
        for section in champ.get('sections') or []:
            for row in section.get('rows') or []:
                yield section.get('navn'), section.get('klasse'), row


def _iter_members(detail):
    """(scope, klasse, member) over championship lag team members."""
    for key in ('km', 'dm'):
        champ = detail.get(key) or {}
        for lag in champ.get('lag') or []:
            for team in lag.get('teams') or []:
                for member in team.get('members') or []:
                    yield lag.get('navn'), lag.get('klasse'), member


def _counted(detail):
    """Rows plus teams across an øvelse's classes."""
    return sum(len(c.get('rows') or []) + len(c.get('teams') or [])
               for c in detail.get('classes') or [])


def census_detail(detail):
    """Pure anomaly checks over one parsed detail. Returns
    {check: [findings]}; an all-empty report is a healthy detail."""
    out = {name: [] for name in CHECKS}

    def name_checks(scope, klasse, row):
        name = row.get('name') or ''
        if ',' in name:
            out['fused_comma'].append(
                {'scope': scope, 'klasse': klasse, 'name': name})
        if _TEAM_LINE_NAME.search(name):
            out['team_lines_as_persons'].append(
                {'scope': scope, 'klasse': klasse, 'name': name})
        elif _club_word_in(name):
            out['club_words_in_name'].append(
                {'scope': scope, 'klasse': klasse, 'name': name})

    for scope, klasse, row in _iter_rows(detail):
        name_checks(scope, klasse, row)
        if (row.get('sum') is not None and row.get('ix') is not None
                and row['sum'] < row['ix']):
            out['sum_lt_ix'].append(
                {'scope': scope, 'klasse': klasse, 'name': row.get('name'),
                 'sum': row['sum'], 'ix': row['ix']})
    for scope, klasse, member in _iter_members(detail):
        name_checks(scope, klasse, member)

    # printed vs parsed deltakere: per øvelse, per championship
    # øvelse (the count rides its class sections), and — for leon,
    # which prints one count for the whole file — per file
    for ovelse in detail.get('ovelser') or []:
        printed = ovelse.get('deltakere')
        if printed is None:
            continue
        parsed = _counted(ovelse)
        if parsed != printed:
            out['deltakere_mismatch'].append(
                {'scope': ovelse.get('navn'), 'printed': printed,
                 'parsed': parsed})
    for key in ('km', 'dm'):
        by_navn = {}
        for section in (detail.get(key) or {}).get('sections') or []:
            if section.get('deltakere') is None:
                continue
            stat = by_navn.setdefault(
                section.get('navn'),
                {'printed': section['deltakere'], 'parsed': 0})
            stat['parsed'] += len(section.get('rows') or [])
        for navn, stat in by_navn.items():
            if stat['parsed'] != stat['printed']:
                out['deltakere_mismatch'].append(
                    {'scope': navn, 'printed': stat['printed'],
                     'parsed': stat['parsed']})
    if (detail.get('deltakere') is not None
            and (detail.get('generator') or '').startswith('leon')):
        parsed = sum(1 for _ in _iter_rows(detail))
        if parsed != detail['deltakere']:
            out['deltakere_mismatch'].append(
                {'scope': '<file>', 'printed': detail['deltakere'],
                 'parsed': parsed})

    for ovelse in detail.get('ovelser') or []:
        classes = ovelse.get('classes') or []
        if classes and not any(c.get('rows') or c.get('teams')
                               for c in classes):
            out['empty_ovelser'].append({'ovelse': ovelse.get('navn')})

    seen = {}
    for scope, klasse, row in _iter_rows(detail):
        key = (row.get('name'), row.get('club'), scope, klasse)
        seen[key] = seen.get(key, 0) + 1
    for (name, club, scope, klasse), count in seen.items():
        if count > 1:
            out['duplicate_rows'].append(
                {'scope': scope, 'klasse': klasse, 'name': name,
                 'club': club, 'count': count})
    return out


def _coverage(detail):
    """(persons, matched) — rows and lag members, by personId."""
    persons = 0
    matched = 0
    for _, _, row in _iter_rows(detail):
        persons += 1
        matched += 1 if row.get('personId') else 0
    for _, _, member in _iter_members(detail):
        persons += 1
        matched += 1 if member.get('personId') else 0
    return persons, matched


def census_corpus(data_dir='public/data', max_samples=5):
    """Census over every detail file under data_dir, joined with the
    comp year JSONs and the mestere indexes."""
    counts = {name: 0 for name in CHECKS}
    samples = {name: [] for name in CHECKS}
    champ = {'count': 0, 'by_reason': {}, 'by_generator': {},
             'samples': []}
    coverage = []
    files = 0
    detaljer = os.path.join(data_dir, 'detaljer')
    if not os.path.isdir(detaljer):
        return {'files': 0,
                'checks': {k: {'count': 0, 'samples': []}
                           for k in CHECKS},
                'champ_titled_unindexed': champ,
                'coverage_worst': []}
    for branch in sorted(os.listdir(detaljer)):
        bdir = os.path.join(detaljer, branch)
        if not os.path.isdir(bdir):
            continue
        for year in sorted(os.listdir(bdir)):
            ydir = os.path.join(bdir, year)
            if not os.path.isdir(ydir):
                continue
            year_json = os.path.join(data_dir, branch, f'{year}.json')
            comps = {}
            if os.path.exists(year_json):
                with open(year_json, encoding='utf-8') as f:
                    comps = {c.get('id'): c for c in
                             json.load(f).get('competitions') or []}
            index_json = os.path.join(
                data_dir, branch, f'mestere-{year}.json')
            indexed = set()
            if os.path.exists(index_json):
                with open(index_json, encoding='utf-8') as f:
                    indexed = {e.get('compId') for e in
                               json.load(f).get('comps') or []}
            details = {}
            for name in sorted(os.listdir(ydir)):
                if not name.endswith('.json'):
                    continue
                path = os.path.join(ydir, name)
                with open(path, encoding='utf-8') as f:
                    detail = json.load(f)
                files += 1
                details[detail.get('compId')] = detail
                rel = os.path.relpath(path, data_dir)
                for check, findings in census_detail(detail).items():
                    counts[check] += len(findings)
                    room = max_samples - len(samples[check])
                    for finding in findings[:room]:
                        samples[check].append(dict(finding, file=rel))
                persons, matched = _coverage(detail)
                if persons:
                    coverage.append(
                        {'file': rel, 'persons': persons,
                         'matched': matched,
                         'coverage': round(matched / persons, 4)})
            for comp_id, comp in comps.items():
                title = comp.get('title') or ''
                if not CHAMP_TITLE.search(title) or comp_id in indexed:
                    continue
                detail = details.get(comp_id)
                if detail is None:
                    reason = 'no-detail'
                elif detail.get('generator') == 'quarantined':
                    reason = 'quarantined'
                elif not (detail.get('km') or detail.get('dm')):
                    reason = 'no-sections'
                else:
                    reason = 'sections-unindexed'
                champ['count'] += 1
                champ['by_reason'][reason] = \
                    champ['by_reason'].get(reason, 0) + 1
                if reason == 'no-sections':
                    gen = detail.get('generator') or '?'
                    champ['by_generator'][gen] = \
                        champ['by_generator'].get(gen, 0) + 1
                if len(champ['samples']) < max_samples * 4:
                    champ['samples'].append(
                        {'compId': comp_id, 'title': title,
                         'reason': reason})
    coverage.sort(key=lambda c: (c['coverage'], -c['persons']))
    return {
        'files': files,
        'checks': {k: {'count': counts[k], 'samples': samples[k]}
                   for k in CHECKS},
        'champ_titled_unindexed': champ,
        'coverage_worst': coverage[:15],
    }


def _counts(report):
    """Check → count for either report shape: census_detail's flat
    {check: [findings]} or census_corpus's {checks: {check: {count}}}."""
    if isinstance(report.get('checks'), dict):
        return {k: v.get('count', 0)
                for k, v in report['checks'].items()
                if isinstance(v, dict)}
    return {k: len(v) for k, v in report.items() if isinstance(v, list)}


def diff_reports(baseline, current):
    """Delta between two census reports, per check and for the
    champ-titled comps missing from the mestere index."""
    out = {}
    before = _counts(baseline)
    after = _counts(current)
    for key in sorted(set(before) | set(after)):
        out[key] = {'before': before.get(key, 0),
                    'after': after.get(key, 0),
                    'delta': after.get(key, 0) - before.get(key, 0)}
    if 'champ_titled_unindexed' in before or 'champ_titled_unindexed' in current:
        b = (baseline.get('champ_titled_unindexed') or {}).get('count', 0)
        c = (current.get('champ_titled_unindexed') or {}).get('count', 0)
        reasons = {}
        b_reasons = (baseline.get('champ_titled_unindexed')
                     or {}).get('by_reason', {})
        c_reasons = (current.get('champ_titled_unindexed')
                     or {}).get('by_reason', {})
        for reason in sorted(set(b_reasons) | set(c_reasons)):
            reasons[reason] = {
                'before': b_reasons.get(reason, 0),
                'after': c_reasons.get(reason, 0),
                'delta': c_reasons.get(reason, 0) - b_reasons.get(reason, 0),
            }
        out['champ_titled_unindexed'] = {
            'before': b, 'after': c, 'delta': c - b, 'by_reason': reasons}
    return out


def _print_report(report):
    print(f"detail files: {report['files']}")
    for name in CHECKS:
        stat = report['checks'][name]
        print(f"{name}: {stat['count']}")
        for finding in stat['samples'][:3]:
            print(f"    {finding}")
    champ = report['champ_titled_unindexed']
    print(f"champ-titled comps missing from the mestere index: "
          f"{champ['count']}")
    for reason, n in sorted(champ['by_reason'].items()):
        print(f"    {reason}: {n}")
    for gen, n in sorted(champ['by_generator'].items()):
        print(f"    no-sections/{gen}: {n}")
    print('lowest personId coverage:')
    for cov in report['coverage_worst'][:10]:
        print(f"    {cov['coverage']:.0%} "
              f"{cov['matched']}/{cov['persons']} {cov['file']}")


def _print_diff(delta):
    for key, stat in delta.items():
        if isinstance(stat, dict) and 'delta' in stat and 'by_reason' \
                not in stat:
            print(f"{key}: {stat['before']} → {stat['after']} "
                  f"({stat['delta']:+d})")
        elif isinstance(stat, dict) and 'by_reason' in stat:
            print(f"{key}: {stat['before']} → {stat['after']} "
                  f"({stat['delta']:+d})")
            for reason, r in sorted(stat['by_reason'].items()):
                if r['delta']:
                    print(f"    {reason}: {r['before']} → {r['after']} "
                          f"({r['delta']:+d})")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description='Local-only detail census (never fails).')
    parser.add_argument('--data-dir', default='public/data')
    parser.add_argument('--json', action='store_true', dest='as_json',
                        help='print the report as JSON')
    parser.add_argument('--save-baseline', metavar='PATH',
                        help='write the report to a local baseline file')
    parser.add_argument('--diff', metavar='PATH',
                        help='print the drift vs a saved baseline')
    args = parser.parse_args(argv)
    report = census_corpus(args.data_dir)
    if args.diff:
        with open(args.diff, encoding='utf-8') as f:
            baseline = json.load(f)
        delta = diff_reports(baseline, report)
        if args.as_json:
            print(json.dumps(delta, ensure_ascii=False, indent=2))
        else:
            _print_diff(delta)
        return 0
    if args.save_baseline:
        with open(args.save_baseline, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f'baseline saved: {args.save_baseline}')
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_report(report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
