'use strict';
var assert = require('node:assert');
var StandplassTable = require('../public/js/table-renderer.js');

var rows = [
    { navn: 'B', poeng: 240 },
    { navn: 'A', poeng: 250 }
];

var sortedAsc = StandplassTable.sortRows(rows, 'poeng', 'asc');
assert.strictEqual(sortedAsc[0].navn, 'B');

var sortedDesc = StandplassTable.sortRows(rows, 'poeng', 'desc');
assert.strictEqual(sortedDesc[0].navn, 'A');
assert.strictEqual(rows[0].navn, 'B', 'sortRows must not mutate the input array');

var html = StandplassTable.renderRows(
    [{ key: 'navn' }, { key: 'poeng' }],
    [{ navn: '<script>', poeng: 250 }]
);
assert.ok(html.indexOf('&lt;script&gt;') !== -1, 'should escape HTML in cell values');
assert.ok(html.indexOf('250') !== -1);

// format() output is escaped by default...
var formatted = StandplassTable.renderRows(
    [{ key: 'navn', format: function (v) { return '<b>' + v + '</b>'; } }],
    [{ navn: 'A' }]
);
assert.ok(formatted.indexOf('&lt;b&gt;A&lt;/b&gt;') !== -1, 'format() output should be escaped by default');

// ...unless the column opts in with raw:true.
var rawHtml = StandplassTable.renderRows(
    [{ key: 'navn', format: function (v) { return '<b>' + v + '</b>'; }, raw: true }],
    [{ navn: 'A' }]
);
assert.ok(rawHtml.indexOf('<td><b>A</b></td>') !== -1, 'raw:true should skip escaping');

console.log('table-renderer.test.js: all assertions passed');
