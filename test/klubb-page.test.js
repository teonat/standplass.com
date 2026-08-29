var assert = require('assert');
var KP = require('../public/js/klubb-page.js');

var url = KP.buildRankingUrl({
    disciplineId: 'd1', orgId: 'org1', year: 2026, numberOfResults: 3
});
assert.ok(url.indexOf('https://nsfapi.azurewebsites.net/ranking?') === 0, 'hits the ranking endpoint, not /query/ranking');
assert.ok(url.indexOf('orderBy=totalScore:desc') !== -1, 'orderBy is present -- omitting it makes ordering undefined');
assert.ok(url.indexOf('disciplineId=d1') !== -1);
assert.ok(url.indexOf('numberOfResults=3') !== -1);
assert.ok(url.indexOf('periodStart=2025-12-31T23%3A00%3A00.000Z') !== -1, 'season boundary is Dec 31 23:00 UTC of the PRIOR year');
assert.ok(url.indexOf('periodEnd=2026-12-31T22%3A59%3A59.999Z') !== -1, 'season boundary is Dec 31 22:59:59 UTC of the season year');
// The one documented gotcha most likely to reintroduce a real HTTP 500:
// personOrganizationId MUST be JSON-array-encoded, not a bare UUID.
assert.ok(url.indexOf('personOrganizationId=%5B%22org1%22%5D') !== -1, 'org GUID is JSON-array-encoded, not passed bare');

console.log('klubb-page.test.js: all assertions passed');
