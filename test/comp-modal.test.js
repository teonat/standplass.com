'use strict';
var assert = require('node:assert');
var CM = require('../public/js/comp-modal.js');

var events = [
    { discipline: 'Grovfelt', class: 'A', entryFee: 150 },
    { discipline: 'Grovfelt', class: 'B', entryFee: 150 },
    { discipline: 'Fellesfelt', class: 'A', entryFee: 100 }
];
var grouped = CM.groupEventsByDiscipline(events);
assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].discipline, 'Fellesfelt', 'groups sort alphabetically');
assert.strictEqual(grouped[1].events.length, 2);

console.log('comp-modal.test.js: all assertions passed');
