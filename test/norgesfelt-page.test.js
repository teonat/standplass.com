var assert = require('assert');
var NP = require('../public/js/norgesfelt-page.js');

// normalizeClub / matchesClub -- same substring-match convention as
// stevner-page.js (duplicated on purpose, see norgesfelt-page.js's own
// comment for why).
assert.strictEqual(NP.normalizeClub('Oslo Pistolklubb'), 'oslopistolklubb');
assert.strictEqual(NP.normalizeClub('Ås Skytterlag'), 'asskytterlag', 'æøå must fold to plain letters');
assert.ok(NP.matchesClub('Kongsvinger Sportsskyttere', 'kongsvinger'));
assert.ok(!NP.matchesClub('Oslo Pistolklubb', 'kongsvinger'));

// flattenAll -- tags each row with its discipline, across every discipline key
var sampleData = {
    disciplines: {
        Finfelt: {
            individual: [{ rank: 1, date: '15.04.2026', name: 'Ola', club: 'Oslo Pistolklubb', points: 80, innertreff: 38 }],
            total: [{ rank: 1, name: 'Ola', club: 'Oslo Pistolklubb', points: 240, innertreff: 112 }]
        },
        Grovfelt: {
            individual: [{ rank: 1, date: '16.04.2026', name: 'Kari', club: 'Bergen Pistolklubb', points: 70, innertreff: 20 }],
            total: []
        }
    }
};
var flatIndividual = NP.flattenAll(sampleData, 'individual');
assert.strictEqual(flatIndividual.length, 2);
assert.strictEqual(flatIndividual[0].discipline, 'Finfelt');
assert.strictEqual(flatIndividual[1].discipline, 'Grovfelt');
var flatTotal = NP.flattenAll(sampleData, 'total');
assert.strictEqual(flatTotal.length, 1, 'Grovfelt has no total rows in this fixture');

// enumerateClubs -- distinct, sorted, scans both individual and total
var clubs = NP.enumerateClubs(sampleData);
assert.deepStrictEqual(clubs, ['Bergen Pistolklubb', 'Oslo Pistolklubb']);

// disciplineOrder -- object key insertion order, never re-sorted
assert.deepStrictEqual(NP.disciplineOrder(sampleData), ['Finfelt', 'Grovfelt']);

// getFilteredEntries -- exact match against chosen club names, empty = all
var entries = [{ club: 'Oslo Pistolklubb' }, { club: 'Bergen Pistolklubb' }];
assert.strictEqual(NP.getFilteredEntries(entries, []).length, 2, 'empty selection shows all clubs');
assert.strictEqual(NP.getFilteredEntries(entries, ['Oslo Pistolklubb']).length, 1);

// searchMatchesEntry -- plain .toLowerCase() substring on name + club, no NFC
assert.ok(NP.searchMatchesEntry({ name: 'Ola Nordmann', club: 'Oslo Pistolklubb' }, 'nordmann'));
assert.ok(NP.searchMatchesEntry({ name: 'Ola Nordmann', club: 'Oslo Pistolklubb' }, 'OSLO'));
assert.ok(!NP.searchMatchesEntry({ name: 'Ola Nordmann', club: 'Oslo Pistolklubb' }, 'bergen'));
assert.ok(NP.searchMatchesEntry({ name: 'Ola', club: 'Oslo' }, ''), 'empty query matches everything');

// filterSearchEntries -- combines discipline filter + search
var searchable = [
    { name: 'Ola', club: 'Oslo Pistolklubb', discipline: 'Finfelt' },
    { name: 'Kari', club: 'Bergen Pistolklubb', discipline: 'Grovfelt' }
];
assert.strictEqual(NP.filterSearchEntries(searchable, { discipline: 'Finfelt' }).length, 1);
assert.strictEqual(NP.filterSearchEntries(searchable, { query: 'kari' }).length, 1);
assert.strictEqual(NP.filterSearchEntries(searchable, {}).length, 2);

// parseClubsParam / buildClubsParam -- page-local comma-join/split, same
// pattern terminliste-page.js already uses for its own multi-selects
assert.deepStrictEqual(NP.parseClubsParam(''), []);
assert.deepStrictEqual(NP.parseClubsParam('Oslo%20Pistolklubb,Bergen%20Pistolklubb'), ['Oslo Pistolklubb', 'Bergen Pistolklubb']);
assert.strictEqual(NP.buildClubsParam(['Oslo Pistolklubb', 'Bergen Pistolklubb']), 'Oslo%20Pistolklubb,Bergen%20Pistolklubb');
assert.deepStrictEqual(NP.parseClubsParam(NP.buildClubsParam(['Ås Skytterlag'])), ['Ås Skytterlag'], 'round-trip through encode/decode preserves æøå');

console.log('norgesfelt-page.test.js: all assertions passed');
