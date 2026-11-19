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

var filtered = KP.filterRankingEntries([
    { position: 1, fullName: 'A', totalScore: 100 },
    { position: 2, fullName: 'B', totalScore: 0 },
    { position: 3, fullName: 'C', totalScore: null }
]);
assert.strictEqual(filtered.length, 1, 'zero and null totalScore entries are dropped');
assert.strictEqual(filtered[0].fullName, 'A');

// ── leaderboardCardSpec (batch 1: shared table base) ────────────────────
// data-table.js calls into the StandplassTable global (table-renderer.js)
// for sort semantics — same load order as the page's script tags.
global.StandplassTable = require('../public/js/table-renderer.js');
var SDT = require('../public/js/data-table.js');
var lbState = { hidden: {}, runtimeHidden: [], widthTier: null };
var lbEntries = [
    { position: 1, personId: 'p1', fullName: 'Anne', totalScore: 98.5 },
    { position: 2, personId: 'p2', fullName: 'Øyvind', totalScore: null },
    { position: null, personId: 'p3', fullName: 'Bjarne', totalScore: 90 }
];
var lbSpec = KP.leaderboardCardSpec(lbEntries, 'Finfelt');
assert.notStrictEqual(lbSpec, null, 'non-empty entries produce a spec');
assert.strictEqual(KP.leaderboardCardSpec([], 'Finfelt'), null, 'empty entries produce no spec');
var lbHtml = SDT.renderTable('klubb-card-d1', lbSpec, lbState);
assert.ok(lbHtml.indexOf('<thead><tr><th scope="col" class="ranking-rank">#</th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="fullName">Navn<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="totalScore">Poeng<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'leaderboard: sortable Navn/Poeng headers');
// Person button markup, byte-exact vs the hand-rolled table — the
// grid wrap's delegated person-modal listener depends on these classes
// and data attributes.
assert.ok(lbHtml.indexOf('<td><button type="button" class="stevner-person-btn link-btn" data-person-id="p1" data-person-name="Anne" data-discipline="Finfelt">Anne</button></td>') !== -1,
    'leaderboard: person button markup byte-exact');
assert.ok(lbHtml.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td>') !== -1
    && lbHtml.indexOf('<tr data-dt-row="2"><td class="ranking-rank">3</td>') !== -1,
    'leaderboard: rank anchored (position wins, page-order fallback)');
assert.ok(lbHtml.indexOf('<td class="ranking-score">98.50</td>') !== -1
    && lbHtml.indexOf('<td class="ranking-score">–</td>') !== -1,
    'leaderboard: Poeng toFixed(2), null renders –');
// Rank travels under a Navn sort; nulls sort last on Poeng.
function lbSorted(key, dir) {
    return SDT.renderTable('klubb-card-d1', lbSpec,
        { sort: { key: key, dir: dir }, hidden: {}, runtimeHidden: [], widthTier: null });
}
var lbName = lbSorted('fullName', 'desc');
assert.ok(lbName.indexOf('<tr data-dt-row="1"><td class="ranking-rank">2</td>') !== -1
    && lbName.indexOf('<tr data-dt-row="1">') < lbName.indexOf('<tr data-dt-row="0">'),
    'leaderboard: rank travels under a Navn sort');
var lbPoeng = lbSorted('totalScore', 'desc');
assert.ok(lbPoeng.indexOf('<td>90</td>') < lbPoeng.indexOf('data-person-id="p2"'),
    'leaderboard: null Poeng sorts last');

console.log('klubb-page.test.js: all assertions passed');
