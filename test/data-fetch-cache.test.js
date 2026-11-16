'use strict';
var assert = require('node:assert');
var StandplassData = require('../public/js/data-fetch-cache.js');

var callCount = 0;
function fakeFetch(url) {
    callCount++;
    return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve({ url: url }); }
    });
}

var fetcher = StandplassData.createFetcher(fakeFetch, 60000);

Promise.all([fetcher.fetchYear('/data/felt', 2026), fetcher.fetchYear('/data/felt', 2026)])
    .then(function (results) {
        assert.strictEqual(callCount, 1, 'second call should be served from cache, not refetched');
        assert.strictEqual(results[0].url, '/data/felt/2026.json');

        var rows = [{ klubb: 'eksempel', navn: 'A' }, { klubb: 'oslo', navn: 'B' }];
        var filtered = StandplassData.applyFilter(rows, { klubb: 'eksempel' });
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].navn, 'A');
        assert.deepStrictEqual(StandplassData.applyFilter(rows, null), rows);

        // fetchBirthyears: same cache discipline as fetchYear — one
        // request per URL per TTL, resolved to the parsed JSON map.
        var birthCallCount = 0;
        function fakeBirthFetch(url) {
            birthCallCount++;
            return Promise.resolve({
                ok: true,
                json: function () { return Promise.resolve({ p1: 1990, p2: null }); }
            });
        }
        var birthFetcher = StandplassData.createFetcher(fakeBirthFetch, 60000);
        return Promise.all([birthFetcher.fetchBirthyears('/data/felt'), birthFetcher.fetchBirthyears('/data/felt')])
            .then(function (maps) {
                assert.strictEqual(birthCallCount, 1, 'second birthyears call served from cache');
                assert.deepStrictEqual(maps[0], { p1: 1990, p2: null });

                console.log('data-fetch-cache.test.js: all assertions passed');
            });
    })
    .catch(function (err) {
        console.error(err);
        process.exit(1);
    });
