'use strict';
var assert = require('node:assert');
global.StandplassTable = require('../public/js/table-renderer.js');
var StandplassDataTable = require('../public/js/data-table.js');

// --- visibleColumns ---

var cols = [
    { key: 'rank' },                       // always visible
    { key: 'club' },
    { key: 'value', hideBelow: 700, defaultHidden: true }
];

function keysOf(out) { return out.map(function (c) { return c.key; }); }

// default-visible columns survive; defaultHidden: true column excluded by default
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: {}, runtimeHidden: [], widthTier: null })),
    ['rank', 'club'],
    'default-visible columns survive, defaultHidden column excluded');

// defaultHidden: true column is included when state.hidden[key] === false
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: { value: false }, runtimeHidden: [], widthTier: null })),
    ['rank', 'club', 'value'],
    'hidden[key] === false overrides defaultHidden');

// explicit user hide via state.hidden[key] === true
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: { club: true }, runtimeHidden: [], widthTier: null })),
    ['rank'],
    'hidden[key] === true hides the column');

// runtimeHidden wins over state.hidden[key] === false
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: { club: false }, runtimeHidden: ['club'], widthTier: null })),
    ['rank'],
    'runtimeHidden wins over hidden[key] === false');

// hideBelow: 700 with NO user choice: the tier acts as a default -> hidden
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: {}, runtimeHidden: [], widthTier: 700 })),
    ['rank', 'club'],
    'hideBelow column hidden at tier 700 with no user choice');

// explicit user SHOW overrides the width tier (owner decision 8: users can
// choose columns at any width — re-enabling a phone-hidden column)
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: { value: false }, runtimeHidden: [], widthTier: 700 })),
    ['rank', 'club', 'value'],
    'hidden[key] === false overrides the width tier');

// ...and the tier still hides with no user choice at wider tiers (covered
// above: tier 900 keeps value visible)

// runtimeHidden stays authoritative: it beats an explicit user SHOW even
// at the tier that would hide the column anyway
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: { value: false }, runtimeHidden: ['value'], widthTier: 700 })),
    ['rank', 'club'],
    'runtimeHidden wins over an explicit show at tier 700');

// ...but visible at widthTier: 900 (and at null, covered above)
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: { value: false }, runtimeHidden: [], widthTier: 900 })),
    ['rank', 'club', 'value'],
    'hideBelow: 700 column visible at widthTier 900');

// --- sortRowsNullsLast ---

var srows = [
    { navn: 'A', poeng: 100 },
    { navn: 'B', poeng: null },
    { navn: 'C', poeng: 300 },
    { navn: 'D', poeng: 100 },
    { navn: 'E', poeng: undefined },
    { navn: 'F', poeng: 200 }
];

function navnOf(sorted) { return sorted.map(function (r) { return r.navn; }); }

// nulls last under asc; equal keys keep input order (A before D); nulls keep input order (B before E)
assert.deepStrictEqual(
    navnOf(StandplassDataTable.sortRowsNullsLast(srows, 'poeng', 'asc')),
    ['A', 'D', 'F', 'C', 'B', 'E'],
    'asc: nulls last, equal keys and nulls keep input order');

// nulls last under desc; numeric desc ordering correct
assert.deepStrictEqual(
    navnOf(StandplassDataTable.sortRowsNullsLast(srows, 'poeng', 'desc')),
    ['C', 'F', 'A', 'D', 'B', 'E'],
    'desc: numeric order correct, nulls still last');

// the input array is not reordered
assert.deepStrictEqual(
    navnOf(srows),
    ['A', 'B', 'C', 'D', 'E', 'F'],
    'input array must not be mutated');

// Norwegian collation for string columns: Æ < Ø < Å, like the site's own
// name sorts (localeCompare 'no'). Raw code-point order would put Å
// (U+00C5) before Æ (U+00C6) and Ø (U+00D8).
var noRows = [{ n: 'Åsen' }, { n: 'Ælverum' }, { n: 'Ørland' }, { n: 'Bodø' }];
function nOf(sorted) { return sorted.map(function (r) { return r.n; }); }
assert.deepStrictEqual(
    nOf(StandplassDataTable.sortRowsNullsLast(noRows, 'n', 'asc')),
    ['Bodø', 'Ælverum', 'Ørland', 'Åsen'],
    'asc: Norwegian collation Æ < Ø < Å, not code-point order');
assert.deepStrictEqual(
    nOf(StandplassDataTable.sortRowsNullsLast(noRows, 'n', 'desc')),
    ['Åsen', 'Ørland', 'Ælverum', 'Bodø'],
    'desc: mirrors the Norwegian order');

// --- secondary sort key (tie-break column) ---
// A column may declare secondaryKey (+ secondaryDir, default 'asc'):
// equal primary values order by the secondary — Klassefordeling's
// Øvelse sort keeps each øvelse's classes alphabetical while the
// default page order (starts desc) stays untouched. Both passes are
// stable and nulls-last: primary nulls sink to the very end, secondary
// nulls last within their tie group.
var secRows = [
    { o: 'Finfelt', k: 'Åpen' },
    { o: 'Grovfelt', k: 'A' },
    { o: 'Finfelt', k: 'Ærlig' },
    { o: 'Finfelt', k: null }
];
function secOf(sorted) { return sorted.map(function (r) { return r.o + '/' + r.k; }); }
assert.deepStrictEqual(
    secOf(StandplassDataTable.sortRowsNullsLast(secRows, 'o', 'asc', 'k')),
    ['Finfelt/Ærlig', 'Finfelt/Åpen', 'Finfelt/null', 'Grovfelt/A'],
    'secondaryKey: primary ties order by the secondary (Norwegian collation), secondary nulls last');
assert.deepStrictEqual(
    secOf(StandplassDataTable.sortRowsNullsLast(secRows, 'o', 'asc', 'k', 'desc')),
    ['Finfelt/Åpen', 'Finfelt/Ærlig', 'Finfelt/null', 'Grovfelt/A'],
    'secondaryDir desc reverses only the tie-break');
assert.deepStrictEqual(
    secOf(StandplassDataTable.sortRowsNullsLast(secRows, 'o', 'desc', 'k')),
    ['Grovfelt/A', 'Finfelt/Ærlig', 'Finfelt/Åpen', 'Finfelt/null'],
    'primary desc still groups; ties stay secondary-asc; primary nulls last');
assert.deepStrictEqual(
    secOf(StandplassDataTable.sortRowsNullsLast(secRows, 'o', 'asc')),
    ['Finfelt/Åpen', 'Finfelt/Ærlig', 'Finfelt/null', 'Grovfelt/A'],
    'no secondaryKey: today\'s behavior — ties keep input order (Åpen before Ærlig)');

// Through renderTable: the column spec carries the secondary key.
var secHtml = StandplassDataTable.renderTable('sec-test',
    { columns: [
        { key: 'o', label: 'Ø', sortable: true, defaultDir: 'asc', secondaryKey: 'k' },
        { key: 'k', label: 'K', sortable: true, defaultDir: 'asc' }
    ], rows: secRows, ariaLabel: 'sec' },
    { sort: { key: 'o', dir: 'asc' }, hidden: {}, runtimeHidden: [], widthTier: null });
assert.ok(secHtml.indexOf('Ærlig') < secHtml.indexOf('Åpen') && secHtml.indexOf('Åpen') < secHtml.indexOf('Grovfelt'),
    'renderTable: øvelse sort with secondaryKey renders tie-broken order');

// wirePicker: the picker-dropdown half of wireTable, callable without a
// table (page-level pickers) — export pin; the wiring itself is DOM/
// manual-QA per project convention.
assert.strictEqual(typeof StandplassDataTable.wirePicker, 'function', 'wirePicker exported');

// wirePicker discovers its button by [data-dt-picker] as well as by the
// .dt-picker-btn class: the attribute (which renderPickerButton has
// always emitted) is the semantic hook, the class is just one styling
// of it. A page can style its picker button freely — the stevner
// stats-bar Kolonner button reuses the Fold-alle look and carries no
// dt-picker-btn class at all. Fake-DOM stand-ins, the filter-widgets
// convention.
global.StandplassFilterWidgets = global.StandplassFilterWidgets || require('../public/js/filter-widgets.js');
function wpEl() {
    return {
        listeners: {},
        addEventListener: function (evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); },
        removeEventListener: function (evt, fn) {
            var arr = this.listeners[evt] || [];
            var i = arr.indexOf(fn);
            if (i !== -1) { arr.splice(i, 1); }
        },
        hasAttribute: function () { return true; },
        setAttribute: function () {},
        removeAttribute: function () {},
        appendChild: function (el) { (this.kids = this.kids || []).push(el); }
    };
}
var wpBtn = wpEl();
wpBtn.getRootNode = function () { return wpRootNode; };
wpBtn.parentElement = { contains: function () { return false; } };
var wpRootNode = wpEl();
// The anchor models the real hazard: a page may host its BUTTON inside
// the anchor (the stevner Kolonner button wraps in it so the panel
// aligns with the button) — so an innerHTML assignment on the anchor
// DESTROYS the button. wirePicker must build its panel scaffold with
// DOM insertion, never an innerHTML wipe.
var wpAnchorWrites = 0;
var wpAnchorKids = [];
var wpAnchor = {
    get innerHTML() { return ''; },
    set innerHTML(v) { wpAnchorWrites++; wpAnchorKids = []; },
    appendChild: function (el) { el.parentNode = this; wpAnchorKids.push(el); },
    removeChild: function (el) {
        var i = wpAnchorKids.indexOf(el);
        if (i !== -1) { wpAnchorKids.splice(i, 1); }
        el.parentNode = null;
    },
    querySelector: function (sel) {
        if (sel.indexOf('checkbox-dropdown-panel') === -1) { return null; }
        for (var i = 0; i < wpAnchorKids.length; i++) {
            if (wpAnchorKids[i].className === 'checkbox-dropdown-panel') { return wpAnchorKids[i]; }
        }
        return null;
    }
};
// wirePicker's scaffold builder runs document.createElement.
global.document = { createElement: function () { return wpEl(); } };
// Returns the button ONLY for a selector that mentions data-dt-picker —
// pins that the discovery query covers attribute-only buttons.
var wpScope = {
    querySelector: function (sel) {
        if (sel.indexOf('data-dt-picker') !== -1) { return wpBtn; }
        if (sel.indexOf('dt-picker-anchor') !== -1) { return wpAnchor; }
        return null;
    }
};
var wpHandle = StandplassDataTable.wirePicker(wpScope,
    { columns: [{ key: 'a', label: 'A' }], picker: { buttonLabel: 'Kolonner' } }, {},
    { hidden: {}, runtimeHidden: [], widthTier: null });
assert.ok(wpHandle, 'wirePicker wires a button discovered by [data-dt-picker]');
assert.strictEqual(wpBtn.listeners.click ? wpBtn.listeners.click.length : 0, 1,
    'the attribute-discovered button got its click listener');
assert.strictEqual(wpBtn.textContent, 'Kolonner', 'the picker label is forced onto the button');
assert.strictEqual(wpAnchorWrites, 0,
    'wirePicker never assigns the anchor innerHTML — a wrapped button would be destroyed');
assert.ok(wpAnchorKids.length > 0 && wpAnchorKids[0].className === 'checkbox-dropdown-panel',
    'the panel scaffold is built inside the anchor by DOM insertion');
wpHandle.destroy();
assert.strictEqual(wpBtn.listeners.click ? wpBtn.listeners.click.length : 0, 0,
    'the handle destroys the wiring');
// Re-wiring (the stevner picker does destroy-before-rewire per render):
// the previous scaffold is replaced, not stacked.
var wpHandle2 = StandplassDataTable.wirePicker(wpScope,
    { columns: [{ key: 'a', label: 'A' }], picker: { buttonLabel: 'Kolonner' } }, {},
    { hidden: {}, runtimeHidden: [], widthTier: null });
var wpPanels = wpAnchorKids.filter(function (k) { return k.className === 'checkbox-dropdown-panel'; });
assert.strictEqual(wpPanels.length, 1, 're-wiring replaces the old scaffold instead of stacking a second');
wpHandle2.destroy();
delete global.document;

// --- renderTable: golden markup ---

function escText(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function clubLinkCell(row) {
    return '<a href="/?klubb=' + encodeURIComponent(row.club) + '">' + escText(row.club) + '</a>';
}

var emptyState = { hidden: {}, runtimeHidden: [], widthTier: null };

// 1. Toplist shape: byte-parity with today's toplistCard markup (sortable off)
var tlRows = [
    { club: 'A & B skyttere', value: 30 },
    { club: 'C skyttere', value: 45 }
];
var tlCols = [
    { key: 'rank', label: '#', align: 'center', cell: function (row, i) { return i + 1; } },
    { key: 'club', label: 'Klubb', raw: true, cell: clubLinkCell },
    { key: 'value', label: 'Starter', align: 'right' }
];
var tlHtml = StandplassDataTable.renderTable(
    'toplist-test',
    { columns: tlCols, rows: tlRows, ariaLabel: 'Flest starter 2026' },
    emptyState
);
assert.strictEqual(tlHtml,
    '<table class="ranking-table" data-dt-id="toplist-test" aria-label="Flest starter 2026">'
    + '<thead><tr><th scope="col" class="ranking-rank">#</th><th scope="col">Klubb</th><th scope="col" class="ranking-score">Starter</th></tr></thead>'
    + '<tbody>'
    + '<tr data-dt-row="0"><td class="ranking-rank">1</td><td><a href="/?klubb=A%20%26%20B%20skyttere">A &amp; B skyttere</a></td><td class="ranking-score">30</td></tr>'
    + '<tr data-dt-row="1"><td class="ranking-rank">2</td><td><a href="/?klubb=C%20skyttere">C skyttere</a></td><td class="ranking-score">45</td></tr>'
    + '</tbody></table>',
    'toplist golden markup, sortable off, & escaped inside raw link cell');

// 2. Sortable on: sort-button affordance in the header, no aria-sort when inactive
var tlColsSortable = [
    { key: 'rank', label: '#', align: 'center', cell: function (row, i) { return i + 1; } },
    { key: 'club', label: 'Klubb', sortable: true, defaultDir: 'asc', raw: true, cell: clubLinkCell },
    { key: 'value', label: 'Starter', align: 'right', sortable: true, defaultDir: 'desc' }
];
var tlSortBtnHtml = StandplassDataTable.renderTable(
    'toplist-test',
    { columns: tlColsSortable, rows: tlRows, ariaLabel: 'Flest starter 2026' },
    emptyState
);
assert.ok(tlSortBtnHtml.indexOf(
    '<thead><tr><th scope="col" class="ranking-rank">#</th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="club">Klubb<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="value">Starter<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'sortable columns wrap their label in the sort button');
assert.ok(tlSortBtnHtml.indexOf('aria-sort') === -1, 'no aria-sort when no sort is active');

// 3. Active sort: aria-sort on that column only; tbody reorders; # recomputes;
//    data-dt-row keeps the ORIGINAL data index so wiring can map back to rows
var tlSortedHtml = StandplassDataTable.renderTable(
    'toplist-test',
    { columns: tlColsSortable, rows: tlRows, ariaLabel: 'Flest starter 2026' },
    { hidden: {}, runtimeHidden: [], widthTier: null, sort: { key: 'value', dir: 'desc' } }
);
assert.ok(tlSortedHtml.indexOf(
    '<th scope="col" class="ranking-score" aria-sort="descending"><button type="button" class="dt-sort-btn" data-dt-sort="value">') !== -1,
    'active sort column carries aria-sort="descending"');
assert.ok(tlSortedHtml.indexOf(
    '<tbody><tr data-dt-row="1"><td class="ranking-rank">1</td><td><a href="/?klubb=C%20skyttere">C skyttere</a></td><td class="ranking-score">45</td></tr>'
    + '<tr data-dt-row="0"><td class="ranking-rank">2</td><td><a href="/?klubb=A%20%26%20B%20skyttere">A &amp; B skyttere</a></td><td class="ranking-score">30</td></tr></tbody>') !== -1,
    'desc sort reorders tbody, # recomputes, data-dt-row keeps data index');

// defaultSort marks the initial aria-sort without reordering rows
var tlDefaultSortHtml = StandplassDataTable.renderTable(
    'toplist-test',
    { columns: tlColsSortable, rows: tlRows, ariaLabel: 'Flest starter 2026', defaultSort: { key: 'value', dir: 'desc' } },
    emptyState
);
assert.ok(tlDefaultSortHtml.indexOf('aria-sort="descending"') !== -1, 'defaultSort marks the initial aria-sort');
assert.ok(tlDefaultSortHtml.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><td><a href="/?klubb=A%20%26%20B%20skyttere">') !== -1,
    'defaultSort does not reorder rows (page order stands)');

// 4. Top-3 shape: asRowHeader cells, alternating cellClass, double-quote escaping
var t3Rows = [
    { name: 'Ola "Olsen" Nordmann', c0: 4, c1: 3, total: 7 },
    { name: 'Kari Hansen', c0: 2, c1: 5, total: 7 }
];
var t3Cols = [
    { key: 'rank', label: '#', align: 'center', cell: function (row, i) { return i + 1; } },
    { key: 'name', label: 'Navn', asRowHeader: true },
    { key: 'c0', label: 'Sportspistol 60', cellClass: 'ranking-score' },
    { key: 'c1', label: 'Felt 30', cellClass: 'ranking-score top3-col-alt' },
    { key: 'total', label: 'Totalt', align: 'right' }
];
var t3Html = StandplassDataTable.renderTable(
    'top3-test',
    { columns: t3Cols, rows: t3Rows, ariaLabel: 'Flest topp-3 plasseringer' },
    emptyState
);
assert.strictEqual(t3Html,
    '<table class="ranking-table" data-dt-id="top3-test" aria-label="Flest topp-3 plasseringer">'
    + '<thead><tr><th scope="col" class="ranking-rank">#</th><th scope="col">Navn</th><th scope="col" class="ranking-score">Sportspistol 60</th><th scope="col" class="ranking-score top3-col-alt">Felt 30</th><th scope="col" class="ranking-score">Totalt</th></tr></thead>'
    + '<tbody>'
    + '<tr data-dt-row="0"><td class="ranking-rank">1</td><th scope="row">Ola &quot;Olsen&quot; Nordmann</th><td class="ranking-score">4</td><td class="ranking-score top3-col-alt">3</td><td class="ranking-score">7</td></tr>'
    + '<tr data-dt-row="1"><td class="ranking-rank">2</td><th scope="row">Kari Hansen</th><td class="ranking-score">2</td><td class="ranking-score top3-col-alt">5</td><td class="ranking-score">7</td></tr>'
    + '</tbody></table>',
    'top-3 golden markup with row headers, alternating classes, escaped quotes');

// 5. groupRows hook: group row with colspan = visible column count
var gRows = [{ g: 'a', v: 1 }, { g: 'b', v: 2 }];
var gCols = [{ key: 'g', label: 'G' }, { key: 'v', label: 'V', align: 'right' }];
var gHtml = StandplassDataTable.renderTable(
    'grp-test',
    {
        columns: gCols, rows: gRows, ariaLabel: 'grupper',
        groupRows: function (rs) { return [{ label: 'Gruppe A', rows: [rs[0]] }, { label: 'Gruppe B', rows: [rs[1]] }]; }
    },
    emptyState
);
assert.strictEqual(gHtml,
    '<table class="ranking-table" data-dt-id="grp-test" aria-label="grupper">'
    + '<thead><tr><th scope="col">G</th><th scope="col" class="ranking-score">V</th></tr></thead>'
    + '<tbody>'
    + '<tr class="dt-group-row"><th scope="colgroup" colspan="2">Gruppe A</th></tr>'
    + '<tr data-dt-row="0"><td>a</td><td class="ranking-score">1</td></tr>'
    + '<tr class="dt-group-row"><th scope="colgroup" colspan="2">Gruppe B</th></tr>'
    + '<tr data-dt-row="1"><td>b</td><td class="ranking-score">2</td></tr>'
    + '</tbody></table>',
    'groupRows emits group header rows with correct colspan');

// 6. rowAttrs hook: attribute string lands on the <tr>
var rHtml = StandplassDataTable.renderTable(
    'ra-test',
    { columns: gCols, rows: gRows, ariaLabel: 'attrs', rowAttrs: function (row, i) { return 'data-idx="' + i + '"'; } },
    emptyState
);
assert.ok(rHtml.indexOf('<tr data-dt-row="0" data-idx="0">') !== -1
    && rHtml.indexOf('<tr data-dt-row="1" data-idx="1">') !== -1,
    'rowAttrs string is appended to the <tr>');

// 7. picker toolbar precedes the table; wrapClass wraps toolbar + table
var pHtml = StandplassDataTable.renderTable(
    'pk-test',
    { columns: gCols, rows: gRows, ariaLabel: 'picker', picker: { buttonLabel: 'Kolonner' } },
    emptyState
);
assert.ok(pHtml.indexOf(
    '<div class="dt-toolbar"><button type="button" class="dt-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">Kolonner</button><div class="dt-picker-anchor"></div></div>'
    + '<table class="ranking-table" data-dt-id="pk-test"') === 0,
    'picker toolbar precedes the table');

var wHtml = StandplassDataTable.renderTable(
    'wk-test',
    { columns: gCols, rows: gRows, ariaLabel: 'wrap', wrapClass: 'ranking-card-table-wrap club-stats-list-scroll', picker: { buttonLabel: 'Kolonner' } },
    emptyState
);
assert.ok(wHtml.indexOf('<div class="ranking-card-table-wrap club-stats-list-scroll"><div class="dt-toolbar">') === 0
    && wHtml.slice(-6) === '</div>',
    'wrapClass wraps toolbar + table');

// 8. renderPickerButton: the button + anchor for pages that host the
// picker in their own controls row; picker.toolbar === false keeps
// renderTable from emitting its own toolbar row.
assert.strictEqual(StandplassDataTable.renderPickerButton({ buttonLabel: 'Kolonner' }),
    '<button type="button" class="dt-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">Kolonner</button>'
    + '<div class="dt-picker-anchor"></div>',
    'renderPickerButton emits the button + anchor');

var noToolbarHtml = StandplassDataTable.renderTable(
    'nt-test',
    { columns: gCols, rows: gRows, ariaLabel: 'nt', wrapClass: 'some-wrap', picker: { buttonLabel: 'Kolonner', toolbar: false } },
    emptyState
);
assert.ok(noToolbarHtml.indexOf('<div class="some-wrap"><table class="ranking-table"') === 0,
    'toolbar:false — the wrap contains only the table');
assert.ok(noToolbarHtml.indexOf('dt-toolbar') === -1 && noToolbarHtml.indexOf('dt-picker-btn') === -1,
    'toolbar:false — no toolbar or picker button emitted');

// 9. zebraClass: alternating column shading computed over the VISIBLE
// columns carrying it. Baked absolute positions would strand same-shaded
// neighbors once the picker (or a width tier) hides columns; counting
// only the visible ones re-flows the alternation.
var zCols = [
    { key: 'n', label: 'Navn' },
    { key: 'a', label: 'A', cellClass: 'ranking-score', zebraClass: 'top3-col-alt' },
    { key: 'b', label: 'B', cellClass: 'ranking-score', zebraClass: 'top3-col-alt' },
    { key: 'c', label: 'C', cellClass: 'ranking-score', zebraClass: 'top3-col-alt' }
];
var zRows = [{ n: 'X', a: 1, b: 2, c: 3 }];
var zebraAllHtml = StandplassDataTable.renderTable(
    'z-test', { columns: zCols, rows: zRows, ariaLabel: 'z' },
    { hidden: {}, runtimeHidden: [], widthTier: null }
);
assert.ok(zebraAllHtml.indexOf('<th scope="col" class="ranking-score top3-col-alt">B</th>') >= 0,
    'all visible: 2nd zebra column shaded');
assert.ok(zebraAllHtml.indexOf('<td class="ranking-score top3-col-alt">2</td>') >= 0,
    'shading reaches the body cells');
assert.strictEqual((zebraAllHtml.match(/top3-col-alt/g) || []).length, 2,
    'exactly one th + one td per shaded column');
var zebraSubsetHtml = StandplassDataTable.renderTable(
    'z-test', { columns: zCols, rows: zRows, ariaLabel: 'z' },
    { hidden: { b: true }, runtimeHidden: [], widthTier: null }
);
assert.ok(zebraSubsetHtml.indexOf('<th scope="col" class="ranking-score top3-col-alt">C</th>') >= 0,
    'subset: hiding the shaded column shades the next visible one');
assert.ok(zebraSubsetHtml.indexOf('<th scope="col" class="ranking-score">A</th>') >= 0,
    'subset: 1st visible zebra column stays unshaded');
var zebraLoneHtml = StandplassDataTable.renderTable(
    'z-test', { columns: zCols, rows: zRows, ariaLabel: 'z' },
    { hidden: { a: true, c: true }, runtimeHidden: [], widthTier: null }
);
assert.ok(zebraLoneHtml.indexOf('top3-col-alt') === -1,
    'a lone visible zebra column is 1st — unshaded');

// 10. data-dt-row identity semantics (pinning tests for the lookup-map
// refactor): a row object appearing twice in rows stamps BOTH <tr>s
// with the FIRST occurrence's index; groupRows-synthesized rows not
// present in opts.rows yield -1.
var dupRow = { n: 'X' };
var dupHtml = StandplassDataTable.renderTable(
    'dup-test',
    { columns: [{ key: 'n', label: 'N' }], rows: [dupRow, { n: 'Y' }, dupRow], ariaLabel: 'dup' },
    { hidden: {}, runtimeHidden: [], widthTier: null }
);
assert.ok(dupHtml.indexOf('<tr data-dt-row="0"><td>X</td></tr><tr data-dt-row="1"><td>Y</td></tr><tr data-dt-row="0"><td>X</td></tr>') >= 0,
    'duplicate row references stamp the first occurrence\'s index');
var grpHtml = StandplassDataTable.renderTable(
    'grp-test',
    { columns: [{ key: 'n', label: 'N' }], rows: [], ariaLabel: 'grp',
        groupRows: function () { return [{ label: 'G', rows: [{ n: 'Z' }] }]; } },
    { hidden: {}, runtimeHidden: [], widthTier: null }
);
assert.ok(grpHtml.indexOf('<tr data-dt-row="-1"><td>Z</td></tr>') >= 0,
    'groupRows-synthesized rows yield -1');

// --- wireTable: guard against non-DOM roots (Node stand-in) ---
var wired = StandplassDataTable.wireTable({}, 'guard-test', { columns: [], rows: [] }, {});
assert.strictEqual(typeof wired.destroy, 'function', 'wireTable returns { destroy }');
wired.destroy();

// with handlers and state present it still no-ops safely
var wired2 = StandplassDataTable.wireTable(
    {},
    'guard-test',
    { columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }], picker: { buttonLabel: 'Kolonner' } },
    { onSortChange: function () {}, onColumnsChange: function () {}, onWidthTierChange: function () {}, onRowClick: function () {} },
    { hidden: {}, runtimeHidden: [], widthTier: null }
);
assert.strictEqual(typeof wired2.destroy, 'function', 'wired table with full handlers returns { destroy }');
wired2.destroy();

// No ariaLabel passed → NO aria-label attribute: an empty aria-label is
// an unnamed table exactly like no attribute, but it is byte-dirt on
// every consumer with nothing to name (all stevner card tables, the
// club-stats toplists). Consumers with a real label keep it.
var noLabelHtml = StandplassDataTable.renderTable('nl-test', { columns: tlCols, rows: tlRows }, emptyState);
assert.ok(noLabelHtml.indexOf('<table class="ranking-table" data-dt-id="nl-test">') === 0,
    'no ariaLabel opt → no aria-label attribute');
assert.ok(noLabelHtml.indexOf('aria-label') === -1,
    'the table element carries no aria-label anywhere');

console.log('data-table.test.js: all assertions passed');
