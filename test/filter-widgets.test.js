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

// rowsToMaxHeight: the "Rader" select's row-count → CSS max-height math
// (~2.1rem per row + ~2rem thead; "Alle" uncaps entirely). DOM wiring
// (wireRowsSelect) is manual-QA per project convention.
assert.strictEqual(StandplassFilterWidgets.rowsToMaxHeight('15', 2.1, 2), '33.5rem');
assert.strictEqual(StandplassFilterWidgets.rowsToMaxHeight('30', 2.1, 2), '65.0rem');
assert.strictEqual(StandplassFilterWidgets.rowsToMaxHeight('50', 2.1, 2), '107.0rem');
assert.strictEqual(StandplassFilterWidgets.rowsToMaxHeight('all', 2.1, 2), 'none');
assert.strictEqual(StandplassFilterWidgets.rowsToMaxHeight('15'), '33.5rem', 'rowRem/headRem default to 2.1/2');
assert.strictEqual(typeof StandplassFilterWidgets.wireRowsSelect, 'function', 'wireRowsSelect exported');

console.log('filter-widgets.test.js: all assertions passed');
