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

// clearPersonFromUrl also strips the in-modal filter params, not just person/year
assert.strictEqual(
    StandplassPersonModal.clearPersonFromUrl('?klubb=eksempel&person=42&year=2026&p_year=2024,2025&p_disc=Felt'),
    '?klubb=eksempel'
);

assert.strictEqual(StandplassPersonModal.shortDate('2024-01-15T00:00:00Z'), "15. jan '24");

// parsePersonFilterParams: absent params -> nulls (defaults), not empty arrays
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42'),
    { years: null, types: null, discs: null, classes: null, metric: null }
);
assert.deepStrictEqual(
    StandplassPersonModal.parsePersonFilterParams('?person=42&p_year=2024,2025&p_disc=Felt,Bane&p_metric=score'),
    { years: [2024, 2025], types: null, discs: ['Felt', 'Bane'], classes: null, metric: 'score' }
);

// buildPersonFilterParams: default state (single selected year === activeYear,
// no filters, default metric) writes nothing -- a plain ?person=X&year=Y link
// never gets p_* clutter just from opening the modal
assert.deepStrictEqual(
    StandplassPersonModal.buildPersonFilterParams({
        selectedYears: [2026], activeYear: 2026, types: null, discs: null, classes: null,
        metric: 'rankingScore', defaultMetric: 'rankingScore'
    }),
    { p_year: null, p_type: null, p_disc: null, p_class: null, p_metric: null }
);
// a real change to each -- multi-year, a filter, and a non-default metric
assert.deepStrictEqual(
    StandplassPersonModal.buildPersonFilterParams({
        selectedYears: [2025, 2024], activeYear: 2026, types: null, discs: ['Felt'], classes: null,
        metric: 'score', defaultMetric: 'rankingScore'
    }),
    { p_year: '2024,2025', p_type: null, p_disc: 'Felt', p_class: null, p_metric: 'score' }
);

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
var cys = [].concat(posContainer.innerHTML.match(/<circle[^>]*cy="([\d.]+)"/g)).map(function (m) {
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

console.log('person-modal.test.js: all assertions passed');
