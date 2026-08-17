'use strict';
var assert = require('node:assert');
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

assert.strictEqual(StandplassPersonModal.shortDate('2024-01-15T00:00:00Z'), "15. jan '24");

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
assert.strictEqual((container.innerHTML.match(/<circle/g) || []).length, 3, 'one dot per entry, no extra overlap rings');

// Y-axis inversion for `position`: lower position (better) must plot higher
// (smaller cy) than a higher position (worse) at the same metric range.
var posEntries = [
    { date: '2024-01-01', position: 5 },
    { date: '2024-02-01', position: 1 }
];
var posContainer = {};
StandplassPersonModal.renderChart(posContainer, posEntries, 'position');
var cys = [].concat(posContainer.innerHTML.match(/<circle[^>]*cy="([\d.]+)"/g)).map(function (m) {
    return parseFloat(m.match(/cy="([\d.]+)"/)[1]);
});
assert.ok(cys[1] < cys[0], 'position=1 (better) plots higher (smaller cy) than position=5 (worse)');

// Fewer than 2 points: renders a fallback message, not a broken chart.
var emptyContainer = {};
StandplassPersonModal.renderChart(emptyContainer, [chartEntries[0]], 'rankingScore');
assert.ok(!emptyContainer.innerHTML.includes('<svg'), 'single data point falls back to a message instead of a chart');

// dotColor: class-relative rankingScore color bands, one threshold crossing per class.
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'A', rankingScore: 96 }, 'rankingScore'), '#ef4444');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'A', rankingScore: 97 }, 'rankingScore'), '#eab308');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'B', rankingScore: 84 }, 'rankingScore'), '#ef4444');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'B', rankingScore: 85 }, 'rankingScore'), '#eab308');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'C', rankingScore: 84 }, 'rankingScore'), '#eab308');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'C', rankingScore: 85 }, 'rankingScore'), '#22c55e');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'D', rankingScore: 84 }, 'rankingScore'), '#eab308');
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'D', rankingScore: 85 }, 'rankingScore'), '#a855f7');
// Unknown/missing class falls back to the brand accent (not a color band).
assert.strictEqual(StandplassPersonModal.dotColor({ class: 'E', rankingScore: 99 }, 'rankingScore'), 'var(--brand-accent)');

// dotColor: position medal colors, 1st/2nd/3rd plus the "other" fallback.
assert.strictEqual(StandplassPersonModal.dotColor({ position: 1 }, 'position'), '#e8b923');
assert.strictEqual(StandplassPersonModal.dotColor({ position: 2 }, 'position'), '#c8d0d8');
assert.strictEqual(StandplassPersonModal.dotColor({ position: 3 }, 'position'), '#b87333');
assert.strictEqual(StandplassPersonModal.dotColor({ position: 4 }, 'position'), '#4a90d9');

var e2024 = [{ date: '2024-05-01', discipline: 'Grovfelt', class: 'A', competitionType: 'Feltskyting', score: 28 }];
var e2025 = [{ date: '2025-05-01', discipline: 'Fellesfelt', class: 'B', competitionType: 'Feltskyting', score: 30 }];
var merged = StandplassPersonModal.mergeYearEntries({ 2024: e2024, 2025: e2025 }, [2024, 2025]);
assert.strictEqual(merged.length, 2);
assert.strictEqual(merged[0].date, '2024-05-01', 'merged entries are date-sorted ascending');

var filtered = StandplassPersonModal.getFilteredEntries(merged, { types: null, discs: ['Grovfelt'], classes: null });
assert.strictEqual(filtered.length, 1);
assert.strictEqual(filtered[0].discipline, 'Grovfelt');

var noneSelected = StandplassPersonModal.getFilteredEntries(merged, { types: null, discs: [], classes: null });
assert.strictEqual(noneSelected.length, 0, 'an empty array means "none selected", not "no filter"');

assert.deepStrictEqual(StandplassPersonModal.resolveInitialFilter('Grovfelt', ['Grovfelt', 'Fellesfelt']), ['Grovfelt']);
assert.strictEqual(StandplassPersonModal.resolveInitialFilter('Stang', ['Grovfelt', 'Fellesfelt']), null, 'unmatched initial value falls back to no filter, never a false empty state');
assert.strictEqual(StandplassPersonModal.resolveInitialFilter(null, ['Grovfelt']), null);

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

console.log('person-modal.test.js: all assertions passed');
