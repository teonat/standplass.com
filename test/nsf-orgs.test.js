var assert = require('assert');
var NsfOrgs = require('../public/js/nsf-orgs.js');

var rawOrgs = [
    { id: 'nsf-id', organizationName: 'Norges Sportsskytterforbund', organizationFederationType: 1 },
    { id: 'krets-id', organizationName: 'Oslo og Akershus Skyttarkrins', organizationFederationType: 2 },
    { id: 'kss-id', organizationName: 'Kongsvinger Sportsskyttere', organizationFederationType: 3 },
    { id: 'other-id', organizationName: 'Oslo Pistolklubb', organizationFederationType: 3 }
];

// filterClubs: excludes federation (1) and krets (2) types
var clubs = NsfOrgs.filterClubs(rawOrgs);
assert.strictEqual(clubs.length, 2, 'only the two federationType:3 entries are clubs');
assert.deepStrictEqual(clubs.map(function (c) { return c.name; }), ['Kongsvinger Sportsskyttere', 'Oslo Pistolklubb']);

// matchClub: same normalized-substring convention as stevner-page.js's matchesClub
assert.strictEqual(NsfOrgs.matchClub(clubs, 'kongsvinger').id, 'kss-id', 'substring match, case/diacritic-insensitive');
assert.strictEqual(NsfOrgs.matchClub(clubs, 'Kongsvinger Sportsskyttere').id, 'kss-id', 'exact full-name match still works');
assert.strictEqual(NsfOrgs.matchClub(clubs, 'nonexistent'), null, 'no match returns null, not undefined or a throw');
assert.strictEqual(NsfOrgs.matchClub(clubs, ''), null, 'empty slug matches nothing (not every club)');

// ensureOrgs: unwraps a flat array (NOT wrapped in items, unlike branchlist)
// and fetches only once even when called twice (module-level promise cache)
var fetchCount = 0;
var mockFetch = function () {
    fetchCount++;
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(rawOrgs); } });
};
Promise.all([NsfOrgs.ensureOrgs(mockFetch), NsfOrgs.ensureOrgs(mockFetch)]).then(function (results) {
    assert.strictEqual(fetchCount, 1, 'second ensureOrgs call reuses the in-flight/resolved promise, no second fetch');
    assert.strictEqual(results[0].length, 2, 'ensureOrgs resolves to clubs only');
    assert.strictEqual(results[1], results[0], 'both calls resolve to the same array reference');
    console.log('nsf-orgs.test.js: all assertions passed');
}).catch(function (err) {
    console.error(err);
    process.exitCode = 1;
});
