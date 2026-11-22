'use strict';
var assert = require('node:assert');
var MP = require('../public/js/mesterskap-page.js');
// Cross-module globals the page module references at call time (same
// pattern as every other page test in this repo).
global.StandplassMestereData = require('../public/js/mestere-data.js');
global.StandplassDataTable = require('../public/js/data-table.js');
global.StandplassFormat = require('../public/js/format.js');

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
                { medal: 'Sølv', team: 'GPK 1', sum: 305 }
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

// ── resolveFilters / filterParams: the URL filter codec ────────────────

var EMPTY_FILTERS = { ovelse: [], klasse: [], krets: [], distrikt: [], klubb: '', navn: '', type: '' };
assert.deepStrictEqual(MP.resolveFilters(''), EMPTY_FILTERS);
assert.deepStrictEqual(MP.resolveFilters('?ovelse=Felt%20Fin,Felt%20Grov'), {
    ovelse: ['Felt Fin', 'Felt Grov'], klasse: [], krets: [], distrikt: [],
    klubb: '', navn: '', type: ''
}, 'øvelse is a comma-joined, per-element-encoded list');
assert.strictEqual(MP.resolveFilters('?type=lag').type, 'lag');
assert.strictEqual(MP.resolveFilters('?type=ugyldig').type, '',
    'invalid type falls back to alle');

var full = {
    ovelse: ['Felt Fin', 'Felt Militær Rødpunkt'], klasse: ['U'],
    krets: ['Buskerud'], distrikt: ['Nord-Norge'],
    klubb: 'Bodø PK', navn: 'anne', type: 'individuelt'
};
var sp = new URLSearchParams();
MP.filterParams(full).forEach(function (p) { sp.set(p[0], p[1]); });
assert.deepStrictEqual(MP.resolveFilters('?' + sp.toString()), full,
    'resolveFilters inverts filterParams (names with spaces and æ/ø round-trip)');
assert.deepStrictEqual(MP.filterParams(EMPTY_FILTERS), [],
    'empty filters produce no params');
assert.deepStrictEqual(MP.filterParams({ ovelse: ['Felt Fin'], klasse: [], krets: [], distrikt: ['Vest-Norge'], klubb: '', navn: '', type: 'lag' }),
    [['ovelse', 'Felt%20Fin'], ['distrikt', 'Vest-Norge'], ['type', 'lag']],
    'only non-empty values are written; klasse writes the class param');

// ── filterBarMarkup: the scope-aware filter row ─────────────────────────

var kmBar = MP.filterBarMarkup('km');
['mesterskap-ovelse-btn', 'mesterskap-ovelse-panel', 'mesterskap-ovelse-list',
 'mesterskap-klasse-btn', 'mesterskap-klasse-list',
 'mesterskap-krets-btn', 'mesterskap-krets-list',
 'mesterskap-distrikt-btn', 'mesterskap-distrikt-list',
 'mesterskap-klubb-input', 'mesterskap-klubb-tags', 'mesterskap-klubb-clear',
 'mesterskap-navn', 'mesterskap-type', 'mesterskap-rows',
 'mesterskap-clear-filters'
].forEach(function (id) { assert.ok(kmBar.indexOf('id="' + id + '"') !== -1, 'km bar has ' + id); });
assert.ok(kmBar.indexOf('checkbox-dropdown') !== -1, 'øvelse/klasse/krets/distrikt use checkbox dropdowns');
assert.ok(kmBar.indexOf('autocomplete-list') !== -1, 'klubb uses the tag-combo pattern');
var nmBar = MP.filterBarMarkup('nm');
assert.ok(nmBar.indexOf('mesterskap-krets') === -1,
    'nm has no krets filter');
assert.ok(nmBar.indexOf('mesterskap-distrikt') === -1,
    'nm has no distrikt filter (national)');
var dmBar = MP.filterBarMarkup('dm');
assert.ok(dmBar.indexOf('mesterskap-distrikt-btn') !== -1,
    'dm has the direct distrikt filter');
assert.ok(dmBar.indexOf('mesterskap-krets') === -1,
    'dm has no krets filter — the finder showed the whole distrikt under a krets label (owner ruling 2026-11-22)');
assert.ok(/id="mesterskap-type"[^>]*>[\s\S]*?<option value="">Alle<\/option>[\s\S]*?<option value="individuelt">Individuelt<\/option>[\s\S]*?<option value="lag">Lag<\/option>/.test(kmBar),
    'the Type select offers Alle/Individuelt/Lag');
assert.ok(/id="mesterskap-rows"[\s\S]*?<option value="30" selected>30<\/option>/.test(kmBar),
    'the Rader select defaults to 30');

// ── tableSpecFor: the dense podium table ────────────────────────────────

var rows = global.StandplassMestereData.podiumRows(pageIndex, 'km');
assert.strictEqual(rows.length, 5);

var spec = MP.tableSpecFor(rows, 'km');
function col(key) {
    return spec.columns.filter(function (c) { return c.key === key; })[0];
}
assert.deepStrictEqual(spec.columns.map(function (c) { return c.key; }),
    ['name', 'ovelseRank', 'klasse', 'medalRank', 'club', 'sum', 'region', 'date', 'organizer'],
    'Navn leads — the person is the row\u2019s identity (owner ruling)');
assert.strictEqual(col('ovelseRank').label, 'Øvelse');
assert.strictEqual(col('ovelseRank').cell(rows[0]), rows[0].ovelse,
    'Øvelse displays the name, sorts by ovelseRank');
assert.strictEqual(col('medalRank').label, 'Medalje');
assert.strictEqual(col('medalRank').cell(rows[0]), rows[0].medal,
    'Medalje displays the name, sorts by medalRank');
assert.strictEqual(col('region').label, 'Krets', 'km carries the krets context column');
assert.strictEqual(col('region').defaultHidden, true,
    'the region column hides behind the group row');
assert.ok(spec.columns.every(function (c) { return c.key !== 'distrikt'; }),
    'km has no distrikt column');
var link = col('name').cell(rows.filter(function (r) { return r.personId === 'p1'; })[0]);
assert.ok(link.indexOf('stevner-person-btn') !== -1 && link.indexOf('data-person-id="p1"') !== -1,
    'person rows link (rows[0] itself is the lag row — klasse M sorts before U)');
var teamRow = rows.filter(function (r) { return r.isTeam; })[0];
var teamCell = col('name').cell(teamRow);
assert.ok(teamCell.indexOf('GPK 1') !== -1,
    'team rows render the team name, no link');
assert.ok(teamCell.indexOf('mesterskap-lag-tag') !== -1,
    'team rows are visibly marked as lag');
assert.strictEqual(col('sum').cell(teamRow), '305',
    'team rows show their lag sum');
assert.strictEqual(col('club').cell(teamRow), 'GPK',
    'team rows without a resolved club show the club from the lag name (team number stripped)');
assert.strictEqual(col('club').cell({ isTeam: false, club: null, name: 'X' }), '–',
    'person rows without a club show –');
assert.strictEqual(col('sum').cell({ sum: null }), '–', 'missing sum renders –');
var escRow = { medal: 'Gull', name: 'A <B>', klasse: 'U', medalRank: 1, ovelseRank: 1, ovelse: 'X', isTeam: false };
assert.ok(col('name').cell(escRow).indexOf('A &lt;B&gt;') !== -1,
    'non-person names escape');
assert.ok(spec.wrapClass.indexOf('club-stats-list-scroll') !== -1,
    'the table sits in a contained scroll region');
assert.ok(spec.picker, 'the Kolonner picker is on');

var groups = spec.groupRows(rows);
assert.strictEqual(groups.length, 2);
assert.strictEqual(groups[0].label, 'Buskerud');
assert.strictEqual(groups[0].rows.length, 4);
assert.strictEqual(groups[1].label, 'Ukjent region', 'null region sinks to a final group');
assert.strictEqual(groups[1].rows.length, 1);

var nmSpec = MP.tableSpecFor(global.StandplassMestereData.podiumRows(pageIndex, 'nm'), 'nm');
assert.strictEqual(nmSpec.groupRows, null, 'nm is flat');
assert.ok(nmSpec.columns.every(function (c) { return c.key !== 'region'; }),
    'nm carries no region column');
var dmSpec = MP.tableSpecFor(global.StandplassMestereData.podiumRows(pageIndex, 'dm'), 'dm');
var dmKeys = dmSpec.columns.map(function (c) { return c.key; });
assert.ok(dmKeys.indexOf('distrikt') !== -1 && dmKeys.indexOf('region') === -1,
    'dm carries the distrikt column, not krets (and no sum column when no row has one)');

var noSum = MP.tableSpecFor([{ medal: 'Gull', name: 'A', isTeam: false }], 'nm');
assert.ok(noSum.columns.every(function (c) { return c.key !== 'sum'; }),
    'no Sum column when no row has one');

// bareSpec: the surgical re-render shape — no wrapClass (re-wrapping
// nests scroll regions), no picker (the surviving toolbar button keeps
// its wiring), everything else shared by reference.
var bare = MP.bareSpec(spec);
assert.deepStrictEqual(Object.keys(bare).sort(),
    ['ariaLabel', 'columns', 'groupRows', 'rows']);
assert.strictEqual(bare.columns, spec.columns);
assert.strictEqual(bare.rows, spec.rows);
assert.strictEqual(bare.groupRows, spec.groupRows);

// ── emptyYearCard: the fetch-rejection / no-data card ──────────────────

var failed = MP.emptyYearCard('felt', 2024, true);
assert.ok(failed.indexOf('2024') !== -1);
assert.ok(failed.indexOf('feltskyting') !== -1);
assert.ok(failed.indexOf('ranking-card') !== -1, 'rendered as a card, not a bare string');
var empty = MP.emptyYearCard('bane', 2025, false);
assert.ok(empty.indexOf('baneskyting') !== -1);
assert.ok(empty.indexOf('2025') !== -1);

console.log('mesterskap-page.test.js: all assertions passed');
