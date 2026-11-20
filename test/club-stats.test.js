'use strict';
var assert = require('node:assert');
var CS = require('../public/js/club-stats-page.js');
global.StandplassStevnerPage = require('../public/js/stevner-page.js');
// Cross-module globals the page modules reference at call time (same
// pattern as every other page test in this repo).
global.StandplassDataTable = require('../public/js/data-table.js');

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
    { label: 'Bane', color: 'var(--chart-blue)', points: [
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

// Plot-area inset: the first point sits half an x-step right of the y-axis
// (W=400, PL=44, PR=12 → step 114.67 → first cx ≈ 101.3), and the last
// point half a step from the right edge.
(function () {
    var circles = multiSvg.match(/<circle[^>]*cx="([0-9.]+)"/g) || [];
    assert.ok(circles.length >= 2, 'multi-series chart has dots');
    var firstCx = Number(/cx="([0-9.]+)"/.exec(circles[0])[1]);
    var lastCx = Number(/cx="([0-9.]+)"/.exec(circles[circles.length - 1])[1]);
    assert.ok(firstCx > 100, 'first dot clears the y-axis (got ' + firstCx + ')');
    assert.ok(lastCx < 389, 'last dot clears the right edge (got ' + lastCx + ')');
})();

// Dashed series + line-swatches legend: series[].dash renders a dashed
// polyline; legend items are line swatches, not round dots.
(function () {
    var dashSeries = [
        { label: 'Gjennomsnitt', color: 'var(--chart-blue)', dash: false, points: [
            { year: 2021, value: 5 }, { year: 2022, value: 8 }, { year: 2023, value: 12 }
        ]},
        { label: 'Median', color: 'var(--chart-blue)', dash: true, points: [
            { year: 2021, value: 4 }, { year: 2022, value: 7 }, { year: 2023, value: 10 }
        ]}
    ];
    var svg = CS.renderMultiSeriesChart(dashSeries, { title: 'Dash test' });
    var polys = svg.match(/<polyline[^>]*>/g) || [];
    assert.strictEqual(polys.length, 2, 'two polylines');
    assert.ok(polys[0].indexOf('stroke-dasharray') === -1, 'first series is solid');
    assert.ok(polys[1].indexOf('stroke-dasharray="4 3"') !== -1, 'dashed series carries stroke-dasharray="4 3"');
    assert.ok(svg.indexOf('chart-legend-swatch') !== -1, 'legend uses line swatches');
    assert.ok(svg.indexOf('chart-legend-swatch--dashed') !== -1, 'dashed legend swatch marked');
    assert.ok(svg.indexOf('chart-legend-dot') === -1, 'no round legend dots in multi-series charts');
    // Slimmer styling: dot radius 2.5, stroke width 1.25.
    assert.ok(/<circle[^>]*r="2.5"/.test(svg), 'dots are r=2.5');
    assert.ok(/stroke-width="1.25"/.test(svg), 'lines are 1.25 wide');
})();

// yClamp: y-axis bases on the data range (min-2 .. max+2), not 0..max —
// for age-style values where a zero baseline wastes the plot.
(function () {
    var series = [
        { label: 'Snitt', color: 'var(--chart-blue)', points: [
            { year: 2021, value: 44 }, { year: 2022, value: 48 }
        ]}
    ];
    var svg = CS.renderMultiSeriesChart(series, { title: 'Clamp', yClamp: true });
    assert.ok(svg.indexOf('>42<') !== -1, 'y-axis bottom label is the clamped min (42)');
    assert.ok(svg.indexOf('>50<') !== -1, 'y-axis top label is the clamped max (50)');
    assert.ok(svg.indexOf('>0<') === -1, 'no zero label on a clamped axis');
    assert.ok(svg.indexOf('NaN') === -1, 'no NaN positions');
})();

// yClamp with flat data (all values equal): degenerate range must not
// produce NaN or divide-by-zero — the `range || 1` guard.
(function () {
    var series = [
        { label: 'Flat', color: 'var(--chart-blue)', points: [
            { year: 2021, value: 46 }, { year: 2022, value: 46 }, { year: 2023, value: 46 }
        ]}
    ];
    var svg = CS.renderMultiSeriesChart(series, { title: 'Flat clamp', yClamp: true });
    assert.ok(svg.indexOf('NaN') === -1, 'flat clamped data renders without NaN');
    assert.ok(/<circle[^>]*cy="[0-9.]+"/.test(svg), 'flat clamped data still renders dots');
})();

// valueFormat: per-dot value labels go through the formatter.
(function () {
    var series = [
        { label: 'Alder', color: 'var(--chart-blue)', points: [
            { year: 2021, value: 47.25 }, { year: 2022, value: 48 }
        ]}
    ];
    var svg = CS.renderMultiSeriesChart(series, {
        title: 'Fmt', yClamp: true,
        valueFormat: function (v) { return String(Math.round(v * 10) / 10); }
    });
    assert.ok(svg.indexOf('>47.3<') !== -1, 'value label is formatted (47.25 → 47.3)');
})();

// Label placement: the upper series labels ABOVE its dots, the lower
// series BELOW its dots; at a same-point collision the series that is
// mostly above (higher mean value) wins the above slot.
(function () {
    function parse(svg) {
        var dots = [], labels = [];
        (svg.match(/<circle[^>]*class="club-chart-dot"[^>]*>/g) || []).forEach(function (m) {
            dots.push({ x: Number(/cx="([0-9.]+)"/.exec(m)[1]), y: Number(/cy="([0-9.]+)"/.exec(m)[1]),
                       color: /fill="([^"]+)"/.exec(m)[1] });
        });
        (svg.match(/<text[^>]*text-anchor="middle"[^>]*>[0-9.]+<\/text>/g) || []).forEach(function (m) {
            labels.push({ x: Number(/ x="([0-9.]+)"/.exec(m)[1]), y: Number(/ y="([0-9.]+)"/.exec(m)[1]),
                          color: /fill="([^"]+)"/.exec(m)[1] });
        });
        return { dots: dots, labels: labels };
    }
    function labelAt(parsed, x, color) {
        var l = parsed.labels.filter(function (t) { return Math.abs(t.x - x) < 0.05 && t.color === color; })[0];
        assert.ok(l, 'label found at x=' + x + ' for ' + color);
        return l.y;
    }
    function dotAt(parsed, x, color) {
        var d = parsed.dots.filter(function (c) { return Math.abs(c.x - x) < 0.05 && c.color === color; })[0];
        assert.ok(d, 'dot found at x=' + x + ' for ' + color);
        return d.y;
    }

    // Clear separation: Felt always above Bane → Felt labels above dots,
    // Bane labels below dots.
    var svg = CS.renderMultiSeriesChart([
        { label: 'Felt', color: 'var(--brand-accent)', points: [{ year: 2021, value: 50 }, { year: 2022, value: 52 }] },
        { label: 'Bane', color: 'var(--chart-blue)', points: [{ year: 2021, value: 40 }, { year: 2022, value: 42 }] }
    ], { title: 'Label placement' });
    var p = parse(svg);
    p.dots.forEach(function (d) {
        var ly = labelAt(p, d.x, d.color);
        if (d.color === 'var(--brand-accent)') {
            assert.ok(ly < d.y, 'upper series label sits above its dot (y ' + ly + ' vs ' + d.y + ')');
        } else {
            assert.ok(ly > d.y, 'lower series label sits below its dot (y ' + ly + ' vs ' + d.y + ')');
        }
    });

    // Same-point collision in 2022 (both 50): Felt's mean (52.5) is above
    // Bane's (47.5), so Felt takes the above slot, Bane below.
    var svg2 = CS.renderMultiSeriesChart([
        { label: 'Felt', color: 'var(--brand-accent)', points: [{ year: 2021, value: 55 }, { year: 2022, value: 50 }] },
        { label: 'Bane', color: 'var(--chart-blue)', points: [{ year: 2021, value: 45 }, { year: 2022, value: 50 }] }
    ], { title: 'Collision' });
    var p2 = parse(svg2);
    var colX = p2.dots[2].x; // 2022 position (second of four dots)
    var feltLy = labelAt(p2, colX, 'var(--brand-accent)');
    var baneLy = labelAt(p2, colX, 'var(--chart-blue)');
    var colY = dotAt(p2, colX, 'var(--brand-accent)');
    assert.ok(feltLy < colY, 'mostly-above series labels above the shared point');
    assert.ok(baneLy > colY, 'other series labels below the shared point');
})();

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
var tagsStart = distHtml.indexOf('apen-disc-tags');
assert.ok(tagsStart >= 0, 'chip block present in disclaimer');
var tagsBlock = distHtml.substring(tagsStart, distHtml.indexOf('</div>', tagsStart));
assert.ok(tagsBlock.indexOf(';') < 0, 'no separator garbage inside chip block');
assert.strictEqual(distHtml.split('class="apen-disc-tag"').length - 1, CS.ALWAYS_OPEN_DISCIPLINES.length,
    'one chip per always-open øvelse');
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
// opts: { mode, hidden: {colKey: bool}, sort: {key, dir} } — the shared
// table base contract. Øvelse columns are defaultHidden; revealing them
// is a false entry in the hidden map (the column picker's state).

var top3Ranking = [
    { personId: 'p1', name: 'Alice', total: 3, combos: { 'Finfelt|A': 2, 'Spesialpistol|Åpen': 1 } },
    { personId: 'p2', name: 'Bob', total: 2, combos: { 'Finfelt|A': 1, 'Finfelt|Åpen': 1 } }
];
function showAllCombos(ranking) {
    var hidden = {};
    var totals = {};
    ranking.forEach(function (s) {
        Object.keys(s.combos).forEach(function (k) { totals[k] = (totals[k] || 0) + s.combos[k]; });
    });
    Object.keys(totals).forEach(function (k) { hidden['combo|' + k] = false; });
    return hidden;
}

var top3Html = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, {});
assert.ok(top3Html.indexOf('Flest topp-3 plasseringer') >= 0, 'card title');
assert.ok(top3Html.indexOf('aria-label="Flest topp-3 plasseringer i 2026 for K1"') >= 0, 'table aria-label names club and year');
assert.ok(top3Html.indexOf('ranking-card-table-wrap') >= 0, 'scroll wrapper present');
assert.ok(top3Html.indexOf('Totalt') >= 0, 'Totalt column header');
assert.ok(top3Html.indexOf('Finfelt A') < 0, 'combo headers hidden by default');
assert.ok(top3Html.indexOf('Spesialpistol Åpen') < 0, 'no combo headers by default (2)');
assert.ok(top3Html.indexOf('scope="row"') >= 0, 'Navn is a row header');
assert.ok(top3Html.indexOf('Vis alle øvelser') < 0, 'old combo cap toggle removed');
assert.ok(top3Html.indexOf('Vis øvelser') < 0, 'øvelser reveal toggle replaced by the column picker');
assert.ok(top3Html.indexOf('data-dt-picker') >= 0, 'column picker button (Kolonner) present');
assert.ok(top3Html.indexOf('dt-picker-anchor') >= 0, 'picker scaffold anchor present');
assert.ok(top3Html.indexOf('3. plass</button><button type="button" class="dt-picker-btn"') !== -1
    && top3Html.indexOf('Kolonner</button><div class="dt-picker-anchor"></div></div>') !== -1,
    'picker button + anchor sit inline in the mode row');
assert.ok(top3Html.indexOf('dt-toolbar') === -1, 'no separate toolbar row above the table');
assert.ok(top3Html.indexOf('data-dt-sort="name"') >= 0, 'Navn column sortable');
assert.ok(top3Html.indexOf('data-dt-sort="total"') >= 0, 'Totalt column sortable');
assert.ok(top3Html.indexOf('aria-sort="descending"') >= 0, 'Totalt marked as the designated default sort (desc)');
assert.ok(top3Html.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><th scope="row">Alice</th>') >= 0,
    'page order stands until a sort is set');
// Placement-mode group: 4 buttons, aria-pressed only on the active one
assert.ok(top3Html.indexOf('top3-mode-btn') >= 0, 'mode group rendered');
assert.strictEqual((top3Html.match(/data-mode="/g) || []).length, 4, 'four mode buttons');
assert.strictEqual((top3Html.match(/aria-pressed="true"/g) || []).length, 1, 'only active mode pressed');
assert.ok(top3Html.indexOf('data-mode="top3" aria-pressed="true"') >= 0, 'default mode active');
assert.ok(top3Html.indexOf('data-mode="p1" aria-pressed="false"') >= 0, 'inactive mode unpressed');
var p2ModeHtml = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, { mode: 'p2' });
assert.ok(p2ModeHtml.indexOf('data-mode="p2" aria-pressed="true"') >= 0, 'selected mode pressed');
assert.ok(p2ModeHtml.indexOf('data-mode="top3" aria-pressed="true"') < 0, 'default mode unpressed when p2 selected');
// hidden map with false entries reveals the øvelse columns
var ovelserHtml = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, { hidden: showAllCombos(top3Ranking) });
assert.ok(ovelserHtml.indexOf('Finfelt A') >= 0, 'combo headers revealed');
assert.ok(ovelserHtml.indexOf('Spesialpistol Åpen') >= 0, 'effective class header revealed');
assert.ok(ovelserHtml.indexOf('data-dt-sort="combo|Finfelt|A"') >= 0, 'øvelse columns are sortable');
// Alternating-column shading on øvelse columns (class-based, never nth-child):
// every other VISIBLE combo column gets .top3-col-alt on its th and tds.
var altRanking = [{ personId: 'a1', name: 'Alt', total: 6, combos: { 'Finfelt|A': 1, 'Grovfelt|B': 2, 'Militærfelt|C': 3 } }];
var altHtml = CS.renderTopThreeHtml(altRanking, 'K1', 2026, { hidden: showAllCombos(altRanking) });
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score top3-col-alt"><button type="button" class="dt-sort-btn" data-dt-sort="combo|Grovfelt|B">Grovfelt B') >= 0, 'odd-index combo header shaded');
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="combo|Finfelt|A">Finfelt A') >= 0, 'first combo header unshaded');
assert.ok(altHtml.indexOf('top3-col-alt"><button type="button" class="dt-sort-btn" data-dt-sort="combo|Finfelt|A">') < 0, 'first combo header never shaded');
assert.ok(altHtml.indexOf('<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="combo|Militærfelt|C">Militærfelt C') >= 0, 'third combo header unshaded');
assert.ok(altHtml.indexOf('top3-col-alt"><button type="button" class="dt-sort-btn" data-dt-sort="combo|Militærfelt|C">') < 0, 'third combo header never shaded');
assert.ok(altHtml.indexOf('<td class="ranking-score top3-col-alt">2</td>') >= 0, 'shaded combo column body cells carry the class');
assert.ok(altHtml.indexOf('<td class="ranking-score">1</td>') >= 0, 'unshaded combo body cells stay plain');
assert.ok(altHtml.indexOf('<td class="ranking-score">3</td>') >= 0, 'unshaded combo body cells stay plain (2)');
assert.strictEqual((altHtml.match(/top3-col-alt/g) || []).length, 2, 'exactly one th and one td shaded (single shooter, one odd combo)');
// Picker subsets: shading re-flows over the VISIBLE combos — hiding the
// shaded column shades the next visible one, so the every-other-column
// accent survives any selection. (comboOrder is total-desc here:
// Militærfelt C, Grovfelt B, Finfelt A.)
var subsetHidden = showAllCombos(altRanking);
subsetHidden['combo|Grovfelt|B'] = true;
var subsetHtml = CS.renderTopThreeHtml(altRanking, 'K1', 2026, { hidden: subsetHidden });
assert.ok(subsetHtml.indexOf('<th scope="col" class="ranking-score top3-col-alt"><button type="button" class="dt-sort-btn" data-dt-sort="combo|Finfelt|A">Finfelt A') >= 0,
    'hiding the shaded combo shades the next visible combo');
assert.ok(subsetHtml.indexOf('<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="combo|Militærfelt|C">Militærfelt C') >= 0,
    'first visible combo stays unshaded');
assert.strictEqual((subsetHtml.match(/top3-col-alt/g) || []).length, 2,
    'exactly one th + one td shaded in the subset render');
assert.strictEqual(CS.renderTopThreeHtml(altRanking, 'K1', 2026, {}).indexOf('top3-col-alt'), -1, 'no shading when øvelser hidden');
// Row paging: all rows rendered, no toggle
var manyRows = [];
for (var ri = 0; ri < 14; ri++) {
    manyRows.push({ personId: 'r' + ri, name: 'Skytter ' + ri, total: 1, combos: { 'Finfelt|A': 1 } });
}
var pagedHtml = CS.renderTopThreeHtml(manyRows, 'K1', 2026, {});
assert.ok(pagedHtml.indexOf('Skytter 13') >= 0, 'all rows rendered, no row paging');
assert.ok(pagedHtml.indexOf('top3-row-toggle') < 0 && pagedHtml.indexOf('Vis alle (') < 0, 'no row paging toggle');
assert.ok(pagedHtml.indexOf('club-stats-list-scroll') >= 0, 'table region gets the scroll cap');
// No combo cap: 14 combos all rendered when shown (zero-padding makes
// the alphabetical tie order deterministic)
var manyCombos = [{ personId: 'c1', name: 'C1', total: 14, combos: {} }];
var allCombosHidden = {};
for (var ci = 0; ci < 14; ci++) {
    manyCombos[0].combos['Øvelse ' + (ci < 10 ? '0' + ci : ci) + '|A'] = 1;
    allCombosHidden['combo|Øvelse ' + (ci < 10 ? '0' + ci : ci) + '|A'] = false;
}
var allCombosHtml = CS.renderTopThreeHtml(manyCombos, 'K1', 2026, { hidden: allCombosHidden });
for (var ai = 0; ai < 14; ai++) {
    assert.ok(allCombosHtml.indexOf('Øvelse ' + (ai < 10 ? '0' + ai : ai) + ' A') >= 0, 'all combo headers shown, no cap (' + ai + ')');
}
assert.ok(allCombosHtml.indexOf('Vis alle øvelser') < 0 && allCombosHtml.indexOf('Vis færre øvelser') < 0, 'cap toggles removed entirely');
assert.strictEqual(CS.renderTopThreeHtml([], 'K1', 2026, {}), '', 'empty ranking -> no card');

var evilTop3 = CS.renderTopThreeHtml(
    [{ personId: 'e', name: '<img src=x onerror=alert(1)>', total: 1, combos: { '<b>Finfelt</b>|A': 1 } }], 'K1', 2026,
    { hidden: { 'combo|<b>Finfelt</b>|A': false } });
assert.ok(evilTop3.indexOf('&lt;img') >= 0 && evilTop3.indexOf('<img') < 0, 'name escaped');
assert.ok(evilTop3.indexOf('&lt;b&gt;Finfelt') >= 0, 'combo label escaped');

// ── empty ranking in a non-default mode keeps the card shell ──────────
// (mode buttons must stay reachable in-card)
var emptyP2Html = CS.renderTopThreeHtml([], 'K1', 2026, { mode: 'p2' });
assert.ok(emptyP2Html.indexOf('data-card="top3"') >= 0, 'empty p2 mode keeps card shell');
assert.ok(emptyP2Html.indexOf('data-mode="p2" aria-pressed="true"') >= 0, 'shell keeps current mode pressed');
assert.ok(emptyP2Html.indexOf('data-mode="top3" aria-pressed="false"') >= 0, 'shell keeps other modes unpressed');
assert.ok(emptyP2Html.indexOf('ranking-status-msg') >= 0, 'empty-state uses status msg class');
assert.ok(emptyP2Html.indexOf('Ingen 2. plasser for denne klubben i 2026.') >= 0, 'empty-state line names mode and year');
var emptyP3Html = CS.renderTopThreeHtml([], 'K1', 2026, { mode: 'p3' });
assert.ok(emptyP3Html.indexOf('Ingen 3. plasser for denne klubben i 2026.') >= 0, 'p3 empty-state names 3. plasser');
assert.ok(emptyP3Html.indexOf('data-mode="p3" aria-pressed="true"') >= 0, 'p3 shell keeps mode pressed');
// Initial render (default mode, no column choices) with no data: no card at all
assert.strictEqual(CS.renderTopThreeHtml([], 'K1', 2026, {}), '', 'empty ranking + default mode + no column choices -> no card');
// A column choice made earlier keeps the shell reachable in-card
assert.ok(CS.renderTopThreeHtml([], 'K1', 2026, { hidden: { 'combo|Finfelt|A': false } }).indexOf('data-card="top3"') >= 0,
    'empty ranking + column choices -> card shell kept');

// Sorting survives the state→render→wire round-trip (Review Focus #3):
// the page persists the sort in top3State and passes the same state back.
// The # column is each shooter's RANK (page-order placement) — it travels
// with the row under sorting instead of renumbering.
var ascTop3 = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, { sort: { key: 'total', dir: 'asc' } });
assert.ok(ascTop3.indexOf('<tr data-dt-row="1"><td class="ranking-rank">2</td><th scope="row">Bob</th>') >= 0,
    'asc sort: Bob leads but keeps his rank (2)');
assert.ok(ascTop3.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><th scope="row">Alice</th>') >= 0,
    'asc sort: Alice is second but keeps her rank (1)');
assert.ok(ascTop3.indexOf('aria-sort="ascending"') >= 0, 'active sort marked ascending');
var ascAgain = CS.renderTopThreeHtml(top3Ranking, 'K1', 2026, { sort: { key: 'total', dir: 'asc' } });
assert.ok(ascAgain.indexOf('<tr data-dt-row="1"><td class="ranking-rank">2</td><th scope="row">Bob</th>') >= 0,
    'sort survives a re-render with the same state');

// ── scroll-confined table cards (toplists + per-club lists) ──────────
// Every klubbstatistikk table renders all rows (no paging, no "Vis
// alle") inside .club-stats-list-scroll, whose max-height comes from
// the user's "Rader" setting. tableHtml is the only table source since
// batch 1 — the old headHtml/renderRow path is deleted.
var expRows = [];
for (var ei = 0; ei < 14; ei++) { expRows.push({ club: 'Klubb ' + ei, value: 100 - ei }); }
var expColumns = [
    { key: 'rank', label: '#', align: 'center' },
    { key: 'club', label: 'Klubb' },
    { key: 'value', label: 'starter', align: 'right' }
];
var expSpec = {
    columns: expColumns,
    rows: expRows.map(function (r, i) { return { rank: i + 1, club: r.club, value: r.value }; }),
    ariaLabel: 'Test toplist 2026'
};
var expCard = CS.buildTableCard({
    id: 'test-list', title: 'Test toplist', rows: expSpec.rows,
    tableHtml: StandplassDataTable.renderTable('test-list', expSpec, { hidden: {}, runtimeHidden: [], widthTier: null }),
    cardClass: 'club-stats-toplist'
});
assert.ok(expCard.indexOf('Klubb 13') >= 0, 'table card: all rows rendered');
assert.ok(expCard.indexOf('Vis alle') < 0 && expCard.indexOf('data-expand-list') < 0, 'table card: no expand toggle');
assert.ok(expCard.indexOf('data-dt-id="test-list"') >= 0, 'table card: table carries data-dt-id');
var expWrapIdx = expCard.indexOf('club-stats-list-scroll');
var expTableIdx = expCard.indexOf('<table');
assert.ok(expWrapIdx >= 0 && expWrapIdx < expTableIdx, 'table card: table wrapped in scroll region');
var expShort = CS.buildTableCard({
    id: 'short-list', title: 'Short', rows: expSpec.rows.slice(0, 4),
    tableHtml: StandplassDataTable.renderTable('short-list',
        { columns: expColumns, rows: expSpec.rows.slice(0, 4), ariaLabel: 'Short' },
        { hidden: {}, runtimeHidden: [], widthTier: null }),
    cardClass: 'club-stats-toplist'
});
assert.ok(expShort.indexOf('Klubb 3') >= 0, 'table card: all short rows rendered');
assert.strictEqual(CS.buildTableCard({
    id: 'empty-list', title: 'Empty', rows: [],
    tableHtml: StandplassDataTable.renderTable('empty-list',
        { columns: expColumns, rows: [], ariaLabel: 'Empty' },
        { hidden: {}, runtimeHidden: [], widthTier: null }),
    cardClass: 'club-stats-toplist'
}), '', 'table card: empty rows -> no card');
var expEvil = CS.buildTableCard({
    id: 'evil-list', title: '<img src=x>', rows: expSpec.rows.slice(0, 2),
    tableHtml: StandplassDataTable.renderTable('evil-list',
        { columns: expColumns, rows: expSpec.rows.slice(0, 2), ariaLabel: 'XSS <script>' },
        { hidden: {}, runtimeHidden: [], widthTier: null }),
    cardClass: 'club-stats-toplist'
});
assert.ok(expEvil.indexOf('&lt;img') >= 0 && expEvil.indexOf('&lt;script') >= 0, 'table card: title/ariaLabel escaped');

// ── Drilldown tables through the shared base (batch 1) ─────────────────
// Pure spec builders feeding renderTable: mostActiveTableSpec,
// disciplineTableSpec, organizedCompsTableSpec, classDistTableSpec
// (each takes clubName last, for the aria-label). Goldens pin today's
// markup plus sort buttons on the opted-in columns.
var ddState = { hidden: {}, runtimeHidden: [], widthTier: null };
function ddSorted(spec, key, dir) {
    return StandplassDataTable.renderTable('dd-sort', spec,
        { sort: { key: key, dir: dir }, hidden: {}, runtimeHidden: [], widthTier: null });
}

// Mest aktive skyttere
// Activity data through the real path (computeShooterActivity): rows
// from other clubs and rows without personId don't count; a shooter's
// stevner are unique competitionIds, klubbstevner the ones the club
// itself organized (clubCompIds); starts split on the same membership.
// A start without a competitionId still counts toward starter.
var maActivity = CS.computeShooterActivity([
    { personId: 'p1', name: 'Alice', club: 'Klubb X', competitionId: 'c1' },
    { personId: 'p1', name: 'Alice', club: 'Klubb X', competitionId: 'c1' },
    { personId: 'p1', name: 'Alice', club: 'Klubb X', competitionId: 'c2' },
    { personId: 'p2', name: 'Bob', club: 'Klubb X', competitionId: 'c2' },
    { personId: 'p2', name: 'Bob', club: 'Klubb X' },
    { personId: 'p3', name: 'Eve', club: 'Annen klubb', competitionId: 'c1' },
    { name: 'Uten id', club: 'Klubb X', competitionId: 'c1' }
], 'Klubb X', { c1: true });
assert.strictEqual(maActivity.length, 2, 'mest aktive data: other-club shooters and personId-less rows excluded');
assert.deepEqual(maActivity[0], { name: 'Alice', stevner: 2, clubStevner: 1, otherStevner: 1, starts: 3, clubStarts: 2, otherStarts: 1 },
    'mest aktive data: Alice — unique stevner, club split, start-without-competitionId counted only as a start');
assert.deepEqual(maActivity[1], { name: 'Bob', stevner: 1, clubStevner: 0, otherStevner: 1, starts: 2, clubStarts: 0, otherStarts: 2 },
    'mest aktive data: Bob — competitionId-less start is an andre start, no stevne');

var maSpec = CS.mostActiveTableSpec(maActivity, 'Klubb X');
assert.strictEqual(maSpec.ariaLabel, 'Mest aktive skyttere for Klubb X', 'mest aktive: aria-label');
assert.deepEqual(maSpec.picker, { buttonLabel: 'Kolonner', toolbar: false },
    'mest aktive: column picker declared, button hosted by the card header');
var maHtml = StandplassDataTable.renderTable('mest-aktive', maSpec, ddState);
assert.ok(maHtml.indexOf('<thead><tr><th scope="col" class="ranking-rank">#</th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="name">Navn<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="clubStevner">Klubbstevner<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="otherStevner">Andre stevner<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="stevner">Stevner<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="clubStarts">Klubbstarter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="otherStarts">Andre starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score" aria-sort="descending"><button type="button" class="dt-sort-btn" data-dt-sort="starts">Starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'mest aktive: eight sortable columns in the owner order, Starter marked aria-sort descending (page order is starts-desc)');
assert.ok(maHtml.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><td>Alice</td><td class="ranking-score">1</td><td class="ranking-score">1</td><td class="ranking-score">2</td><td class="ranking-score">2</td><td class="ranking-score">1</td><td class="ranking-score">3</td></tr>') !== -1,
    'mest aktive: row markup — splits sum to their totals');
var maAsc = ddSorted(maSpec, 'starts', 'asc');
assert.ok(maAsc.indexOf('<tr data-dt-row="1"><td class="ranking-rank">2</td><td>Bob</td>') !== -1
    && maAsc.indexOf('<tr data-dt-row="1">') < maAsc.indexOf('<tr data-dt-row="0">'),
    'mest aktive: rank travels under a Starter sort');
var maClubSort = ddSorted(maSpec, 'clubStevner', 'desc');
assert.ok(maClubSort.indexOf('<tr data-dt-row="0">') < maClubSort.indexOf('<tr data-dt-row="1">'),
    'mest aktive: Klubbstevner desc keeps Alice (1) above Bob (0)');
// Width tier 900: the four split columns hide, the totals stay — the
// Kolonner picker can re-enable them (user choice overrides the tier).
var maTier = StandplassDataTable.renderTable('mest-aktive', maSpec,
    { hidden: {}, runtimeHidden: [], widthTier: 900 });
assert.ok(maTier.indexOf('Klubbstevner') === -1 && maTier.indexOf('Andre starter') === -1,
    'mest aktive: split columns hidden at tier 900');
assert.ok(maTier.indexOf('<thead><tr><th scope="col" class="ranking-rank">#</th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="name">Navn<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="stevner">Stevner<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score" aria-sort="descending"><button type="button" class="dt-sort-btn" data-dt-sort="starts">Starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'mest aktive: tier 900 keeps #, Navn, Stevner, Starter');
assert.ok(maTier.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><td>Alice</td><td class="ranking-score">2</td><td class="ranking-score">3</td></tr>') !== -1,
    'mest aktive: tier 900 row markup carries the totals');

// Øvelsesfordeling
var discData = {
    'Finfelt': { shooters: { a: 1, b: 1, c: 1 }, starts: 7 },
    'Grovfelt': { shooters: { d: 1 }, starts: 3 }
};
var discSpec = CS.disciplineTableSpec(['Finfelt', 'Grovfelt'], discData, 'Klubb X');
assert.strictEqual(discSpec.ariaLabel, 'Øvelsesfordeling for Klubb X', 'øvelsesfordeling: aria-label');
var discHtml = StandplassDataTable.renderTable('ovelsesfordeling', discSpec, ddState);
assert.ok(discHtml.indexOf('<thead><tr>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="discipline">Øvelse<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="shooters">Skyttere<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score" aria-sort="descending"><button type="button" class="dt-sort-btn" data-dt-sort="starts">Starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'øvelsesfordeling: all three columns sortable, Starter marked aria-sort descending (page order is starts-desc)');
assert.ok(discHtml.indexOf('<tr data-dt-row="0"><td>Finfelt</td><td class="ranking-score">3</td><td class="ranking-score">7</td></tr>') !== -1,
    'øvelsesfordeling: bare-name rows flattened with counts');
var discAsc = ddSorted(discSpec, 'shooters', 'asc');
assert.ok(discAsc.indexOf('<tr data-dt-row="1"><td>Grovfelt</td>') !== -1
    && discAsc.indexOf('<tr data-dt-row="1">') < discAsc.indexOf('<tr data-dt-row="0">'),
    'øvelsesfordeling: shooters asc reorders');

// Arrangerte stevner
// Participant counts through the real path (organizedCompRow):
// personId-keyed uniques — results without one don't count — split
// into the club's members and everyone else. Total is the union, not
// the sum of the splits.
var orgRows = [
    CS.organizedCompRow({ title: 'Uten dato', startDate: null, facilityName: null, results: [
        { personId: 'p1', club: 'Klubb X' },
        { personId: 'p1', club: 'Klubb X' },
        { personId: 'p2', club: 'Annen klubb' },
        { name: 'Ingen id', club: 'Klubb X' }
    ] }, 'Klubb X'),
    CS.organizedCompRow({ title: 'Høststevnet', startDate: '2026-10-03T10:00:00Z', facilityName: 'Bane A', results: [
        { personId: 'p3', club: 'KLUBB X' },
        { personId: 'p4', club: 'Ekstern PK' }
    ] }, 'Klubb X'),
    CS.organizedCompRow({ title: 'Vårfeltet', startDate: '2026-03-01T08:00:00Z', facilityName: null, results: [] }, 'Klubb X')
];
assert.deepEqual(orgRows[0], { title: 'Uten dato', startDate: null, facilityName: null, memberParticipants: 1, externalParticipants: 1, totalParticipants: 2, memberStarts: 3, externalStarts: 1, totalStarts: 4 },
    'arrangerte data: same person twice is one participant, personId-less results don\'t count as deltakere — but every result row is a start (3 member starts, 1 member deltaker)');
assert.strictEqual(orgRows[1].memberParticipants, 1,
    'arrangerte data: club matching is normalizeClub (case-insensitive)');
var orgAnomaly = CS.organizedCompRow({ title: 'Anomali', results: [
    { personId: 'p9', club: 'Klubb X' },
    { personId: 'p9', club: 'Annen klubb' }
] }, 'Klubb X');
assert.strictEqual(orgAnomaly.memberParticipants, 1);
assert.strictEqual(orgAnomaly.externalParticipants, 1);
assert.strictEqual(orgAnomaly.totalParticipants, 1,
    'arrangerte data: a person with starts under both clubs (data anomaly) counts once in the total');
assert.strictEqual(orgAnomaly.memberStarts, 1);
assert.strictEqual(orgAnomaly.externalStarts, 1);
assert.strictEqual(orgAnomaly.totalStarts, 2,
    'arrangerte data: start splits count result rows — the both-clubs anomaly is a start in each');

var orgSpec = CS.organizedCompsTableSpec(orgRows, 'Klubb X');
assert.strictEqual(orgSpec.ariaLabel, 'Arrangerte stevner for Klubb X', 'arrangerte: aria-label');
assert.deepEqual(orgSpec.picker, { buttonLabel: 'Kolonner', toolbar: false },
    'arrangerte: column picker declared, button hosted by the card header');
var orgHtml = StandplassDataTable.renderTable('arrangerte-stevner', orgSpec, ddState);
assert.ok(orgHtml.indexOf('<thead><tr>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="title">Stevne<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" aria-sort="descending"><button type="button" class="dt-sort-btn" data-dt-sort="startDate">Dato<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="facilityName">Anlegg<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="memberParticipants"><span>Deltakere<br>(medlemmer)</span><span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="externalParticipants"><span>Deltakere<br>(eksterne)</span><span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="totalParticipants"><span>Deltakere<br>(totalt)</span><span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="memberStarts"><span>Starter<br>(medlemmer)</span><span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="externalStarts"><span>Starter<br>(eksterne)</span><span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="totalStarts"><span>Starter<br>(totalt)</span><span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'arrangerte: nine sortable columns — counting headers break onto two lines, Dato marked aria-sort descending (page order is date-desc)');
assert.ok(orgHtml.indexOf('<tr data-dt-row="1"><td>Høststevnet</td><td>2026-10-03</td><td>Bane A</td><td class="ranking-score">1</td><td class="ranking-score">1</td><td class="ranking-score">2</td><td class="ranking-score">1</td><td class="ranking-score">1</td><td class="ranking-score">2</td></tr>') !== -1,
    'arrangerte: ISO date sliced to YYYY-MM-DD, participant and start counts in the row');
assert.ok(orgHtml.indexOf('<tr data-dt-row="0"><td>Uten dato</td><td>–</td><td>–</td><td class="ranking-score">1</td><td class="ranking-score">1</td><td class="ranking-score">2</td><td class="ranking-score">3</td><td class="ranking-score">1</td><td class="ranking-score">4</td></tr>') !== -1,
    'arrangerte: missing values render –, starter columns shown by default');
var orgAsc = ddSorted(orgSpec, 'startDate', 'asc');
assert.ok(orgAsc.indexOf('Vårfeltet') < orgAsc.indexOf('Høststevnet') && orgAsc.indexOf('Høststevnet') < orgAsc.indexOf('Uten dato'),
    'arrangerte: Dato asc sorts chronologically, nulls last');
var orgTotalDesc = ddSorted(orgSpec, 'totalParticipants', 'desc');
assert.ok(orgTotalDesc.indexOf('Vårfeltet') > orgTotalDesc.indexOf('Høststevnet'),
    'arrangerte: Deltakere (totalt) desc sinks the empty stevne last');
var orgStartsDesc = ddSorted(orgSpec, 'totalStarts', 'desc');
assert.ok(orgStartsDesc.indexOf('Vårfeltet') > orgStartsDesc.indexOf('Høststevnet'),
    'arrangerte: Starter (totalt) desc sinks the empty stevne last');
// Counting columns carry the plain-text name for the Kolonner dropdown
// (the header label is pre-built two-line HTML via labelRaw).
var counting = orgSpec.columns.filter(function (c) { return c.pickerLabel; });
assert.strictEqual(counting.length, 6, 'arrangerte spec: six counting columns with picker labels');
assert.ok(counting.every(function (c) { return c.pickerLabel.indexOf('<') === -1 && c.pickerLabel.indexOf('(') !== -1; }),
    'arrangerte spec: picker labels are the plain one-line phrases');
// Starter columns follow the participant columns' tier split: splits
// hide below 900px, totals stay — and the user's explicit Kolonner
// choice overrides both (the base's visibility rules).
assert.ok(orgSpec.columns.filter(function (c) { return /Starts$/.test(c.key) && c.hideBelow == null; }
    ).every(function (c) { return c.key === 'totalStarts'; }),
    'arrangerte spec: only Starter (totalt) lacks a tier');
var orgTier = StandplassDataTable.renderTable('arrangerte-stevner', orgSpec,
    { hidden: {}, runtimeHidden: [], widthTier: 900 });
assert.ok(orgTier.indexOf('data-dt-sort="memberParticipants"') === -1
    && orgTier.indexOf('data-dt-sort="externalStarts"') === -1,
    'arrangerte: split columns hidden at tier 900');
assert.ok(orgTier.indexOf('data-dt-sort="totalStarts"') !== -1,
    'arrangerte: Starter (totalt) survives tier 900');
assert.ok(orgTier.indexOf('<tr data-dt-row="0"><td>Uten dato</td><td>–</td><td>–</td><td class="ranking-score">2</td><td class="ranking-score">4</td></tr>') !== -1,
    'arrangerte: tier 900 row keeps both totals');
var orgHidden = StandplassDataTable.renderTable('arrangerte-stevner', orgSpec,
    { hidden: { totalStarts: true }, runtimeHidden: [], widthTier: null });
assert.ok(orgHidden.indexOf('data-dt-sort="totalStarts"') === -1
    && orgHidden.indexOf('data-dt-sort="memberStarts"') !== -1,
    'arrangerte: a user-hidden starter column drops out, the others stay');

// Klassefordeling
var cdSpec = CS.classDistTableSpec([
    { discipline: 'Finfelt', class: 'Åpen', shooters: 2, starts: 5 },
    { discipline: 'Finfelt', class: 'Ærlig', shooters: 3, starts: 7 }
], 'Klubb X');
assert.strictEqual(cdSpec.ariaLabel, 'Klassefordeling for Klubb X', 'klassefordeling: aria-label');
var cdHtml = StandplassDataTable.renderTable('klassefordeling', cdSpec, ddState);
assert.ok(cdHtml.indexOf('<thead><tr>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="discipline">Øvelse<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="class">Klasse<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="shooters">Skyttere<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score" aria-sort="descending"><button type="button" class="dt-sort-btn" data-dt-sort="starts">Starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'klassefordeling: all four columns sortable, Starter marked aria-sort descending (page order is starts-desc)');
assert.ok(cdHtml.indexOf('<tr data-dt-row="0"><td>Finfelt</td><td>Åpen</td><td class="ranking-score">2</td><td class="ranking-score">5</td></tr>') !== -1,
    'klassefordeling: row markup matches today');
var cdAsc = ddSorted(cdSpec, 'class', 'asc');
assert.ok(cdAsc.indexOf('Ærlig') < cdAsc.indexOf('Åpen'),
    'klassefordeling: Klasse sorts Norwegian-collated (Æ before Å)');
// Øvelse ties resolve by Klasse (the column's secondary sort key):
// within Finfelt, Ærlig sorts before Åpen — the default starts-desc
// page order would otherwise carry into the tie group.
var cdDisc = ddSorted(cdSpec, 'discipline', 'asc');
assert.ok(cdDisc.indexOf('Ærlig') < cdDisc.indexOf('Åpen'),
    'klassefordeling: Øvelse sort keeps each øvelse\'s classes alphabetical');

// ── Chart details table spec (batch 1) ──────────────────────────────────
var ctSpecStarts = CS.chartTableSpec('starts',
    [{ year: 2025, value: 40 }, { year: 2026, value: 45 }],
    [{ year: 2026, value: 12 }]);
assert.strictEqual(ctSpecStarts.ariaLabel, 'Aktivitet per år', 'chart table: aria-label');
var ctHtml = StandplassDataTable.renderTable('chart-data', ctSpecStarts, ddState);
assert.ok(ctHtml.indexOf('<thead><tr>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="year">År<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="felt">Felt starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="bane">Bane starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'chart table: starts labels + sortable columns');
assert.ok(ctHtml.indexOf('<tr data-dt-row="0"><td>2025</td><td class="ranking-score">40</td><td class="ranking-score">–</td></tr>') !== -1
    && ctHtml.indexOf('<tr data-dt-row="1"><td>2026</td><td class="ranking-score">45</td><td class="ranking-score">12</td></tr>') !== -1,
    'chart table: year rows with – for missing series points');
var ctDesc = ddSorted(ctSpecStarts, 'year', 'desc');
assert.ok(ctDesc.indexOf('<td>2026</td>') < ctDesc.indexOf('<td>2025</td>'),
    'chart table: År desc reverses year order');
var ctNulls = ddSorted(ctSpecStarts, 'bane', 'desc');
assert.ok(ctNulls.indexOf('<td>2026</td>') < ctNulls.indexOf('<td>2025</td>'),
    'chart table: nulls sort last on a value column');
var ctSpecAge = CS.chartTableSpec('avgAge', [{ year: 2026, value: 47.5 }], []);
var ctAgeHtml = StandplassDataTable.renderTable('chart-data', ctSpecAge, ddState);
assert.ok(ctAgeHtml.indexOf('Felt snittalder') >= 0 && ctAgeHtml.indexOf('Bane snittalder') >= 0,
    'chart table: avgAge branch labels');
assert.ok(ctAgeHtml.indexOf('<td class="ranking-score">47.5</td>') >= 0,
    'chart table: age values formatted via formatAgeValue');

// ── Age series computation ──────────────────────────────────────────────

// isLuftDiscipline: the only luft disciplines in the data are the 10m
// luftpistol/luftsprint ones; every powder discipline lacks "luft".
assert.strictEqual(CS.isLuftDiscipline('10m luftpistol 40 skudd'), true);
assert.strictEqual(CS.isLuftDiscipline('10m luftpistol 60 skudd'), true);
assert.strictEqual(CS.isLuftDiscipline('10m luftsprint, pistol'), true);
assert.strictEqual(CS.isLuftDiscipline('25m finpistol'), false);
assert.strictEqual(CS.isLuftDiscipline('Finfelt'), false);
assert.strictEqual(CS.isLuftDiscipline('T96 grov'), false);
assert.strictEqual(CS.isLuftDiscipline(''), false);

// computeLuftOnlyShooters: a shooter is luft-only when EVERY row in the
// family is a luft discipline — any powder row anywhere (other club, other
// year) gives the powder floor.
(function () {
    var rows = [
        { personId: 'p1', discipline: '10m luftpistol 40 skudd', club: 'A' },
        { personId: 'p1', discipline: '10m luftpistol 60 skudd', club: 'B' },
        { personId: 'p2', discipline: '10m luftpistol 40 skudd', club: 'A' },
        { personId: 'p2', discipline: '25m finpistol', club: 'B' },
        { personId: 'p3', discipline: 'Finfelt', club: 'A' }
    ];
    var luftOnly = CS.computeLuftOnlyShooters(rows);
    assert.deepStrictEqual(luftOnly, { p1: true }, 'only all-luft shooters are luft-only');
})();

// computeAgeSeries: unique shooters per year, age = year - birthYear,
// null/absent birth year excluded, discipline-aware floors (luft-only 9,
// powder 11), avg rounded to 1 decimal, median middle-or-mean-of-two.
(function () {
    var rowsByYear = [
        { year: 2021, rows: [
            // p1: born 2010 → age 11 in 2021 (powder floor ok); 3 starts, counted once.
            { personId: 'p1', discipline: 'Finfelt', club: 'A' },
            { personId: 'p1', discipline: 'Grovfelt', club: 'A' },
            { personId: 'p1', discipline: 'Spesialpistol', club: 'B' }
        ]},
        { year: 2022, rows: [
            // p1 a year older (12); p2 has null birth year → excluded.
            { personId: 'p1', discipline: 'Finfelt', club: 'A' },
            { personId: 'p2', discipline: 'Finfelt', club: 'A' }
        ]},
        { year: 2023, rows: [
            // p3 absent from birthyears entirely → excluded; p1 only (13).
            { personId: 'p1', discipline: 'Finfelt', club: 'A' },
            { personId: 'p3', discipline: 'Finfelt', club: 'A' }
        ]}
    ];
    var birthyears = { p1: 2010, p2: null };
    var series = CS.computeAgeSeries(rowsByYear, {}, birthyears);
    assert.strictEqual(series.length, 3, 'all three years have data');
    var y2021 = series[0];
    assert.strictEqual(y2021.year, 2021);
    assert.strictEqual(y2021.count, 1, 'multiple starts count once per year');
    assert.strictEqual(y2021.avg, 11, 'age 11 in 2021 (born 2010)');
    assert.strictEqual(y2021.median, 11);
    assert.strictEqual(series[1].avg, 12, 'same shooter one year older in 2022');
    assert.strictEqual(series[1].count, 1, 'null birth year excluded');
    assert.strictEqual(series[2].count, 1, 'absent-from-map birth year excluded');
    assert.strictEqual(series[2].avg, 13);
})();

// Floors: luft-only shooters are plausible from age 9, powder from 11.
(function () {
    var luftOnly = { pl: true };
    var birthyears = { pl: 2016, pp: 2016, py: 2015, ppow11: 2015 };
    // pl: luft-only, age 10 in 2026 → kept. pp: powder, age 10 → excluded.
    // py: powder, age 11 → kept. ppow11: age 11 → kept.
    var rowsByYear = [{ year: 2026, rows: [
        { personId: 'pl', discipline: '10m luftpistol 40 skudd' },
        { personId: 'pp', discipline: '25m finpistol' },
        { personId: 'py', discipline: '25m finpistol' }
    ]}];
    var series = CS.computeAgeSeries(rowsByYear, luftOnly, birthyears);
    assert.strictEqual(series.length, 1);
    assert.strictEqual(series[0].count, 2, 'age-10 luft kept, age-10 powder excluded');
    var ages = [10, 11];
    assert.strictEqual(series[0].avg, 10.5, 'avg of 10 and 11');
    assert.strictEqual(series[0].median, 10.5, 'even count → mean of two middle values (.5)');
})();

// Median/avg rounding: odd count → middle; even → mean of two middle;
// avg rounds to 1 decimal.
(function () {
    var birthyears = { a: 1980, b: 1970, c: 1990 };
    var rowsByYear = [{ year: 2020, rows: [
        { personId: 'a', discipline: 'Finfelt' },
        { personId: 'b', discipline: 'Finfelt' },
        { personId: 'c', discipline: 'Finfelt' }
    ]}];
    var series = CS.computeAgeSeries(rowsByYear, {}, birthyears);
    // ages 40, 50, 30
    assert.strictEqual(series[0].median, 40, 'odd count → middle value');
    assert.strictEqual(series[0].avg, 40, 'avg of 40/50/30');
    var birthyears2 = { a: 1980, b: 1970, c: 1990, d: 1991 };
    var rowsByYear2 = [{ year: 2020, rows: [
        { personId: 'a', discipline: 'Finfelt' }, { personId: 'b', discipline: 'Finfelt' },
        { personId: 'c', discipline: 'Finfelt' }, { personId: 'd', discipline: 'Finfelt' }
    ]}];
    var series2 = CS.computeAgeSeries(rowsByYear2, {}, birthyears2);
    // ages 40, 50, 30, 29 → sorted 29,30,40,50
    assert.strictEqual(series2[0].median, 35, 'even count → mean of two middle (30,40)');
    assert.strictEqual(series2[0].avg, 37.3, 'avg rounds to 1 decimal (37.25 → 37.3)');
})();

// formatAgeValue: 1 decimal, trailing .0 trimmed.
assert.strictEqual(CS.formatAgeValue(47), '47');
assert.strictEqual(CS.formatAgeValue(47.5), '47.5');
assert.strictEqual(CS.formatAgeValue(47.25), '47.3');
assert.strictEqual(CS.formatAgeValue(47.04), '47');

// ── Metric switcher ────────────────────────────────────────────────────

assert.strictEqual(CS.normalizeClubChartMetric('starts'), 'starts');
assert.strictEqual(CS.normalizeClubChartMetric('avgAge'), 'avgAge');
assert.strictEqual(CS.normalizeClubChartMetric('medianAge'), 'medianAge');
assert.strictEqual(CS.normalizeClubChartMetric('age'), 'shooters', 'pre-split age key is no longer a metric');
assert.strictEqual(CS.normalizeClubChartMetric('shooters'), 'shooters');
assert.strictEqual(CS.normalizeClubChartMetric('garbage'), 'shooters');
assert.strictEqual(CS.normalizeClubChartMetric(null), 'shooters');

(function () {
    var html = CS.renderMetricToggleHtml('starts');
    assert.ok(html.indexOf('club-metric-toggle') !== -1, 'toggle buttons carry the class');
    assert.ok(html.indexOf('data-metric="starts"') !== -1, 'starts button present');
    assert.ok(html.indexOf('data-metric="shooters"') !== -1, 'shooters button present');
    assert.strictEqual((html.match(/program-btn--active/g) || []).length, 1, 'exactly one active button');
    assert.ok(/data-metric="starts"[^>]*aria-pressed="true"/.test(html), 'active button is aria-pressed=true');
    assert.ok(/data-metric="shooters"[^>]*aria-pressed="false"/.test(html), 'inactive button is aria-pressed=false');
    // After the split: Snittalder and Medianalder are separate metrics.
    var ageHtml = CS.renderMetricToggleHtml('avgAge');
    assert.ok(ageHtml.indexOf('>Snittalder<') !== -1, 'Snittalder metric present');
    assert.ok(ageHtml.indexOf('>Medianalder<') !== -1, 'Medianalder metric present');
    assert.ok(ageHtml.indexOf('>Alder<') === -1, 'combined Alder metric is gone');
})();

// createAgeSeriesCache: memoizes the (expensive, immutable-input) age
// walk per scope — one full flatten of both families per scope, never
// re-run on toggle clicks or filter changes.
(function () {
    var calls = [];
    var cached = CS.createAgeSeriesCache(function (scopeClub) {
        calls.push(scopeClub);
        return { scope: scopeClub };
    });
    assert.deepStrictEqual(cached(null), { scope: null }, 'returns the computed value');
    assert.deepStrictEqual(cached('Klubb A'), { scope: 'Klubb A' });
    cached(null); cached('Klubb A'); cached(null);
    assert.strictEqual(calls.length, 2, 'same scope is served from cache');
    assert.deepStrictEqual(calls, [null, 'Klubb A']);
})();

// ── Toplists through the shared table base ──────────────────────────────
// The migrated toplistCard builds its <table> via
// StandplassDataTable.renderTable inside buildTableCard's tableHtml path.
// This mirrors that composition and pins today's observable markup: same
// thead cells, same row cells, club links escaped, all rows rendered.

(function () {
    function escT(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    // Same column spec the migrated toplistCard builds (klubbstatistikk).
    // The # column is data-backed (row.rank) — each club's placement in
    // the page order, traveling with the row under sorting.
    function toplistColumns(valueKey, valueLabel) {
        return [
            { key: 'rank', label: '#', align: 'center' },
            { key: 'club', label: 'Klubb', sortable: true, defaultDir: 'asc', raw: true,
                cell: function (row) { return '<a href="?klubb=' + encodeURIComponent(row.club) + '">' + escT(row.club) + '</a>'; } },
            { key: valueKey, label: valueLabel, align: 'right', sortable: true, defaultDir: 'desc' }
        ];
    }

    var ranked = [
        { club: 'A & B', totalStarts: 30, rank: 1 },
        { club: 'Klubb C', totalStarts: 25, rank: 2 }
    ];

    var tableHtml = StandplassDataTable.renderTable('toplist-starts', {
        columns: toplistColumns('totalStarts', 'starter'),
        rows: ranked,
        ariaLabel: 'Flest starter 2026',
        defaultSort: { key: 'totalStarts', dir: 'desc' }
    }, { hidden: {}, runtimeHidden: [], widthTier: null });

    var card = CS.buildTableCard({
        title: 'Flest starter',
        rows: ranked,
        tableHtml: tableHtml,
        cardClass: 'club-stats-toplist'
    });

    // Card wrapper unchanged; the table is the base's output, un-wrapped
    // (buildTableCard's .club-stats-list-scroll already wraps it).
    assert.strictEqual(card,
        '<section class="ranking-card club-stats-toplist">'
        + '<div class="ranking-card-header"><h2 class="ranking-card-title">Flest starter</h2></div>'
        + '<div class="club-stats-list-scroll">' + tableHtml + '</div></section>',
        'buildTableCard tableHtml path keeps the card wrapper, scroll wrap only once');

    // data-dt-id present (replaces the old id="...-table").
    assert.ok(card.indexOf('data-dt-id="toplist-starts"') !== -1, 'table carries data-dt-id');

    // Full row count rendered — no paging (Review Focus #5).
    assert.strictEqual((card.match(/<tr data-dt-row=/g) || []).length, ranked.length,
        'all rows render as real DOM rows');

    // Golden thead: today's cells with the new sort affordance on Klubb
    // and the value column; the value column is the designated default
    // sort (desc), so it carries the initial aria-sort.
    assert.ok(card.indexOf(
        '<thead><tr><th scope="col" class="ranking-rank">#</th>'
        + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="club">Klubb<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
        + '<th scope="col" class="ranking-score" aria-sort="descending"><button type="button" class="dt-sort-btn" data-dt-sort="totalStarts">starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
        + '</tr></thead>') !== -1,
        'sortable Klubb and value headers, value marked as default sort');

    // Golden row cells: today's markup, & in the club name escaped.
    assert.ok(card.indexOf(
        '<tr data-dt-row="0"><td class="ranking-rank">1</td><td><a href="?klubb=A%20%26%20B">A &amp; B</a></td><td class="ranking-score">30</td></tr>'
        + '<tr data-dt-row="1"><td class="ranking-rank">2</td><td><a href="?klubb=Klubb%20C">Klubb C</a></td><td class="ranking-score">25</td></tr>') !== -1,
        'row cells match today\'s toplist markup with A & B escaped');

    // Sorted by club (desc): Klubb C leads the table but keeps her rank
    // (2) — # is a data-anchored rank that travels with the row, not a
    // renumbering of the current order.
    var byClubDesc = StandplassDataTable.renderTable('toplist-starts', {
        columns: toplistColumns('totalStarts', 'starter'),
        rows: ranked,
        ariaLabel: 'Flest starter 2026',
        defaultSort: { key: 'totalStarts', dir: 'desc' }
    }, { sort: { key: 'club', dir: 'desc' }, hidden: {}, runtimeHidden: [], widthTier: null });
    assert.ok(byClubDesc.indexOf('<tr data-dt-row="1"><td class="ranking-rank">2</td><td><a href="?klubb=Klubb%20C">Klubb C</a></td>') >= 0,
        'club sort: Klubb C keeps rank 2');
    assert.ok(byClubDesc.indexOf('<tr data-dt-row="1">') < byClubDesc.indexOf('<tr data-dt-row="0">'),
        'club sort desc: Klubb C renders first, A & B second');
})();

console.log('club-stats.test.js: all tests passed');
