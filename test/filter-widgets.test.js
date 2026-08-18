'use strict';
var assert = require('node:assert');
var StandplassFilterWidgets = require('../public/js/filter-widgets.js');

assert.strictEqual(StandplassFilterWidgets.esc('<script>'), '&lt;script&gt;');
assert.strictEqual(StandplassFilterWidgets.esc('O\'Brien & Co "Ltd"'), 'O&#39;Brien &amp; Co &quot;Ltd&quot;');
assert.strictEqual(StandplassFilterWidgets.esc(null), '');
assert.strictEqual(typeof StandplassFilterWidgets.makeComboHandlers, 'function');
assert.strictEqual(typeof StandplassFilterWidgets.makeTagComboHandlers, 'function');
assert.strictEqual(typeof StandplassFilterWidgets.makeCheckboxDropdown, 'function');

// wireClearAllFilters: resets run before widgets rebuild, before onDone --
// no DOM in this test environment, so a minimal addEventListener stand-in.
var clickHandler = null;
var fakeBtn = { addEventListener: function (evt, fn) { if (evt === 'click') { clickHandler = fn; } } };
var order = [];
var fakeWidget = { rebuild: function () { order.push('rebuild'); } };
StandplassFilterWidgets.wireClearAllFilters(
    fakeBtn,
    [function () { order.push('reset'); }],
    [fakeWidget],
    function () { order.push('done'); }
);
clickHandler();
assert.deepStrictEqual(order, ['reset', 'rebuild', 'done'], 'resets run, then widgets rebuild, then onDone');

console.log('filter-widgets.test.js: all assertions passed');
