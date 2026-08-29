var assert = require('assert');
global.StandplassKlubbDisciplineGroups = require('../public/js/klubb-discipline-groups.js');
var NP = require('../public/js/nasjonalt-page.js');

// Shape mirrors the live branchlist response across multiple branches --
// see docs/superpowers/nsf-skyting-api-reference.md's "GET /query/branchlist"
// section. Deliberately includes a duplicate discipline id across two
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

console.log('nasjonalt-page.test.js: all assertions passed');
