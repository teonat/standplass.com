'use strict';
var assert = require('node:assert');
var SP = require('../public/js/stevner-page.js');
var PM = require('../public/js/person-modal.js');

// flattenRows must hand the chart a *date-only* string (nsf-ui.js:2166 does
// `comp.startDate.slice(0, 10)`): person-modal.js keys its "best result per
// date" reduction on this value and parses it with getUTC*, both of which
// misbehave on a full local-time datetime.
var rows = SP.flattenRows({
    competitions: [
        { startDate: '2025-12-30T10:04:00', applicableForClassification: true, results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 2, score: 28, rankingScore: 90 }] },
        { startDate: '2025-12-30T18:00:00', applicableForClassification: true, results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 1, score: 30, rankingScore: 95 }] },
        { startDate: '2025-06-01T09:00:00', applicableForClassification: true, results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 3, score: 25, rankingScore: 80 }] },
        { results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 4 }] }
    ]
});
assert.deepStrictEqual(rows.map(function (r) { return r.date; }), ['2025-12-30', '2025-12-30', '2025-06-01', '']);

// Two competitions on the same calendar day therefore merge into one line
// point (best result of the day), while every dot is still drawn.
var container = { innerHTML: '' };
PM.renderChart(container, rows, 'rankingScore');
assert.strictEqual(container.innerHTML.match(/points="([^"]*)"/)[1].split(' ').length, 2, 'same-day competitions must share one line point');
assert.strictEqual((container.innerHTML.match(/<circle/g) || []).length, 3, 'all dated results still get a dot');

console.log('stevner-page.test.js: all assertions passed');
