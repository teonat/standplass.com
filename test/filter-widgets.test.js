'use strict';
var assert = require('node:assert');
var StandplassFilterWidgets = require('../public/js/filter-widgets.js');

assert.strictEqual(StandplassFilterWidgets.esc('<script>'), '&lt;script&gt;');
assert.strictEqual(StandplassFilterWidgets.esc('O\'Brien & Co "Ltd"'), 'O&#39;Brien &amp; Co &quot;Ltd&quot;');
assert.strictEqual(StandplassFilterWidgets.esc(null), '');
assert.strictEqual(typeof StandplassFilterWidgets.makeComboHandlers, 'function');
assert.strictEqual(typeof StandplassFilterWidgets.makeTagComboHandlers, 'function');
assert.strictEqual(typeof StandplassFilterWidgets.makeCheckboxDropdown, 'function');

console.log('filter-widgets.test.js: all assertions passed');
