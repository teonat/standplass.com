'use strict';
var assert = require('node:assert');
var StandplassFormat = require('../public/js/format.js');

assert.strictEqual(StandplassFormat.formatDate('2026-08-12T00:00:00Z'), '12. aug 2026');
assert.strictEqual(
    StandplassFormat.formatDateRange('2026-08-12T00:00:00Z', '2026-08-12T00:00:00Z'),
    '12. aug 2026'
);
assert.strictEqual(
    StandplassFormat.formatDateRange('2026-08-12T00:00:00Z', '2026-08-14T00:00:00Z'),
    '12.–14. aug 2026'
);
assert.strictEqual(
    StandplassFormat.formatDateRange('2026-08-30T00:00:00Z', '2026-09-02T00:00:00Z'),
    '30. aug 2026–2. sep 2026'
);

// ── encodeIdList / decodeIdList ────────────────────────────────────────

// Round-trips, including values that themselves contain commas (real data:
// organizer "Aron Skytterklubb, Drammen", discipline "10m luftsprint, pistol").
assert.deepStrictEqual(
    StandplassFormat.decodeIdList(StandplassFormat.encodeIdList(['Aron Skytterklubb, Drammen', 'Oslo Kretsskyting'])),
    ['Aron Skytterklubb, Drammen', 'Oslo Kretsskyting'],
    'round-trip with comma-containing value');
assert.deepStrictEqual(StandplassFormat.decodeIdList(StandplassFormat.encodeIdList(['Finfelt'])), ['Finfelt'], 'single value round-trip');
assert.deepStrictEqual(StandplassFormat.decodeIdList(StandplassFormat.encodeIdList([])), [], 'empty list round-trip');
assert.deepStrictEqual(StandplassFormat.decodeIdList(''), [], 'empty raw string -> empty list');

// Legacy single-value URLs: the whole value is one element after split
// (split on raw comma happens BEFORE per-element decode).
assert.deepStrictEqual(StandplassFormat.decodeIdList('Aron Skytterklubb%2C%20Drammen'),
    ['Aron Skytterklubb, Drammen'], 'legacy encoded comma stays one value');
assert.deepStrictEqual(StandplassFormat.decodeIdList('A%20B,C'), ['A B', 'C'], 'two values, encoded space in first');

// Malformed escapes and stray percents must not throw (decode runs in init()).
assert.deepStrictEqual(StandplassFormat.decodeIdList('%E0%A4%A'), ['%E0%A4%A'], 'malformed escape falls back to raw');
assert.deepStrictEqual(StandplassFormat.decodeIdList('100%'), ['100%'], 'stray percent falls back to raw');

console.log('format.test.js: all assertions passed');
