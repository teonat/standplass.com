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

// description comes from a third-party API and must be escaped
var xssBody = CM.renderDetailBody({ competitionNumber: '1', description: '<img src=x onerror=alert(1)>', events: [] });
assert.ok(xssBody.indexOf('<img src=x') < 0, 'description markup is not emitted raw');
assert.ok(xssBody.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0, 'description is escaped');

// the common case (plain text) still renders inside the description div
var plainBody = CM.renderDetailBody({ competitionNumber: '2', description: 'Vanlig stevne', events: [] });
assert.ok(plainBody.indexOf('<div class="comp-modal-description">Vanlig stevne</div>') >= 0, 'plain description renders unchanged');

console.log('comp-modal.test.js: all assertions passed');
