'use strict';
var assert = require('node:assert');
var CS = require('../public/js/club-stats-page.js');
global.StandplassStevnerPage = require('../public/js/stevner-page.js');

// ── Test data ──────────────────────────────────────────────────────────

// Simulates flattened rows from StandplassStevnerPage.flattenRows — the
// real flattenRows adds competition (title), date, competitionType, etc.
// For stats purposes the key fields are: personId, club, discipline, class,
// position, competition.
var sampleRows = [
    // Klubb A: 3 unique shooters, 5 starts, 2 competitions, 2 disciplines, 2 classes, 2 top-3
    { personId: 'p1', name: 'Alice', club: 'Klubb A', discipline: 'Finfelt', class: 'A', position: 1, competition: 'Vårfelt', competitionId: 'c1' },
    { personId: 'p1', name: 'Alice', club: 'Klubb A', discipline: 'Grovfelt', class: 'B', position: 2, competition: 'Vårfelt', competitionId: 'c1' },
    { personId: 'p2', name: 'Bob', club: 'Klubb A', discipline: 'Finfelt', class: 'A', position: 3, competition: 'Vårfelt', competitionId: 'c1' },
    { personId: 'p2', name: 'Bob', club: 'Klubb A', discipline: 'Finfelt', class: 'A', position: 5, competition: 'Høstfelt', competitionId: 'c2' },
    { personId: 'p3', name: 'Carol', club: 'Klubb A', discipline: 'Grovfelt', class: 'B', position: 4, competition: 'Høstfelt', competitionId: 'c2' },
    // Klubb B: 1 unique shooter, 2 starts, 1 competition, 1 discipline, 1 class, 1 top-3
    { personId: 'p4', name: 'Dave', club: 'Klubb B', discipline: 'Finfelt', class: 'C', position: 1, competition: 'Vårfelt', competitionId: 'c1' },
    { personId: 'p4', name: 'Dave', club: 'Klubb B', discipline: 'Finfelt', class: 'C', position: 6, competition: 'Vårfelt', competitionId: 'c1' },
    // Klubb C: 2 unique shooters, 3 starts, 2 competitions, 2 disciplines, 2 classes, 0 top-3
    { personId: 'p5', name: 'Eve', club: 'Klubb C', discipline: 'Finfelt', class: 'A', position: 4, competition: 'Vårfelt', competitionId: 'c1' },
    { personId: 'p5', name: 'Eve', club: 'Klubb C', discipline: 'Grovfelt', class: 'B', position: 5, competition: 'Høstfelt', competitionId: 'c2' },
    { personId: 'p6', name: 'Frank', club: 'Klubb C', discipline: 'Finfelt', class: 'A', position: 6, competition: 'Høstfelt', competitionId: 'c2' }
];

// ── computeClubStats ───────────────────────────────────────────────────

var stats = CS.computeClubStats(sampleRows);

// Klubb A
assert.strictEqual(stats['Klubb A'].uniqueShooters, 3, 'Klubb A: 3 unique shooters');
assert.strictEqual(stats['Klubb A'].totalStarts, 5, 'Klubb A: 5 total starts');
assert.strictEqual(stats['Klubb A'].competitionsAttended, 2, 'Klubb A: 2 competitions');
assert.strictEqual(stats['Klubb A'].topThree, 3, 'Klubb A: 3 top-3 finishes (positions 1, 2, 3)');
assert.strictEqual(stats['Klubb A'].disciplinesRepresented, 2, 'Klubb A: 2 disciplines (Finfelt, Grovfelt)');
assert.strictEqual(stats['Klubb A'].classesRepresented, 2, 'Klubb A: 2 classes (A, B)');

// Klubb B
assert.strictEqual(stats['Klubb B'].uniqueShooters, 1, 'Klubb B: 1 unique shooter');
assert.strictEqual(stats['Klubb B'].totalStarts, 2, 'Klubb B: 2 total starts');
assert.strictEqual(stats['Klubb B'].competitionsAttended, 1, 'Klubb B: 1 competition');
assert.strictEqual(stats['Klubb B'].topThree, 1, 'Klubb B: 1 top-3 finish');
assert.strictEqual(stats['Klubb B'].disciplinesRepresented, 1, 'Klubb B: 1 discipline');
assert.strictEqual(stats['Klubb B'].classesRepresented, 1, 'Klubb B: 1 class');

// Klubb C
assert.strictEqual(stats['Klubb C'].uniqueShooters, 2, 'Klubb C: 2 unique shooters');
assert.strictEqual(stats['Klubb C'].totalStarts, 3, 'Klubb C: 3 total starts');
assert.strictEqual(stats['Klubb C'].competitionsAttended, 2, 'Klubb C: 2 competitions');
assert.strictEqual(stats['Klubb C'].topThree, 0, 'Klubb C: 0 top-3 finishes');
assert.strictEqual(stats['Klubb C'].disciplinesRepresented, 2, 'Klubb C: 2 disciplines');
assert.strictEqual(stats['Klubb C'].classesRepresented, 2, 'Klubb C: 2 classes');

// Same person in multiple competitions counts once for unique shooters
assert.strictEqual(stats['Klubb A'].uniqueShooters, 3, 'personId dedup: p1 appears 2x, p2 appears 2x, counted once each');

// Same person with multiple results in one competition counts multiple starts
assert.strictEqual(stats['Klubb A'].totalStarts, 5, 'multiple starts per competition counted separately');

// Empty data
var emptyStats = CS.computeClubStats([]);
assert.strictEqual(Object.keys(emptyStats).length, 0, 'empty rows → empty stats');

// Null/undefined input
assert.strictEqual(Object.keys(CS.computeClubStats(null)).length, 0, 'null rows → empty stats');
assert.strictEqual(Object.keys(CS.computeClubStats(undefined)).length, 0, 'undefined rows → empty stats');

// Rows with missing club go to "Ukjent"
var noClubRows = [{ personId: 'p1', club: '', discipline: 'Finfelt', class: 'A', position: 1, competition: 'Test', competitionId: 'c9' }];
var noClubStats = CS.computeClubStats(noClubRows);
assert.strictEqual(Object.keys(noClubStats).length, 1, 'empty club name → "Ukjent" bucket');
assert.strictEqual(noClubStats['Ukjent'].uniqueShooters, 1, 'Ukjent bucket has 1 shooter');

// ── rankClubs ──────────────────────────────────────────────────────────

// Sort by uniqueShooters (no threshold filtering for these tests)
var byShooters = CS.rankClubs(stats, 'uniqueShooters', { minShooters: 0, minStarts: 0 });
assert.strictEqual(byShooters.length, 3, 'rankClubs returns all 3 clubs');
assert.strictEqual(byShooters[0].club, 'Klubb A', 'Klubb A first (3 shooters)');
assert.strictEqual(byShooters[1].club, 'Klubb C', 'Klubb C second (2 shooters)');
assert.strictEqual(byShooters[2].club, 'Klubb B', 'Klubb B third (1 shooter)');

// Sort by totalStarts
var byStarts = CS.rankClubs(stats, 'totalStarts', { minShooters: 0, minStarts: 0 });
assert.strictEqual(byStarts[0].club, 'Klubb A', 'Klubb A first (5 starts)');
assert.strictEqual(byStarts[1].club, 'Klubb C', 'Klubb C second (3 starts)');
assert.strictEqual(byStarts[2].club, 'Klubb B', 'Klubb B third (2 starts)');

// Sort by topThree
var byTopThree = CS.rankClubs(stats, 'topThree', { minShooters: 0, minStarts: 0 });
assert.strictEqual(byTopThree[0].club, 'Klubb A', 'Klubb A first (3 top-3)');
assert.strictEqual(byTopThree[1].club, 'Klubb B', 'Klubb B second (1 top-3)');
assert.strictEqual(byTopThree[2].club, 'Klubb C', 'Klubb C third (0 top-3)');

// Ties broken alphabetically — create a tie
var tieStats = {
    'Zebra SK': { uniqueShooters: 5, totalStarts: 10, competitionsAttended: 3, topThree: 1, disciplinesRepresented: 2, classesRepresented: 2 },
    'Apple PK': { uniqueShooters: 5, totalStarts: 10, competitionsAttended: 3, topThree: 1, disciplinesRepresented: 2, classesRepresented: 2 }
};
var tied = CS.rankClubs(tieStats, 'uniqueShooters');
assert.strictEqual(tied[0].club, 'Apple PK', 'tie broken alphabetically: Apple before Zebra');

// Empty stats
assert.strictEqual(CS.rankClubs({}, 'uniqueShooters').length, 0, 'empty stats → empty array');

// Threshold filtering: minShooters=2 excludes Klubb B (1 shooter, 2 starts)
var filtered = CS.rankClubs(stats, 'uniqueShooters', { minShooters: 2, minStarts: 5 });
assert.strictEqual(filtered.length, 2, 'Klubb B excluded (1 shooter < 2, 2 starts < 5)');
assert.strictEqual(filtered[0].club, 'Klubb A');
assert.strictEqual(filtered[1].club, 'Klubb C');

// Threshold: minStarts=3 alone keeps Klubb A (5) and Klubb C (3), excludes Klubb B (2)
var filteredStarts = CS.rankClubs(stats, 'totalStarts', { minShooters: 100, minStarts: 3 });
assert.strictEqual(filteredStarts.length, 2, 'only clubs with ≥3 starts OR ≥100 shooters');
assert.strictEqual(filteredStarts[0].club, 'Klubb A');
assert.strictEqual(filteredStarts[1].club, 'Klubb C');

// Default thresholds (3 shooters OR 5 starts): only Klubb A passes (3 shooters, 5 starts)
var defaultFiltered = CS.rankClubs(stats, 'uniqueShooters');
assert.strictEqual(defaultFiltered.length, 1, 'default thresholds keep only Klubb A');
assert.strictEqual(defaultFiltered[0].club, 'Klubb A');

// ── computeYearOverYear ────────────────────────────────────────────────

var currentStats = {
    'Klubb A': { uniqueShooters: 10, totalStarts: 30 },
    'Klubb B': { uniqueShooters: 5, totalStarts: 15 },
    'Klubb C': { uniqueShooters: 8, totalStarts: 20 }
};
var previousStats = {
    'Klubb A': { uniqueShooters: 7, totalStarts: 25 },
    'Klubb B': { uniqueShooters: 5, totalStarts: 12 },
    'Klubb D': { uniqueShooters: 3, totalStarts: 8 }
};

var yoy = CS.computeYearOverYear(currentStats, previousStats);

// Find specific clubs
function findClub(arr, name) { return arr.filter(function (c) { return c.club === name; })[0]; }

var a = findClub(yoy, 'Klubb A');
assert.strictEqual(a.current, 10, 'Klubb A current: 10');
assert.strictEqual(a.previous, 7, 'Klubb A previous: 7');
assert.strictEqual(a.delta, 3, 'Klubb A delta: +3');
assert.strictEqual(a.isNew, false, 'Klubb A is not new');

var b = findClub(yoy, 'Klubb B');
assert.strictEqual(b.current, 5, 'Klubb B current: 5');
assert.strictEqual(b.previous, 5, 'Klubb B previous: 5');
assert.strictEqual(b.delta, 0, 'Klubb B delta: 0');
assert.strictEqual(b.isNew, false, 'Klubb B is not new');

var c = findClub(yoy, 'Klubb C');
assert.strictEqual(c.current, 8, 'Klubb C current: 8 (new club)');
assert.strictEqual(c.previous, 0, 'Klubb C previous: 0');
assert.strictEqual(c.delta, 8, 'Klubb C delta: +8');
assert.strictEqual(c.isNew, true, 'Klubb C is new');

var d = findClub(yoy, 'Klubb D');
assert.strictEqual(d.current, 0, 'Klubb D current: 0 (gone)');
assert.strictEqual(d.previous, 3, 'Klubb D previous: 3');
assert.strictEqual(d.delta, -3, 'Klubb D delta: -3');
assert.strictEqual(d.isNew, false, 'Klubb D is not new (had shooters before)');

// Total clubs: A, B, C, D
assert.strictEqual(yoy.length, 4, 'all 4 clubs across both years');

// Absolute increase, not percentage
assert.strictEqual(findClub(yoy, 'Klubb A').delta, 3, 'absolute delta (10-7=3), not percentage');

// Empty inputs
assert.strictEqual(CS.computeYearOverYear(null, null).length, 0, 'null inputs → empty');
assert.strictEqual(CS.computeYearOverYear({}, {}).length, 0, 'empty inputs → empty');
assert.strictEqual(CS.computeYearOverYear(currentStats, null).length, 3, 'null previous → all current clubs are new');

// Club with 0 shooters in one year
var zeroStats = { 'Klubb X': { uniqueShooters: 0, totalStarts: 0 } };
var zeroYoy = CS.computeYearOverYear(zeroStats, { 'Klubb X': { uniqueShooters: 5, totalStarts: 10 } });
var x = findClub(zeroYoy, 'Klubb X');
assert.strictEqual(x.current, 0, 'zero current shooters');
assert.strictEqual(x.previous, 5, 'previous had 5');
assert.strictEqual(x.delta, -5, 'delta: -5');

// ── renderLineChart ────────────────────────────────────────────────────

var chartData = [
    { year: 2021, shooters: 5, starts: 10 },
    { year: 2022, shooters: 8, starts: 15 },
    { year: 2023, shooters: 12, starts: 22 },
    { year: 2024, shooters: 10, starts: 20 },
    { year: 2025, shooters: 15, starts: 30 }
];

var chartSvg = CS.renderLineChart(chartData);
assert.ok(chartSvg.indexOf('<svg') !== -1, 'chart contains <svg>');
assert.ok(chartSvg.indexOf('<polyline') !== -1, 'chart contains <polyline>');
assert.ok(chartSvg.indexOf('role="img"') !== -1, 'chart has role="img"');
assert.ok(chartSvg.indexOf('aria-label') !== -1, 'chart has aria-label');

// Correct number of circles (one per data point, shooters line)
var circleCount = (chartSvg.match(/<circle/g) || []).length;
assert.ok(circleCount >= 5, 'at least 5 circles (one per year for shooters line)');

// With showStarts: second line → more circles
var chartWithStarts = CS.renderLineChart(chartData, { showStarts: true });
var circleCountWithStarts = (chartWithStarts.match(/<circle/g) || []).length;
assert.strictEqual(circleCountWithStarts, 10, '10 circles with showStarts (5 shooters + 5 starts)');

// Legend has both entries when showStarts
assert.ok(chartWithStarts.indexOf('Skyttere') !== -1, 'legend has "Skyttere"');
assert.ok(chartWithStarts.indexOf('Starter') !== -1, 'legend has "Starter"');

// Single data point → message, not SVG
var singlePoint = CS.renderLineChart([{ year: 2025, shooters: 10, starts: 20 }]);
assert.ok(singlePoint.indexOf('<svg') === -1, 'single data point → no SVG');
assert.ok(singlePoint.indexOf('Ikke nok data') !== -1, 'single data point → message');

// Empty data → message
var emptyChart = CS.renderLineChart([]);
assert.ok(emptyChart.indexOf('<svg') === -1, 'empty data → no SVG');
assert.ok(emptyChart.indexOf('Ikke nok data') !== -1, 'empty data → message');

// Null data → message
var nullChart = CS.renderLineChart(null);
assert.ok(nullChart.indexOf('Ikke nok data') !== -1, 'null data → message');

// Dots are focusable
assert.ok(chartSvg.indexOf('tabindex="0"') !== -1, 'chart dots are focusable (tabindex="0")');

// Dots have aria-label
assert.ok(chartSvg.indexOf('aria-label=') !== -1, 'chart dots have aria-label');

// ── renderMultiSeriesChart ─────────────────────────────────────────────

var multiSeries = [
    { label: 'Felt', color: 'var(--brand-accent)', points: [
        { year: 2021, value: 5 }, { year: 2022, value: 8 }, { year: 2023, value: 12 }
    ]},
    { label: 'Bane', color: '#4a90d9', points: [
        { year: 2021, value: 3 }, { year: 2022, value: 6 }, { year: 2023, value: 9 }
    ]}
];

var multiSvg = CS.renderMultiSeriesChart(multiSeries, { title: 'Test chart' });
assert.ok(multiSvg.indexOf('<svg') !== -1, 'multi-series chart contains <svg>');
assert.ok(multiSvg.indexOf('<polyline') !== -1, 'multi-series chart contains <polyline>');
assert.strictEqual((multiSvg.match(/<polyline/g) || []).length, 2, 'two polylines (one per series)');
assert.ok(multiSvg.indexOf('role="img"') !== -1, 'multi-series chart has role="img"');
assert.ok(multiSvg.indexOf('Felt') !== -1, 'legend has Felt');
assert.ok(multiSvg.indexOf('Bane') !== -1, 'legend has Bane');
assert.ok(multiSvg.indexOf('tabindex="0"') !== -1, 'multi-series dots are focusable');

// Single series with < 2 points → message
var shortSeries = [{ label: 'Felt', color: 'red', points: [{ year: 2025, value: 5 }] }];
assert.ok(CS.renderMultiSeriesChart(shortSeries).indexOf('Ikke nok data') !== -1, 'short series → message');

// Empty series → message
assert.ok(CS.renderMultiSeriesChart([]).indexOf('Ikke nok data') !== -1, 'empty series → message');

// ── effectiveClass / computeClassDistribution ─────────────────────────

var distRows = [
    // Gisle-pattern: klasseførende A starts + ikke-klasseførende A starts
    // (the latter remap to Åpen). Additive Åpen: he appears in both rows.
    { personId: 'g1', name: 'Gisle', club: 'Odda PK', discipline: 'Finfelt', class: 'A', applicableForClassification: true },
    { personId: 'g1', name: 'Gisle', club: 'Odda PK', discipline: 'Finfelt', class: 'A', applicableForClassification: true },
    { personId: 'g1', name: 'Gisle', club: 'Odda PK', discipline: 'Finfelt', class: 'A', applicableForClassification: false },
    { personId: 'g1', name: 'Gisle', club: 'Odda PK', discipline: 'Finfelt', class: 'A', applicableForClassification: false },
    { personId: 'g1', name: 'Gisle', club: 'Odda PK', discipline: 'Finfelt', class: 'A', applicableForClassification: false },
    // Modal wins over lowest: 3 B starts + 1 spurious C start (klasseførende)
    { personId: 'm1', name: 'Modal', club: 'Odda PK', discipline: 'Finfelt', class: 'B', applicableForClassification: true },
    { personId: 'm1', name: 'Modal', club: 'Odda PK', discipline: 'Finfelt', class: 'B', applicableForClassification: true },
    { personId: 'm1', name: 'Modal', club: 'Odda PK', discipline: 'Finfelt', class: 'B', applicableForClassification: true },
    { personId: 'm1', name: 'Modal', club: 'Odda PK', discipline: 'Finfelt', class: 'C', applicableForClassification: true },
    // Tie (1 start each) -> lowest (C) wins
    { personId: 't1', name: 'Tie', club: 'Odda PK', discipline: 'Grovfelt', class: 'B', applicableForClassification: true },
    { personId: 't1', name: 'Tie', club: 'Odda PK', discipline: 'Grovfelt', class: 'C', applicableForClassification: true },
    // Age class passes through untouched, even at ikke-klasseførende stevner
    { personId: 'a1', name: 'Age', club: 'Odda PK', discipline: 'Finfelt', class: 'Veteran 55', applicableForClassification: false },
    // Always-open øvelser: dummy-A remaps to Åpen even at klasseførende stevner
    { personId: 's1', name: 'Spes', club: 'Odda PK', discipline: 'Spesialpistol', class: 'A', applicableForClassification: true },
    { personId: 's2', name: 'T96', club: 'Odda PK', discipline: 'T96 fin', class: 'A', applicableForClassification: true },
    // Other club must be ignored; missing class skipped
    { personId: 'x1', name: 'X', club: 'Anna klubb', discipline: 'Finfelt', class: 'C', applicableForClassification: true },
    { personId: 'x2', name: 'Y', club: 'Odda PK', discipline: 'Finfelt', class: '', applicableForClassification: true }
];

var dist = CS.computeClassDistribution(distRows, 'Odda PK');

function distCell(disc, cls) {
    var hit = dist.filter(function (d) { return d.discipline === disc && d.class === cls; })[0];
    return hit || null;
}

// Finfelt: g1 has 2 klasseførende A starts (modal A); m1 has 3 B + 1 C (modal B);
// m1's starts are all attributed to his modal class B, and C (no modal
// shooters left) is not displayed at all.
assert.strictEqual(distCell('Finfelt', 'A').shooters, 1, 'Finfelt A: g1 (modal)');
assert.strictEqual(distCell('Finfelt', 'A').starts, 2, 'Finfelt A: g1 skill-class starts');
assert.strictEqual(distCell('Finfelt', 'B').shooters, 1, 'Finfelt B: m1 modal B (3 > 1)');
assert.strictEqual(distCell('Finfelt', 'B').starts, 4, 'Finfelt B: m1 starts attributed to modal (3 B + 1 C)');
assert.strictEqual(distCell('Finfelt', 'C'), null, 'Finfelt C: no modal shooters, no row');
assert.strictEqual(distCell('Finfelt', 'Åpen').shooters, 1, 'Finfelt Åpen: g1 additive (remapped starts)');
assert.strictEqual(distCell('Finfelt', 'Åpen').starts, 3, 'Finfelt Åpen: remapped starts raw');
assert.strictEqual(distCell('Finfelt', 'Veteran 55').shooters, 1, 'age class passes through at ikke-klasseførende');
assert.strictEqual(distCell('Finfelt', 'Veteran 55').starts, 1, 'age class starts raw');

// Grovfelt tie: lowest (C) wins -> C gets both starts attributed, B row gone
assert.strictEqual(distCell('Grovfelt', 'B'), null, 'Grovfelt B: no modal shooters, no row');
assert.strictEqual(distCell('Grovfelt', 'C').shooters, 1, 'Grovfelt C: tie-break lowest wins');
assert.strictEqual(distCell('Grovfelt', 'C').starts, 2, 'Grovfelt C: both starts attributed to modal');

// Always-open øvelser: no A row survives
assert.strictEqual(distCell('Spesialpistol', 'A'), null, 'Spesialpistol dummy-A remapped');
assert.strictEqual(distCell('Spesialpistol', 'Åpen').shooters, 1, 'Spesialpistol Åpen');
assert.strictEqual(distCell('T96 fin', 'A'), null, 'T96 fin dummy-A remapped');
assert.strictEqual(distCell('T96 fin', 'Åpen').shooters, 1, 'T96 fin Åpen');

// Other club and empty-class rows excluded (x1 is another club -> no
// Finfelt C row at all, asserted above; x2 skipped entirely)
assert.ok(!dist.some(function (d) { return d.starts === 0; }), 'empty-class row skipped entirely');

// Sorted by starts desc
for (var di = 1; di < dist.length; di++) {
    assert.ok(dist[di - 1].starts >= dist[di].starts, 'sorted by starts desc');
}

// effectiveClass is pure + exact about skill classes
assert.strictEqual(CS.effectiveClass({ class: 'A', applicableForClassification: false, discipline: 'Finfelt' }), 'Åpen');
assert.strictEqual(CS.effectiveClass({ class: 'D', applicableForClassification: true, discipline: 'Spesialrevolver' }), 'Åpen');
assert.strictEqual(CS.effectiveClass({ class: 'C', applicableForClassification: true, discipline: 'Finfelt' }), 'C');
assert.strictEqual(CS.effectiveClass({ class: 'Veteran 65', applicableForClassification: false, discipline: 'Finfelt' }), 'Veteran 65');
assert.strictEqual(CS.effectiveClass({ class: 'Åpen2', applicableForClassification: true, discipline: 'Revolverfelt-Rødpunkt' }), 'Åpen2');

// ── renderClassDistributionHtml ───────────────────────────────────────

var distHtml = CS.renderClassDistributionHtml([
    { discipline: 'Finfelt', class: 'A', shooters: 2, starts: 5 },
    { discipline: 'Finfelt', class: 'Åpen', shooters: 1, starts: 3 }
], 'Odda PK');
assert.ok(distHtml.indexOf('Klassefordeling') >= 0, 'card title present');
assert.ok(distHtml.indexOf('aria-label="Klassefordeling for Odda PK"') >= 0, 'table aria-label names club');
assert.ok(distHtml.indexOf('<details') >= 0 && distHtml.indexOf('årsskiftet') >= 0, 'disclaimer as details, year-free');
assert.ok(distHtml.indexOf('starter deres føres til samme klasse, og klasser uten tildelte skyttere vises ikke') >= 0, 'disclaimer notes starts follow modal class and empty classes are hidden');
assert.ok(distHtml.indexOf('Spesialpistol') >= 0 && distHtml.indexOf('T96 fin') >= 0, 'øvelse list generated from constant');
assert.ok(distHtml.indexOf('2026') < 0, 'no edition year in UI text');
assert.strictEqual(CS.renderClassDistributionHtml([], 'X'), '', 'empty distribution -> no card');

var evilDist = CS.renderClassDistributionHtml([
    { discipline: '<img src=x onerror=alert(1)>', class: 'A', shooters: 1, starts: 1 }
], 'Odda PK');
assert.ok(evilDist.indexOf('&lt;img') >= 0 && evilDist.indexOf('<img') < 0, 'discipline string is escaped');

// ── computeTopThreeRanking ────────────────────────────────────────────

var topRows = [
    // Alice: 2 in Finfelt A + 1 in Spesialpistol (dummy-A -> Åpen column)
    { personId: 'p1', name: 'Alice', club: 'K1', discipline: 'Finfelt', class: 'A', position: 1, applicableForClassification: true },
    { personId: 'p1', name: 'Alice', club: 'K1', discipline: 'Finfelt', class: 'A', position: 2, applicableForClassification: true },
    { personId: 'p1', name: 'Alice', club: 'K1', discipline: 'Spesialpistol', class: 'A', position: 3, applicableForClassification: true },
    // Bob: podiums are NOT deduped — A podium + remapped-Åpen podium both count
    { personId: 'p2', name: 'Bob', club: 'K1', discipline: 'Finfelt', class: 'A', position: 3, applicableForClassification: true },
    { personId: 'p2', name: 'Bob', club: 'K1', discipline: 'Finfelt', class: 'A', position: 1, applicableForClassification: false },
    // Carol: 4th place — not a top-3
    { personId: 'p3', name: 'Carol', club: 'K1', discipline: 'Finfelt', class: 'B', position: 4, applicableForClassification: true },
    // Other club ignored
    { personId: 'p9', name: 'X', club: 'K2', discipline: 'Finfelt', class: 'A', position: 1, applicableForClassification: true }
];

var ranking = CS.computeTopThreeRanking(topRows, 'K1', null);
assert.strictEqual(ranking.length, 2, 'only K1 shooters, only top-3');
assert.strictEqual(ranking[0].name, 'Alice');
assert.strictEqual(ranking[0].total, 3, 'Alice: 3 podiums');
assert.strictEqual(ranking[0].combos['Finfelt|A'], 2, 'per-combo counts');
assert.strictEqual(ranking[0].combos['Spesialpistol|Åpen'], 1, 'effective class names the combo');
assert.strictEqual(ranking[1].total, 2, 'Bob: no dedup — both podiums count');
assert.strictEqual(ranking[1].combos['Finfelt|Åpen'], 1, 'remapped podium lands in Åpen column');

// Position filter: 1/2/3 counts only that exact placement; null = all top-3
var p1Ranking = CS.computeTopThreeRanking(topRows, 'K1', 1);
assert.strictEqual(p1Ranking.length, 2, 'position 1: Alice and Bob each have one');
assert.strictEqual(p1Ranking[0].name, 'Alice');
assert.strictEqual(p1Ranking[0].total, 1, 'Alice: her position-1 Finfelt A row only');
assert.deepStrictEqual(p1Ranking[0].combos, { 'Finfelt|A': 1 }, 'Alice position-1 combo');
assert.strictEqual(p1Ranking[1].name, 'Bob');
assert.strictEqual(p1Ranking[1].total, 1, "Bob: ikke-klasseførende position-1 counts");
assert.strictEqual(p1Ranking[1].combos['Finfelt|Åpen'], 1, 'Bob position-1 combo');

var p2Ranking = CS.computeTopThreeRanking(topRows, 'K1', 2);
assert.strictEqual(p2Ranking.length, 1, 'zero-total shooters are not in the ranking');
assert.strictEqual(p2Ranking[0].name, 'Alice');
assert.strictEqual(p2Ranking[0].total, 1, 'Alice: her position-2 Finfelt A row');

var p3Ranking = CS.computeTopThreeRanking(topRows, 'K1', 3);
assert.strictEqual(p3Ranking.length, 2, 'position 3: both shooters present');
assert.strictEqual(p3Ranking[0].total, 1, 'Alice position-3 total');
assert.strictEqual(p3Ranking[0].combos['Spesialpistol|Åpen'], 1, 'Alice position-3 combo');
assert.strictEqual(p3Ranking[1].total, 1, 'Bob position-3 total');
assert.strictEqual(p3Ranking[1].combos['Finfelt|A'], 1, 'Bob position-3 combo');

// Tied positions both count (delt 2. plass)
var tieRanking = CS.computeTopThreeRanking([
    { personId: 'd1', name: 'D1', club: 'K1', discipline: 'Finfelt', class: 'A', position: 2, applicableForClassification: true },
    { personId: 'd2', name: 'D2', club: 'K1', discipline: 'Finfelt', class: 'A', position: 2, applicableForClassification: true }
], 'K1', null);
assert.strictEqual(tieRanking.length, 2, 'tied placement counts for both shooters');
assert.strictEqual(tieRanking[0].total, 1);
assert.strictEqual(tieRanking[1].total, 1);

// Ties in total sort by name
var sortRanking = CS.computeTopThreeRanking([
    { personId: 'z', name: 'Zed', club: 'K1', discipline: 'Finfelt', class: 'A', position: 3, applicableForClassification: true },
    { personId: 'a', name: 'Abe', club: 'K1', discipline: 'Grovfelt', class: 'B', position: 3, applicableForClassification: true }
], 'K1', null);
assert.deepStrictEqual(sortRanking.map(function (s) { return s.name; }), ['Abe', 'Zed'], 'total tie -> name order');

// ── renderTopThreeHtml ────────────────────────────────────────────────

var top3Ranking = [
    { personId: 'p1', name: 'Alice', total: 3, combos: { 'Finfelt|A': 2, 'Spesialpistol|Åpen': 1 } },
    { personId: 'p2', name: 'Bob', total: 2, combos: { 'Finfelt|A': 1, 'Finfelt|Åpen': 1 } }
];
var top3Html = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, {});
assert.ok(top3Html.indexOf('Flest topp-3 plasseringer') >= 0, 'card title');
assert.ok(top3Html.indexOf('aria-label="Flest topp-3 plasseringer i 2026 for K1"') >= 0, 'table aria-label names club and year');
assert.ok(top3Html.indexOf('ranking-card-table-wrap') >= 0, 'scroll wrapper present');
assert.ok(top3Html.indexOf('Totalt') >= 0, 'Totalt column header');
assert.ok(top3Html.indexOf('Finfelt A') < 0, 'combo headers hidden by default');
assert.ok(top3Html.indexOf('Spesialpistol Åpen') < 0, 'no combo headers by default (2)');
assert.ok(top3Html.indexOf('scope="row"') >= 0, 'Navn is a row header');
assert.ok(top3Html.indexOf('Vis alle øvelser') < 0, 'old combo cap toggle removed');
assert.ok(top3Html.indexOf('Vis øvelser') >= 0, 'øvelser reveal toggle present');
// Placement-mode group: 4 buttons, aria-pressed only on the active one
assert.ok(top3Html.indexOf('top3-mode-btn') >= 0, 'mode group rendered');
assert.strictEqual((top3Html.match(/data-mode="/g) || []).length, 4, 'four mode buttons');
assert.strictEqual((top3Html.match(/aria-pressed="true"/g) || []).length, 1, 'only active mode pressed');
assert.ok(top3Html.indexOf('data-mode="top3" aria-pressed="true"') >= 0, 'default mode active');
assert.ok(top3Html.indexOf('data-mode="p1" aria-pressed="false"') >= 0, 'inactive mode unpressed');
var p2ModeHtml = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, { mode: 'p2' });
assert.ok(p2ModeHtml.indexOf('data-mode="p2" aria-pressed="true"') >= 0, 'selected mode pressed');
assert.ok(p2ModeHtml.indexOf('data-mode="top3" aria-pressed="true"') < 0, 'default mode unpressed when p2 selected');
// showOvelser: true reveals ALL combo headers
var ovelserHtml = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, { showOvelser: true });
assert.ok(ovelserHtml.indexOf('Finfelt A') >= 0, 'combo headers revealed');
assert.ok(ovelserHtml.indexOf('Spesialpistol Åpen') >= 0, 'effective class header revealed');
assert.ok(ovelserHtml.indexOf('Skjul øvelser') >= 0, 'label flips when shown');
// Alternating-column shading on øvelse columns (class-based, never nth-child):
// odd-index visible combos get .top3-col-alt on their th and every td.
var altRanking = [{ personId: 'a1', name: 'Alt', total: 6, combos: { 'Finfelt|A': 1, 'Grovfelt|B': 2, 'Militærfelt|C': 3 } }];
var altHtml = CS.renderTopThreeHtml(altRanking, 'K1', 2026, { showOvelser: true });
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score top3-col-alt">Grovfelt B') >= 0, 'odd-index combo header shaded');
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score">Finfelt A') >= 0, 'first combo header unshaded');
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score top3-col-alt">Finfelt A') < 0, 'first combo header never shaded');
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score">Militærfelt C') >= 0, 'third combo header unshaded');
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score top3-col-alt">Militærfelt C') < 0, 'third combo header never shaded');
assert.ok(altHtml.indexOf('<td class="ranking-score top3-col-alt">2</td>') >= 0, 'shaded combo column body cells carry the class');
assert.ok(altHtml.indexOf('<td class="ranking-score">1</td>') >= 0, 'unshaded combo body cells stay plain');
assert.ok(altHtml.indexOf('<td class="ranking-score">3</td>') >= 0, 'unshaded combo body cells stay plain (2)');
assert.strictEqual((altHtml.match(/top3-col-alt/g) || []).length, 2, 'exactly one th and one td shaded (single shooter, one odd combo)');
assert.strictEqual(CS.renderTopThreeHtml(altRanking, 'K1', 2026, {}).indexOf('top3-col-alt'), -1, 'no shading when øvelser hidden');
// Row paging: 10 shown, toggle appears beyond that
var manyRows = [];
for (var ri = 0; ri < 14; ri++) {
    manyRows.push({ personId: 'r' + ri, name: 'Skytter ' + ri, total: 1, combos: { 'Finfelt|A': 1 } });
}
var pagedHtml = CS.renderTopThreeHtml(manyRows, 'K1', 2026, {});
assert.ok(pagedHtml.indexOf('Vis alle (14)') >= 0, 'row paging toggle');
assert.ok(pagedHtml.indexOf('Skytter 13') < 0, 'only first 10 rows shown');
var expandedRowsHtml = CS.renderTopThreeHtml(manyRows, 'K1', 2026, { showAllShooters: true });
assert.ok(expandedRowsHtml.indexOf('aria-expanded="true"') >= 0, 'row toggle exposes state');
assert.ok(expandedRowsHtml.indexOf('Skytter 13') >= 0, 'expanded shows all rows');
// No combo cap: 14 combos all rendered when øvelser shown (zero-padding makes
// the alphabetical tie order deterministic)
var manyCombos = [{ personId: 'c1', name: 'C1', total: 14, combos: {} }];
for (var ci = 0; ci < 14; ci++) {
    manyCombos[0].combos['Øvelse ' + (ci < 10 ? '0' + ci : ci) + '|A'] = 1;
}
var allCombosHtml = CS.renderTopThreeHtml(manyCombos, 'K1', 2026, { showOvelser: true });
for (var ai = 0; ai < 14; ai++) {
    assert.ok(allCombosHtml.indexOf('Øvelse ' + (ai < 10 ? '0' + ai : ai) + ' A') >= 0, 'all combo headers shown, no cap (' + ai + ')');
}
assert.ok(allCombosHtml.indexOf('Vis alle øvelser') < 0 && allCombosHtml.indexOf('Vis færre øvelser') < 0, 'cap toggles removed entirely');
assert.strictEqual(CS.renderTopThreeHtml([], 'K1', 2026, {}), '', 'empty ranking -> no card');

var evilTop3 = CS.renderTopThreeHtml(
    [{ personId: 'e', name: '<img src=x onerror=alert(1)>', total: 1, combos: { '<b>Finfelt</b>|A': 1 } }], 'K1', 2026, { showOvelser: true });
assert.ok(evilTop3.indexOf('&lt;img') >= 0 && evilTop3.indexOf('<img') < 0, 'name escaped');
assert.ok(evilTop3.indexOf('&lt;b&gt;Finfelt') >= 0, 'combo label escaped');

// ── empty ranking in a non-default mode keeps the card shell ──────────
// (mode buttons and øvelser toggle must stay reachable in-card)
var emptyP2Html = CS.renderTopThreeHtml([], 'K1', 2026, { mode: 'p2', showOvelser: false, showAllShooters: false });
assert.ok(emptyP2Html.indexOf('data-card="top3"') >= 0, 'empty p2 mode keeps card shell');
assert.ok(emptyP2Html.indexOf('data-mode="p2" aria-pressed="true"') >= 0, 'shell keeps current mode pressed');
assert.ok(emptyP2Html.indexOf('data-mode="top3" aria-pressed="false"') >= 0, 'shell keeps other modes unpressed');
assert.ok(emptyP2Html.indexOf('Vis øvelser') >= 0, 'shell keeps øvelser toggle');
assert.ok(emptyP2Html.indexOf('ranking-status-msg') >= 0, 'empty-state uses status msg class');
assert.ok(emptyP2Html.indexOf('Ingen 2. plasser for denne klubben i 2026.') >= 0, 'empty-state line names mode and year');
var emptyP3Html = CS.renderTopThreeHtml([], 'K1', 2026, { mode: 'p3', showOvelser: false, showAllShooters: false });
assert.ok(emptyP3Html.indexOf('Ingen 3. plasser for denne klubben i 2026.') >= 0, 'p3 empty-state names 3. plasser');
assert.ok(emptyP3Html.indexOf('data-mode="p3" aria-pressed="true"') >= 0, 'p3 shell keeps mode pressed');
// Initial render (default mode, øvelser hidden) with no data: no card at all
assert.strictEqual(CS.renderTopThreeHtml([], 'K1', 2026, {}), '', 'empty ranking + default mode + øvelser hidden -> no card');
// øvelser toggle carries a stable id so the delegated handler can refocus it
assert.ok(top3Html.indexOf('id="top3-ovelser-btn"') >= 0, 'øvelser toggle has stable id for refocus');

console.log('club-stats.test.js: all tests passed');
