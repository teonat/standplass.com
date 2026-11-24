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
        comp('c8', {
            region: 'Hedmark', distrikt: 'Østlandet Nord',
            dm: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p9', name: 'Dag', club: 'Brumunddal Pistolklubb', sum: 90 }
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

assert.deepStrictEqual(MP.resolveInitial('', 2026), { gren: 'alle', ar: 2026 },
    'defaults: alle + current year (the unified page opens fully merged)');
assert.deepStrictEqual(MP.resolveInitial('?gren=bane', 2026), { gren: 'bane', ar: 2026 });
assert.deepStrictEqual(MP.resolveInitial('?gren=bane&ar=2024', 2026),
    { gren: 'bane', ar: 2024 });
assert.strictEqual(MP.resolveInitial('?gren=felt', 2026).gren, 'felt');
assert.strictEqual(MP.resolveInitial('?gren=alle', 2026).gren, 'alle');
assert.deepStrictEqual(MP.resolveInitial('?gren=xyz&ar=abc', 2026),
    { gren: 'alle', ar: 2026 }, 'invalid values fall back to the defaults');
assert.deepStrictEqual(MP.resolveInitial('?ar=2019', 2026), { gren: 'alle', ar: 2026 },
    'years before 2021 fall back to the current year');
assert.deepStrictEqual(MP.resolveInitial('?ar=2030', 2026), { gren: 'alle', ar: 2026 },
    'future years clamp to the current year');

assert.strictEqual(MP.grenDisplayName('felt'), 'feltskyting');
assert.strictEqual(MP.grenDisplayName('bane'), 'baneskyting');
assert.strictEqual(MP.grenDisplayName('alle'), 'feltskyting og baneskyting');

// ── resolveFilters / filterParams: the URL filter codec ────────────────

var EMPTY_FILTERS = { mesterskap: [], ovelse: [], klasse: [], medal: [], krets: [], distrikt: [], klubb: '', navn: '', type: '' };
assert.deepStrictEqual(MP.resolveFilters(''), EMPTY_FILTERS);
assert.deepStrictEqual(MP.resolveFilters('?ovelse=Felt%20Fin,Felt%20Grov'), {
    mesterskap: [], ovelse: ['Felt Fin', 'Felt Grov'], klasse: [], medal: [], krets: [], distrikt: [],
    klubb: '', navn: '', type: ''
}, 'øvelse is a comma-joined, per-element-encoded list');
assert.deepStrictEqual(MP.resolveFilters('?medal=Gull,S%C3%B8lv'), {
    mesterskap: [], ovelse: [], klasse: [], medal: ['Gull', 'Sølv'], krets: [], distrikt: [],
    klubb: '', navn: '', type: ''
}, 'medal is a comma-joined list (æ/ø round-trips)');
assert.strictEqual(MP.resolveFilters('?type=lag').type, 'lag');
assert.strictEqual(MP.resolveFilters('?type=ugyldig').type, '',
    'invalid type falls back to alle');
assert.deepStrictEqual(MP.resolveFilters('?mesterskap=km,nm').mesterskap,
    ['km', 'nm'], 'mesterskap is a comma-joined list');
assert.deepStrictEqual(MP.resolveFilters('?mesterskap=xx').mesterskap, [],
    'invalid mesterskap values are dropped');
assert.deepStrictEqual(MP.resolveFilters('?mesterskap=dm,xx,km').mesterskap,
    ['dm', 'km'], 'valid values survive an invalid neighbor');

var full = {
    mesterskap: ['km', 'nm'],
    ovelse: ['Felt Fin', 'Felt Militær Rødpunkt'], klasse: ['U'],
    medal: ['Gull'], krets: ['Buskerud'], distrikt: ['Nord-Norge'],
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
assert.deepStrictEqual(MP.filterParams({ mesterskap: ['km', 'nm'] }),
    [['mesterskap', 'km,nm']],
    'mesterskap writes a comma-joined list param');

// ── filterBarMarkup: the unified filter row ─────────────────────────────

var bar = MP.filterBarMarkup();
['mesterskap-mesterskap-btn', 'mesterskap-mesterskap-panel', 'mesterskap-mesterskap-list',
 'mesterskap-ovelse-btn', 'mesterskap-ovelse-panel', 'mesterskap-ovelse-list',
 'mesterskap-klasse-btn', 'mesterskap-klasse-list',
 'mesterskap-medal-btn', 'mesterskap-medal-list',
 'mesterskap-krets-btn', 'mesterskap-krets-list',
 'mesterskap-distrikt-btn', 'mesterskap-distrikt-list',
 'mesterskap-klubb-input', 'mesterskap-klubb-tags', 'mesterskap-klubb-clear',
 'mesterskap-navn', 'mesterskap-type', 'mesterskap-rows',
 'mesterskap-clear-filters'
].forEach(function (id) { assert.ok(bar.indexOf('id="' + id + '"') !== -1, 'bar has ' + id); });
assert.ok(bar.indexOf('Mesterskapstype') > -1, 'the mesterskapstype group is labeled');
assert.ok(bar.indexOf('mesterskap-mesterskap-btn') < bar.indexOf('mesterskap-ovelse-btn'),
    'mesterskapstype leads the bar');
assert.ok(bar.indexOf('checkbox-dropdown') !== -1, 'øvelse/klasse/mesterskap/krets/distrikt use checkbox dropdowns');
assert.ok(bar.indexOf('autocomplete-list') !== -1, 'klubb uses the tag-combo pattern');
assert.ok(/id="mesterskap-type"[^>]*>[\s\S]*?<option value="">Alle<\/option>[\s\S]*?<option value="individuelt">Individuelt<\/option>[\s\S]*?<option value="lag">Lag<\/option>/.test(bar),
    'the Type select offers Alle/Individuelt/Lag');
assert.ok(/id="mesterskap-rows"[\s\S]*?<option value="30" selected>30<\/option>/.test(bar),
    'the Rader select defaults to 30');

// ── tableSpecFor: the dense podium table ────────────────────────────────

var rows = global.StandplassMestereData.podiumRows(pageIndex, 'km');
assert.strictEqual(rows.length, 5);

var spec = MP.tableSpecFor(rows);
function col(key) {
    return spec.columns.filter(function (c) { return c.key === key; })[0];
}
assert.deepStrictEqual(spec.columns.map(function (c) { return c.key; }),
    ['name', 'ovelseRank', 'klasse', 'medalRank', 'club', 'sum', 'region', 'title', 'date', 'organizer'],
    'Navn leads — the person is the row\u2019s identity (owner ruling)');
assert.strictEqual(col('ovelseRank').label, 'Øvelse');
assert.strictEqual(col('ovelseRank').cell(rows[0]), rows[0].ovelse,
    'Øvelse displays the name, sorts by ovelseRank');
assert.strictEqual(col('medalRank').label, 'Medalje');
assert.ok(col('medalRank').cell(rows[0]).indexOf(rows[0].medal) !== -1,
    'Medalje displays the name (as a medal chip, ruling 13), sorts by medalRank');
assert.strictEqual(col('region').label, 'Krets', 'km carries the krets context column');
assert.strictEqual(col('region').defaultHidden, true,
    'the region column hides behind the group row');
assert.ok(spec.columns.every(function (c) { return c.key !== 'distrikt'; }),
    'km has no distrikt column');

// Ruling 15 (2026-11-24): the Arrangement column (the stevne name)
// carries the resultfile link — the parsed result file, the
// "Resultatfil beta" modal from the felt/bane pages.
assert.strictEqual(col('title').label, 'Arrangement');
assert.ok(!col('title').defaultHidden, 'Arrangement is visible — it carries the resultfile link');
var rfLink = col('title').cell({ title: 'Aron SK Feltpistol', compId: 'c9', gren: 'felt' });
assert.ok(rfLink.indexOf('stevner-resultfile-btn') !== -1
    && rfLink.indexOf('data-comp-id="c9"') !== -1
    && rfLink.indexOf('data-gren="felt"') !== -1
    && rfLink.indexOf('data-title="Aron SK Feltpistol"') !== -1
    && rfLink.indexOf('nav-beta-tag') !== -1,
    'the arrangement cell links the parsed result file, beta-tagged');
assert.strictEqual(col('title').cell({ title: 'Bare stevne' }), 'Bare stevne',
    'no compId renders plain text, no button');
assert.strictEqual(col('title').cell({ compId: 'c9', gren: 'felt' }), '–',
    'no title renders a dash');
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

var nmSpec = MP.tableSpecFor(global.StandplassMestereData.podiumRows(pageIndex, 'nm'));
assert.strictEqual(nmSpec.groupRows, null, 'nm is flat');
assert.ok(nmSpec.columns.every(function (c) { return c.key !== 'region'; }),
    'nm carries no region column');
var dmSpec = MP.tableSpecFor(global.StandplassMestereData.podiumRows(pageIndex, 'dm'));
var dmKeys = dmSpec.columns.map(function (c) { return c.key; });
assert.ok(dmKeys.indexOf('distrikt') !== -1 && dmKeys.indexOf('region') === -1,
    'dm carries the distrikt column, not krets (and no sum column when no row has one)');

var noSum = MP.tableSpecFor([{ medal: 'Gull', name: 'A', isTeam: false }]);
assert.ok(noSum.columns.every(function (c) { return c.key !== 'sum'; }),
    'no Sum column when no row has one');

// ── tableSpecFor: the mixed view (spec ruling 6 — type as a column) ───
// Mixed-type rows go flat with a Mesterskap column (chip, sorted by
// typeRank: NM→DM→KM) and a unified Region column (the row's own
// championship region, '–' for nm rows); single-type views keep today's
// per-type shape above (blocks included — regression guard).

var mixedRows = global.StandplassMestereData.podiumRows(pageIndex);
assert.ok(mixedRows.length >= 7, 'km + dm + nm rows together');
var mixedSpec = MP.tableSpecFor(mixedRows);
assert.strictEqual(mixedSpec.groupRows, null, 'mixed views are flat');
var mixedKeys = mixedSpec.columns.map(function (c) { return c.key; });
assert.ok(mixedKeys.indexOf('region') === -1 && mixedKeys.indexOf('distrikt') === -1,
    'no per-type region columns in the mixed view');
function mcol2(key) {
    return mixedSpec.columns.filter(function (c) { return c.key === key; })[0];
}
var typeCol = mcol2('typeRank');
assert.ok(typeCol, 'the Mesterskap (type) column exists');
assert.strictEqual(typeCol.label, 'Mesterskap');
assert.strictEqual(typeCol.secondaryKey, 'ovelseRank',
    'within a type, øvelse program order tie-breaks');
assert.ok(typeCol.cell({ type: 'km' }).indexOf('KM') !== -1
    && typeCol.cell({ type: 'nm' }).indexOf('NM') !== -1,
    'the type cell renders the NM/DM/KM chip');
assert.ok(typeCol.cell({ type: 'dm' }).indexOf('mesterskap-type-chip') !== -1,
    'chips carry the shared styling hook');
var regionCol = mcol2('champRegion');
assert.ok(regionCol, 'the unified Region column exists');
assert.strictEqual(regionCol.label, 'Region');
assert.strictEqual(regionCol.cell({ champRegion: null }), '–',
    'nm rows and region-less comps show –');
assert.ok(!regionCol.defaultHidden, 'Region is visible by default in mixed views');
assert.strictEqual(mixedKeys.indexOf('typeRank') < mixedKeys.indexOf('champRegion'), true,
    'Mesterskap leads Region');

// ── mergeMestereIndexes / regionDropdownsFor / initialSortFor ─────────

assert.deepStrictEqual(MP.mergeMestereIndexes([null, { comps: [{ compId: 'a' }] }]).comps,
    [{ compId: 'a' }], 'a failed branch fetch (null) vanishes; the other renders');
assert.strictEqual(MP.mergeMestereIndexes([null, null]).comps.length, 0);

// stampGren: the load path annotates each fetched index's comps with
// its branch, so rows can address the right detaljer directory for
// the resultfile link (ruling 15).
assert.deepStrictEqual(MP.stampGren({ comps: [{ compId: 'a' }] }, 'bane').comps,
    [{ compId: 'a', gren: 'bane' }], 'comps get their branch stamped');
assert.strictEqual(MP.stampGren(null, 'felt'), null, 'a failed fetch passes through');
assert.strictEqual(MP.mergeMestereIndexes().comps.length, 0);

assert.deepStrictEqual(MP.regionDropdownsFor(global.StandplassMestereData.podiumRows(pageIndex, 'nm')),
    { krets: false, distrikt: false }, 'nm rows carry neither region field');
assert.deepStrictEqual(MP.regionDropdownsFor(mixedRows),
    { krets: true, distrikt: true }, 'km/dm rows carry both fields');

assert.deepStrictEqual(MP.initialSortFor(mixedRows), { key: 'typeRank', dir: 'asc' },
    'mixed views seed the type-first sort (NM → DM → KM)');
assert.strictEqual(MP.initialSortFor(rows), null,
    'single-type views open unsorted (page order)');

// Ruling 13: the Medalje column renders medal chips, golden/silver/
// bronze like the other tables' badges.
var gullCell = mcol2('medalRank').cell({ medal: 'Gull' });
assert.ok(gullCell.indexOf('medal--gold') !== -1 && gullCell.indexOf('Gull') !== -1,
    'Gull renders as a golden chip');
assert.ok(mcol2('medalRank').cell({ medal: 'Sølv' }).indexOf('medal--silver') !== -1,
    'Sølv renders as a silver chip');
assert.ok(mcol2('medalRank').cell({ medal: 'Bronse' }).indexOf('medal--bronze') !== -1,
    'Bronse renders as a bronze chip');
assert.strictEqual(mcol2('medalRank').cell({ medal: 'Ukjent' }), 'Ukjent',
    'unknown medal names stay plain text');

// Ruling 14: the Arrangør column links each row to the comp modal
// (the full result list) — visible by default now that it carries
// the affordance.
var orgColR14 = mcol2('organizer');
assert.ok(!orgColR14.defaultHidden, 'Arrangør is visible — it carries the comp link');
var orgLinkCell = orgColR14.cell({ organizer: 'Brumunddal PK', compId: 'c8', title: 'Teststevne c8' });
assert.ok(orgLinkCell.indexOf('stevner-comp-btn') !== -1
    && orgLinkCell.indexOf('data-comp-id="c8"') !== -1
    && orgLinkCell.indexOf('data-comp-title="Teststevne c8"') !== -1
    && orgLinkCell.indexOf('Brumunddal PK') !== -1,
    'the organizer cell links the comp modal, titled by the comp');
assert.strictEqual(orgColR14.cell({ organizer: null, compId: null }), '–',
    'no organizer and no comp stay a plain dash');

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
var emptyAlle = MP.emptyYearCard('alle', 2026, false);
assert.ok(emptyAlle.indexOf('feltskyting og baneskyting') !== -1,
    'alle names both branches');

// ── tableSpecFor cells: lag member rows (sub-line under Navn) ────────
// Owner ruling 2026-11-23: the lag name goes under the person's name as
// a muted sub-line — no dedicated Lag column.

var memberRows = global.StandplassMestereData.podiumRows({ year: 2025, comps: [comp('mx', {
    kmLag: [sec('Felt Fin', 'Å', [
        { medal: 'Gull', team: 'GPK 1', sum: 318, members: [
            { name: 'Tore Vrålstad', klasse: 'M', personId: 'p1', club: 'Greipstad Pistolklubb', sum: 107 },
            { name: 'Ukjent Skytter', klasse: 'K', sum: 106 }
        ] }
    ])]
})] }, 'km');
assert.strictEqual(memberRows.length, 2);
var mSpec = MP.tableSpecFor(memberRows);
function mcol(key) {
    return mSpec.columns.filter(function (c) { return c.key === key; })[0];
}
var toreRow = memberRows.filter(function (r) { return r.personId === 'p1'; })[0];
var ukjentRow = memberRows.filter(function (r) { return r.name === 'Ukjent Skytter'; })[0];
var toreCell = mcol('name').cell(toreRow);
assert.ok(toreCell.indexOf('stevner-person-btn') !== -1
    && toreCell.indexOf('data-person-id="p1"') !== -1,
    'matched members link like person rows');
assert.ok(toreCell.indexOf('Lag: GPK 1') !== -1,
    'the lag name rides as a sub-line under Navn');
var ukjentCell = mcol('name').cell(ukjentRow);
assert.ok(ukjentCell.indexOf('stevner-person-btn') === -1,
    'unmatched members stay plain text');
assert.ok(ukjentCell.indexOf('Lag: GPK 1') !== -1);
assert.ok(ukjentCell.indexOf('mesterskap-lag-tag') === -1,
    'member rows are persons, not the fallback team row');
assert.strictEqual(mcol('klasse').cell(toreRow), 'Lag Å');
assert.strictEqual(mcol('klasse').cell(ukjentRow), 'Lag Å',
    'the lag\u2019s own section class — not the member\u2019s');
assert.strictEqual(mcol('sum').cell(toreRow), '107<span class="mesterskap-lag-sub">318</span>',
    'the lag score rides under the member\u2019s own sum (owner ruling — mirrors the Navn sub-line)');
assert.strictEqual(mcol('sum').cell(ukjentRow), '106<span class="mesterskap-lag-sub">318</span>');
assert.strictEqual(mcol('club').cell({ isTeam: true, lag: 'GPK 1', club: null, name: 'X' }), '–',
    'member rows without a resolved club show a dash, never a lag-name-derived club (owner ruling)');
assert.strictEqual(mcol('club').cell({ isTeam: true, lag: null, club: null, name: 'GPK 1' }), 'GPK',
    'memberless team rows keep the derived club display');

// ── toItemIds: select-all stores ids, never label objects ───────────────
// The mesterskapstype dropdown's items carry {id, name} objects (the
// NM/DM/KM labels); every other dropdown's raw items are the ids
// themselves. "Merk alle" must store ids either way — review finding:
// objects in the filter state matched zero rows and serialized as
// [object Object] into the URL.
assert.deepStrictEqual(MP.toItemIds(['nm', 'dm']), ['nm', 'dm'],
    'string items are ids already');
assert.deepStrictEqual(MP.toItemIds([{ id: 'nm', name: 'NM' }, { id: 'dm', name: 'DM' }]),
    ['nm', 'dm'], 'object items reduce to their ids');
assert.deepStrictEqual(MP.toItemIds([]), []);

// ── Ruling 12: region-filter availability is per view ────────────────
// An nm-only view carries neither region field, so both region
// filters grey out and go inert; adding DM/KM back to the type filter
// reactivates them. The basis excludes the region filters' own
// selections — a krets pick must not deactivate its own dropdown.
var availRows = [
    { type: 'km', ovelse: 'Felt Fin', klasse: 'A', medal: 'Gull', region: 'Hedmark', isTeam: false },
    { type: 'dm', ovelse: 'Felt Fin', klasse: 'A', medal: 'Gull', distrikt: 'Øst', isTeam: false },
    { type: 'nm', ovelse: 'Felt Fin', klasse: 'A', medal: 'Gull', isTeam: false }
];
assert.deepStrictEqual(MP.regionFilterAvailability(availRows, {}),
    { krets: true, distrikt: true }, 'the unfiltered view carries both region fields');
assert.deepStrictEqual(MP.regionFilterAvailability(availRows, { mesterskap: ['nm'] }),
    { krets: false, distrikt: false }, 'an nm-only view greys out both region filters');
assert.deepStrictEqual(MP.regionFilterAvailability(availRows, { mesterskap: ['nm', 'dm'] }),
    { krets: false, distrikt: true }, 'adding DM back reactivates distrikt');
assert.deepStrictEqual(MP.regionFilterAvailability(availRows, { mesterskap: ['km'] }),
    { krets: true, distrikt: false }, 'a km-only view keeps krets, drops distrikt');
assert.deepStrictEqual(MP.regionFilterAvailability(availRows, { krets: ['Hedmark'], distrikt: ['Øst'] }),
    { krets: true, distrikt: true },
    "the region filters' own selections are excluded from the basis");

// ── the region-filter looks need their CSS ─────────────────────────────
// setRegionFilterActive greys a group out via the filter-group--
// inactive class — the rule must exist or the grey-out is a visual
// no-op. The [hidden] companion stays: the person modal's
// initially-hidden filter groups rely on it against .filter-group's
// display:flex.
var fs = require('node:fs');
var styles = fs.readFileSync(__dirname + '/../public/styles.css', 'utf8');
assert.ok(styles.indexOf('.filter-group--inactive') !== -1,
    'styles.css carries the .filter-group--inactive greying rule');
assert.ok(styles.indexOf('.filter-group[hidden]') !== -1,
    'styles.css carries the .filter-group[hidden] display:none companion rule');

// The resultfile modal (ruling 15) must be loaded by the page — the
// Arrangement links die without it.
var page = fs.readFileSync(__dirname + '/../public/mesterskap/index.html', 'utf8');
assert.ok(page.indexOf('/js/resultfile-modal.js') !== -1,
    'the mesterskap page loads the resultfile modal script');

console.log('mesterskap-page.test.js: all assertions passed');
