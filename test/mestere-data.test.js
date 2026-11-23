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
                { medal: 'Sølv', team: 'Hurum SKL', sum: 300, club: 'Hurum SKL' }
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

// ── programRank ────────────────────────────────────────────────────────
// Specificity-ordered keyword scan: 'Sp-Revolver' contains 'revolver' but
// is a spesial øvelse, so the sp- keywords are checked first.

assert.strictEqual(MD.programRank('Felt Fin'), 1);
assert.strictEqual(MD.programRank('Felt Grov'), 2);
assert.strictEqual(MD.programRank('Felt Revolver'), 3);
assert.strictEqual(MD.programRank('Felt Militær Rødpunkt'), 4);
assert.strictEqual(MD.programRank('Felt Sp-Pistol'), 5);
assert.strictEqual(MD.programRank('Felt Sp-Revolver'), 5);
assert.strictEqual(MD.programRank('Mix-lag: Felt Sp-Revolver'), 5);
assert.strictEqual(MD.programRank('Felt Spesialpistol'), 5);
assert.strictEqual(MD.programRank('Felt Magnum-1'), 6);
assert.strictEqual(MD.programRank('Felt Magnum-2'), 6);
assert.strictEqual(MD.programRank('Felt Ungdom'), 90,
    'øvelser outside the known families rank after them');
assert.strictEqual(MD.programRank('Hurtig Sp Revolver'), 5,
    'space-separated Sp is spesial too (bane prints it without the hyphen)');
assert.strictEqual(MD.programRank('Hurtig Sp Pistol'), 5);

// ── teamClub ───────────────────────────────────────────────────────────
// The club inside a lag name: strip a trailing team number, spaced
// ('GPK 1') or fused ('SSSK10'). Names without digits pass through.

assert.strictEqual(MD.teamClub('Hurum SKL'), 'Hurum SKL');
assert.strictEqual(MD.teamClub('Fredrikstad SS'), 'Fredrikstad SS');
assert.strictEqual(MD.teamClub('Brumunddal PK 2'), 'Brumunddal PK');
assert.strictEqual(MD.teamClub('GPK 1'), 'GPK');
assert.strictEqual(MD.teamClub('SSSK10'), 'SSSK');
assert.strictEqual(MD.teamClub('Oppdal8'), 'Oppdal');
assert.strictEqual(MD.teamClub(null), '');

// ── podiumRows ─────────────────────────────────────────────────────────

var kmRows = MD.podiumRows(feltIndex, 'km');
assert.strictEqual(kmRows.length, 6,
    'c1 km (3) + c2 km (1) + c3 kmLag (1) + c4 km (1)');
var fin = kmRows.filter(function (r) {
    return r.ovelse === 'Felt Fin' || r.ovelse === 'Lag Felt Fin';
});
assert.strictEqual(fin.length, 4);
assert.ok(fin[0].klasse === 'Menn lag' && fin[0].isTeam,
    'klasse Menn lag sorts before U, so the lag row leads Felt Fin');
var teamRow = kmRows.filter(function (r) { return r.isTeam; })[0];
assert.strictEqual(teamRow.name, 'Hurum SKL', 'team rows carry the team as name');
assert.strictEqual(teamRow.personId, null);
assert.strictEqual(teamRow.club, 'Hurum SKL', 'team rows carry the member-resolved club when the index has one');
assert.strictEqual(teamRow.sum, 300, 'team rows keep their lag sum');
assert.strictEqual(teamRow.medalRank, 2, 'Sølv');
assert.ok(kmRows.slice(0, 4).every(function (r) { return r.ovelseRank === 1; }),
    'the four Felt Fin rows (rank 1, incl. the Lag variant) sort before Felt Grov (rank 2)');
assert.ok(kmRows.slice(4).every(function (r) { return r.ovelse === 'Felt Grov'; }));
assert.strictEqual(kmRows[0].region, 'Buskerud');
assert.strictEqual(kmRows[0].date, '2025-06-11');
assert.strictEqual(kmRows[0].organizer, 'Arrangør c3', 'kmRows[0] is c3\u2019s lag row');
var uRows = kmRows.filter(function (r) { return r.ovelse === 'Felt Fin' && !r.isTeam; });
assert.deepStrictEqual(uRows.map(function (r) { return r.medal; }),
    ['Gull', 'Sølv', 'Bronse'], 'medalRank tiebreak within øvelse+klasse');
assert.strictEqual(uRows[2].club, null, 'club-less rows keep null club (Carl)');
var grov = kmRows.filter(function (r) { return r.ovelse === 'Felt Grov'; });
assert.strictEqual(grov.filter(function (r) { return r.klasse == null; }).length, 2,
    'klasse-null rows sink below the classed ones');
var nmRows = MD.podiumRows(feltIndex, 'nm');
assert.strictEqual(nmRows.length, 2, 'c7 nm (1) + nmLag (1); dm/km sections ignored');
assert.ok(nmRows.some(function (r) { return r.isTeam; }));
var dmRows = MD.podiumRows(feltIndex, 'dm');
assert.strictEqual(dmRows.length, 3, 'c5 dm (1) + dmLag (1) + c6 dm (1)');

// ── filterPodiumRows ───────────────────────────────────────────────────

var NOF = { ovelse: [], klasse: [], region: [], distrikt: [], klubb: '', navn: '', type: '' };
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: ['Felt Grov'], klasse: [], region: [], distrikt: [], klubb: '', navn: '', type: '' }).length, 2);
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: ['U'], region: [], distrikt: [], klubb: '', navn: '', type: '' }).length, 3);
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], medal: ['Gull'], region: [], distrikt: [], klubb: '', navn: '', type: '' }).length, 3,
    'medal filters by exact medal names');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], medal: ['Sølv', 'Bronse'], region: [], distrikt: [], klubb: '', navn: '', type: '' }).length, 3,
    'medal is multi-select');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], medal: ['Sølv'], region: [], distrikt: [], klubb: '', navn: '', type: 'lag' }).length, 1,
    'medal combines with the type filter (the lag row is Sølv)');
assert.strictEqual(MD.filterPodiumRows(kmRows, NOF).length, 6,
    'empty filters are no-ops (a filter object without a medal key too)');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: ['Buskerud'], distrikt: [], klubb: '', navn: '', type: '' }).length, 4);
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: ['Østlandet Sør'], klubb: '', navn: '', type: '' }).length, 3,
    'distrikt filter applies to row.distrikt (c3\u2019s lag row has none)');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: [], klubb: 'Bodø PK', navn: '', type: '' }).length, 1);
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: [], klubb: '', navn: 'ANNE', type: '' }).length, 2,
    'navn is a case-insensitive substring match');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: [], klubb: '', navn: 'hurum', type: '' }).length, 1,
    'navn matches team names too');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: [], klubb: '', navn: '', type: 'lag' }).length, 1);
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: [], klubb: '', navn: '', type: 'individuelt' }).length, 5);
assert.deepStrictEqual(MD.filterPodiumRows(kmRows, { ovelse: ['Finnes Ikke'], klasse: [], region: [], distrikt: [], klubb: '', navn: '', type: '' }), [],
    'stale filter values filter to nothing (a visible zero, never a crash)');
assert.strictEqual(MD.filterPodiumRows(kmRows, null).length, 6,
    'a null filters object is an empty filter');

// ── statsFor ────────────────────────────────────────────────────────────

assert.deepStrictEqual(MD.statsFor(kmRows, 'km'),
    { medaljer: 6, ovselser: 3, regioner: 2, klubber: 4 },
    'øvelser count Felt Fin + Lag Felt Fin + Felt Grov; klubber include the lag club (KSS+Brumunddal+Bodø+Hurum)');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: [], klubb: 'Hurum SKL', navn: '', type: '' }).length, 1,
    'the klubb filter matches lag rows via their resolved club');
assert.strictEqual(MD.statsFor(kmRows, 'nm').regioner, null, 'nm has no region stat');
assert.deepStrictEqual(MD.statsFor(nmRows, 'nm'),
    { medaljer: 2, ovselser: 2, regioner: null, klubber: 1 });

// ── podiumRows: lag member expansion (v15 team members) ───────────────
// Owner rulings 2026-11-23: one row per member; Klasse = the member's own
// class (Menn/Kvinner/…) with 'lag' appended, or 'Mix lag' for mix teams
// (a mix team is one male + one female — the team type is the class);
// Klubb = the member's resolved club (never the lag name); the lag name
// rides under Navn (page level); stats count the team medal once.

function memberFilters(over) {
    var f = { ovelse: [], klasse: [], region: [], distrikt: [], klubb: '', navn: '', type: '' };
    Object.keys(over || {}).forEach(function (k) { f[k] = over[k]; });
    return f;
}

var memberIndex = { year: 2024, comps: [comp('m1', {
    nm: [sec('Felt Fin', 'Å', [
        { medal: 'Gull', personId: 'p9', name: 'Solo', club: 'Solo PK', sum: 100 }
    ])],
    nmLag: [
        sec('Felt Fin', 'Å', [
            { medal: 'Gull', team: 'Greipstad PK1', sum: 318, club: 'Greipstad Pistolklubb', members: [
                { name: 'Tore Vrålstad', klasse: 'M', personId: 'p1', club: 'Greipstad Pistolklubb', sum: 107 },
                { name: 'Ukjent Skytter', klasse: 'K', sum: 106 }
            ] },
            { medal: 'Sølv', team: 'Bærum PK', sum: 310, members: [] }
        ]),
        sec('Felt Fin', 'Mix', [
            { medal: 'Gull', team: 'Farris SS1', sum: 198, members: [
                { name: 'Kjetil Skogshagen', klasse: 'V55', personId: 'p2', club: 'Farris SS', sum: 101 },
                { name: 'Mona Gjelstad', klasse: 'K', personId: 'p3', club: 'Larvik SK', sum: 97 }
            ] }
        ])
    ]
})] };

var mRows = MD.podiumRows(memberIndex, 'nm');
assert.strictEqual(mRows.length, 6,
    'one row per member; the memberless team keeps its single team row');
var tore = mRows.filter(function (r) { return r.name === 'Tore Vrålstad'; })[0];
assert.strictEqual(tore.ovelse, 'Lag Felt Fin', 'lag rows carry the Lag-prefixed øvelse label');
assert.strictEqual(tore.klasse, 'Menn lag', 'the member\u2019s own class with lag appended');
assert.strictEqual(tore.personId, 'p1');
assert.strictEqual(tore.club, 'Greipstad Pistolklubb', 'the member\u2019s resolved club');
assert.strictEqual(tore.sum, 107, 'the member\u2019s own sum');
assert.strictEqual(tore.lag, 'Greipstad PK1', 'the lag name rides on the row');
assert.strictEqual(tore.medal, 'Gull', 'the team\u2019s medal');
assert.ok(tore.isTeam, 'member rows count as lag for the type filter');
var ukjent = mRows.filter(function (r) { return r.name === 'Ukjent Skytter'; })[0];
assert.strictEqual(ukjent.klasse, 'Kvinner lag');
assert.strictEqual(ukjent.personId, null);
assert.strictEqual(ukjent.club, 'Greipstad Pistolklubb',
    'members without their own club fall back to the team\u2019s resolved club');
assert.strictEqual(tore.podiumKey, ukjent.podiumKey, 'teammates share one podium key');
var barum = mRows.filter(function (r) { return r.name === 'Bærum PK'; })[0];
assert.ok(barum.isTeam, 'a memberless team falls back to the team row');
assert.strictEqual(barum.ovelse, 'Lag Felt Fin');
assert.strictEqual(barum.klasse, 'Å lag',
    'the fallback team row uses the section class + lag (no members to read)');
assert.strictEqual(barum.sum, 310, 'the team sum on the fallback');
var kjetil = mRows.filter(function (r) { return r.name === 'Kjetil Skogshagen'; })[0];
assert.strictEqual(kjetil.ovelse, 'Mix-lag Felt Fin', 'mix sections label Mix-lag');
assert.strictEqual(kjetil.klasse, 'Mix lag',
    'a mix team\u2019s class is the team type — the participants\u2019 own classes do not show');
var mona = mRows.filter(function (r) { return r.name === 'Mona Gjelstad'; })[0];
assert.strictEqual(mona.klasse, 'Mix lag');
assert.strictEqual(mona.club, 'Larvik SK', 'each member carries their own club — mix halves can differ');
assert.deepStrictEqual(mRows.map(function (r) { return r.name; }),
    ['Ukjent Skytter', 'Tore Vrålstad', 'Kjetil Skogshagen', 'Mona Gjelstad', 'Solo', 'Bærum PK'],
    'member rows sort by klasse/medal/name like any other row (Kvinner lag < Menn lag < Mix lag < Å < Å lag for the fallback)');

assert.deepStrictEqual(MD.statsFor(mRows, 'nm'),
    { medaljer: 4, ovselser: 3, regioner: null, klubber: 4 },
    'the team medal counts once (1 individual + 3 teams); øvelser count the lag variants');
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ ovelse: ['Lag Felt Fin'], type: 'lag' })).length, 3,
    'the øvelse filter lists the Lag variant as its own entry');
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ klasse: ['Mix lag'] })).length, 2);
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ navn: 'tore' })).length, 1,
    'navn search finds team members');
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ type: 'individuelt' })).length, 1);

console.log('mestere-data.test.js: all assertions passed');
