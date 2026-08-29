var assert = require('assert');
var DG = require('../public/js/klubb-discipline-groups.js');

// Shape mirrors the live branchlist's Pistol branch disciplineGroups,
// trimmed to just enough to exercise both the Felt union (Feltpistol +
// Spesialfelt) and the Bane union (the 5 BANE_GROUP_NAMES) -- see
// docs/superpowers/nsf-skyting-api-reference.md for the verified live shape.
var groups = [
    // Deliberately in the live API's own (out-of-order, not source-matching)
    // sequence -- Militærfelt-Rødpunkt/Revolverfelt-Rødpunkt come first in
    // the real branchlist response, which is exactly the bug a user caught
    // in manual QA (those two rendered as the first cards instead of near
    // the end, matching the source's own card order).
    { name: 'Feltpistol', disciplines: [
        { id: 'f7', name: 'Militærfelt-Rødpunkt', deleted: false },
        { id: 'f8', name: 'Revolverfelt-Rødpunkt', deleted: false },
        { id: 'f1', name: 'Finfelt', deleted: false },
        { id: 'f4', name: 'Militærfelt', deleted: false },
        { id: 'f5', name: 'Revolverfelt', deleted: false },
        { id: 'f2', name: 'Grovfelt', deleted: false },
        { id: 'f-deleted', name: 'Gammelt Felt', deleted: true }
    ] },
    { name: 'Spesialfelt', disciplines: [
        { id: 'f6', name: 'Spesialrevolver', deleted: false },
        { id: 'f9', name: 'Magnumfelt 1', deleted: false },
        { id: 'f3', name: 'Spesialpistol', deleted: false },
        { id: 'f10', name: 'Magnumfelt 2', deleted: false }
    ] },
    { name: 'PPC', disciplines: [
        { id: 'p1', name: 'P1 - Revolver 1500', deleted: false }
    ] },
    { name: 'Fin-/grovpistol', disciplines: [
        { id: 'b1', name: 'Presisjon Landsdelsmatch', deleted: false },
        { id: 'b2', name: '25m finpistol', deleted: false },
        { id: 'b3', name: '25m grovpistol', deleted: false },
        { id: 'b-deleted', name: 'Gammel Bane', deleted: true }
    ] },
    { name: 'Hurtig', disciplines: [ { id: 'b4', name: '25m hurtigpistol fin', deleted: false } ] },
    { name: 'Standardpistol', disciplines: [ { id: 'b5', name: '25m standardpistol', deleted: false } ] },
    { name: 'Silhuettpistol', disciplines: [ { id: 'b6', name: '25m silhuettpistol', deleted: false } ] },
    { name: 'T96', disciplines: [ { id: 'b7', name: 'T96 fin', deleted: false } ] }
];

var felt = DG.resolveFelt(groups);
assert.strictEqual(felt.length, 10, 'Felt = Feltpistol (6 non-deleted) + Spesialfelt (4), deleted entries dropped');
assert.ok(felt.every(function (d) { return d.id !== 'p1'; }), 'PPC group (P1-P7) is not felt -- only "spesial" and "felt"-named groups match');
// The actual bug a user caught in manual QA: the live API returns
// Militærfelt-Rødpunkt/Revolverfelt-Rødpunkt first, but the source's own
// card order puts them near the end. Card membership stays dynamic
// (asserted above); this checks the *display order* matches the source
// exactly despite the API's own natural order being different.
assert.deepStrictEqual(felt.map(function (d) { return d.name; }),
    ['Finfelt', 'Grovfelt', 'Militærfelt', 'Revolverfelt', 'Spesialpistol', 'Spesialrevolver',
        'Militærfelt-Rødpunkt', 'Revolverfelt-Rødpunkt', 'Magnumfelt 1', 'Magnumfelt 2'],
    'Felt card order matches the source exactly, not the live API\'s own group-internal order');

var bane = DG.resolveBane(groups);
// The whole-group-union decision (2026-08-29): includes Presisjon
// Landsdelsmatch (b1), which the source's own hardcoded list omitted --
// this is the one behavior a future "helpful" revert back to the source's
// exact list would silently regress. Keep this assertion if that file is
// ever touched again.
assert.strictEqual(bane.length, 7, 'Bane = union of all 5 BANE_GROUP_NAMES groups, including Presisjon Landsdelsmatch');
assert.ok(bane.some(function (d) { return d.id === 'b1'; }), 'Presisjon Landsdelsmatch (Fin-/grovpistol group) is included -- deliberate, not a bug');
assert.ok(bane.every(function (d) { return d.id !== 'b-deleted'; }), 'deleted entries are dropped from Bane too, not just Felt');
// Presisjon Landsdelsmatch has no entry in BANE_ORDER (the source never
// had this discipline at all) -- must sort after every known discipline,
// not before (the live API's own group order puts it first).
assert.deepStrictEqual(bane.map(function (d) { return d.name; }),
    ['25m finpistol', '25m grovpistol', '25m hurtigpistol fin', '25m standardpistol', '25m silhuettpistol', 'T96 fin', 'Presisjon Landsdelsmatch'],
    'Bane card order matches the source for every known discipline; the one unknown discipline sorts last');

// no matching groups / empty input -- resolves to [], never throws
assert.deepStrictEqual(DG.resolveFelt([]), [], 'resolveFelt returns [] for an empty groups array');
assert.deepStrictEqual(DG.resolveBane([]), [], 'resolveBane returns [] for an empty groups array');
var noMatch = [{ name: 'PPC', disciplines: [{ id: 'p1', name: 'P1', deleted: false }] }];
assert.deepStrictEqual(DG.resolveFelt(noMatch), [], 'resolveFelt returns [] when no group name matches');
assert.deepStrictEqual(DG.resolveBane(noMatch), [], 'resolveBane returns [] when no group name matches');

console.log('klubb-discipline-groups.test.js: all assertions passed');
