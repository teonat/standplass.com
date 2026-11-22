'use strict';
var assert = require('node:assert');
var MP = require('../public/js/mesterskap-page.js');
// Cross-module globals the page module references at call time (same
// pattern as every other page test in this repo).
global.StandplassMestereData = require('../public/js/mestere-data.js');
global.StandplassDataTable = require('../public/js/data-table.js');

// ── Test data: the published mestere-{year}.json shape ─────────────────

function sec(ovelse, klasse, podium) {
    return { ovelse: ovelse, klasse: klasse, podium: podium };
}

function comp(id, opts) {
    var c = { compId: id, date: '2025-06-11', title: 'Teststevne ' + id, organizer: 'Arrangør ' + id };
    Object.keys(opts || {}).forEach(function (k) { c[k] = opts[k]; });
    return c;
}

var pageIndex = {
    year: 2025,
    comps: [
        comp('c1', {
            region: 'Buskerud', distrikt: 'Østlandet Sør',
            km: [sec('Felt Fin', 'U', [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere', sum: 88 },
                { medal: 'Sølv', name: 'Berit', club: 'Brumunddal Pistolklubb' },
                { medal: 'Bronse', name: 'Carl' }
            ])]
        }),
        comp('c3', {
            region: 'Buskerud',
            kmLag: [sec('Felt Fin', 'M', [
                { medal: 'Sølv', team: 'Hurum SKL' }
            ])]
        }),
        comp('c4', {
            // region-less: no region/distrikt keys at all
            km: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere', sum: 92 }
            ])]
        }),
        comp('c7', {
            nm: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere', sum: 150 }
            ])]
        })
    ]
};

// ── resolveInitial: URL param defaults ─────────────────────────────────

assert.deepStrictEqual(MP.resolveInitial('', 2026), { gren: 'felt', ar: 2026 },
    'defaults: felt + current year');
assert.deepStrictEqual(MP.resolveInitial('?gren=bane', 2026), { gren: 'bane', ar: 2026 });
assert.deepStrictEqual(MP.resolveInitial('?gren=bane&ar=2024', 2026),
    { gren: 'bane', ar: 2024 });
assert.deepStrictEqual(MP.resolveInitial('?gren=xyz&ar=abc', 2026),
    { gren: 'felt', ar: 2026 }, 'invalid values fall back to the defaults');
assert.deepStrictEqual(MP.resolveInitial('?ar=2019', 2026), { gren: 'felt', ar: 2026 },
    'years before 2021 fall back to the current year');
assert.deepStrictEqual(MP.resolveInitial('?ar=2030', 2026), { gren: 'felt', ar: 2026 },
    'future years clamp to the current year');

assert.strictEqual(MP.grenDisplayName('felt'), 'feltskyting');
assert.strictEqual(MP.grenDisplayName('bane'), 'baneskyting');

// ── tableSpecFor ──────────────────────────────────────────────────────

var spec = MP.tableSpecFor(sec('Felt Fin', 'U', [
    { medal: 'Gull', personId: 'p1', name: 'Anne <Test>', club: 'Kongsvinger Sportsskyttere', sum: 88 },
    { medal: 'Sølv', name: 'Berit', club: 'Brumunddal Pistolklubb' },
    { medal: 'Bronse', name: 'Carl' }
]));
assert.deepStrictEqual(spec.columns.map(function (c) { return c.key; }),
    ['medal', 'name', 'club', 'sum']);
assert.strictEqual(spec.columns[0].label, 'Medalje');
assert.strictEqual(spec.columns[1].raw, true,
    'the name column is a raw pre-escaped cell (house person-link pattern)');
var link = spec.columns[1].cell(spec.rows[0]);
assert.ok(link.indexOf('stevner-person-btn') !== -1,
    'person rows become person-modal buttons');
assert.ok(link.indexOf('data-person-id="p1"') !== -1);
assert.ok(link.indexOf('Anne &lt;Test&gt;') !== -1, 'the name is escaped inside the button');
assert.strictEqual(spec.columns[1].cell(spec.rows[1]), 'Berit',
    'rows without a personId render as plain escaped text');
assert.strictEqual(spec.columns[3].cell(spec.rows[0]), '88');
assert.strictEqual(spec.columns[3].cell(spec.rows[1]), '–', 'missing sum renders –');
assert.strictEqual(spec.rows.length, 3, 'the podium rows are the table rows');

// No sum anywhere → no Sum column
var noSumSpec = MP.tableSpecFor(sec('X', null, [{ medal: 'Gull', name: 'A' }]));
assert.deepStrictEqual(noSumSpec.columns.map(function (c) { return c.key; }),
    ['medal', 'name', 'club']);

// Team sections: medal + team columns, no person links
var teamSpec = MP.tableSpecFor(sec('Felt Fin', 'M', [{ medal: 'Gull', team: 'Hurum SKL' }]));
assert.deepStrictEqual(teamSpec.columns.map(function (c) { return c.key; }),
    ['medal', 'team']);
assert.strictEqual(teamSpec.columns[1].label, 'Lag');

// ── renderYear ─────────────────────────────────────────────────────────

var html = MP.renderYear('km', pageIndex);
assert.ok(html.indexOf('Buskerud') !== -1, 'region heading rendered');
assert.ok(html.indexOf('Ukjent region') !== -1,
    'region-less comps get their own final bucket');
assert.ok(html.indexOf('Teststevne c1') !== -1, 'comp title rendered');
assert.ok(html.indexOf('Felt Fin') !== -1, 'øvelse name rendered');
assert.ok(html.indexOf('Hurum SKL') !== -1,
    'lag sections render alongside the individual ones');
assert.ok(/data-dt-id="mest-km-/.test(html),
    'tables render through the data-table base with scoped ids');
var nmHtml = MP.renderYear('nm', pageIndex);
assert.ok(nmHtml.indexOf('Ukjent region') === -1, 'the nm page has no region grouping');
assert.ok(nmHtml.indexOf('Teststevne c7') !== -1);
assert.strictEqual(MP.renderYear('km', { comps: [] }), '',
    'no matching comps → no markup (the page shows its empty card)');

// ── emptyYearCard: the fetch-rejection / no-data card ──────────────────

var failed = MP.emptyYearCard('felt', 2024, true);
assert.ok(failed.indexOf('2024') !== -1);
assert.ok(failed.indexOf('feltskyting') !== -1);
assert.ok(failed.indexOf('ranking-card') !== -1, 'rendered as a card, not a bare string');
var empty = MP.emptyYearCard('bane', 2025, false);
assert.ok(empty.indexOf('baneskyting') !== -1);
assert.ok(empty.indexOf('2025') !== -1);

console.log('mesterskap-page.test.js: all assertions passed');
