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
assert.strictEqual(TP.statusClass(1), '', 'Godkjent gets no tint class');
assert.strictEqual(TP.statusClass(0), 'terminliste-status--pending');
assert.strictEqual(TP.statusClass(2), 'terminliste-status--rejected');
assert.strictEqual(TP.statusClass(3), 'terminliste-status--rejected');

console.log('terminliste-page.test.js: all assertions passed');
