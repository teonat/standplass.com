'use strict';
var assert = require('node:assert');
// resolveKlubbParam decodes ?klubb= via StandplassFormat.decodeIdList, a
// browser global -- shim it here the same way comp-modal.test.js does.
global.StandplassFormat = require('../public/js/format.js');
global.StandplassDataTable = require('../public/js/data-table.js');
var SP = require('../public/js/stevner-page.js');
var PM = require('../public/js/person-modal.js');

// flattenRows must hand the chart a *date-only* string (nsf-ui.js:2166 does
// `comp.startDate.slice(0, 10)`): person-modal.js keys its "best result per
// date" reduction on this value and parses it with getUTC*, both of which
// misbehave on a full local-time datetime.
var rows = SP.flattenRows({
    competitions: [
        { startDate: '2025-12-30T10:04:00', applicableForClassification: true, results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 2, score: 28, rankingScore: 90 }] },
        { startDate: '2025-12-30T18:00:00', applicableForClassification: true, results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 1, score: 30, rankingScore: 95 }] },
        { startDate: '2025-06-01T09:00:00', applicableForClassification: true, results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 3, score: 25, rankingScore: 80 }] },
        { results: [{ personId: '1', name: 'A', club: 'K', discipline: 'Grovfelt', class: 'A', position: 4 }] }
    ]
});
assert.deepStrictEqual(rows.map(function (r) { return r.date; }), ['2025-12-30', '2025-12-30', '2025-06-01', '']);

// Two competitions on the same calendar day therefore merge into one line
// point (best result of the day), while every dot is still drawn.
var container = { innerHTML: '' };
PM.renderChart(container, rows, 'rankingScore');
assert.strictEqual(container.innerHTML.match(/points="([^"]*)"/)[1].split(' ').length, 2, 'same-day competitions must share one line point');
assert.strictEqual((container.innerHTML.match(/class="person-chart-dot"/g) || []).length, 3, 'all dated results still get a dot');

var comps = [
    {
        id: 'c1', title: 'Vårfelt', status: 1, startDate: '2025-04-01',
        facilityName: 'Bane A', organizationName: 'Klubb A',
        resultFileUrl: 'https://example.test/r.pdf', deepLink: 'https://skyting.no/c1',
        applicableForClassification: true,
        results: [
            { personId: '1', name: 'Ola', club: 'Klubb A', discipline: 'Grovfelt', class: 'A', position: 2, score: 28, rankingScore: 90 },
            { personId: '2', name: 'Kari', club: 'Klubb B', discipline: 'Grovfelt', class: 'B', position: 1, score: 30, rankingScore: 95 },
            { personId: '3', name: 'Per', club: 'Klubb A', discipline: 'Fellesfelt', class: 'A', position: 1, score: 27, rankingScore: 88 }
        ]
    },
    {
        id: 'c2', title: 'Høstfelt', status: 3, startDate: '2025-09-01',
        facilityName: 'Bane B', organizationName: 'Klubb B', resultFileUrl: null,
        deepLink: 'https://skyting.no/c2', applicableForClassification: false,
        results: [{ personId: '2', name: 'Kari', club: 'Klubb B', discipline: 'Grovfelt', class: 'B', position: 1, score: 29, rankingScore: 92 }]
    }
];
var baseFilters = { activeTab: 'alle', activeDiscs: [], activeClubs: [], nameQuery: '', groupMode: 'klasse',
    activeOrganizers: [], compQuery: '' };

var cards = SP.buildCompetitionCards(comps, baseFilters);
assert.strictEqual(cards.length, 2, 'both competitions survive an unfiltered build');
assert.strictEqual(cards[0].id, 'c1');
assert.strictEqual(cards[0].title, 'Vårfelt');
assert.strictEqual(cards[0].status, 1);
assert.strictEqual(cards[0].resultFileUrl, 'https://example.test/r.pdf');

// klasse mode keys on discipline|class, so c1's three results form THREE
// groups (Grovfelt|A, Grovfelt|B, Fellesfelt|A), not two.
assert.strictEqual(cards[0].groups.length, 3, 'klasse mode groups by discipline+class');
assert.deepStrictEqual(cards[0].groups.map(function (g) { return g.label; }).sort(), ['Fellesfelt – A', 'Grovfelt – A', 'Grovfelt – B'].sort());
assert.strictEqual(cards[0].stats.skyttere, 3);
assert.strictEqual(cards[0].stats.startere, 3);
assert.strictEqual(cards[0].stats.snitt, (28 + 30 + 27) / 3);

var klasseOnly = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { activeTab: 'klasse' }));
assert.strictEqual(klasseOnly.length, 1, 'ikke-klasseførende competition c2 is dropped entirely');
assert.strictEqual(klasseOnly[0].id, 'c1');

var byClub = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { activeClubs: ['Klubb A'] }));
assert.strictEqual(byClub.length, 1, 'c2 has no Klubb A rows once filtered, so the whole card drops');
assert.strictEqual(byClub[0].stats.startere, 2, 'c1 keeps only its 2 Klubb A rows');

var ovelseMode = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { groupMode: 'ovelse' }));
assert.strictEqual(ovelseMode[0].groups.length, 2, 'ovelse mode groups by discipline only');

assert.ok(cards[0].groups[0].rows[0].nameHtml.indexOf('data-discipline="') !== -1, 'nameHtml now carries the row discipline for Task 7');

// Mixed-value ?klubb= semantics are init-bound in the page (activeClubs is
// exact-membership), so the keep-unmatched-alongside-matched guarantee is
// asserted through resolveKlubbParam instead (r3 above).

assert.strictEqual(SP.statsLine({ skyttere: 3, startere: 5, snitt: 27.4, median: 28 }),
    '3 skyttere · 5 starter · snitt 27,4 · median 28');
assert.strictEqual(SP.statsLine({ skyttere: 0, startere: 0, snitt: null, median: null }),
    '0 skyttere · 0 starter · snitt – · median –');
assert.strictEqual(SP.statsLine({ skyttere: 3, startere: 5, snitt: 45.333333333333336, median: 44.5 }),
    '3 skyttere · 5 starter · snitt 45,3 · median 44,5', 'repeating decimals round to one decimal');
assert.strictEqual(SP.statsLine({ skyttere: 1, startere: 1, snitt: 10, median: 10 }),
    '1 skytter · 1 start · snitt 10 · median 10', 'singular skytter/start drop the trailing e/er');
assert.strictEqual(SP.formatUpdated('2026-08-17T14:05:00Z'), 'Oppdatert 17.08.2026 kl. 14:05');
assert.strictEqual(SP.formatUpdated(undefined), '', 'missing lastUpdated yields no text, not NaN');

var byOrganizer = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { activeOrganizers: ['Klubb A'] }));
assert.strictEqual(byOrganizer.length, 1, 'only c1 (organizationName "Klubb A") matches');
assert.strictEqual(byOrganizer[0].id, 'c1');

var byTitle = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { compQuery: 'høst' }));
assert.strictEqual(byTitle.length, 1, 'case-insensitive substring match against comp.title');
assert.strictEqual(byTitle[0].id, 'c2');

var noMatch = SP.buildCompetitionCards(comps, Object.assign({}, baseFilters, { compQuery: 'nonexistent' }));
assert.strictEqual(noMatch.length, 0);

// ── countUniqueShooters ────────────────────────────────────────────────
assert.strictEqual(SP.countUniqueShooters([]), 0, 'no rows -> 0');
assert.strictEqual(SP.countUniqueShooters([{ personId: 'p1' }, { personId: 'p2' }, { personId: 'p1' }]),
    2, 'distinct personIds counted once');
assert.strictEqual(SP.countUniqueShooters([{ name: 'A' }, { personId: null }]),
    0, 'rows without personId are not counted');

// ── resolveKlubbParam ──────────────────────────────────────────────────
// matchesClub is a normalized substring match — use realistic names.
var names = ['Kongsvinger Sportsskyttere', 'Oslo Poltiselskap', 'Aron Skytterklubb, Drammen'];
var r1 = SP.resolveKlubbParam('kongsvinger', names);
assert.deepStrictEqual(r1, { clubs: ['Kongsvinger Sportsskyttere'], hasUnmatched: false }, 'single slug resolves');
var r2 = SP.resolveKlubbParam('kongsvinger,oslo', names);
assert.strictEqual(r2.clubs.length, 2, 'two slugs resolve to two clubs');
assert.ok(r2.clubs.indexOf('Kongsvinger Sportsskyttere') >= 0 && r2.clubs.indexOf('Oslo Poltiselskap') >= 0, 'both matched');
assert.strictEqual(r2.hasUnmatched, false, 'no unmatched when both match');
var r3 = SP.resolveKlubbParam('kongsvinger,nosuchclub', names);
assert.strictEqual(r3.clubs.length, 2, 'unmatched element kept, never widen');
assert.ok(r3.clubs.indexOf('nosuchclub') >= 0, 'unmatched slug present verbatim');
assert.strictEqual(r3.hasUnmatched, true, 'unmatched flagged');
assert.deepStrictEqual(SP.resolveKlubbParam('', names), { clubs: [], hasUnmatched: false }, 'empty raw -> empty');
var r4 = SP.resolveKlubbParam('oslo,poltiselskap', names);
assert.deepStrictEqual(r4.clubs, ['Oslo Poltiselskap'], 'two slugs matching one club dedupe, first occurrence wins');
assert.strictEqual(r4.hasUnmatched, false, 'a fully deduped match is not unmatched');
var r5 = SP.resolveKlubbParam('Aron%20Skytterklubb%2C%20Drammen', names);
assert.deepStrictEqual(r5, { clubs: ['Aron Skytterklubb, Drammen'], hasUnmatched: false }, 'encoded comma survives as one element and resolves');
assert.deepStrictEqual(SP.resolveKlubbParam(',,,', names), { clubs: [',,,'], hasUnmatched: true },
    'degenerate raw decodes to zero elements but must never widen the view');
assert.deepStrictEqual(SP.resolveKlubbParam('%20%20', names), { clubs: ['  '], hasUnmatched: true },
    'whitespace-only slug normalizes to empty and must never widen the view');

// ── resolveSlugElements ────────────────────────────────────────────────
// The shared slug→club resolver behind resolveKlubbParam and loadYear's
// re-resolution pass: matched elements become club names, unmatched stay
// verbatim (never widen), duplicates dedupe preserving first occurrence.
var s1 = SP.resolveSlugElements(['kongsvinger', 'nosuchclub'], names);
assert.strictEqual(s1.clubs.length, 2, 'mixed: matched resolves, unmatched kept verbatim');
assert.ok(s1.clubs.indexOf('Kongsvinger Sportsskyttere') >= 0 && s1.clubs.indexOf('nosuchclub') >= 0);
assert.strictEqual(s1.hasUnmatched, true, 'mixed: unmatched flagged');
assert.deepStrictEqual(SP.resolveSlugElements(['  '], names), { clubs: ['  '], hasUnmatched: true },
    'empty-normalizing element kept verbatim, never widens');
var s3 = SP.resolveSlugElements(['oslo', 'poltiselskap'], names);
assert.deepStrictEqual(s3, { clubs: ['Oslo Poltiselskap'], hasUnmatched: false },
    'two slugs matching one club dedupe, first occurrence wins');
var s4 = SP.resolveSlugElements(['Kongsvinger Sportsskyttere', 'kongsvinger'], names);
assert.deepStrictEqual(s4, { clubs: ['Kongsvinger Sportsskyttere'], hasUnmatched: false },
    'exact name passes through and dedupes with its own slug');
assert.deepStrictEqual(SP.resolveSlugElements([], names), { clubs: [], hasUnmatched: false }, 'empty elements -> empty');
assert.deepStrictEqual(SP.resolveSlugElements(null, names), { clubs: [], hasUnmatched: false }, 'null elements -> empty');

// ── competitionCardTableSpec (batch 2: shared table base) ───────────────
// The per-competition card tables render through the base: six sortable
// columns (Øvelse stays plain — it is the group key), group rows via
// dt-group-row on EVERY card (single-group included — owner QA round 7:
// the label is where the discipline lives at phone width, where the
// Øvelse column is hidden by default; single-group cards never showed
// it pre-migration either), cells completely unclassed (no rank/score
// styling — owner ruling), and rows flattened from card.groups.
var NF_STATE = { hidden: {}, runtimeHidden: [], widthTier: null };
function nfRender(spec, state) {
    return StandplassDataTable.renderTable('stevner-card-test', spec, state || NF_STATE);
}
function nfSorted(spec, key, dir) {
    return StandplassDataTable.renderTable('stevner-card-test', spec,
        { sort: { key: key, dir: dir }, hidden: {}, runtimeHidden: [], widthTier: null });
}

// Multi-group card, klasse mode (c1: three discipline+class groups; cards built with baseFilters' groupMode).
var klasseSpec = SP.competitionCardTableSpec(cards[0]);
assert.ok(klasseSpec.groupRows, 'multi-group card carries the groupRows opt');
assert.ok(nfRender(klasseSpec).indexOf('<thead><tr>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="position">#<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="name">Navn<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="club">Klubb<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col">Øvelse</th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="class">Klasse<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="score">Poeng<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '<th scope="col"><button type="button" class="dt-sort-btn" data-dt-sort="rankingScore">Ranking<span class="dt-sort-arrow" aria-hidden="true"></span></button></th>'
    + '</tr></thead>') !== -1,
    'card table: six sortable headers, plain Øvelse, no align classes anywhere');
var klasseHtml = nfRender(klasseSpec);
assert.ok(klasseHtml.indexOf('ranking-rank') === -1 && klasseHtml.indexOf('ranking-score') === -1,
    'card table: cells stay completely unclassed (owner ruling — plain look)');
assert.ok(klasseHtml.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="7">Grovfelt – A</th></tr>') !== -1,
    'card table: group rows via dt-group-row with today\'s labels');
assert.ok(klasseHtml.indexOf('<tr data-dt-row="1"><td>2</td><td><button type="button" class="stevner-person-btn link-btn" data-person-id="1" data-person-name="Ola" data-discipline="Grovfelt">Ola</button></td><td>Klubb A</td><td>Grovfelt</td><td>A</td><td>28</td><td>90.00</td></tr>') !== -1,
    'card table: person button byte-exact, num/toFixed(2) cells, no cell classes (comparator order: Fellesfelt < Grovfelt puts Ola at index 1)');

// Single-group card (c2): carries the group row TOO — the label row is
// the discipline's home when the Øvelse column is tier-hidden.
var singleSpec = SP.competitionCardTableSpec(cards[1]);
assert.ok(singleSpec.groupRows, 'single-group card carries the groupRows opt');
var singleHtml = nfRender(singleSpec);
assert.ok(singleHtml.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="7">Grovfelt – B</th></tr>') !== -1,
    'single-group card renders its group label row');
assert.ok(singleHtml.indexOf('<tr data-dt-row="0"><td>1</td><td><button type="button" class="stevner-person-btn link-btn" data-person-id="2" data-person-name="Kari" data-discipline="Grovfelt">Kari</button></td><td>Klubb B</td><td>Grovfelt</td><td>B</td><td>29</td><td>92.00</td></tr>') !== -1,
    'single-group card: rows keep comparator order beneath the label');

// Single-group card in poeng mode keeps the comparator (poeng desc) order.
var poengComps = [{
    id: 'c3', title: 'Sommerskyting', status: 1, startDate: '2025-07-01',
    applicableForClassification: true,
    results: [
        { personId: '9', name: 'Åse', club: 'Klubb C', discipline: 'Grovfelt', class: 'A', position: 3, score: 25, rankingScore: 80 },
        { personId: '8', name: 'Bent', club: 'Klubb C', discipline: 'Grovfelt', class: 'A', position: 1, score: 30, rankingScore: 95 },
        { personId: '7', name: 'Cato', club: 'Klubb D', discipline: 'Grovfelt', class: 'B', position: 2, score: 28, rankingScore: 90 }
    ]
}];
var poengCards = SP.buildCompetitionCards(poengComps, Object.assign({}, baseFilters, { groupMode: 'poeng' }));
assert.strictEqual(poengCards[0].groups.length, 1, 'poeng mode: one discipline-only group');
var poengSpec = SP.competitionCardTableSpec(poengCards[0]);
assert.ok(poengSpec.groupRows, 'single-group card in poeng mode carries groupRows');
var poengHtml = nfRender(poengSpec);
assert.ok(poengHtml.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="7">Grovfelt</th></tr>') !== -1,
    'poeng single-group: group label row renders');
assert.ok(poengHtml.indexOf('<td>30</td>') < poengHtml.indexOf('<td>28</td>') && poengHtml.indexOf('<td>28</td>') < poengHtml.indexOf('<td>25</td>'),
    'single-group card keeps comparator order (poeng desc) beneath the label');

// Sorts apply WITHIN groups; group order and group rows stay fixed.
// ovelse mode: groups are [Fellesfelt: Per], [Grovfelt: Kari, Ola]
// (discipline collation; within-group comparator order = position).
var ovelseSpec = SP.competitionCardTableSpec(ovelseMode[0]);
var ovelseHtml = nfRender(ovelseSpec);
assert.ok(ovelseHtml.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="7">Grovfelt</th></tr>') !== -1
    && ovelseHtml.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="7">Fellesfelt</th></tr>') !== -1
    && ovelseHtml.indexOf('Fellesfelt') < ovelseHtml.indexOf('Grovfelt'),
    'ovelse mode: discipline-only group labels, Fellesfelt group first');
assert.ok(ovelseHtml.indexOf('data-person-name="Per"') < ovelseHtml.indexOf('data-person-name="Kari"')
    && ovelseHtml.indexOf('data-person-name="Kari"') < ovelseHtml.indexOf('data-person-name="Ola"'),
    'default order: comparator order through the flattened rows');
var scoreAsc = nfSorted(ovelseSpec, 'score', 'asc');
assert.ok(scoreAsc.indexOf('data-person-name="Per"') < scoreAsc.indexOf('data-person-name="Ola"')
    && scoreAsc.indexOf('data-person-name="Ola"') < scoreAsc.indexOf('data-person-name="Kari"'),
    'score asc reorders rows INSIDE the Grovfelt group (Ola 28 before Kari 30), group order fixed');
var nameDesc = nfSorted(ovelseSpec, 'name', 'desc');
assert.ok(nameDesc.indexOf('<tr data-dt-row="2"><td>2</td><td><button type="button" class="stevner-person-btn link-btn" data-person-id="1" data-person-name="Ola" data-discipline="Grovfelt">Ola</button></td>') !== -1
    && nameDesc.indexOf('data-person-name="Ola"') < nameDesc.indexOf('data-person-name="Kari"'),
    'name desc: # travels with the row (Ola keeps position 2 and his data index)');
var posAsc = nfSorted(ovelseSpec, 'position', 'asc');
assert.ok(posAsc.indexOf('data-person-name="Kari"') < posAsc.indexOf('data-person-name="Ola"'),
    'position asc restores placement order within groups');

// Responsive defaults and runtime hiding through the state.
var tier700 = nfRender(ovelseSpec, { hidden: {}, runtimeHidden: [], widthTier: 700 });
// Owner ruling (post-QA, 2026-11-19): at phone width the default hidden
// pair is Klubb + ØvelSE — Ranking stays visible. Øvelse is the redundant
// column on multi-group cards (the group row names the discipline) and is
// re-enablable through the picker like any default.
assert.ok(tier700.indexOf('data-dt-sort="club"') === -1 && tier700.indexOf('<th scope="col">Øvelse</th>') === -1
    && tier700.indexOf('data-dt-sort="rankingScore"') !== -1
    && tier700.indexOf('data-dt-sort="score"') !== -1,
    'widthTier 700 hides Klubb and Øvelse by default; Ranking stays');
assert.ok(tier700.indexOf('<th scope="colgroup" colspan="5">') !== -1,
    'group-row colspan tracks the visible column count');
var runtimeClub = nfRender(ovelseSpec, { hidden: {}, runtimeHidden: ['club'], widthTier: null });
assert.ok(runtimeClub.indexOf('data-dt-sort="club"') === -1 && runtimeClub.indexOf('<th scope="colgroup" colspan="6">') !== -1,
    'runtimeHidden club column: absent, colspan adjusts');
var specCols = ovelseSpec.columns;
function colBy(key) { for (var i = 0; i < specCols.length; i++) { if (specCols[i].key === key) { return specCols[i]; } } }
assert.strictEqual(colBy('club').hideBelow, 700, 'Klubb declares hideBelow 700');
assert.strictEqual(colBy('discipline').hideBelow, 700, 'Øvelse declares hideBelow 700 (post-QA ruling: hidden at phone width, not Ranking)');
assert.strictEqual(colBy('rankingScore').hideBelow, undefined, 'Ranking has no hideBelow (owner: stays visible at phone width)');
assert.strictEqual(colBy('position').hideBelow, undefined, '# has no hideBelow');
assert.ok(!colBy('discipline').sortable, 'Øvelse is not sortable (group key)');

// The hand-rolled table assembly is gone: no legacy columns export, no
// direct renderRows usage (batch 2 renders through the base only).
assert.strictEqual(SP.columns, undefined, 'the legacy columns export is deleted');

// ── overallStatsBar (batch 2: hosts the shared Kolonner picker) ────────
// QA round 1 (owner): the Kolonner button lives in the stats bar, left
// of "Fold alle", with the Fold-alle button style — and the anchor WRAPS
// the button so the dropdown panel (absolutely positioned against the
// anchor box) aligns with the button instead of the page edge.
var statsBar = SP.overallStatsBar(cards, '2026-11-19T10:00:00', 'test');
assert.ok(statsBar.indexOf('stevner-stats-right') !== -1, 'stats bar renders its right group');
// The Kolonner button wears its OWN class (stevner-picker-btn), not
// stevner-collapse-all-btn: the bulk-collapse handler on rowsEl matches
// clicks BY CLASS, so a picker button sharing the class would toggle
// every card AND hijack the clicked button's label on every open. The
// Fold-alle LOOK is shared via grouped CSS selectors instead.
assert.ok(statsBar.indexOf('<div class="dt-picker-anchor"><button type="button" class="stevner-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">Kolonner</button></div>') !== -1,
    'Kolonner: anchor-wrapped, own class, data-dt-picker hook');
assert.ok(statsBar.indexOf('data-dt-picker') < statsBar.indexOf('stevner-collapse-all-btn" id="test-collapse-all"'),
    'Kolonner sits to the LEFT of Fold alle');
// The updated stamp is INFORMATION — it belongs at the end of the
// summary line, not lumped in with the action buttons (owner QA round
// 6: at phone width the wrapped right group dropped the stamp
// awkwardly under the summary). The right group is actions only.
var barRightIdx = statsBar.indexOf('stevner-stats-right');
assert.ok(statsBar.indexOf('Oppdatert') !== -1 && statsBar.indexOf('Oppdatert') < barRightIdx,
    'the updated stamp sits in the left (info) span');
assert.ok(statsBar.slice(barRightIdx).indexOf('Oppdatert') === -1,
    'the right group is actions only — no stamp');
// The FULL bar renders at ANY card count ≥ 1 (owner QA round 3):
// summary line, updated stamp, Kolonner and "Fold alle" — a single
// competition result keeps them all.
var singleBar = SP.overallStatsBar([cards[0]], '2026-11-19T10:00:00', 'test');
assert.ok(singleBar.indexOf('<div class="dt-picker-anchor"><button type="button" class="stevner-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">Kolonner</button></div>') !== -1,
    'single card: the Kolonner button renders (own class — the exact-substring golden pins the class separation from Fold alle)');
assert.ok(singleBar.indexOf('1 stevne') !== -1, 'single card: the summary line stays ("1 stevne")');
assert.ok(singleBar.indexOf('id="test-collapse-all"') !== -1, 'single card: Fold alle stays');
assert.strictEqual(SP.overallStatsBar([], '2026-11-19T10:00:00', 'test'), '',
    'zero cards: no bar at all (the empty state owns that render)');

console.log('stevner-page.test.js: all assertions passed');
