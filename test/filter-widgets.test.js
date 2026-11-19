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

// wireRowsSelect: applies the markup default on init and the select's
// value on change — and NEVER touches localStorage (owner ruling
// 2026-11-19: no persistence for now; each page opens at its own
// markup default, and a value left in storage by the pre-batch
// klubbstatistikk behavior must be ignored). Fake-DOM stand-in, same
// pattern as the wireClearAllFilters test above.
var rowsCalls = [];
var rowsSelect = {
    value: '30',
    options: [{ value: '15' }, { value: '30' }, { value: '50' }, { value: 'all' }],
    changeListener: null,
    addEventListener: function (evt, fn) { if (evt === 'change') { this.changeListener = fn; } }
};
var rowsStyle = {};
var rowsContent = { style: { setProperty: function (k, v) { rowsStyle[k] = v; } } };
var storageCalls = [];
global.localStorage = {
    getItem: function (k) { storageCalls.push('get:' + k); return '15'; },
    setItem: function (k, v) { storageCalls.push('set:' + k + '=' + v); }
};
StandplassFilterWidgets.wireRowsSelect({
    select: rowsSelect,
    contentEl: rowsContent,
    onChange: function (v) { rowsCalls.push(v); }
});
assert.deepStrictEqual(storageCalls, [], 'wireRowsSelect never reads or writes localStorage');
assert.strictEqual(rowsStyle['--club-stats-rows-max'], '65.0rem',
    'markup default (30) applied on init — stored 15 ignored');
assert.deepStrictEqual(rowsCalls, ['30'], 'onChange fired on initial apply');
rowsSelect.value = 'all';
rowsSelect.changeListener();
assert.strictEqual(rowsStyle['--club-stats-rows-max'], 'none', 'change applies the new value');
assert.deepStrictEqual(rowsCalls, ['30', 'all'], 'onChange fired on change');
assert.deepStrictEqual(storageCalls, [], 'still no storage writes after a change');
delete global.localStorage;

// makeCheckboxDropdown's destroy contract: it removes EVERY listener it
// registered, not just the root outside-click. Batch-2's shared stevner
// picker re-wires a dropdown onto a long-lived STATIC button on every
// render (destroy-before-rewire) — a destroy that leaves the button's
// click listener behind accumulates one listener (plus one retained
// detached panel subtree, captured by the listener's closure) per
// re-wire, for the life of the page.
function countListeners(el, evt) {
    return el.listeners[evt] ? el.listeners[evt].length : 0;
}
function fakeDropdownEl() {
    return {
        listeners: {},
        addEventListener: function (evt, fn) {
            (this.listeners[evt] = this.listeners[evt] || []).push(fn);
        },
        removeEventListener: function (evt, fn) {
            var arr = this.listeners[evt] || [];
            var i = arr.indexOf(fn);
            if (i !== -1) { arr.splice(i, 1); }
        },
        // Panel reports hidden so rebuild() skips buildList — this test
        // pins listener bookkeeping, not list building.
        hasAttribute: function () { return true; },
        setAttribute: function () {},
        removeAttribute: function () {}
    };
}
var ddRoot = fakeDropdownEl();
var ddBtn = fakeDropdownEl();
ddBtn.getRootNode = function () { return ddRoot; };
ddBtn.parentElement = { contains: function () { return false; } };
var ddPanel = fakeDropdownEl();
var ddList = fakeDropdownEl();
var ddClearAll = fakeDropdownEl();
function makeTestDropdown() {
    return StandplassFilterWidgets.makeCheckboxDropdown({
        btn: ddBtn, panel: ddPanel, list: ddList, clearAllBtn: ddClearAll,
        labelNone: 'Ingen',
        getItems: function () { return [{ id: 'a', name: 'A' }]; },
        getSelected: function () { return ['a']; },
        onToggle: function () {},
        onClearAll: function () {}
    });
}
var dd1 = makeTestDropdown();
dd1.rebuild();
assert.strictEqual(countListeners(ddBtn, 'click'), 1, 'one button listener after wiring');
assert.strictEqual(countListeners(ddRoot, 'click'), 1, 'one root outside-click listener after wiring');
assert.strictEqual(countListeners(ddPanel, 'keydown'), 1, 'one panel keydown listener after wiring');
assert.strictEqual(countListeners(ddClearAll, 'click'), 1, 'one clear-all listener after wiring');
dd1.destroy();
assert.strictEqual(countListeners(ddBtn, 'click'), 0, 'destroy removes the button click listener');
assert.strictEqual(countListeners(ddRoot, 'click'), 0, 'destroy removes the root outside-click listener');
assert.strictEqual(countListeners(ddPanel, 'keydown'), 0, 'destroy removes the panel keydown listener');
assert.strictEqual(countListeners(ddClearAll, 'click'), 0, 'destroy removes the clear-all listener');
// The re-wire cycle the stevner picker does per render: net zero growth.
var dd2 = makeTestDropdown();
assert.strictEqual(countListeners(ddBtn, 'click'), 1, 're-wiring after destroy adds exactly one listener again');
dd2.destroy();

console.log('filter-widgets.test.js: all assertions passed');
