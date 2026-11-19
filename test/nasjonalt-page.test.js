var assert = require('assert');
global.StandplassKlubbDisciplineGroups = require('../public/js/klubb-discipline-groups.js');
// Page-test convention: globals in HTML script order — data-table.js
// calls into StandplassTable for sort semantics.
global.StandplassTable = require('../public/js/table-renderer.js');
global.StandplassDataTable = require('../public/js/data-table.js');
var NP = require('../public/js/nasjonalt-page.js');

// Shape mirrors the live branchlist response across multiple branches.
// Deliberately includes a duplicate discipline id across two
// groups within the same branch (the real API does this -- see
// klubb-discipline-groups.js's own precedent for why dedup matters) and a
// deleted discipline/class to confirm both are dropped.
var rawBranchlist = {
    items: [
        {
            name: 'Pistol',
            classes: [
                { id: 'c1', name: 'Pistol\\A', classCode: 'A', deleted: false },
                { id: 'c-del', name: 'Pistol\\Gammel', classCode: 'Z', deleted: true }
            ],
            disciplineGroups: [
                { name: 'Feltpistol', disciplines: [
                    { id: 'd1', name: 'Finfelt', branchId: 'b-pistol', deleted: false },
                    { id: 'd-del', name: 'Slettet', branchId: 'b-pistol', deleted: true }
                ] },
                { name: 'Spesialfelt', disciplines: [
                    { id: 'd1', name: 'Finfelt', branchId: 'b-pistol', deleted: false }, // duplicate id, same branch
                    { id: 'd2', name: 'Spesialpistol', branchId: 'b-pistol', deleted: false }
                ] }
            ]
        },
        {
            name: 'Rifle',
            classes: [ { id: 'c2', name: 'Rifle\\B', classCode: 'B', deleted: false } ],
            disciplineGroups: [
                { name: 'Noe', disciplines: [ { id: 'd3', name: 'Noe Rifle', branchId: 'b-rifle', deleted: false } ] }
            ]
        }
    ]
};

var processed = NP.processBranchlist(rawBranchlist);
assert.strictEqual(processed.branches.length, 2, 'both branches present, no branch filter');
var pistolBranch = processed.branches.filter(function (b) { return b.name === 'Pistol'; })[0];
assert.strictEqual(pistolBranch.disciplines.length, 2, 'duplicate discipline id within a branch is deduped (Finfelt appears once, not twice)');
assert.ok(pistolBranch.disciplines.every(function (d) { return d.id !== 'd-del'; }), 'deleted disciplines are dropped');
assert.strictEqual(processed.disciplines.length, 3, 'flat discipline list across both branches: Finfelt, Spesialpistol, Noe Rifle');
var finfelt = processed.disciplines.filter(function (d) { return d.id === 'd1'; })[0];
assert.strictEqual(finfelt.classes.length, 1, 'classes are the branch\'s own non-deleted classes, deleted class dropped');
assert.strictEqual(finfelt.classes[0].name, 'A', 'class name prefix ("Pistol\\\\") is stripped, matching comp-modal.js\'s own convention');
assert.strictEqual(finfelt.classes[0].code, 'A', 'classCode carried through for nasjonalt-class-sort.js to use');

// Clickability gate: reuses klubb-discipline-groups.js's own resolution,
// not the source's STEVNERESULTATER_DISC_IDS/BANE_IDS (see file header
// comment for why). Mock groups shaped like klubb-discipline-groups.js's
// own test fixture (Feltpistol/Spesialfelt/Fin-grovpistol/etc.), plus a
// PPC group to prove it's correctly excluded here too.
var DG = require('../public/js/klubb-discipline-groups.js');
var mockGroups = [
    { name: 'Feltpistol', disciplines: [ { id: 'felt1', name: 'Finfelt', deleted: false } ] },
    { name: 'Spesialfelt', disciplines: [ { id: 'felt2', name: 'Spesialpistol', deleted: false } ] },
    { name: 'PPC', disciplines: [ { id: 'ppc1', name: 'P1', deleted: false } ] },
    { name: 'T96', disciplines: [ { id: 'bane1', name: 'T96 fin', deleted: false } ] },
    { name: 'Rifle-only', disciplines: [ { id: 'rifle1', name: 'Noe Rifle', deleted: false } ] }
];
var clickableIds = NP.computeClickableIds(mockGroups);
assert.ok(clickableIds['felt1'], 'Feltpistol-group discipline is clickable');
assert.ok(clickableIds['bane1'], 'Bane-group discipline is clickable');
assert.ok(!clickableIds['ppc1'], 'PPC-group discipline is NOT clickable -- the source\'s own gate wrongly includes this, this project\'s does not');
assert.ok(!clickableIds['rifle1'], 'a discipline in neither Felt nor Bane resolution is not clickable (Rifle/Leirdue/Viltmål)');

// buildDiscItems: group headers are query-dependent, not a static "more
// than one branch total" check (bug found during Task 10 QA -- the source's
// own `allBranches.length > 1` check is scoped to the branches that
// actually matched the current query, not the whole dataset).
var unambiguous = NP.buildDiscItems(processed.branches, 'finfelt');
assert.ok(!unambiguous.some(function (i) { return i.isGroup; }), 'no stray group header when only one branch matches the query');
assert.strictEqual(unambiguous.length, 1, 'just the matching discipline itself');

var ambiguous = NP.buildDiscItems(processed.branches, ''); // empty query matches every branch
assert.ok(ambiguous.some(function (i) { return i.isGroup && i.name === 'Pistol'; }), 'group header shown once multiple branches match');
assert.ok(ambiguous.some(function (i) { return i.isGroup && i.name === 'Rifle'; }), 'every matching branch gets its own header');

// buildRankingUrl: classId/kretsId/orgId are each optional and, when
// given, JSON-array-encoded -- a bare UUID 500s against the real API.
var urlMinimal = NP.buildRankingUrl({ disciplineId: 'd1', numberOfResults: 1, periodStart: '2025-12-31T23:00:00.000Z', periodEnd: '2026-12-31T22:59:59.999Z' });
assert.ok(urlMinimal.indexOf('https://nsfapi.azurewebsites.net/ranking?') === 0);
assert.ok(urlMinimal.indexOf('orderBy=totalScore:desc') !== -1);
assert.ok(urlMinimal.indexOf('disciplineId=d1') !== -1);
assert.ok(urlMinimal.indexOf('classId=') === -1, 'classId omitted entirely when not given, not sent as an empty param');
assert.ok(urlMinimal.indexOf('personRegionOrganizationId=') === -1, 'krets omitted when not given');
assert.ok(urlMinimal.indexOf('personOrganizationId=') === -1, 'org omitted when not given');

var urlFull = NP.buildRankingUrl({ disciplineId: 'd1', classId: 'c1', kretsId: 'k1', orgId: 'o1', numberOfResults: 3, periodStart: '2025-12-31T23:00:00.000Z', periodEnd: '2026-12-31T22:59:59.999Z' });
assert.ok(urlFull.indexOf('classId=%5B%22c1%22%5D') !== -1, 'classId JSON-array-encoded when given');
assert.ok(urlFull.indexOf('personRegionOrganizationId=%5B%22k1%22%5D') !== -1, 'krets JSON-array-encoded when given');
assert.ok(urlFull.indexOf('personOrganizationId=%5B%22o1%22%5D') !== -1, 'org JSON-array-encoded when given');

// filterRankingEntries: identical contract to klubb-page.js's own version.
var filtered = NP.filterRankingEntries([{ totalScore: 100 }, { totalScore: 0 }, { totalScore: null }]);
assert.strictEqual(filtered.length, 1, 'zero and null totalScore entries are dropped');

// Period-mode date helpers, ported from the source's isValidIsoDate.
assert.strictEqual(NP.isValidIsoDate('2026-08-30'), true);
assert.strictEqual(NP.isValidIsoDate('2026-13-01'), false, 'invalid month rejected');
assert.strictEqual(NP.isValidIsoDate('2026-02-30'), false, 'invalid day rejected (Feb has no 30th)');
assert.strictEqual(NP.isValidIsoDate(''), false);
assert.strictEqual(NP.isValidIsoDate(null), false);
assert.strictEqual(NP.yearFrom(2026), '2025-12-31T23:00:00.000Z', 'season boundary: Dec 31 23:00 UTC of the PRIOR year');
assert.strictEqual(NP.yearTo(2026), '2026-12-31T22:59:59.999Z', 'season boundary: Dec 31 22:59:59 UTC of the season year');

// ── rankingTableSpec (batch 1: shared table base) ──────────────────────
// The whole table renders through the base now: no PAGE_SIZE slicing
// (a contained scroll region caps the height instead), rank is
// data-anchored so # travels under sorting, and the Navn cell keeps
// today's exact person-button markup — the table wrap's delegated
// person-modal listener depends on those classes/attributes.
var NP_STATE = { hidden: {}, runtimeHidden: [], widthTier: null };
function npSorted(spec, key, dir) {
    return StandplassDataTable.renderTable('nasjonal-ranking', spec,
        { sort: { key: key, dir: dir }, hidden: {}, runtimeHidden: [], widthTier: null });
}
var npEntries = [
    { position: 1, personId: 'p1', fullName: 'Anne', personOrganizationName: 'Oslo PK', totalScore: 98.5 },
    { position: 2, personId: 'p2', fullName: 'Øyvind', personOrganizationName: null, totalScore: null },
    { position: null, personId: 'p3', fullName: 'Bjarne', personOrganizationName: 'Bergen SK', totalScore: 90 }
];
var npSpec = NP.rankingTableSpec(npEntries, function () { return true; });
var npHtml = StandplassDataTable.renderTable('nasjonal-ranking', npSpec, NP_STATE);
assert.ok(npHtml.indexOf('<thead><tr><th scope="col" class="ranking-rank">#</th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="fullName">Navn<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="org">Klubb<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="totalScore">Poeng<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'nasjonal ranking: Navn/Klubb/Poeng sortable headers');
assert.ok(npHtml.indexOf('<td><button type="button" class="stevner-person-btn link-btn" data-person-id="p1" data-person-name="Anne">Anne</button></td>') !== -1,
    'nasjonal ranking: clickable Navn is today\'s exact person button');
assert.ok(npHtml.indexOf('<tr data-dt-row="2"><td class="ranking-rank">3</td>') !== -1,
    'nasjonal ranking: rank anchored (position wins, page-order fallback)');
assert.ok(npHtml.indexOf('<td class="ranking-score">98.50</td>') !== -1
    && npHtml.indexOf('<td class="ranking-score">–</td>') !== -1,
    'nasjonal ranking: Poeng toFixed(2), null renders –');
// Plain (non-clickable) Navn cell shape.
var npPlain = NP.rankingTableSpec(npEntries, function () { return false; });
var npPlainHtml = StandplassDataTable.renderTable('nasjonal-ranking', npPlain, NP_STATE);
assert.ok(npPlainHtml.indexOf('<td>Anne</td>') !== -1
    && npPlainHtml.indexOf('stevner-person-btn') === -1,
    'nasjonal ranking: non-clickable Navn is plain escaped text');
var npNameless = NP.rankingTableSpec([{ personId: 'p9', fullName: null, personOrganizationName: 'X PK', totalScore: 5 }], function () { return true; });
assert.ok(StandplassDataTable.renderTable('nasjonal-ranking', npNameless, NP_STATE).indexOf('<td>–</td>') !== -1,
    'nasjonal ranking: missing fullName renders –');
// Rank travels under a Klubb sort; nulls sort last (org and Poeng).
var npOrg = npSorted(npSpec, 'org', 'asc');
assert.ok(npOrg.indexOf('<tr data-dt-row="2"><td class="ranking-rank">3</td>') !== -1
    && npOrg.indexOf('<tr data-dt-row="2">') < npOrg.indexOf('<tr data-dt-row="0">')
    && npOrg.indexOf('data-person-id="p2"') > npOrg.indexOf('data-person-id="p1"'),
    'nasjonal ranking: rank travels under a Klubb sort, null org last');
var npPoeng = npSorted(npSpec, 'totalScore', 'desc');
assert.ok(npPoeng.indexOf('<td class="ranking-score">90</td>') < npPoeng.indexOf('data-person-id="p2"'),
    'nasjonal ranking: null Poeng sorts last');
// Full row count — no PAGE_SIZE slicing.
var npMany = [];
for (var ni = 0; ni < 60; ni++) { npMany.push({ position: ni + 1, personId: 'p' + ni, fullName: 'N' + ni, personOrganizationName: 'K' + (ni % 7), totalScore: 100 - ni }); }
var npManySpec = NP.rankingTableSpec(npMany, function () { return false; });
var npManyHtml = StandplassDataTable.renderTable('nasjonal-ranking', npManySpec, NP_STATE);
assert.strictEqual((npManyHtml.match(/<tr data-dt-row="/g) || []).length, 60,
    'nasjonal ranking: all 60 rows rendered — the scroll region caps height, not the row count');
assert.ok(npManyHtml.indexOf('Vis alle') === -1 && npManyHtml.indexOf('ranking-toggle') === -1,
    'nasjonal ranking: no show-all toggle remains');

console.log('nasjonalt-page.test.js: all assertions passed');
