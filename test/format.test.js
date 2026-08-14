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

console.log('format.test.js: all assertions passed');
