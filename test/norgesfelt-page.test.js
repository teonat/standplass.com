var assert = require('assert');
// NP's club-param helpers delegate to format.js's hardened implementations —
// shim the browser global before requiring, the same way
// terminliste-page.test.js does.
global.StandplassFormat = require('../public/js/format.js');
// Page-test convention: globals in HTML script order — data-table.js
// calls into StandplassTable for sort semantics.
global.StandplassTable = require('../public/js/table-renderer.js');
global.StandplassDataTable = require('../public/js/data-table.js');
var NP = require('../public/js/norgesfelt-page.js');

// normalizeClub / matchesClub -- same substring-match convention as
// stevner-page.js (duplicated on purpose, see norgesfelt-page.js's own
// comment for why).
assert.strictEqual(NP.normalizeClub('Oslo Pistolklubb'), 'oslopistolklubb');
assert.strictEqual(NP.normalizeClub('Ås Skytterlag'), 'asskytterlag', 'æøå must fold to plain letters');
assert.ok(NP.matchesClub('Kongsvinger Sportsskyttere', 'kongsvinger'));
assert.ok(!NP.matchesClub('Oslo Pistolklubb', 'kongsvinger'));

// flattenAll -- tags each row with its discipline, across every discipline key
var sampleData = {
    disciplines: {
        Finfelt: {
            individual: [{ rank: 1, date: '15.04.2026', name: 'Ola', club: 'Oslo Pistolklubb', points: 80, innertreff: 38 }],
            total: [{ rank: 1, name: 'Ola', club: 'Oslo Pistolklubb', points: 240, innertreff: 112 }]
        },
        Grovfelt: {
            individual: [{ rank: 1, date: '16.04.2026', name: 'Kari', club: 'Bergen Pistolklubb', points: 70, innertreff: 20 }],
            total: []
        }
    }
};
var flatIndividual = NP.flattenAll(sampleData, 'individual');
assert.strictEqual(flatIndividual.length, 2);
assert.strictEqual(flatIndividual[0].discipline, 'Finfelt');
assert.strictEqual(flatIndividual[1].discipline, 'Grovfelt');
var flatTotal = NP.flattenAll(sampleData, 'total');
assert.strictEqual(flatTotal.length, 1, 'Grovfelt has no total rows in this fixture');

// enumerateClubs -- distinct, sorted, scans both individual and total
var clubs = NP.enumerateClubs(sampleData);
assert.deepStrictEqual(clubs, ['Bergen Pistolklubb', 'Oslo Pistolklubb']);

// disciplineOrder -- object key insertion order, never re-sorted
assert.deepStrictEqual(NP.disciplineOrder(sampleData), ['Finfelt', 'Grovfelt']);

// getFilteredEntries -- exact match against chosen club names, empty = all
var entries = [{ club: 'Oslo Pistolklubb' }, { club: 'Bergen Pistolklubb' }];
assert.strictEqual(NP.getFilteredEntries(entries, []).length, 2, 'empty selection shows all clubs');
assert.strictEqual(NP.getFilteredEntries(entries, ['Oslo Pistolklubb']).length, 1);

// searchMatchesEntry -- plain .toLowerCase() substring on name + club, no NFC
assert.ok(NP.searchMatchesEntry({ name: 'Ola Nordmann', club: 'Oslo Pistolklubb' }, 'nordmann'));
assert.ok(NP.searchMatchesEntry({ name: 'Ola Nordmann', club: 'Oslo Pistolklubb' }, 'OSLO'));
assert.ok(!NP.searchMatchesEntry({ name: 'Ola Nordmann', club: 'Oslo Pistolklubb' }, 'bergen'));
assert.ok(NP.searchMatchesEntry({ name: 'Ola', club: 'Oslo' }, ''), 'empty query matches everything');

// filterSearchEntries -- combines discipline filter + search
var searchable = [
    { name: 'Ola', club: 'Oslo Pistolklubb', discipline: 'Finfelt' },
    { name: 'Kari', club: 'Bergen Pistolklubb', discipline: 'Grovfelt' }
];
assert.strictEqual(NP.filterSearchEntries(searchable, { discipline: 'Finfelt' }).length, 1);
assert.strictEqual(NP.filterSearchEntries(searchable, { query: 'kari' }).length, 1);
assert.strictEqual(NP.filterSearchEntries(searchable, {}).length, 2);

// parseClubsParam / buildClubsParam -- page-local comma-join/split, same
// pattern terminliste-page.js already uses for its own multi-selects
assert.deepStrictEqual(NP.parseClubsParam(''), []);
assert.deepStrictEqual(NP.parseClubsParam('Oslo%20Pistolklubb,Bergen%20Pistolklubb'), ['Oslo Pistolklubb', 'Bergen Pistolklubb']);
assert.strictEqual(NP.buildClubsParam(['Oslo Pistolklubb', 'Bergen Pistolklubb']), 'Oslo%20Pistolklubb,Bergen%20Pistolklubb');
assert.deepStrictEqual(NP.parseClubsParam(NP.buildClubsParam(['Ås Skytterlag'])), ['Ås Skytterlag'], 'round-trip through encode/decode preserves æøå');
assert.deepStrictEqual(NP.parseClubsParam('%E0%A4%A'), ['%E0%A4%A'],
    'malformed escape falls back to raw instead of dead-ending init');

// ── dateSortKey + searchTableSpec (batch 1: shared table base) ─────────
// Norgesfelt dates display as DD.MM.YYYY, which collated as text sort
// day-then-month; the derived YYYYMMDD key sorts chronologically while
// the display string is untouched.
assert.strictEqual(NP.dateSortKey('08.03.2026'), '20260308');
assert.strictEqual(NP.dateSortKey('01.11.2026'), '20261101');
assert.strictEqual(NP.dateSortKey(null), null, 'absent date -> null key');
assert.strictEqual(NP.dateSortKey(''), null, 'empty date -> null key');

var NF_STATE = { hidden: {}, runtimeHidden: [], widthTier: null };
function nfSorted(spec, key, dir) {
    return StandplassDataTable.renderTable('norgesfelt-search', spec,
        { sort: { key: key, dir: dir }, hidden: {}, runtimeHidden: [], widthTier: null });
}
var nfEntries = [
    { rank: 1, name: 'Anne', club: 'Oslo PK', discipline: 'Finfelt', date: '01.11.2026', points: 289, innertreff: 41 },
    { rank: 2, name: 'Bjarne', club: 'Bergen PK', discipline: 'Finfelt', date: '08.03.2026', points: 275, innertreff: null },
    { rank: 3, name: 'Cecilie', club: 'Oslo PK', discipline: 'Grovfelt', date: null, points: 260, innertreff: 38 }
];
// Full variant: Gren shown (no disc filter), Dato shown (individual).
var nfSpecFull = NP.searchTableSpec(nfEntries, true, 'individual');
var nfFull = StandplassDataTable.renderTable('norgesfelt-search', nfSpecFull, NF_STATE);
assert.ok(nfFull.indexOf('<thead><tr>'
    + '<th scope="col" class="ranking-rank"><button type="button" class="dt-sort-btn" data-dt-sort="rank">#<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="name">Navn<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="club">Forening<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="discipline">Gren<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="dateSort">Dato<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="points">Poeng<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="innertreff">Innertreff<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'norgesfelt search: full header — all columns sortable, tiers carry the old breakpoints');
assert.ok(nfFull.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><td>Anne</td><td>Oslo PK</td><td>Finfelt</td><td>01.11.2026</td><td class="ranking-score">289</td><td class="ranking-score">41</td></tr>') !== -1,
    'norgesfelt search: row markup, hide classes replaced by tiers');
assert.ok(nfFull.indexOf('<td>–</td>') !== -1,
    'norgesfelt search: missing date renders –');
// Chronological Dato sort (lexicographic would put 01.11 first).
var nfDate = nfSorted(nfSpecFull, 'dateSort', 'asc');
assert.ok(nfDate.indexOf('08.03.2026') < nfDate.indexOf('01.11.2026'),
    'norgesfelt search: Dato asc sorts chronologically, not lexicographically');
assert.ok(nfDate.indexOf('–') > nfDate.indexOf('01.11.2026'),
    'norgesfelt search: null dates sort last');
// Reduced variant: disc filtered (no Gren), total type (no Dato).
var nfSpecSlim = NP.searchTableSpec(nfEntries, false, 'total');
var nfSlim = StandplassDataTable.renderTable('norgesfelt-search', nfSpecSlim, NF_STATE);
assert.ok(nfSlim.indexOf('data-dt-sort="discipline"') === -1 && nfSlim.indexOf('<th>Gren</th>') === -1,
    'norgesfelt search: Gren column absent when a discipline is filtered');
assert.ok(nfSlim.indexOf('data-dt-sort="dateSort"') === -1,
    'norgesfelt search: Dato column absent for total type');
assert.ok(nfSlim.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><td>Anne</td><td>Oslo PK</td><td class="ranking-score">289</td><td class="ranking-score">41</td></tr>') !== -1,
    'norgesfelt search: reduced row markup — #/Navn/Forening/Poeng/Innertreff only');
var nfPoints = nfSorted(nfSpecFull, 'points', 'desc');
assert.ok(nfPoints.indexOf('<td>Anne</td>') < nfPoints.indexOf('<td>Cecilie</td>'),
    'norgesfelt search: Poeng desc reorders');

// ── toplisteCardSpec (batch 1: shared table base) ───────────────────────
// The "Toppliste klubb" cards: same row shape as the flat table (incl.
// the derived dateSort key), toggle machinery deleted — a contained
// scroll region caps the height. # is not sortable here (it is the
// entry's own rank, not a placement), matching today's card headers.
assert.strictEqual(NP.toplisteCardSpec([], true, 'individual'), null,
    'topliste: empty entries produce no spec (message-only card)');
var tpEntries = [
    { rank: 1, name: 'Anne', club: 'Oslo PK', date: '01.11.2026', points: 289, innertreff: 41 },
    { rank: 2, name: 'Bjarne', club: 'Bergen PK', date: '08.03.2026', points: 275, innertreff: 37 },
    { rank: 3, name: 'Cecilie', club: 'Oslo PK', date: null, points: 260, innertreff: 33 }
];
var tpSpecFull = NP.toplisteCardSpec(tpEntries, true, 'individual');
var tpFull = StandplassDataTable.renderTable('norgesfelt-card-Finfelt', tpSpecFull, NF_STATE);
assert.ok(tpFull.indexOf('<thead><tr>'
    + '<th scope="col" class="ranking-rank">#</th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="name">Navn<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="club">Klubb<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="dateSort">Dato<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col" class="ranking-score"><button type="button" class="dt-sort-btn" data-dt-sort="points">Poeng<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="innertreff">Innertreff<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'topliste: full header — Navn/Klubb/Dato/Poeng/Innertreff sortable, # plain');
assert.ok(tpFull.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><td>Anne</td><td>Oslo PK</td><td>01.11.2026</td><td class="ranking-score">289</td><td>41</td></tr>') !== -1,
    'topliste: full row markup matches today\'s card cells');
var tpDate = nfSorted(tpSpecFull, 'dateSort', 'asc');
assert.ok(tpDate.indexOf('08.03.2026') < tpDate.indexOf('01.11.2026') && tpDate.indexOf('–') > tpDate.indexOf('01.11.2026'),
    'topliste: Dato sorts chronologically via the derived key, nulls last');
// One club selected (no Klubb col) + sammenlagt (no Dato col).
var tpSpecSlim = NP.toplisteCardSpec(tpEntries, false, 'total');
var tpSlim = StandplassDataTable.renderTable('norgesfelt-card-Finfelt', tpSpecSlim, NF_STATE);
assert.ok(tpSlim.indexOf('data-dt-sort="club"') === -1 && tpSlim.indexOf('data-dt-sort="dateSort"') === -1,
    'topliste: Klubb and Dato columns absent in the slim variant');
assert.ok(tpSlim.indexOf('<tr data-dt-row="0"><td class="ranking-rank">1</td><td>Anne</td><td class="ranking-score">289</td><td>41</td></tr>') !== -1,
    'topliste: slim row markup — #/Navn/Poeng/Innertreff only');
assert.ok(tpFull.indexOf('ranking-toggle') === -1 && tpFull.indexOf('Vis alle') === -1,
    'topliste: no toggle remains');

// ── batch 3: hideBelow tiers replace the CSS hide classes ──────────────
// Tier parity with the deleted media queries: at <=700 BOTH breakpoints
// fire (mobile- and tablet-tier columns hide); at <=900 only the
// tablet-tier columns (Innertreff, Klubb) hide — # and Dato have a 700
// boundary, which a 750px-wide viewport has not crossed.
var nfState = function (tier, hidden) {
    return { hidden: hidden || {}, runtimeHidden: [], widthTier: tier };
};
var nfT700 = StandplassDataTable.renderTable('norgesfelt-search', nfSpecFull, nfState(700));
assert.ok(nfT700.indexOf('data-dt-sort="rank"') < 0 && nfT700.indexOf('data-dt-sort="dateSort"') < 0 && nfT700.indexOf('data-dt-sort="innertreff"') < 0,
    'tier 700 hides #, Dato and Innertreff (both media queries fired at <=700)');
assert.ok(nfT700.indexOf('data-dt-sort="name"') >= 0 && nfT700.indexOf('data-dt-sort="club"') >= 0 && nfT700.indexOf('data-dt-sort="points"') >= 0,
    'tier 700 keeps Navn, Forening, Poeng');
var nfT900 = StandplassDataTable.renderTable('norgesfelt-search', nfSpecFull, nfState(900));
assert.ok(nfT900.indexOf('data-dt-sort="innertreff"') < 0, 'tier 900 hides Innertreff');
assert.ok(nfT900.indexOf('data-dt-sort="rank"') >= 0 && nfT900.indexOf('data-dt-sort="dateSort"') >= 0,
    'tier 900 keeps # and Dato (their boundary is 700, not crossed at 750px)');
var tpT700 = StandplassDataTable.renderTable('norgesfelt-card-Finfelt', tpSpecFull, nfState(700));
assert.ok(tpT700.indexOf('data-dt-sort="dateSort"') < 0 && tpT700.indexOf('data-dt-sort="club"') < 0 && tpT700.indexOf('data-dt-sort="innertreff"') < 0,
    'topliste tier 700 hides Dato, Klubb and Innertreff');
var tpT900 = StandplassDataTable.renderTable('norgesfelt-card-Finfelt', tpSpecFull, nfState(900));
assert.ok(tpT900.indexOf('data-dt-sort="club"') < 0 && tpT900.indexOf('data-dt-sort="innertreff"') < 0,
    'topliste tier 900 hides Klubb and Innertreff');
assert.ok(tpT900.indexOf('data-dt-sort="dateSort"') >= 0, 'topliste tier 900 keeps Dato');

// tab independence: the two tabs keep SEPARATE hidden maps — hiding
// Klubb on the cards leaves Forening on the search table alone
var tpClubHidden = StandplassDataTable.renderTable('norgesfelt-card-Finfelt', tpSpecFull, nfState(null, { club: true }));
assert.ok(tpClubHidden.indexOf('data-dt-sort="club"') < 0, 'topliste: hidden club removes the Klubb column');
assert.ok(StandplassDataTable.renderTable('norgesfelt-search', nfSpecFull, nfState(null)).indexOf('data-dt-sort="club"') >= 0,
    'search: Forening unaffected by the topliste tab\'s choice');

// the CSS hide classes are gone for good — source pins
var fs = require('fs');
var nfSrc = fs.readFileSync(__dirname + '/../public/js/norgesfelt-page.js', 'utf8');
assert.ok(nfSrc.indexOf('norgesfelt-mobile-hide') < 0 && nfSrc.indexOf('norgesfelt-tablet-hide') < 0,
    'no norgesfelt hide classes remain in the page source');
var cssSrc = fs.readFileSync(__dirname + '/../public/styles.css', 'utf8');
assert.ok(cssSrc.indexOf('norgesfelt-mobile-hide') < 0 && cssSrc.indexOf('norgesfelt-tablet-hide') < 0
    && cssSrc.indexOf('terminliste-mobile-hide') < 0 && cssSrc.indexOf('terminliste-tablet-hide') < 0,
    'no hide-class rules remain in the stylesheet');

console.log('norgesfelt-page.test.js: all assertions passed');
