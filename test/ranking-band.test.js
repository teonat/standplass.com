'use strict';
var assert = require('node:assert');
var RB = require('../public/js/ranking-band.js');

// ── bandFor: the owner-confirmed ladder ──────────────────────────────
// A: ≥97 in class; 85–97 under (B level); <85 2+ under.
assert.strictEqual(RB.bandFor('A', 97).id, 'inClass');
assert.strictEqual(RB.bandFor('A', 96.99).id, 'below');
assert.strictEqual(RB.bandFor('A', 85).id, 'below');
assert.strictEqual(RB.bandFor('A', 84.99).id, 'twoBelow');
// B: ≥97 opprykk (A level); 85–97 in class; <85 under (C/D level).
// No twoBelow band — only the C/D zone is below B.
assert.strictEqual(RB.bandFor('B', 97).id, 'promotion');
assert.strictEqual(RB.bandFor('B', 96.99).id, 'inClass');
assert.strictEqual(RB.bandFor('B', 85).id, 'inClass');
assert.strictEqual(RB.bandFor('B', 84.99).id, 'below');
// C: ≥97 2+ over; 85–97 opprykk (B level); <85 in class — C and D are
// one zone (D auto-converts to C after a year), so C never goes below-band.
assert.strictEqual(RB.bandFor('C', 97).id, 'twoAbove');
assert.strictEqual(RB.bandFor('C', 96.99).id, 'promotion');
assert.strictEqual(RB.bandFor('C', 85).id, 'promotion');
assert.strictEqual(RB.bandFor('C', 84.99).id, 'inClass');
assert.strictEqual(RB.bandFor('C', 10).id, 'inClass');
// D: ≥85 2+ over (B level or higher); <85 in class — C is no promotion
// from D (auto-convert), so 75–85 is in-class, not opprykk.
assert.strictEqual(RB.bandFor('D', 85).id, 'twoAbove');
assert.strictEqual(RB.bandFor('D', 100).id, 'twoAbove');
assert.strictEqual(RB.bandFor('D', 84.99).id, 'inClass');
assert.strictEqual(RB.bandFor('D', 75).id, 'inClass');

// off-ladder classes and no-ranking scores carry no band
assert.strictEqual(RB.bandFor('Åpen', 90), null);
assert.strictEqual(RB.bandFor('Veteran 55', 90), null);
assert.strictEqual(RB.bandFor('', 90), null);
assert.strictEqual(RB.bandFor(null, 90), null);
assert.strictEqual(RB.bandFor('A', null), null);
assert.strictEqual(RB.bandFor('A', undefined), null);
assert.strictEqual(RB.bandFor('A', 0), null, '0 rankingScore means no ranking (chartPoints excludes it too)');

// band payload: the chart's color vars (dots) and the text-safe twins
assert.strictEqual(RB.bandFor('B', 98).color, 'var(--chart-green)');
assert.strictEqual(RB.bandFor('B', 98).text, 'var(--chart-green-text)');
assert.strictEqual(RB.bandFor('B', 98).label, 'Opprykksgrense nådd');
assert.strictEqual(RB.bandFor('A', 84).color, 'var(--chart-orange)');
assert.strictEqual(RB.bandFor('A', 84).text, 'var(--chart-orange-text)');
assert.strictEqual(RB.bandFor('D', 90).color, 'var(--chart-purple)');
assert.strictEqual(RB.bandFor('D', 90).text, 'var(--chart-purple-text)');

// BANDS: exactly five, in the chart legend's order, labels verbatim
assert.deepStrictEqual(RB.BANDS.map(function (b) { return b.id; }),
    ['twoAbove', 'promotion', 'inClass', 'below', 'twoBelow']);
assert.deepStrictEqual(RB.BANDS.map(function (b) { return b.label; }),
    ['2+ klasser over', 'Opprykksgrense nådd', 'I klassen', 'Under klassen', '2+ klasser under']);

// ── cellHtml: the shared table cell (text-safe variants) ─────────────
assert.strictEqual(RB.cellHtml(97.5, 'A'),
    '<span class="rank-value" style="color:var(--chart-blue-text)" title="I klassen">97.50</span>');
assert.strictEqual(RB.cellHtml(98, 'B'),
    '<span class="rank-value" style="color:var(--chart-green-text)" title="Opprykksgrense nådd">98.00</span>');
assert.strictEqual(RB.cellHtml(84.99, 'C'),
    '<span class="rank-value" style="color:var(--chart-blue-text)" title="I klassen">84.99</span>');
assert.strictEqual(RB.cellHtml(90, 'Åpen'), '90.00', 'off-ladder: plain value, no color');
assert.strictEqual(RB.cellHtml(null, 'A'), '–', 'no ranking renders –');
assert.strictEqual(RB.cellHtml(0, 'A'), '0.00', '0 is no ranking: plain 0.00, no color');

// ── positionCellHtml: absolute medals (never relative to the visible set) ──
assert.strictEqual(RB.positionCellHtml(1),
    '<span class="rank-value" style="color:var(--chart-gold-text)">1</span>');
assert.strictEqual(RB.positionCellHtml(2),
    '<span class="rank-value" style="color:var(--chart-silver-text)">2</span>');
assert.strictEqual(RB.positionCellHtml(3),
    '<span class="rank-value" style="color:var(--chart-bronze-text)">3</span>');
assert.strictEqual(RB.positionCellHtml(4), '4', 'below the podium: plain');
assert.strictEqual(RB.positionCellHtml('3'),
    '<span class="rank-value" style="color:var(--chart-bronze-text)">3</span>', 'numeric strings still medal');
assert.strictEqual(RB.positionCellHtml(null), '–');
assert.strictEqual(RB.positionCellHtml('x'), '–', 'non-numeric renders – (num() convention)');

// ── deltaCellHtml: signed deltas, sign is the signal ──────────────────
assert.strictEqual(RB.deltaCellHtml(12),
    '<span class="rank-value" style="color:var(--chart-green-text)">+12</span>');
assert.strictEqual(RB.deltaCellHtml(1),
    '<span class="rank-value" style="color:var(--chart-green-text)">+1</span>');
assert.strictEqual(RB.deltaCellHtml(-3),
    '<span class="rank-value" style="color:var(--chart-red-text)">-3</span>');
assert.strictEqual(RB.deltaCellHtml(0), '0', 'zero → bare 0, no prefix, no color');
assert.strictEqual(RB.deltaCellHtml(null), '–');
