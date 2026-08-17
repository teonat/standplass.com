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

var comps = [
    {
        id: 'c1', title: 'Vårfelt', status: 1, startDate: '2025-04-01',
        facilityName: 'Bane A', organizationName: 'Klubb A',
        resultFileUrl: 'https://example.test/r.pdf', deepLink: 'https://skyting.no/c1',
        applicableForClassification: true,
        results: [
            { personId: '1', name: 'Ola', club: 'Klubb A', discipline: 'Grovfelt', class: 'A', position: 2, score: 28, rankingScore: 90 },
            { personId: '2', name: 'Kari', club: 'Klubb B', discipline: 'Grovfelt', class: 'B', position: 1, score: 30, rankingScore: 95 },
            { personId: '3', name: 'Per', club: 'Klubb A', discipline: 'Fellesfelt', class: 'A', position: 1, score: 27, rankingScore: 88 }
        ]
    },
    {
        id: 'c2', title: 'Høstfelt', status: 3, startDate: '2025-09-01',
        facilityName: 'Bane B', organizationName: 'Klubb B', resultFileUrl: null,
        deepLink: 'https://skyting.no/c2', applicableForClassification: false,
        results: [{ personId: '2', name: 'Kari', club: 'Klubb B', discipline: 'Grovfelt', class: 'B', position: 1, score: 29, rankingScore: 92 }]
    }
];
var baseFilters = { activeTab: 'alle', activeDiscs: [], activeClubs: [], klubbUnmatched: false, klubb: null, nameQuery: '', groupMode: 'klasse',
    activeOrganizers: [], compQuery: '' };

var cards = SP.buildCompetitionCards(comps, baseFilters);
assert.strictEqual(cards.length, 2, 'both competitions survive an unfiltered build');
assert.strictEqual(cards[0].id, 'c1');
assert.strictEqual(cards[0].title, 'Vårfelt');
assert.strictEqual(cards[0].status, 1);
assert.strictEqual(cards[0].resultFileUrl, 'https://example.test/r.pdf');

// klasse mode keys on discipline|class, so c1's three results form THREE
// groups (Grovfelt|A, Grovfelt|B, Fellesfelt|A), not two.
assert.strictEqual(cards[0].groups.length, 3, 'klasse mode groups by discipline+class');
assert.deepStrictEqual(cards[0].groups.map(function (g) { return g.label; }).sort(), ['Fellesfelt – A', 'Grovfelt – A', 'Grovfelt – B'].sort());
assert.strictEqual(cards[0].stats.skyttere, 3);
assert.strictEqual(cards[0].stats.startere, 3);
assert.strictEqual(cards[0].stats.snitt, (28 + 30 + 27) / 3);

var klasseOnly = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { activeTab: 'klasse' }));
assert.strictEqual(klasseOnly.length, 1, 'ikke-klasseførende competition c2 is dropped entirely');
assert.strictEqual(klasseOnly[0].id, 'c1');

var byClub = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { activeClubs: ['Klubb A'] }));
assert.strictEqual(byClub.length, 1, 'c2 has no Klubb A rows once filtered, so the whole card drops');
assert.strictEqual(byClub[0].stats.startere, 2, 'c1 keeps only its 2 Klubb A rows');

var ovelseMode = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { groupMode: 'ovelse' }));
assert.strictEqual(ovelseMode[0].groups.length, 2, 'ovelse mode groups by discipline only');

assert.ok(cards[0].groups[0].rows[0].nameHtml.indexOf('data-discipline="') !== -1, 'nameHtml now carries the row discipline for Task 7');

var byKlubbSlug = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { klubbUnmatched: true, klubb: 'a' }));
assert.strictEqual(byKlubbSlug.length, 1, 'klubbUnmatched filter with slug "a" matches "Klubb A" and drops "Klubb B" competitions entirely');
assert.strictEqual(byKlubbSlug[0].stats.startere, 2, 'c1 keeps only its 2 Klubb A rows when filtered by klub slug');

assert.strictEqual(SP.statsLine({ skyttere: 3, startere: 5, snitt: 27.4, median: 28 }),
    '3 skyttere · 5 startere · snitt 27,4 · median 28');
assert.strictEqual(SP.statsLine({ skyttere: 0, startere: 0, snitt: null, median: null }),
    '0 skyttere · 0 startere · snitt – · median –');
assert.strictEqual(SP.statsLine({ skyttere: 3, startere: 5, snitt: 45.333333333333336, median: 44.5 }),
    '3 skyttere · 5 startere · snitt 45,3 · median 44,5', 'repeating decimals round to one decimal');
assert.strictEqual(SP.formatUpdated('2026-08-17T14:05:00Z'), 'Oppdatert 17.08.2026 kl. 14:05');
assert.strictEqual(SP.formatUpdated(undefined), '', 'missing lastUpdated yields no text, not NaN');

var byOrganizer = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { activeOrganizers: ['Klubb A'] }));
assert.strictEqual(byOrganizer.length, 1, 'only c1 (organizationName "Klubb A") matches');
assert.strictEqual(byOrganizer[0].id, 'c1');

var byTitle = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { compQuery: 'høst' }));
assert.strictEqual(byTitle.length, 1, 'case-insensitive substring match against comp.title');
assert.strictEqual(byTitle[0].id, 'c2');

var noMatch = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { compQuery: 'nonexistent' }));
assert.strictEqual(noMatch.length, 0);

console.log('stevner-page.test.js: all assertions passed');
