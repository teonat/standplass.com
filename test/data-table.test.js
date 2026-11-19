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

console.log('data-table.test.js: all assertions passed');
