'use strict';
var assert = require('node:assert');
// person-modal.js resolves the shared band module as a browser global
// at call time (the site-chrome.test.js pattern for cross-module refs).
global.StandplassRankingBand = require('../public/js/ranking-band.js');
var StandplassPersonModal = require('../public/js/person-modal.js');

assert.strictEqual(StandplassPersonModal.parsePersonFromUrl('?klubb=eksempel'), null);
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFromUrl('?person=42&year=2026'),
    { personId: '42', year: 2026 }
);
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFromUrl('?person=42'),
    { personId: '42', year: null }
);

var built = StandplassPersonModal.buildPersonUrl('?klubb=eksempel', '42', 2026);
assert.strictEqual(built, '?klubb=eksempel&person=42&year=2026');

var cleared = StandplassPersonModal.clearPersonFromUrl('?klubb=eksempel&person=42&year=2026');
assert.strictEqual(cleared, '?klubb=eksempel');

// clearPersonFromUrl also strips the in-modal filter params, not just person/year
assert.strictEqual(
    StandplassPersonModal.clearPersonFromUrl('?klubb=eksempel&person=42&year=2026&p_year=2024,2025&p_disc=Felt'),
    '?klubb=eksempel'
);
// ...including the meritter tab + branch params
assert.strictEqual(
    StandplassPersonModal.clearPersonFromUrl('?klubb=eksempel&person=42&year=2026&p_tab=meritter&p_branch=felt'),
    '?klubb=eksempel'
);
// ...and the activated entry param
assert.strictEqual(
    StandplassPersonModal.clearPersonFromUrl('?klubb=eksempel&person=42&year=2026&p_entry=2026-06-06~c1~Felt+Fin~%C3%85'),
    '?klubb=eksempel'
);

assert.strictEqual(StandplassPersonModal.shortDate('2024-01-15T00:00:00Z'), "15. jan '24");

// parsePersonFilterParams: absent params -> nulls (defaults), not empty arrays
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42'),
    { years: null, types: null, discs: null, classes: null, metric: null,
      tab: null, branch: null, entry: null }
);
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_year=2024,2025&p_disc=Felt,Bane&p_metric=score'),
    { years: [2024, 2025], types: null, discs: ['Felt', 'Bane'], classes: null, metric: 'score',
      tab: null, branch: null, entry: null }
);
// p_tab/p_branch: the Meritter deep link — only the meritter tab and a
// real branch value parse; anything else falls back to the defaults
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_tab=meritter&p_branch=felt'),
    { years: null, types: null, discs: null, classes: null, metric: null,
      tab: 'meritter', branch: 'felt', entry: null }
);
assert.strictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_tab=resultater&p_branch=xyz').tab,
    null, 'an unknown tab value is not the meritter tab');
assert.strictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_tab=meritter&p_branch=xyz').branch,
    null, 'an unknown branch value falls back to Alle');

// p_entry: the activated entry's identity, date~competitionId~discipline~
// class — shareable, re-activated on open. Empty parts are wildcards on
// the match; a value with no anchor at all would match everything and
// parses as no entry.
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_entry=2026-06-06~c1~Felt Fin~Å').entry,
    { date: '2026-06-06', competitionId: 'c1', discipline: 'Felt Fin', class: 'Å' },
    'a full p_entry parses into the entry identity');
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_entry=2026-06-06~c1~Felt Fin~').entry,
    { date: '2026-06-06', competitionId: 'c1', discipline: 'Felt Fin', class: null },
    'an empty trailing class part is a wildcard');
assert.strictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_entry=not-enough-parts').entry,
    null, 'a malformed p_entry (not four parts) is no entry');
assert.strictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_entry=~~~').entry,
    null, 'an all-empty p_entry is no entry (it would match the first row)');

// buildPersonFilterParams: default state (single selected year === activeYear,
// no filters, default metric) writes nothing -- a plain ?person=X&year=Y link
// never gets p_* clutter just from opening the modal
assert.deepStrictEqual(
    StandplassPersonModal.buildPersonFilterParams({
        selectedYears: [2026], activeYear: 2026, types: null, discs: null, classes: null,
        metric: 'rankingScore', defaultMetric: 'rankingScore'
    }),
    { p_year: null, p_type: null, p_disc: null, p_class: null, p_metric: null,
      p_tab: null, p_branch: null, p_entry: null }
);
// a real change to each -- multi-year, a filter, and a non-default metric
assert.deepStrictEqual(
    StandplassPersonModal.buildPersonFilterParams({
        selectedYears: [2025, 2024], activeYear: 2026, types: null, discs: ['Felt'], classes: null,
        metric: 'score', defaultMetric: 'rankingScore'
    }),
    { p_year: '2024,2025', p_type: null, p_disc: 'Felt', p_class: null, p_metric: 'score',
      p_tab: null, p_branch: null, p_entry: null }
);
// the unfiltered state (empty filter lists) serializes to no params —
// an all-unticked or never-touched filter never writes p_* clutter,
// and a shared link reopens unfiltered.
assert.deepStrictEqual(
    StandplassPersonModal.buildPersonFilterParams({
        selectedYears: [2026], activeYear: 2026, types: [], discs: [], classes: [],
        metric: 'rankingScore', defaultMetric: 'rankingScore'
    }),
    { p_year: null, p_type: null, p_disc: null, p_class: null, p_metric: null,
      p_tab: null, p_branch: null, p_entry: null }
);
// the Meritter tab + branch filter ride the same patch, non-default only
assert.deepStrictEqual(
    StandplassPersonModal.buildPersonFilterParams({
        selectedYears: [2026], activeYear: 2026, types: null, discs: null, classes: null,
        metric: 'rankingScore', defaultMetric: 'rankingScore',
        tab: 'meritter', branch: 'felt'
    }),
    { p_year: null, p_type: null, p_disc: null, p_class: null, p_metric: null,
      p_tab: 'meritter', p_branch: 'felt', p_entry: null }
);
// the activated entry rides along too, and round-trips through the parse
var entryState = {
    selectedYears: [2026], activeYear: 2026, types: null, discs: null, classes: null,
    metric: 'rankingScore', defaultMetric: 'rankingScore',
    entry: { date: '2026-06-06', competitionId: 'c1', discipline: 'Felt Fin', class: 'Å' }
};
var entryPatch = StandplassPersonModal.buildPersonFilterParams(entryState);
assert.strictEqual(entryPatch.p_entry, '2026-06-06~c1~Felt Fin~Å',
    'an active entry writes its identity');
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_entry=' + entryPatch.p_entry).entry,
    entryState.entry,
    'the written p_entry parses back into the same spec');
assert.strictEqual(
    StandplassPersonModal.buildPersonFilterParams(Object.assign({}, entryState,
        { entry: { date: '2026-06-06', competitionId: 'c1', discipline: 'Felt Fin', class: null } })).p_entry,
    '2026-06-06~c1~Felt Fin~',
    'a null class part serializes as empty');
assert.strictEqual(
    StandplassPersonModal.buildPersonFilterParams(Object.assign({}, entryState,
        { entry: { date: null, competitionId: null, discipline: null, class: null } })).p_entry,
    null, 'an all-null entry spec writes nothing');

var entries = [
    { date: '2024-01-01', rankingScore: 0, position: 5 },
    { date: '2024-02-01', rankingScore: 42, position: 3 },
    { date: null, rankingScore: 50, position: 1 }
];
var filtered = StandplassPersonModal.chartPoints(entries, 'rankingScore');
assert.strictEqual(filtered.length, 1, 'drops zero-rankingScore and missing-date entries');
assert.strictEqual(filtered[0].rankingScore, 42);

// renderChart: no DOM in this test environment, so verify against a minimal
// stand-in with just the one property (innerHTML) the function writes to.
var chartEntries = [
    { date: '2024-01-01', competition: 'Åpent stevne', discipline: 'Felt', class: 'A', position: 3, score: 240, rankingScore: 80 },
    { date: '2024-02-01', competition: 'Klubbmesterskap', discipline: 'Felt', class: 'A', position: 1, score: 248, rankingScore: 97 },
    { date: '2024-03-01', competition: 'Kretsmesterskap', discipline: 'Felt', class: 'A', position: 2, score: 244, rankingScore: 90 }
];

var container = {};
StandplassPersonModal.renderChart(container, chartEntries, 'rankingScore');
assert.ok(container.innerHTML.includes('viewBox="0 0 400 120"'), 'renders the expected viewBox');
assert.ok(container.innerHTML.includes('<polyline'), 'renders a polyline for the best-per-date line');
assert.match(container.innerHTML, /<circle[^>]*>[\s\S]*<circle[^>]*>[\s\S]*<circle/, 'renders one circle per entry');
// 2 circles per plotted dot: a selection ring + the dot itself. No extra
// overlap rings — the three dates are distinct.
assert.strictEqual((container.innerHTML.match(/<circle/g) || []).length, 6, 'one ring + one dot per entry, no extra overlap rings');

// Plot-area inset: the first dot sits half an x-step right of the y-axis
// (PL=40, three points a month apart → half-step ≈ 28 → first cx ≈ 68).
(function () {
    var cxMatch = /<circle[^>]*cx="([0-9.]+)"/.exec(container.innerHTML);
    assert.ok(cxMatch, 'renderChart produced a dot');
    var firstCx = Number(cxMatch[1]);
    assert.ok(firstCx > 60, 'first dot clears the y-axis (got ' + firstCx + ')');
})();

// Legend: a fixed 5-item legend describing what each color *means*
// (2+ over/at opprykk/in class/under/2+ under), not per-class numeric
// thresholds -- same regardless of which classes are actually in view.
assert.ok(container.innerHTML.includes('2+ klasser over'), 'rankingScore legend uses the fixed semantic labels');
assert.ok(container.innerHTML.includes('Opprykksgrense nådd'));
assert.ok(!container.innerHTML.includes('Klasse A'), 'legend is not grouped/labeled per class');

// Y-axis inversion for `position`: lower position (better) must plot higher
// (smaller cy) than a higher position (worse) at the same metric range.
var posEntries = [
    { date: '2024-01-01', position: 5 },
    { date: '2024-02-01', position: 1 }
];
var posContainer = {};
StandplassPersonModal.renderChart(posContainer, posEntries, 'position');
var cys = [].concat(posContainer.innerHTML.match(/class="person-chart-dot"[^>]*cy="([\d.]+)"/g)).map(function (m) {
    return parseFloat(m.match(/cy="([\d.]+)"/)[1]);
});
assert.ok(cys[1] < cys[0], 'position=1 (better) plots higher (smaller cy) than position=5 (worse)');
assert.ok(posContainer.innerHTML.includes('Andre'), 'position legend includes the 4th "Andre" (non-podium) color');

// Fewer than 2 points: renders a fallback message, not a broken chart.
var emptyContainer = {};
StandplassPersonModal.renderChart(emptyContainer, [chartEntries[0]], 'rankingScore');
assert.ok(!emptyContainer.innerHTML.includes('<svg'), 'single data point falls back to a message instead of a chart');

// dotColor: rankingScore bands per class. B has no orange band — nothing
// is 2+ classes below B (C is below B; D is the entry class, doesn't count).
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'A', rankingScore: 98 }, 'rankingScore'), 'var(--chart-blue)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'A', rankingScore: 96 }, 'rankingScore'), 'var(--chart-red)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'A', rankingScore: 84 }, 'rankingScore'), 'var(--chart-orange)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'B', rankingScore: 98 }, 'rankingScore'), 'var(--chart-green)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'B', rankingScore: 86 }, 'rankingScore'), 'var(--chart-blue)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'B', rankingScore: 80 }, 'rankingScore'), 'var(--chart-red)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'B', rankingScore: 60 }, 'rankingScore'), 'var(--chart-red)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'C', rankingScore: 98 }, 'rankingScore'), 'var(--chart-purple)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'C', rankingScore: 86 }, 'rankingScore'), 'var(--chart-green)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'C', rankingScore: 70 }, 'rankingScore'), 'var(--chart-blue)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'D', rankingScore: 86 }, 'rankingScore'), 'var(--chart-purple)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'D', rankingScore: 70 }, 'rankingScore'), 'var(--chart-blue)');
// Non-klasseføring competition classes (Åpen, Menn, veteran, '') and unknown
// classes fall back to the neutral chart line color — never red.
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'Åpen', rankingScore: 90 }, 'rankingScore'), 'var(--chart-blue)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: '', rankingScore: 90 }, 'rankingScore'), 'var(--chart-blue)');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'E', rankingScore: 99 }, 'rankingScore'), 'var(--chart-blue)');

// dotColor: position medal colors, 1st/2nd/3rd plus the "other" fallback.
assert.strictEqual(StandplassPersonModal.dotColor({ position: 1 }, 'position'), 'var(--chart-gold)');
assert.strictEqual(StandplassPersonModal.dotColor({ position: 2 }, 'position'), 'var(--chart-silver)');
assert.strictEqual(StandplassPersonModal.dotColor({ position: 3 }, 'position'), 'var(--chart-bronze)');
assert.strictEqual(StandplassPersonModal.dotColor({ position: 4 }, 'position'), 'var(--chart-blue)');

var e2024 = [{ date: '2024-05-01', discipline: 'Grovfelt', class: 'A', competitionType: 'Feltskyting', score: 28 }];
var e2025 = [{ date: '2025-05-01', discipline: 'Fellesfelt', class: 'B', competitionType: 'Feltskyting', score: 30 }];
var merged = StandplassPersonModal.mergeYearEntries({ 2024: e2024, 2025: e2025 }, [2024, 2025]);
assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[0].date, '2024-05-01', 'merged entries are date-sorted ascending');

var filtered = StandplassPersonModal.getFilteredEntries(merged, { types: null, discs: ['Grovfelt'], classes: null });
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].discipline, 'Grovfelt');

// nothing picked = everything shown: empty filter lists are no
// restriction, so unticking every box is the unfiltered state
var emptyIsAll = StandplassPersonModal.getFilteredEntries(merged, { types: [], discs: [], classes: [] });
assert.strictEqual(emptyIsAll.length, 2, 'empty filter lists mean unfiltered, not "nothing"');

assert.deepStrictEqual(StandplassPersonModal.resolveInitialFilter('Grovfelt', ['Grovfelt', 'Fellesfelt']), ['Grovfelt']);
assert.deepStrictEqual(StandplassPersonModal.resolveInitialFilter('Stang', ['Grovfelt', 'Fellesfelt']), [], 'unmatched initial value falls back to unfiltered');
assert.deepStrictEqual(StandplassPersonModal.resolveInitialFilter(null, ['Grovfelt']), []);

var overlapEntries = [
    { date: '2025-05-01', rankingScore: 90 }, { date: '2025-05-01', rankingScore: 90 }, { date: '2025-06-01', rankingScore: 80 }
];
var counts = StandplassPersonModal.computeOverlapCounts(overlapEntries, 'rankingScore');
assert.strictEqual(counts['2025-05-01|90.00'], 2);
assert.strictEqual(counts['2025-06-01|80.00'], 1);

var html = StandplassPersonModal.buildTooltipContent({ date: '2025-05-01', rankingScore: 90, discipline: 'Grovfelt', class: 'A' },
    [{ date: '2025-05-01', rankingScore: 90, discipline: 'Grovfelt', class: 'A' }, { date: '2025-05-01', rankingScore: 90, discipline: 'Fellesfelt', class: 'B' }],
    'rankingScore');
assert.ok(html.indexOf('90.00') !== -1);
assert.ok(html.indexOf('Grovfelt') !== -1 && html.indexOf('Fellesfelt') !== -1, 'both overlapping entries get their own line');

// renderChart dots carry data-idx — the entry's index into the entries
// array passed in, so rows and dots can find each other. Entries filtered
// out of the plot keep their original array position.
(function () {
    var entries = [
        { date: '2024-01-01', competition: 'A', discipline: 'Felt', class: 'A', position: 3, score: 240, rankingScore: 80 },
        { date: '2024-02-01', competition: 'B', discipline: 'Felt', class: 'A', position: 1, score: 248, rankingScore: 0 },
        { date: '2024-03-01', competition: 'C', discipline: 'Felt', class: 'A', position: 2, score: 244, rankingScore: 90 }
    ];
    var linkContainer = {};
    StandplassPersonModal.renderChart(linkContainer, entries, 'rankingScore');
    // rankingScore 0 drops entry B from the plot; dots 0 and 2 remain.
    assert.ok(linkContainer.innerHTML.indexOf('data-idx="0"') !== -1, 'first dot carries data-idx 0');
    assert.ok(linkContainer.innerHTML.indexOf('data-idx="1"') === -1, 'filtered entry has no dot');
    assert.ok(linkContainer.innerHTML.indexOf('data-idx="2"') !== -1, 'third dot carries data-idx 2 (original position)');
})();

// Every dot gets a paired selection ring (same data-idx) — the visible
// active indicator when a dot is activated from the chart or from a
// table row. Counted per dot, so the plot has 2 circles per plotted entry.
(function () {
    var ringContainer = {};
    StandplassPersonModal.renderChart(ringContainer, chartEntries, 'rankingScore');
    var rings = ringContainer.innerHTML.match(/class="person-chart-dot-ring"/g) || [];
    assert.strictEqual(rings.length, 3, 'one selection ring per plotted dot');
    var dots = ringContainer.innerHTML.match(/class="person-chart-dot"/g) || [];
    assert.strictEqual(dots.length, 3, 'one dot per plotted entry');
    // ring and dot share the data-idx so activation can pair them
    ['0', '1', '2'].forEach(function (i) {
        assert.ok(
            ringContainer.innerHTML.indexOf('person-chart-dot-ring" data-idx="' + i + '"') !== -1,
            'selection ring carries data-idx ' + i
        );
    });
    // renderChart hands back an interaction handle for the caller (the
    // modal controller) to activate dots from table-row clicks.
    var handle = StandplassPersonModal.renderChart(ringContainer, chartEntries, 'rankingScore');
    assert.strictEqual(typeof handle.activateDot, 'function', 'renderChart returns an activateDot handle');
    assert.strictEqual(typeof handle.clearActive, 'function', 'renderChart returns a clearActive handle');
})();

// Overlap rings (same-day dots) are classed so CSS can keep them from
// intercepting pointer events — without this they swallow taps aimed at
// the dot cluster without ever resolving to anything.
(function () {
    var ovContainer = {};
    StandplassPersonModal.renderChart(ovContainer, [
        { date: '2025-05-01', competition: 'A', discipline: 'Felt', class: 'A', position: 3, score: 240, rankingScore: 90 },
        { date: '2025-05-01', competition: 'A', discipline: 'Felt', class: 'A', position: 3, score: 240, rankingScore: 90 },
        { date: '2025-06-01', competition: 'B', discipline: 'Felt', class: 'A', position: 3, score: 240, rankingScore: 80 }
    ], 'rankingScore');
    assert.ok(ovContainer.innerHTML.indexOf('person-chart-overlap-ring') !== -1, 'overlap rings carry the pointer-events-none class');
})();

// findNearestPoint: nearest-point tap/hover resolution in viewBox units —
// a fat-fingered tap resolves to the *closest* dot, not the topmost one,
// and taps beyond the threshold resolve to nothing at all.
(function () {
    var pts = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 100, y: 50 }];
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 12, 11, 16), 0, 'tap near a dot resolves to it');
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 19, 12, 16), 1, 'nearest dot wins, not topmost');
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 15, 10, 16), 0, 'an exact tie resolves to the earlier dot');
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 40, 10, 16), -1, 'beyond the threshold resolves to nothing');
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 100, 50, 16), 2, 'a dead-center hit resolves to that dot');
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 100, 60, 9.9), -1, 'just outside the threshold resolves to nothing');
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 100, 60, 10), -1, 'exactly at the threshold does not resolve (threshold is exclusive)');
    assert.strictEqual(StandplassPersonModal.findNearestPoint(pts, 100, 60, 10.5), 2, 'just inside the threshold resolves');
    assert.strictEqual(StandplassPersonModal.findNearestPoint([], 10, 10, 16), -1, 'no dots resolves to nothing');
})();

console.log('person-modal.test.js: all assertions passed');

// ── resultsTableColumns: the shared-base spec for the modal's table ────
// (straight port of the hand-rolled markup it replaced)
var cols = StandplassPersonModal.resultsTableColumns();
assert.deepStrictEqual(cols.map(function (c) { return c.key; }),
    ['date', 'competition', 'discipline', 'class', 'position', 'score', 'rankingScore'],
    'seven columns in the original order');
assert.deepStrictEqual(cols.map(function (c) { return c.label; }),
    ['Dato', 'Stevne', 'Øvelse', 'Klasse', 'Plass', 'Poeng', 'Ranking'],
    'labels unchanged from the hand-rolled thead');
assert.ok(cols.every(function (c) { return c.sortable; }), 'every column sortable on the base');
assert.strictEqual(cols[0].format('2026-05-01T10:00:00Z'), "1. mai '26", 'dates render short-form');
assert.strictEqual(cols[0].format(null), '–', 'missing date renders –');
assert.strictEqual(cols[1].format(null), '–', 'missing competition renders –');
assert.strictEqual(cols[2].format(null), '', 'missing discipline renders empty, like before');
assert.strictEqual(cols[4].cell({ position: null }), '–', 'missing position renders –');
assert.strictEqual(cols[4].cell({ position: 2 }),
    '<span class="medal medal--silver">2</span>',
    'a 2nd place renders a silver badge from the shared module');
assert.ok(cols[4].raw, 'the Plass cell is raw HTML — it carries the medal badge');
assert.strictEqual(cols[6].cell({ rankingScore: 0.9, class: 'Åpen' }), '0.90', 'rankingScore renders two decimals');
assert.strictEqual(cols[6].cell({ rankingScore: null, class: 'A' }), '–', 'missing rankingScore renders –');
assert.ok(cols[6].raw, 'the Ranking cell is raw HTML — it carries the colored value');
assert.strictEqual(cols[6].cell({ rankingScore: 98, class: 'B' }),
    '<span class="rank-value" style="color:var(--chart-green-text)" title="Opprykksgrense nådd">98.00</span>',
    'a banded ranking renders its color from the shared module');

// Render through the base: the migration contract — date-asc default
// order (the order the table has always shown), rows stamped with
// data-idx = the entry's FILTER-order index (the chart's dot index, so
// the row↔dot linking keeps working), formats as above.
global.StandplassDataTable = require('../public/js/data-table.js');
var pmEntries = [
    { date: '2026-06-01T00:00:00Z', competition: 'Høstfelt', discipline: 'Finfelt', class: 'A', position: 3, score: 90, rankingScore: 0.9 },
    { date: '2026-05-01T00:00:00Z', competition: 'Vårfelt', discipline: 'Grovfelt', class: 'B', position: 1, score: null, rankingScore: null },
    { date: '2026-07-01T00:00:00Z', competition: 'Sommerstevne', discipline: 'Finfelt', class: 'Åpen', position: 2, score: 85, rankingScore: 0.85 }
];
var pmRowIdx = new Map();
pmEntries.forEach(function (e, i) { pmRowIdx.set(e, i); });
var pmTable = StandplassDataTable.renderTable('qa-person-results', {
    columns: StandplassPersonModal.resultsTableColumns(),
    rows: pmEntries.slice().sort(function (a, b) {
        return (a.date || '') < (b.date || '') ? -1 : 1;
    }),
    ariaLabel: 'Resultater for Test Skytter',
    defaultSort: { key: 'date', dir: 'asc' },
    rowAttrs: function (row) {
        return 'data-idx="' + pmRowIdx.get(row) + '" tabindex="-1" aria-label="Klikk for å markere resultatet i grafen"';
    }
}, { sort: null });
// date-asc display order
assert.ok(pmTable.indexOf('Vårfelt') < pmTable.indexOf('Høstfelt')
    && pmTable.indexOf('Høstfelt') < pmTable.indexOf('Sommerstevne'),
    'default sort is date-ascending, the historical order');
// data-idx travels with the row, not the sort: Vårfelt is filter-index 1
// but sorts first (data-dt-row 0) — the two indices deliberately differ.
assert.ok(pmTable.indexOf('<tr data-dt-row="0" data-idx="1" tabindex="-1"') >= 0,
    'Vårfelt sorts first (data-dt-row 0) but keeps its filter-order index (1) as data-idx');
assert.ok(pmTable.indexOf('<tr data-dt-row="1" data-idx="0"') >= 0,
    'Høstfelt keeps filter-index 0 as data-idx at sorted position 1');
// cell formats through the base
assert.ok(pmTable.indexOf('<td>1. mai &#39;26</td>') >= 0, 'short date in the Dato cell');
assert.ok(pmTable.indexOf('<td>–</td>') >= 0, 'null score renders –');
assert.ok(pmTable.indexOf('<td><span class="rank-value" style="color:var(--chart-orange-text)" title="2+ klasser under">0.90</span></td>') >= 0,
    'rankingScore 0.9 renders 0.90 colored by its band (class A, far below)');
assert.ok(pmTable.indexOf('<td><span class="medal medal--gold">1</span></td>') >= 0,
    'a 1st place renders a gold badge in the Plass cell');
assert.ok(pmTable.indexOf('<td><span class="medal medal--silver">2</span></td>') >= 0,
    'a 2nd place renders a silver badge in the Plass cell');
assert.ok(pmTable.indexOf('<td><span class="medal medal--bronze">3</span></td>') >= 0,
    'a 3rd place renders a bronze badge in the Plass cell');
// every header sortable, Dato carrying the initial aria-sort
assert.strictEqual((pmTable.match(/dt-sort-btn/g) || []).length, 7, 'seven sortable header buttons');
assert.ok(pmTable.indexOf('aria-sort="ascending"') >= 0, 'the date column carries the initial ascending sort');

// ── Meritter tab: chips + body rendering (owner rulings 2026-11-23) ────
// Merit rows are meritterForPerson's shape; the chips split individual
// and lag kinds (separate chips), and lag rows carry the muted team span.

var meritFixture = [
    { year: 2026, scope: 'km', ovelse: 'Felt Fin', klasse: 'U', region: 'Buskerud',
      medal: 'Gull', compId: 'c1', compTitle: 'KM felt 2026', team: null },
    { year: 2026, scope: 'km', ovelse: 'Felt Grov', klasse: 'Lag Å', region: 'Vestlandet',
      medal: 'Sølv', compId: 'c2', compTitle: 'KM felt 2026 lag', team: 'Tysnes SSK 1' },
    { year: 2025, scope: 'nm', ovelse: 'Felt Fin', klasse: null, region: null,
      medal: 'Bronse', compId: 'c3', compTitle: 'NM felt 2025', team: null }
];

var chips = StandplassPersonModal.meritterChips(meritFixture);
assert.deepStrictEqual(chips.map(function (c) { return c.key; }), ['nm', 'km', 'kmLag'],
    'chip kinds in the fixed order, lag keyed off team, only non-zero kinds');
var chipByKey = {};
chips.forEach(function (c) { chipByKey[c.key] = c; });
assert.deepStrictEqual(chipByKey.km, { key: 'km', label: 'KM', counts: { Gull: 1, Sølv: 0, Bronse: 0 } },
    'counts keep all three medals, zeros included');
assert.deepStrictEqual(chipByKey.kmLag, { key: 'kmLag', label: 'KM-lag', counts: { Gull: 0, Sølv: 1, Bronse: 0 } },
    'a lag merit counts into its own kmLag chip');
assert.strictEqual(chipByKey.nm.label, 'NM');

var lagOnlyChips = StandplassPersonModal.meritterChips([
    { year: 2026, scope: 'dm', ovelse: '25m Grov', klasse: 'Mix-lag', region: 'Østlandet Sør',
      medal: 'Gull', compId: 'd1', compTitle: 'DM 2026', team: 'Brumunddal PK' }
]);
assert.deepStrictEqual(lagOnlyChips.map(function (c) { return c.key; }), ['dmLag'],
    'a lag-only shooter gets no individual chips');
assert.strictEqual(lagOnlyChips[0].label, 'DM-lag');
assert.deepStrictEqual(StandplassPersonModal.meritterChips([]), [], 'no merits → no chips');

var meritBody = StandplassPersonModal.renderMeritterBody(meritFixture, { compLinks: true });

// chips row: labels + medal spans with counts, zeros omitted
var chipsAt = meritBody.indexOf('person-meritt-chips');
assert.ok(chipsAt !== -1, 'the chips row renders');
var chipsHtml = meritBody.slice(chipsAt, meritBody.indexOf('</div>', chipsAt));
['km', 'kmLag', 'nm'].forEach(function (k) {
    assert.ok(chipsHtml.indexOf('data-kind="' + k + '"') !== -1, 'chip ' + k + ' renders');
});
assert.ok(chipsHtml.indexOf('data-kind="nmLag"') === -1 && chipsHtml.indexOf('data-kind="dm"') === -1,
    'zero kinds get no chip');
assert.ok(chipsHtml.indexOf('KM') !== -1 && chipsHtml.indexOf('KM-lag') !== -1
    && chipsHtml.indexOf('NM') !== -1, 'chip labels use the scope + -lag forms');
assert.strictEqual((chipsHtml.match(/class="medal /g) || []).length, 3,
    'one medal span per non-zero count');
assert.ok(chipsHtml.indexOf('>0<') === -1, 'zero counts are omitted from the chips');

// year groups, newest first; per-merit medal badges mirror ranking-band markup
assert.ok(meritBody.indexOf('person-meritt-year">2026') < meritBody.indexOf('person-meritt-year">2025'),
    'year headings group the list, newest first');
assert.ok(meritBody.indexOf('<span class="medal medal--gold">1</span>') !== -1,
    'a gull merit renders the gold badge with position 1');
assert.ok(meritBody.indexOf('<span class="medal medal--silver">2</span>') !== -1,
    'a sølv merit renders the silver badge with position 2');
assert.ok(meritBody.indexOf('<span class="medal medal--bronze">3</span>') !== -1,
    'a bronse merit renders the bronze badge with position 3');

// each row names its championship kind between the medal and the øvelse
assert.ok(meritBody.indexOf('<span class="person-meritt-scope">KM</span>') !== -1,
    'a km merit names its kind');
assert.ok(meritBody.indexOf('<span class="person-meritt-scope">NM</span>') !== -1,
    'an nm merit names its kind');
var goldBadgeAt = meritBody.indexOf('<span class="medal medal--gold">1</span>');
var kmScopeAt = meritBody.indexOf('<span class="person-meritt-scope">KM</span>');
var firstOvelseAt = meritBody.indexOf('<span class="person-meritt-ovelse">Felt Fin</span>');
assert.ok(goldBadgeAt !== -1 && kmScopeAt !== -1 && firstOvelseAt !== -1
    && goldBadgeAt < kmScopeAt && kmScopeAt < firstOvelseAt,
    'the scope sits between the medal badge and the øvelse');

// row parts: only when present; the lag team span sits between class and region
assert.strictEqual((meritBody.match(/person-meritt-klasse/g) || []).length, 2,
    'klasse renders only when present (2 of 3 merits)');assert.strictEqual((meritBody.match(/person-meritt-region/g) || []).length, 2,
    'region renders only when present (2 of 3 merits)');
assert.strictEqual((meritBody.match(/person-meritt-team/g) || []).length, 1,
    'only the lag merit carries a team span');
var teamAt = meritBody.indexOf('Tysnes SSK 1');
assert.ok(meritBody.indexOf('Lag Å') < teamAt && teamAt < meritBody.indexOf('Vestlandet'),
    'the team name sits inline between the class and the region, muted by its class');

// comp links on: buttons carrying id + title for delegation
assert.ok(meritBody.indexOf('<button type="button" class="stevner-person-btn link-btn person-meritt-comp"'
    + ' data-comp-id="c2" data-comp-title="KM felt 2026 lag">KM felt 2026 lag</button>') !== -1,
    'comp titles render as link buttons carrying id + title for delegation');

// comp links off (and by default): plain spans, no buttons
var plainBody = StandplassPersonModal.renderMeritterBody(meritFixture, { compLinks: false });
assert.ok(plainBody.indexOf('<button') === -1, 'no link buttons without a comp-modal host');
assert.ok(plainBody.indexOf('<span class="person-meritt-comp">KM felt 2026</span>') !== -1,
    'comp titles render as plain spans');
assert.ok(StandplassPersonModal.renderMeritterBody(meritFixture).indexOf('<button') === -1,
    'compLinks defaults off');

// every dynamic text goes through esc, attribute values included
var hostile = StandplassPersonModal.renderMeritterBody([
    { year: 2026, scope: 'km', ovelse: 'Felt <Fin>', klasse: 'U', region: 'Buske&rud',
      medal: 'Gull', compId: 'c"<1>', compTitle: '<script>alert("x")</script>', team: 'T <&> PK' }
], { compLinks: true });
assert.ok(hostile.indexOf('<script>') === -1, 'a hostile comp title never reaches the DOM raw');
assert.ok(hostile.indexOf('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;') !== -1);
assert.ok(hostile.indexOf('data-comp-id="c&quot;&lt;1&gt;"') !== -1, 'attribute values are escaped');
assert.ok(hostile.indexOf('Felt &lt;Fin&gt;') !== -1 && hostile.indexOf('T &lt;&amp;&gt; PK') !== -1,
    'øvelse and team are escaped too');

// empty merits → the honest empty message, nothing else
assert.strictEqual(StandplassPersonModal.renderMeritterBody([], { compLinks: true }),
    '<p class="ranking-status-msg">Ingen mesterskapsmedaljer funnet.</p>',
    'empty merits → the honest empty message');

// ── open-from-entry activation helpers ────────────────────────────────
// Opening the modal from a specific result row should activate that
// entry like an in-modal row click: dot ring + row highlight. The row
// button carries the entry's identity (date, competitionId, discipline,
// class); a ranking chart cannot show an entry without a rank score,
// so the activation falls back to the poeng graph (owner ruling).

var entryFixture = [
    { date: '2026-06-06', competition: 'KM felt', competitionId: 'c1',
      discipline: 'Felt Fin', class: 'Å', rankingScore: 0.91, score: 88, position: 2 },
    { date: '2026-06-06', competition: 'KM felt', competitionId: 'c1',
      discipline: 'Felt Grov', class: 'Å', rankingScore: null, score: 94, position: 1 },
    { date: '2026-07-01', competition: 'Sommerstevne', competitionId: 'c2',
      discipline: 'Felt Fin', class: 'Å', rankingScore: 0.85, score: 80, position: 4 }
];

assert.strictEqual(StandplassPersonModal.findEntryIndex(entryFixture,
    { date: '2026-07-01', competitionId: 'c2', discipline: 'Felt Fin', class: 'Å' }), 2,
    'the entry is found by its full identity');
assert.strictEqual(StandplassPersonModal.findEntryIndex(entryFixture,
    { date: '2026-06-06', competitionId: 'c1', discipline: 'Felt Grov' }), 1,
    'a spec without class still matches (class skipped when absent)');
assert.strictEqual(StandplassPersonModal.findEntryIndex(entryFixture,
    { date: '2026-06-06', competitionId: 'c9', discipline: 'Felt Fin' }), -1,
    'another competition is no match');
assert.strictEqual(StandplassPersonModal.findEntryIndex(entryFixture, null), -1,
    'no spec is no match');

assert.strictEqual(StandplassPersonModal.activationMetric(
    { rankingScore: null, score: 94 }, 'rankingScore'), 'score',
    'a rankless entry activates on the poeng graph instead');
// The listing encodes "no ranking" as zero, not just null — chartPoints
// excludes ranking-0 rows from the ranking series, so the activation
// helpers must agree with the chart's own dot predicate.
assert.strictEqual(StandplassPersonModal.activationMetric(
    { rankingScore: 0, score: 94 }, 'rankingScore'), 'score',
    'a zero-ranking entry activates on the poeng graph instead');
assert.strictEqual(StandplassPersonModal.activationMetric(
    { rankingScore: 88, score: 94 }, 'rankingScore'), 'rankingScore',
    'a real ranking keeps the ranking graph');
assert.strictEqual(StandplassPersonModal.activationMetric(
    { rankingScore: null }, 'score'), 'score',
    'the poeng graph is never switched away from');
assert.strictEqual(StandplassPersonModal.activationMetric(
    { rankingScore: null }, 'position'), 'position',
    'the position graph is never switched away from');

assert.strictEqual(StandplassPersonModal.hasMetricValue(
    { rankingScore: 0.91, score: 88, position: 2 }, 'rankingScore'), true);
assert.strictEqual(StandplassPersonModal.hasMetricValue(
    { rankingScore: null, score: 88 }, 'rankingScore'), false);
assert.strictEqual(StandplassPersonModal.hasMetricValue(
    { rankingScore: 0, score: 94 }, 'rankingScore'), false,
    'a zero ranking has no dot on the ranking chart');
assert.strictEqual(StandplassPersonModal.hasMetricValue(
    { score: 88 }, 'score'), true);
assert.strictEqual(StandplassPersonModal.hasMetricValue(
    { score: 0 }, 'score'), true,
    'a zero poeng sum is still a dot on the poeng chart');
assert.strictEqual(StandplassPersonModal.hasMetricValue(
    { position: null }, 'position'), false);

// hasChartDot: whether an entry actually gets a dot on the rendered
// chart — the chart renders dots only with 2+ plotted points (fewer is
// the noop-chart path), and only for entries its series includes. The
// open-from-entry activation must treat a single-point chart like no
// chart at all: the row fallback (highlight + p_entry write) takes over
// instead of silently swallowing the activation into the noop handle.
var chartPts = [
    { date: '2026-06-06', competitionId: 'c1', discipline: 'Grovfelt', class: 'Å',
      score: 94, rankingScore: 0 },
    { date: '2026-07-01', competitionId: 'c2', discipline: 'Grovfelt', class: 'Å',
      score: 91, rankingScore: null }
];
assert.strictEqual(StandplassPersonModal.hasChartDot(chartPts, 'score', chartPts[0]), true,
    'two plotted points render dots — the entry gets one');
assert.strictEqual(StandplassPersonModal.hasChartDot(chartPts, 'score',
    { date: '2026-08-01', competitionId: 'c3', discipline: 'Grovfelt', class: 'Å', score: 88 }),
    false, 'an entry outside the series has no dot');
assert.strictEqual(StandplassPersonModal.hasChartDot(
    [chartPts[0]], 'score', chartPts[0]), false,
    'a single-point chart renders no dots — the row fallback takes over');
assert.strictEqual(StandplassPersonModal.hasChartDot(chartPts, 'rankingScore', chartPts[1]),
    false, 'the ranking series excludes rankless rows — no dot on that chart');

// ── branch switcher (owner ruling 2026-11-23: Alle/Felt/Bane, not ────
// per-row tags — scales with future branches; rows stay untagged)

var branchMerits = [
    { year: 2026, scope: 'km', ovelse: 'Felt Fin', klasse: 'U', region: 'Buskerud',
      medal: 'Gull', compId: 'c1', compTitle: 'KM felt 2026', team: null, branch: 'felt' },
    { year: 2026, scope: 'km', ovelse: '25m Grovpistol', klasse: 'Å', region: 'Hordaland',
      medal: 'Sølv', compId: 'c2', compTitle: 'KM bane 2026', team: null, branch: 'bane' },
    { year: 2025, scope: 'km', ovelse: 'Felt Grov', klasse: 'Lag Å', region: 'Vestlandet',
      medal: 'Gull', compId: 'c3', compTitle: 'KM felt 2025 lag', team: 'Tysnes SSK 1', branch: 'felt' }
];

var branchBody = StandplassPersonModal.renderMeritterBody(branchMerits, { compLinks: false });
var toggleAt = branchBody.indexOf('person-meritt-branch-toggle');
assert.ok(toggleAt !== -1, 'mixed-branch merits render the switcher');
var toggleHtml = branchBody.slice(toggleAt, branchBody.indexOf('</div>', toggleAt));
assert.deepStrictEqual(
    (toggleHtml.match(/data-branch="([^"]*)"/g) || []).map(function (s) { return s.slice(13, -1); }),
    ['', 'felt', 'bane'],
    'Alle first, then the present branches in fixed order');
assert.ok(toggleHtml.indexOf('data-branch="" aria-pressed="true"') !== -1,
    'Alle is the active default');
assert.ok(branchBody.indexOf('25m Grovpistol') !== -1 && branchBody.indexOf('medal--silver') !== -1,
    'Alle shows every branch');

var feltBody = StandplassPersonModal.renderMeritterBody(branchMerits, { branch: 'felt' });
assert.ok(feltBody.indexOf('25m Grovpistol') === -1, 'a branch filter drops the other branch\'s rows');
assert.ok(feltBody.indexOf('Felt Grov') !== -1, 'the branch\'s own rows stay');
assert.ok(feltBody.indexOf('medal--silver') === -1,
    'chips recompute from the filtered merits — the bane sølv is gone');
assert.ok(feltBody.indexOf('data-branch="felt" aria-pressed="true"') !== -1,
    'the active branch button is marked');
assert.ok(feltBody.indexOf('data-branch="" aria-pressed="false"') !== -1,
    'Alle is no longer active under a branch filter');

assert.ok(StandplassPersonModal.renderMeritterBody(
    branchMerits.filter(function (m) { return m.branch === 'felt'; }), {}
).indexOf('person-meritt-branch-toggle') === -1,
    'single-branch merits render no switcher — nothing to filter');
