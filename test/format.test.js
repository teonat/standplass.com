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
    '30. aug–2. sep 2026'
);
// same-year cross-month compresses the year to once (a duplicated year
// made Dato cells the widest nowrap content in the terminliste table
// and pushed it into horizontal scroll); cross-year keeps both years
assert.strictEqual(
    StandplassFormat.formatDateRange('2026-12-28T00:00:00Z', '2027-01-04T00:00:00Z'),
    '28. des 2026–4. jan 2027'
);

// ── UTC-to-Oslo datetime conversion + time helpers ─────────────────────
// The competition APIs emit datetimes WITHOUT a timezone suffix, and the
// value is a UTC instant: the registration form has no timezone input
// (clubs type digits), the backend stores the UTC equivalent, and
// skyting.no renders Europe/Oslo local time. So 15:00 stored shows as
// "kl 16:00" in November (CET +1) -- and 07:00 stored shows 09:00 in
// summer (CEST +2). The parser must do that same conversion for every
// viewer, never reinterpret a suffix-less string in the viewer's zone.
assert.strictEqual(StandplassFormat.formatDate('2026-11-18T15:00:00'), '18. nov 2026', 'UTC datetime converts to the Oslo date');
assert.strictEqual(StandplassFormat.formatDate('2026-11-16'), '16. nov 2026', 'date-only string passes through unconverted');
assert.strictEqual(StandplassFormat.formatDate(''), '', 'empty input -> empty output');
assert.strictEqual(StandplassFormat.formatTime('2026-11-18T15:00:00'), '16:00', 'CET winter: UTC + 1 (live repro: stored 15:00, skyting.no shows 16:00)');
assert.strictEqual(StandplassFormat.formatTime('2026-06-15T13:00:00'), '15:00', 'CEST summer: UTC + 2');
assert.strictEqual(StandplassFormat.formatTime('2026-11-18T15:00:00Z'), '16:00', 'an explicit Z agrees with the suffix-less convention');
assert.strictEqual(StandplassFormat.formatTime('2026-11-18T23:30:00'), '00:30', 'late-evening UTC rolls over to the next Oslo day');
assert.strictEqual(StandplassFormat.formatDate('2026-11-18T23:30:00'), '19. nov 2026', 'the Oslo date rolls over with it');
assert.strictEqual(StandplassFormat.formatTime('2026-03-29T00:30:00'), '01:30', 'just before the spring-forward switch: still CET + 1');
assert.strictEqual(StandplassFormat.formatTime('2026-03-29T01:30:00'), '03:30', 'just after the spring-forward switch: CEST + 2 (02:30 Oslo does not exist)');
assert.strictEqual(StandplassFormat.formatTime('2026-11-16'), null, 'no time part -> null');
assert.strictEqual(StandplassFormat.formatTime(''), null, 'empty -> null');
assert.strictEqual(
    StandplassFormat.formatDateRange('2026-11-16T16:00:00', '2026-11-16T18:00:00'),
    '16. nov 2026',
    'same-day different-times renders a single date (old code produced "16.–16. nov 2026")'
);
assert.strictEqual(
    StandplassFormat.formatDateRangeTime('2026-11-16T16:00:00', '2026-11-16T16:00:00'),
    '16. nov 2026, kl 17:00',
    'single-day event with start time'
);
assert.strictEqual(
    StandplassFormat.formatDateRangeTime('2026-11-21T09:00:00', '2026-11-22T16:00:00'),
    '21.–22. nov 2026 · starter kl 10:00',
    'multi-day range with first-day start time'
);
assert.strictEqual(
    StandplassFormat.formatDateRangeTime('2026-11-16', '2026-11-16'),
    '16. nov 2026',
    'no time part -> plain range'
);
assert.strictEqual(StandplassFormat.formatDateRangeTime('', ''), '', 'empty inputs -> empty output');

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
