var assert = require('assert');
var TP = require('../public/js/terminliste-page.js');

// Shape mirrors the live branchlist response -- see
// docs/superpowers/nsf-skyting-api-reference.md's "GET /query/branchlist"
// section. Includes a deleted branch and a deleted group, both dropped.
var rawBranchlist = {
    items: [
        {
            id: 'b-pistol', name: 'Pistol', deleted: false,
            disciplineGroups: [
                { id: 'g1', name: 'Feltpistol', branchId: 'b-pistol', deleted: false, disciplines: [] },
                { id: 'g-del', name: 'Slettet', branchId: 'b-pistol', deleted: true, disciplines: [] }
            ]
        },
        {
            id: 'b-rifle', name: 'Rifle', deleted: false,
            disciplineGroups: [ { id: 'g2', name: 'Bane', branchId: 'b-rifle', deleted: false, disciplines: [] } ]
        },
        { id: 'b-del', name: 'Slettet gren', deleted: true, disciplineGroups: [] }
    ]
};

var processed = TP.processBranchlist(rawBranchlist);
assert.strictEqual(processed.branches.length, 2, 'deleted branch is dropped');
var pistol = processed.branches.filter(function (b) { return b.id === 'b-pistol'; })[0];
assert.strictEqual(pistol.groups.length, 1, 'deleted group is dropped');
assert.strictEqual(pistol.groups[0].name, 'Feltpistol');
assert.strictEqual(pistol.groups[0].branchId, 'b-pistol', 'branchId carried through, needed for the cascading Øvelsesgruppe filter');

// id-list encode/decode: comma-joined, per-id URI-component-escaped (a
// krets/org name could theoretically contain a comma if it were the value,
// but these are always GUIDs -- escaping is defensive, not load-bearing).
assert.strictEqual(TP.encodeIdList(['a', 'b']), 'a,b');
assert.strictEqual(TP.encodeIdList([]), '');
assert.strictEqual(TP.encodeIdList(null), '', 'null/undefined input is treated as empty, not thrown');
assert.deepStrictEqual(TP.decodeIdList('a,b'), ['a', 'b']);
assert.deepStrictEqual(TP.decodeIdList(''), []);
assert.deepStrictEqual(TP.decodeIdList(null), []);

// Status maps
assert.strictEqual(TP.STATUS_LABEL[0], 'Søknad');
assert.strictEqual(TP.STATUS_LABEL[1], 'Godkjent');
assert.strictEqual(TP.STATUS_LABEL[3], 'Avlyst');

// buildCompetitionListUrl: every id-list opt is optional and, when given,
// JSON-array-encoded under an `in:` prefix; date opts use `ge:`/`le:`;
// name uses `like:`. Omitted entirely when empty/absent, matching the
// source's own buildUrl (terminliste.js:115-141) -- verified against a
// real live request during design (2026-08-30).
var urlMinimal = TP.buildCompetitionListUrl({ pageIndex: 0, pageSize: 50 });
assert.ok(urlMinimal.indexOf('https://nsfapi.azurewebsites.net/query/competitionlist?') === 0);
assert.ok(urlMinimal.indexOf('pageIndex=0') !== -1);
assert.ok(urlMinimal.indexOf('pageSize=50') !== -1);
assert.ok(urlMinimal.indexOf('orderBy=startDate%3Aasc') === -1, 'orderBy kept as a literal string, never percent-encoded');
assert.ok(urlMinimal.indexOf('orderBy=startDate:asc') !== -1);
assert.ok(urlMinimal.indexOf('startDate=') === -1, 'fra omitted when not given');
assert.ok(urlMinimal.indexOf('branches=') === -1, 'branchIds omitted when empty');
assert.ok(urlMinimal.indexOf('title=') === -1, 'name omitted when not given');

var urlFull = TP.buildCompetitionListUrl({
    pageIndex: 1, pageSize: 50, fra: '2026-01-01', til: '2026-02-01',
    branchIds: ['b1'], orgIds: ['o1', 'o2'], kretsIds: ['k1'], typeIds: ['t1'], groupIds: ['g1'],
    name: 'test cup'
});
assert.ok(urlFull.indexOf('startDate=ge%3A2026-01-01T00%3A00%3A00.000Z') !== -1, 'fra becomes a UTC-midnight ge: bound');
assert.ok(urlFull.indexOf('endDate=le%3A2026-02-01T23%3A59%3A59.999Z') !== -1, 'til becomes a UTC-end-of-day le: bound');
assert.ok(urlFull.indexOf('branches=in%3A%5B%22b1%22%5D') !== -1);
assert.ok(urlFull.indexOf('organizationId=in%3A%5B%22o1%22%2C%22o2%22%5D') !== -1, 'multiple ids JSON-array-encoded together');
assert.ok(urlFull.indexOf('regionOrganizationId=in%3A%5B%22k1%22%5D') !== -1);
assert.ok(urlFull.indexOf('competitionTypeId=in%3A%5B%22t1%22%5D') !== -1);
assert.ok(urlFull.indexOf('disciplineGroups=in%3A%5B%22g1%22%5D') !== -1);
assert.ok(urlFull.indexOf('title=like%3Atest%20cup') !== -1 || urlFull.indexOf('title=like%3Atest+cup') !== -1);

// groupsForBranches: cascading filter -- no branch selected means every
// branch's groups are candidates (Gren's own default), a selection
// narrows to only those branches' groups.
var branches = [
    { id: 'b1', name: 'Pistol', groups: [ { id: 'g1', name: 'Feltpistol', branchId: 'b1' }, { id: 'g2', name: 'Bane', branchId: 'b1' } ] },
    { id: 'b2', name: 'Rifle', groups: [ { id: 'g3', name: 'Rifle-bane', branchId: 'b2' } ] }
];
assert.strictEqual(TP.groupsForBranches(branches, []).length, 3, 'no branch selected -> every group is a candidate');
var narrowed = TP.groupsForBranches(branches, ['b2']);
assert.deepStrictEqual(narrowed.map(function (g) { return g.id; }), ['g3'], 'selecting Rifle narrows Øvelsesgruppe to only Rifle\'s groups');

console.log('terminliste-page.test.js: all assertions passed');
