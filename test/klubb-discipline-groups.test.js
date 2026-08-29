var assert = require('assert');
var DG = require('../public/js/klubb-discipline-groups.js');

// Shape mirrors the live branchlist's Pistol branch disciplineGroups,
// trimmed to just enough to exercise both the Felt union (Feltpistol +
// Spesialfelt) and the Bane union (the 5 BANE_GROUP_NAMES) -- see
// docs/superpowers/nsf-skyting-api-reference.md for the verified live shape.
var groups = [
    { name: 'Feltpistol', disciplines: [
        { id: 'f1', name: 'Finfelt', deleted: false },
        { id: 'f2', name: 'Grovfelt', deleted: false },
        { id: 'f-deleted', name: 'Gammelt Felt', deleted: true }
    ] },
    { name: 'Spesialfelt', disciplines: [
        { id: 'f3', name: 'Spesialpistol', deleted: false }
    ] },
    { name: 'PPC', disciplines: [
        { id: 'p1', name: 'P1 - Revolver 1500', deleted: false }
    ] },
    { name: 'Fin-/grovpistol', disciplines: [
        { id: 'b1', name: 'Presisjon Landsdelsmatch', deleted: false },
        { id: 'b2', name: '25m finpistol', deleted: false },
        { id: 'b3', name: '25m grovpistol', deleted: false }
    ] },
    { name: 'Hurtig', disciplines: [ { id: 'b4', name: '25m hurtigpistol fin', deleted: false } ] },
    { name: 'Standardpistol', disciplines: [ { id: 'b5', name: '25m standardpistol', deleted: false } ] },
    { name: 'Silhuettpistol', disciplines: [ { id: 'b6', name: '25m silhuettpistol', deleted: false } ] },
    { name: 'T96', disciplines: [ { id: 'b7', name: 'T96 fin', deleted: false } ] }
];

var felt = DG.resolveFelt(groups);
assert.strictEqual(felt.length, 3, 'Felt = Feltpistol (2 non-deleted) + Spesialfelt (1), deleted entries dropped');
assert.deepStrictEqual(felt.map(function (d) { return d.id; }).sort(), ['f1', 'f2', 'f3']);
assert.ok(felt.every(function (d) { return d.id !== 'p1'; }), 'PPC group (P1-P7) is not felt -- only "spesial" and "felt"-named groups match');

var bane = DG.resolveBane(groups);
// The whole-group-union decision (2026-08-29): includes Presisjon
// Landsdelsmatch (b1), which the source's own hardcoded list omitted --
// this is the one behavior a future "helpful" revert back to the source's
// exact list would silently regress. Keep this assertion if that file is
// ever touched again.
assert.strictEqual(bane.length, 7, 'Bane = union of all 5 BANE_GROUP_NAMES groups, including Presisjon Landsdelsmatch');
assert.ok(bane.some(function (d) { return d.id === 'b1'; }), 'Presisjon Landsdelsmatch (Fin-/grovpistol group) is included -- deliberate, not a bug');

console.log('klubb-discipline-groups.test.js: all assertions passed');
