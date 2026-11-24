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
            region: 'Buskerud', distrikt: 'Østlandet Sør', gren: 'felt',
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
    region: 'Buskerud', medal: 'Gull', compId: 'c1',
    compTitle: 'Teststevne c1', team: null, branch: null
}, 'km merit region is the krets; comp title rides along for the comp link');
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

// ── meritterForPerson: lag merits (owner ruling 2026-11-23) ───────────
// A team championship is a medal the person won as a member — matched
// by the member's personId. The merit carries the team name and the
// lag's own class form ('Lag Å', 'Mix-lag').

var lagIndex = {
    year: 2025,
    comps: [
        comp('l1', {
            region: 'Vestlandet',
            km: [sec('Felt Grov', null, [
                { medal: 'Bronse', personId: 'p1', name: 'Anne', club: 'X PK' }
            ])],
            kmLag: [sec('Felt Fin', 'Å', [
                { medal: 'Gull', team: 'Tysnes SSK 1', sum: 1417, club: 'Tysnes SSK',
                  members: [
                      { name: 'Ronnie Borgen', personId: 'p1', sum: 457 },
                      { name: 'Steffen Fosli', personId: 'p9', sum: 480 }
                  ] },
                { medal: 'Sølv', team: 'Odda PK', club: 'Odda PK', members: [
                    { name: 'Annen Person', personId: 'p2' }
                ] }
            ])]
        }),
        comp('l2', {
            kmLag: [sec('Felt Fin', 'Mix', [
                { medal: 'Gull', team: 'Brumunddal PK', club: 'Brumunddal PK',
                  members: [
                      { name: 'Kvinna', personId: 'p1' },
                      { name: 'Mannen', personId: 'p10' }
                  ] }
            ])]
        }),
        comp('l3', {
            // memberless: no personId anywhere to match
            kmLag: [sec('Felt Grov', 'V55', [
                { medal: 'Gull', team: 'Hurum SKL' }
            ])]
        })
    ]
};
var lagMeritter = MD.meritterForPerson([{ year: 2025, index: lagIndex }], 'p1');
assert.strictEqual(lagMeritter.length, 3,
    'individual + two lag merits for p1; memberless teams produce none');
assert.deepStrictEqual(lagMeritter[1], {
    year: 2025, scope: 'km', ovelse: 'Felt Fin', klasse: 'Lag Å',
    region: 'Vestlandet', medal: 'Gull', compId: 'l1',
    compTitle: 'Teststevne l1', team: 'Tysnes SSK 1', branch: null
}, 'a lag merit carries the team, the lag class form and the comp title');
assert.strictEqual(lagMeritter[2].klasse, 'Mix-lag',
    'mix teams are Mix-lag, never Lag Mix');
assert.strictEqual(lagMeritter[2].region, null,
    'region-less comps give lag merits no region');
assert.strictEqual(MD.meritterForPerson([{ year: 2025, index: lagIndex }], 'p9').length, 1,
    'a teammate merits only the shared team medal, not the rivals\'');
assert.strictEqual(MD.meritterForPerson([{ year: 2025, index: lagIndex }], 'p2').length, 1,
    'the second team\'s member merits that medal');

// branch rides along from the entry — the Meritter tab's
// Alle/Felt/Bane switcher filters on it; entries without a branch
// (older callers) give merits without one.
var branchMeritter = MD.meritterForPerson([
    { year: 2025, index: lagIndex, branch: 'felt' },
    { year: 2024, index: baneIndex, branch: 'bane' }
], 'p1');
assert.strictEqual(branchMeritter.length, 4,
    '2025 felt merits (3) + 2024 bane merit (1), newest year first');
branchMeritter.forEach(function (m) {
    assert.strictEqual(m.branch, m.year === 2025 ? 'felt' : 'bane',
        'each merit carries its entry\'s branch');
});

// ── summarizeByClub ────────────────────────────────────────────────────

var clubRows = MD.summarizeByClub([feltIndex, baneIndex]);
assert.deepStrictEqual(clubRows.map(function (r) { return r.club; }),
    ['Kongsvinger Sportsskyttere', 'Ukjent klubb', 'Bodø PK',
     'Brumunddal Pistolklubb', 'Hurum SKL'],
    'sorted by gull desc across all six scope keys, then sølv, then bronse, then name');
assert.deepStrictEqual(clubRows[0].km, { Gull: 2, Sølv: 1, Bronse: 0 },
    'km medals accumulate across both branches');
assert.deepStrictEqual(clubRows[0].dm, { Gull: 1, Sølv: 0, Bronse: 0 });
assert.deepStrictEqual(clubRows[0].nm, { Gull: 1, Sølv: 0, Bronse: 0 });
assert.deepStrictEqual(clubRows[0].kmLag, { Gull: 0, Sølv: 0, Bronse: 0 },
    'every row carries all six scope keys');
assert.deepStrictEqual(clubRows[1].dmLag, { Gull: 1, Sølv: 0, Bronse: 0 },
    'a clubless memberless team lands in Ukjent klubb (dmLag gull)');
assert.deepStrictEqual(clubRows[1].nmLag, { Gull: 0, Sølv: 0, Bronse: 1 });
assert.deepStrictEqual(clubRows[1].km, { Gull: 0, Sølv: 0, Bronse: 1 },
    'podium rows with no club land in the same bucket');
assert.deepStrictEqual(clubRows[2].km, { Gull: 1, Sølv: 0, Bronse: 0 });
assert.deepStrictEqual(clubRows[3].km, { Gull: 0, Sølv: 1, Bronse: 0 });
assert.deepStrictEqual(clubRows[3].dm, { Gull: 0, Sølv: 0, Bronse: 1 });
assert.deepStrictEqual(clubRows[4].kmLag, { Gull: 0, Sølv: 1, Bronse: 0 },
    'a memberless team counts once under its resolved club (owner ruling 2026-11-23)');

// ── summarizeByClub: lag team clubs (owner ruling 2026-11-23) ───────────

var lagClubRows = MD.summarizeByClub([lagIndex]);
var tysnes = lagClubRows.filter(function (r) { return r.club === 'Tysnes SSK'; })[0];
assert.deepStrictEqual(tysnes.kmLag, { Gull: 1, Sølv: 0, Bronse: 0 },
    'two members, one team medal — counted once');

var fallbackIndex = {
    year: 2025,
    comps: [comp('f1', {
        kmLag: [sec('Felt Fin', 'Å', [
            { medal: 'Sølv', team: 'Fallet Ut PK', members: [
                { name: 'D', personId: 'p4', club: 'Fallback PK' }
            ] }
        ])]
    })]
};
var fallbackRows = MD.summarizeByClub([fallbackIndex]);
assert.strictEqual(fallbackRows[0].club, 'Fallback PK',
    'a membered team with no resolved club falls back to the first member club');
assert.deepStrictEqual(fallbackRows[0].kmLag, { Gull: 0, Sølv: 1, Bronse: 0 });

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
var fin = kmRows.filter(function (r) { return r.ovelse === 'Felt Fin'; });
assert.strictEqual(fin.length, 4);
assert.ok(!fin[0].isTeam && fin[0].klasse === 'U',
    'the øvelse leads with its individual klasses');
assert.ok(fin[3].klasse === 'Lag Menn' && fin[3].isTeam,
    'lag rows come last within the øvelse (ruling 2026-11-24)');
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
assert.strictEqual(kmRows[0].organizer, 'Arrangør c1', 'kmRows[0] is c1\u2019s leading individual row');
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
    { medaljer: 6, ovselser: 2, regioner: 2, klubber: 4 },
    'øvelser count Felt Fin + Felt Grov (lag variants merge into their øvelse); klubber include the lag club (KSS+Brumunddal+Bodø+Hurum)');
assert.strictEqual(MD.filterPodiumRows(kmRows, { ovelse: [], klasse: [], region: [], distrikt: [], klubb: 'Hurum SKL', navn: '', type: '' }).length, 1,
    'the klubb filter matches lag rows via their resolved club');
assert.strictEqual(MD.statsFor(kmRows, 'nm').regioner, 2,
    'legacy scope arg ignored — regioner counts champRegion regardless');
assert.deepStrictEqual(MD.statsFor(nmRows, 'nm'),
    { medaljer: 2, ovselser: 2, regioner: 0, klubber: 1 },
    'nm rows carry no champRegion — regioner counts 0, never null');

// ── podiumRows: lag member expansion (v15 team members) ───────────────
// Owner rulings 2026-11-23 (v2): one row per member; Øvelse keeps its
// bare name (lag variants merge into their øvelse); Klasse = the
// lag's OWN class from the section ('Lag Å', 'Lag Menn' — M/K spelled
// out), 'Mix-lag' for mix teams (the team type is the class, the
// participants' own classes do not show); Klubb = the member's
// resolved club (never the lag name); the lag name rides under Navn
// (page level); stats count the team medal once.

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
        sec('Felt Fin', 'Mix U', [
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
assert.strictEqual(tore.ovelse, 'Felt Fin', 'lag rows carry the bare øvelse name');
assert.strictEqual(tore.klasse, 'Lag Å', 'the lag\u2019s own class — the section\u2019s, not the member\u2019s');
assert.strictEqual(tore.personId, 'p1');
assert.strictEqual(tore.club, 'Greipstad Pistolklubb', 'the member\u2019s resolved club');
assert.strictEqual(tore.sum, 107, 'the member\u2019s own sum');
assert.strictEqual(tore.lagSum, 318, 'the team\u2019s sum rides on member rows for the Sum sub-line');
assert.strictEqual(tore.lag, 'Greipstad PK1', 'the lag name rides on the row');
assert.strictEqual(tore.medal, 'Gull', 'the team\u2019s medal');
assert.ok(tore.isTeam, 'member rows count as lag for the type filter');
var ukjent = mRows.filter(function (r) { return r.name === 'Ukjent Skytter'; })[0];
assert.strictEqual(ukjent.klasse, 'Lag Å',
    'teammates share the section class regardless of their own');
assert.strictEqual(ukjent.personId, null);
assert.strictEqual(ukjent.club, 'Greipstad Pistolklubb',
    'members without their own club fall back to the team\u2019s resolved club');
assert.strictEqual(tore.podiumKey, ukjent.podiumKey, 'teammates share one podium key');
var barum = mRows.filter(function (r) { return r.name === 'Bærum PK'; })[0];
assert.ok(barum.isTeam, 'a memberless team falls back to the team row');
assert.strictEqual(barum.ovelse, 'Felt Fin');
assert.strictEqual(barum.klasse, 'Lag Å',
    'the fallback team row uses the same section class');
assert.strictEqual(barum.sum, 310, 'the team sum on the fallback');
assert.strictEqual(barum.lagSum, null,
    'the fallback team row\u2019s sum IS the team sum — no sub-line');
var kjetil = mRows.filter(function (r) { return r.name === 'Kjetil Skogshagen'; })[0];
assert.strictEqual(kjetil.ovelse, 'Felt Fin', 'mix sections carry the bare øvelse name too');
assert.strictEqual(kjetil.klasse, 'Mix-lag U',
    'mix teams render their registered mix class (Mix U -> Mix-lag U)');
var mona = mRows.filter(function (r) { return r.name === 'Mona Gjelstad'; })[0];
assert.strictEqual(mona.klasse, 'Mix-lag U');
assert.strictEqual(mona.club, 'Larvik SK', 'each member carries their own club — mix halves can differ');
assert.strictEqual(mona.lagSum, 198, 'mix member rows carry the team sum too');
assert.deepStrictEqual(mRows.map(function (r) { return r.name; }),
    ['Solo', 'Tore Vrålstad', 'Ukjent Skytter', 'Bærum PK', 'Kjetil Skogshagen', 'Mona Gjelstad'],
    'individual rows first, then the øvelse\'s lag rows by klasse/medal/name (ruling 2026-11-24)');

assert.deepStrictEqual(MD.statsFor(mRows, 'nm'),
    { medaljer: 4, ovselser: 1, regioner: 0, klubber: 4 },
    'the team medal counts once (1 individual + 3 teams); the lag variants merge into their øvelse');
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ ovelse: ['Felt Fin'], type: 'lag' })).length, 5,
    'the øvelse filter keeps individual and lag rows of the same øvelse; the type filter narrows');
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ klasse: ['Mix-lag U'] })).length, 2);
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ navn: 'tore' })).length, 1,
    'navn search finds team members');
assert.strictEqual(MD.filterPodiumRows(mRows, memberFilters({ type: 'individuelt' })).length, 1);

// The medal-count ruling under FILTERS: a team's medal counts once
// even when the filter keeps only part of the team, and each team of
// a two-team club counts its own (the PDFs print all the club's
// shooters under each team line, so the same names ride both teams).
var greipstadRows = MD.filterPodiumRows(mRows, memberFilters({ klubb: 'Greipstad Pistolklubb' }));
assert.strictEqual(greipstadRows.length, 2, 'the klubb filter keeps both Greipstad members');
assert.strictEqual(MD.statsFor(greipstadRows, 'nm').medaljer, 1,
    'a filter keeping part of a team still counts its medal once');
assert.strictEqual(MD.statsFor(
    MD.filterPodiumRows(mRows, memberFilters({ navn: 'tore' })), 'nm').medaljer, 1,
    'a single kept teammate counts the medal once too');

var twoTeamIndex = { year: 2024, comps: [comp('t1', {
    nmLag: [sec('Felt Fin', 'Å', [
        { medal: 'Gull', team: 'Mosjøen PK 1', sum: 318, club: 'Mosjøen PK', members: [
            { name: 'Ola Nordmann', klasse: 'M', sum: 107 },
            { name: 'Kari Nordmann', klasse: 'K', sum: 106 }
        ] },
        { medal: 'Sølv', team: 'Mosjøen PK 2', sum: 310, club: 'Mosjøen PK', members: [
            { name: 'Ola Nordmann', klasse: 'M', sum: 104 },
            { name: 'Kari Nordmann', klasse: 'K', sum: 103 }
        ] }
    ])]
})] };
var tRows = MD.podiumRows(twoTeamIndex, 'nm');
assert.strictEqual(tRows.length, 4, 'two teams × their printed member lines');
var tKeys = {};
tRows.forEach(function (r) { tKeys[r.podiumKey] = true; });
assert.strictEqual(Object.keys(tKeys).length, 2,
    'the same names under team 2 are a different podium');
var mosjoenRows = MD.filterPodiumRows(tRows, memberFilters({ klubb: 'Mosjøen PK' }));
assert.strictEqual(mosjoenRows.length, 4,
    'a two-team club keeps all its member rows under one club filter');
assert.strictEqual(MD.statsFor(mosjoenRows, 'nm').medaljer, 2,
    'each team of a two-team club counts its own medal');

// ── podiumRows: multi-scope stamping (unified view) ────────────────────
// Spec: 2026-11-24-mesterskap-unified-view-design.md — podiumRows takes a
// scopes list (string | array | absent = all three) and stamps every row
// with its championship type (type/typeRank) and the championship's own
// region (champRegion: krets for km, distrikt for dm, null for nm).
// Ruling 11: dual km+dm comps emit one entry per scope — a person on
// both podiums gets two rows, never a merged or deduped one.

var mixedIndex = {
    year: 2026,
    comps: [
        comp('m1', {
            region: 'Buskerud', distrikt: 'Østlandet Sør', gren: 'felt',
            km: [sec('Felt Fin', 'U', [
                { medal: 'Gull', personId: 'p2', name: 'Berit', club: 'Hurum SKL', sum: 88 }
            ])]
        }),
        comp('m2', {
            region: 'Hedmark', distrikt: 'Østlandet Nord',
            dm: [sec('Felt Grov', null, [
                { medal: 'Gull', personId: 'p3', name: 'Carl', club: 'Brumunddal Pistolklubb', sum: 90 }
            ])]
        }),
        comp('m3', {
            // nm comps carry neither region nor distrikt
            nm: [sec('Felt Magnum-2', 'Å', [
                { medal: 'Gull', personId: 'p4', name: 'Dag', club: 'Bodø PK', sum: 150 }
            ])]
        }),
        comp('m4', {
            // dual km+dm: one championship counted at both levels — Anne
            // tops both podiums (ruling 11: two entries, one km one dm)
            region: 'Vestfold', distrikt: 'Østlandet Sør', gren: 'felt',
            km: [sec('Felt Magnum-1', 'Å', [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Larvik PK', sum: 80 }
            ])],
            dm: [sec('Felt Magnum-1', 'Å', [
                { medal: 'Gull', personId: 'p1', name: 'Anne', club: 'Larvik PK', sum: 80 }
            ])]
        })
    ]
};

// Multi-scope default: no scopes arg returns rows from all three types.
var allRows = MD.podiumRows(mixedIndex);
var mixedTypes = {};
allRows.forEach(function (r) { mixedTypes[r.type] = true; });
assert.deepStrictEqual(Object.keys(mixedTypes).sort(), ['dm', 'km', 'nm'],
    'no scopes arg = all three types');

// A string arg stays a one-element list (old callers keep working).
var kmOnlyMixed = MD.podiumRows(mixedIndex, 'km');
assert.ok(kmOnlyMixed.every(function (r) { return r.type === 'km'; }),
    'string scope arg keeps the old single-scope behavior');
assert.ok(kmOnlyMixed.length > 0 && MD.podiumRows(mixedIndex, ['dm']).length > 0);

// Type stamps and ranks.
var byType = {};
allRows.forEach(function (r) { byType[r.type] = r; });
assert.strictEqual(byType.km.typeRank, 3);
assert.strictEqual(byType.dm.typeRank, 2);
assert.strictEqual(byType.nm.typeRank, 1);

// champRegion: krets for km, distrikt for dm, null for nm.
assert.strictEqual(byType.km.champRegion, byType.km.region);
assert.strictEqual(byType.dm.champRegion, byType.dm.distrikt);
assert.strictEqual(byType.nm.champRegion, null);

// The comp title rides on every row — the Arrangør column's comp-modal
// link passes it as the modal header (ruling 14).
assert.strictEqual(byType.km.title, 'Teststevne ' + byType.km.compId,
    'rows carry their comp title');

// The branch (felt/bane) rides on rows too — the Arrangement column's
// resultfile link needs it to address the right detaljer directory
// (ruling 15).
assert.strictEqual(byType.km.gren, 'felt', 'rows carry their comp branch');
assert.strictEqual(byType.nm.gren, null, 'comps without a branch stamp carry null');

// Ruling 11: a dual km+dm comp emits one entry per scope — Anne on
// both podiums gets two rows (KM-gull and DM-gull), never a merged
// or deduped one.
var anneDual = allRows.filter(function (r) {
    return r.personId === 'p1' && r.ovelse === 'Felt Magnum-1';
});
assert.strictEqual(anneDual.length, 2, 'one entry per scope, never merged');
assert.deepStrictEqual(anneDual.map(function (r) { return r.type; }).sort(), ['dm', 'km']);

// Ruling 20 (2026-11-24): within an øvelse, lag rows come after ALL
// individual rows — their 'Lag M'-style klasse otherwise sorts
// alphabetically before the 'M'/'V' klasses (before men and
// veterans), which reads as the klasse sort not being applied.
// Within each klasse the podium rank orders the rows (Gull → Sølv →
// Bronse), also across comps.
var lagOrderIndex = {
    year: 2026,
    comps: [
        comp('lo1', {
            km: [
                sec('Felt Fin', 'V55', [{ medal: 'Gull', name: 'Veteran', club: 'A SK' }]),
                sec('Felt Fin', 'M', [{ medal: 'Gull', name: 'Mann', club: 'A SK' }])
            ],
            kmLag: [sec('Felt Fin', 'M', [{ medal: 'Sølv', team: 'Laget', sum: 300, club: 'A SK' }])]
        }),
        comp('lo2', {
            km: [sec('Felt Fin', 'M', [
                { medal: 'Sølv', name: 'Annemann', club: 'B SK' },
                { medal: 'Bronse', name: 'Carlmann', club: 'B SK' }
            ])]
        })
    ]
};
var lagOrderRows = MD.podiumRows(lagOrderIndex);
assert.deepStrictEqual(
    lagOrderRows.map(function (r) { return (r.isTeam ? 'lag:' : 'person:') + r.name; }),
    ['person:Mann', 'person:Annemann', 'person:Carlmann', 'person:Veteran', 'lag:Laget'],
    'individual klasses first (Norwegian collation), podium rank within each klasse, then the øvelse\'s lag rows last');

// ── filterPodiumRows: mesterskapstype + statsFor: champRegion ─────────
// Spec rulings 3 and 10: mesterskap filters by row type (empty = all);
// under a region filter, rows that carry no region (nm rows) drop out —
// the filter means "championships of this region". statsFor counts
// distinct non-null champRegion values, scope-independent.

// Mesterskapstype filter: empty = all; list = membership.
var fAll = MD.filterPodiumRows(allRows, {});
assert.strictEqual(fAll.length, allRows.length, 'no mesterskap filter = all types');
var fKm = MD.filterPodiumRows(allRows, { mesterskap: ['km'] });
assert.ok(fKm.every(function (r) { return r.type === 'km'; }),
    'mesterskap filters by row type');
assert.strictEqual(MD.filterPodiumRows(allRows, { mesterskap: ['nm', 'dm'] }).length,
    allRows.length - fKm.length, 'multi-type membership (nm+dm = the complement of km)');

// Ruling 10: NM rows carry no region/distrikt and DROP OUT under a
// region filter — but dm rows match their host krets (the krets rule).
var fKrets = MD.filterPodiumRows(allRows, { region: [byType.km.region] });
assert.ok(fKrets.every(function (r) { return r.region === byType.km.region; }));
assert.ok(fKrets.every(function (r) { return r.type !== 'nm'; }),
    'nm rows never match a region filter');

// statsFor: distinct non-null champRegion, nulls ignored.
var sAll = MD.statsFor(allRows);
var expectedRegions = {};
allRows.forEach(function (r) { if (r.champRegion != null) { expectedRegions[r.champRegion] = true; } });
assert.strictEqual(sAll.regioner, Object.keys(expectedRegions).length,
    'regioner counts distinct non-null champRegion');

console.log('mestere-data.test.js: all assertions passed');
