'use strict';
var assert = require('node:assert');
var MD = require('../public/js/mestere-data.js');

// ── Test data: the published mestere-{year}.json shape ─────────────────
// Individual podium rows are {medal, personId?, name, club?, sum?}; team
// podiums are {medal, team}; comps carry region (krets) + distrikt when
// resolved. Region-less comps (the corpus state until the region regen)
// have neither key.

function sec(ovelse, klasse, podium) {
    return { ovelse: ovelse, klasse: klasse, podium: podium };
}

function comp(id, opts) {
    var c = { compId: id, date: '2025-06-11', title: 'Teststevne ' + id, organizer: 'Arrangør ' + id };
    Object.keys(opts || {}).forEach(function (k) { c[k] = opts[k]; });
    return c;
}

var feltIndex = {
    year: 2025,
    comps: [
        comp('c1', {
            region: 'Buskerud', distrikt: 'Østlandet Sør',
            km: [sec('Felt Fin', 'U', [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere', sum: 88 },
                { medal: 'Sølv', personId: 'p2', name: 'Berit', club: 'Brumunddal Pistolklubb', sum: 68 },
                { medal: 'Bronse', name: 'Carl' }
            ])]
        }),
        comp('c2', {
            region: 'Nordland', distrikt: 'Nord-Norge',
            km: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p3', name: 'Dag', club: 'Bodø PK', sum: 90 }
            ])]
        }),
        comp('c3', {
            region: 'Buskerud',
            kmLag: [sec('Felt Fin', 'M', [
                { medal: 'Sølv', team: 'Hurum SKL' }
            ])]
        }),
        comp('c4', {
            // region-less: no region/distrikt keys at all
            km: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere', sum: 92 }
            ])]
        }),
        comp('c5', {
            region: 'Østlandet-Nord', distrikt: 'Østlandet Nord',
            dm: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere' }
            ])],
            dmLag: [sec('Felt Fin', 'Mix', [
                { medal: 'Gull', team: 'Brumunddal PK' }
            ])]
        }),
        comp('c6', {
            region: 'Troms', distrikt: 'Nord-Norge',
            dm: [sec('Felt Fin', null, [
                { medal: 'Bronse', personId: 'p2', name: 'Berit', club: 'Brumunddal Pistolklubb' }
            ])]
        }),
        comp('c7', {
            nm: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere', sum: 150 }
            ])],
            nmLag: [sec('Felt Fin', 'M', [
                { medal: 'Bronse', team: 'Sortland PK' }
            ])]
        })
    ]
};

var baneIndex = {
    year: 2024,
    comps: [
        comp('b1', {
            region: 'Buskerud',
            km: [sec('25m Grov', null, [
                { medal: 'Sølv', personId: 'p1', name: 'Anne', club: 'Kongsvinger Sportsskyttere', sum: 570 }
            ])]
        })
    ]
};

// ── normalizeRegionName ────────────────────────────────────────────────

assert.strictEqual(MD.normalizeRegionName('Østlandet-Nord'), 'østlandet nord',
    'dash variants collapse to one grouping key');
assert.strictEqual(MD.normalizeRegionName('østlandet nord'), 'østlandet nord',
    'case and separator variants normalize identically');
assert.strictEqual(MD.normalizeRegionName('Møre og Romsdal'), 'møre og romsdal');
assert.strictEqual(MD.normalizeRegionName(null), '');
assert.strictEqual(MD.normalizeRegionName(''), '');

// ── groupByRegion ──────────────────────────────────────────────────────

var kmGroups = MD.groupByRegion(feltIndex, 'km');
assert.deepStrictEqual(kmGroups.map(function (g) { return g.label; }),
    ['Buskerud', 'Nordland', 'Ukjent region'],
    'km groups by krets alphabetically; region-less comps get a final bucket');
assert.strictEqual(kmGroups[0].comps.length, 2,
    'km and kmLag sections both route a comp into its region group');
assert.strictEqual(kmGroups[0].comps[0].compId, 'c1');
assert.strictEqual(kmGroups[0].comps[1].compId, 'c3');
assert.strictEqual(kmGroups[2].label, 'Ukjent region');
assert.strictEqual(kmGroups[2].comps.length, 1);
assert.strictEqual(kmGroups[2].comps[0].compId, 'c4');

var dmGroups = MD.groupByRegion(feltIndex, 'dm');
assert.deepStrictEqual(dmGroups.map(function (g) { return g.label; }),
    ['Nord-Norge', 'Østlandet Nord'],
    'dm groups by distrikt');
assert.strictEqual(dmGroups[0].comps[0].compId, 'c6');
assert.strictEqual(dmGroups[1].comps[0].compId, 'c5');

var nmGroups = MD.groupByRegion(feltIndex, 'nm');
assert.strictEqual(nmGroups.length, 1, 'nm is one ungrouped list');
assert.strictEqual(nmGroups[0].label, null);
assert.strictEqual(nmGroups[0].comps.length, 1);
assert.strictEqual(nmGroups[0].comps[0].compId, 'c7');

assert.strictEqual(MD.groupByRegion({ comps: [] }, 'km').length, 0,
    'no matching comps → no groups');

// ── medalCounts ────────────────────────────────────────────────────────

assert.deepStrictEqual(
    MD.medalCounts([
        sec('A', null, [{ medal: 'Gull' }, { medal: 'Gull' }, { medal: 'Sølv' }]),
        sec('B', null, [{ medal: 'Bronse' }, {}])
    ]),
    { Gull: 2, Sølv: 1, Bronse: 1 },
    'sums podium medals across sections; rows without a medal are ignored');
assert.deepStrictEqual(MD.medalCounts([]), { Gull: 0, Sølv: 0, Bronse: 0 });
assert.deepStrictEqual(MD.medalCounts(null), { Gull: 0, Sølv: 0, Bronse: 0 });

// ── meritterForPerson ──────────────────────────────────────────────────

var meritter = MD.meritterForPerson(
    [{ year: 2025, index: feltIndex }, { year: 2024, index: baneIndex }], 'p1');
assert.strictEqual(meritter.length, 5,
    'c1 km + c4 km + c5 dm + c7 nm (2025) + b1 km (2024)');
assert.deepStrictEqual(meritter.map(function (m) { return m.year; }),
    [2025, 2025, 2025, 2025, 2024], 'newest year first');
assert.deepStrictEqual(meritter[0], {
    year: 2025, scope: 'km', ovelse: 'Felt Fin', klasse: 'U',
    region: 'Buskerud', medal: 'Gull', compId: 'c1'
}, 'km merit region is the krets');
assert.strictEqual(meritter[2].scope, 'dm');
assert.strictEqual(meritter[2].region, 'Østlandet Nord',
    'dm merit region is the distrikt');
assert.strictEqual(meritter[3].scope, 'nm');
assert.strictEqual(meritter[3].region, null, 'nm merits carry no region');
assert.strictEqual(meritter[4].compId, 'b1');

assert.deepStrictEqual(MD.meritterForPerson([{ year: 2025, index: feltIndex }], 'nope'), [],
    'unknown person → no merits');
assert.deepStrictEqual(MD.meritterForPerson([{ year: 2025, index: feltIndex }], null), [],
    'null personId → no merits');

// ── summarizeByClub ────────────────────────────────────────────────────

var clubRows = MD.summarizeByClub([feltIndex, baneIndex]);
assert.deepStrictEqual(clubRows.map(function (r) { return r.club; }),
    ['Kongsvinger Sportsskyttere', 'Bodø PK', 'Brumunddal Pistolklubb', 'Ukjent klubb'],
    'sorted by gull desc, then sølv, then bronse');
assert.deepStrictEqual(clubRows[0].km, { Gull: 2, Sølv: 1, Bronse: 0 },
    'km medals accumulate across both branches');
assert.deepStrictEqual(clubRows[0].dm, { Gull: 1, Sølv: 0, Bronse: 0 });
assert.deepStrictEqual(clubRows[0].nm, { Gull: 1, Sølv: 0, Bronse: 0 });
assert.deepStrictEqual(clubRows[2].km, { Gull: 0, Sølv: 1, Bronse: 0 });
assert.deepStrictEqual(clubRows[2].dm, { Gull: 0, Sølv: 0, Bronse: 1 });
assert.deepStrictEqual(clubRows[3].km, { Gull: 0, Sølv: 0, Bronse: 1 },
    'podium rows with no club land in a Ukjent klubb bucket');
clubRows.forEach(function (r) {
    assert.ok(['Hurum SKL', 'Brumunddal PK', 'Sortland PK'].indexOf(r.club) === -1,
        'team podium names never count as club medals: ' + r.club);
});

console.log('mestere-data.test.js: all assertions passed');
