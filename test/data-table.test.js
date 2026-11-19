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

// hideBelow: 700 column excluded at widthTier: 700 even when explicitly shown
assert.deepStrictEqual(
    keysOf(StandplassDataTable.visibleColumns(cols, { hidden: { value: false }, runtimeHidden: [], widthTier: 700 })),
    ['rank', 'club'],
    'hideBelow: 700 column excluded at widthTier 700');

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

console.log('data-table.test.js: all assertions passed');
