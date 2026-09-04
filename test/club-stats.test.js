'use strict';
var assert = require('node:assert');
var CS = require('../public/js/club-stats-page.js');

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

console.log('club-stats.test.js: all tests passed');
