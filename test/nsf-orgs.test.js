var assert = require('assert');

var rawOrgs = [
    { id: 'nsf-id', organizationName: 'Norges Sportsskytterforbund', organizationFederationType: 1 },
    { id: 'krets-id', organizationName: 'Oslo og Akershus Skyttarkrins', organizationFederationType: 2 },
    { id: 'kss-id', organizationName: 'Kongsvinger Sportsskyttere', organizationFederationType: 3 },
    { id: 'other-id', organizationName: 'Oslo Pistolklubb', organizationFederationType: 3 }
];

// Mock localStorage for testing cache behavior
var mockStorage = {};
global.localStorage = {
    getItem: function (k) { return mockStorage[k] || null; },
    setItem: function (k, v) { mockStorage[k] = v; },
    removeItem: function (k) { delete mockStorage[k]; }
};

var NsfOrgs = require('../public/js/nsf-orgs.js');

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
var failFetchCount, retryFetchCount, rejectFetchCount, recoverFetchCount;
var mockFetch = function () {
    fetchCount++;
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(rawOrgs); } });
};
Promise.all([NsfOrgs.ensureOrgs(mockFetch), NsfOrgs.ensureOrgs(mockFetch)]).then(function (results) {
    assert.strictEqual(fetchCount, 1, 'second ensureOrgs call reuses the in-flight/resolved promise, no second fetch');
    assert.strictEqual(results[0].length, 4, 'ensureOrgs resolves to the RAW org list now, not pre-filtered to clubs');
    assert.strictEqual(results[1], results[0], 'both calls resolve to the same array reference');
    assert.strictEqual(NsfOrgs.filterClubs(results[0]).length, 2, 'filterClubs still works, applied by the caller now');
    var kretser = NsfOrgs.filterKretser(results[0]);
    assert.strictEqual(kretser.length, 1, 'filterKretser selects only organizationFederationType === 2');
    assert.strictEqual(kretser[0].name, 'Oslo og Akershus Skyttarkrins');

    // Clear require cache for next scenario to reset module-level orgsPromise
    delete require.cache[require.resolve('../public/js/nsf-orgs.js')];
    mockStorage = {};  // Clear mock storage

    // Test failure scenarios: failed fetch doesn't get cached
    var NsfOrgs2 = require('../public/js/nsf-orgs.js');
    failFetchCount = 0;
    var failFetch = function () {
        failFetchCount++;
        return Promise.resolve({ ok: false });
    };
    return NsfOrgs2.ensureOrgs(failFetch);
}).then(function (failResult) {
    assert.strictEqual(failResult.length, 0, 'failed fetch resolves to [] (graceful fallback)');
    assert.strictEqual(failFetchCount, 1, 'failure path calls fetch exactly once');
    assert.strictEqual(Object.keys(mockStorage).length, 0, 'failed fetch does NOT write to cache');

    // After a failed fetch, the next ensureOrgs call should retry (not use cached failure)
    var NsfOrgs2 = require('../public/js/nsf-orgs.js');
    retryFetchCount = 0;
    var retryFetch = function () {
        retryFetchCount++;
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve(rawOrgs); } });
    };
    return Promise.all([NsfOrgs2.ensureOrgs(retryFetch), NsfOrgs2.ensureOrgs(retryFetch)]);
}).then(function (results) {
    assert.strictEqual(results[0].length, 4, 'retry after failure resolves to the raw list');
    assert.strictEqual(results[1], results[0], 'second retry call reuses promise, no second fetch');
    assert.strictEqual(retryFetchCount, 1, 'only one fetch made across both concurrent retry calls');
    assert.strictEqual(Object.keys(mockStorage).length, 1, 'successful retry writes to cache');

    // Clear require cache for rejection path test
    delete require.cache[require.resolve('../public/js/nsf-orgs.js')];
    mockStorage = {};

    // Test rejection path: fetch rejects (network error etc)
    var NsfOrgs3 = require('../public/js/nsf-orgs.js');
    rejectFetchCount = 0;
    var rejectFetch = function () {
        rejectFetchCount++;
        return Promise.reject(new Error('Network error'));
    };
    return NsfOrgs3.ensureOrgs(rejectFetch);
}).then(function (rejectResult) {
    assert.strictEqual(rejectResult.length, 0, 'rejected fetch resolves to [] (graceful fallback)');
    assert.strictEqual(rejectFetchCount, 1, 'rejection path calls fetch exactly once');
    assert.strictEqual(Object.keys(mockStorage).length, 0, 'rejected fetch does NOT write to cache');

    // After a rejected fetch, the next ensureOrgs call should retry, not return rejected promise
    var NsfOrgs3 = require('../public/js/nsf-orgs.js');
    recoverFetchCount = 0;
    var recoverFetch = function () {
        recoverFetchCount++;
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve(rawOrgs); } });
    };
    return NsfOrgs3.ensureOrgs(recoverFetch);
}).then(function (recoverResult) {
    assert.strictEqual(recoverResult.length, 4, 'after rejection, ensureOrgs recovers on next call');
    assert.strictEqual(recoverFetchCount, 1, 'recovery call fetches exactly once');
    console.log('nsf-orgs.test.js: all assertions passed');
}).catch(function (err) {
    console.error(err);
    process.exitCode = 1;
});
