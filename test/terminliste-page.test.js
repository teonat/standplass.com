var assert = require('assert');
// TP's id-list helpers delegate to format.js's hardened implementations —
// shim the browser global before requiring, the same way
// stevner-page.test.js does.
global.StandplassFormat = require('../public/js/format.js');
// terminlisteTableSpec renders through the shared base -- same load order
// as the page's script tags (table-renderer.js before data-table.js)
global.StandplassTable = require('../public/js/table-renderer.js');
global.StandplassDataTable = require('../public/js/data-table.js');
var TP = require('../public/js/terminliste-page.js');

// Shape mirrors the live branchlist response. Includes a deleted branch
// and a deleted group, both dropped.
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
assert.deepStrictEqual(TP.decodeIdList('%E0%A4%A'), ['%E0%A4%A'],
    'malformed escape falls back to raw via format.js instead of dead-ending init');

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

// ── terminlisteTableSpec: the full page's table through the base ──────
assert.strictEqual(typeof TP.terminlisteTableSpec, 'function', 'terminlisteTableSpec is exported');

// resolved-row fixtures in the shape init's resolveRow produces
var fullRow = {
    id: 'c-1', status: 1, dateRange: '16.–17. nov 2026', title: 'Høststevne',
    facilityName: 'Bomba Skytterhus', competitionTypeName: 'Åpent stevne',
    orgName: 'Kongsvinger Sportsskyttere', kretsName: 'Glåmdalen skytterkrets',
    branchNames: 'Pistol', groupNames: 'Feltpistol', frist: '1. nov 2026',
    hasResult: true, resultFileUrl: 'https://example.com/r.pdf',
    href: 'https://app.skyting.no/p/c/c-1/details',
    starttid: '11:00',
    klasseforendeBadge: '<span class="comp-modal-badge comp-modal-badge--yes" title="Resultater teller for klasseopprykk og -nedrykk">Klasseførende</span>'
};
var sparseRow = {
    id: 'c-2', status: 2, dateRange: '20. des 2026', title: 'Julestevne',
    facilityName: '', competitionTypeName: '', orgName: '–', kretsName: '',
    branchNames: '–', groupNames: '–', frist: '–', hasResult: false, resultFileUrl: '',
    href: 'https://app.skyting.no/p/c/c-2/details', starttid: '', klasseforendeBadge: ''
};
var resolvedRows = [fullRow, sparseRow];

var pageState = function (tier) {
    return { sort: null, hidden: {}, runtimeHidden: [], widthTier: tier };
};
var pageHtml = StandplassDataTable.renderTable('tl-table', TP.terminlisteTableSpec(resolvedRows, {}), pageState(null));

// wrapper + table element: byte-identical to the hand-rolled markup
assert.ok(pageHtml.indexOf('<div class="ranking-full-table"><table class="ranking-table" data-dt-id="tl-table" aria-label="Terminliste">') >= 0,
    'the ranking-full-table wrap and aria-label carry over');
// header row: the visually-hidden Detaljer label survives via labelRaw
assert.ok(pageHtml.indexOf('<th scope="col" class="terminliste-detail-col"><span class="visually-hidden">Detaljer</span></th>') >= 0,
    'the Detaljer header stays a visually-hidden span');
assert.ok(pageHtml.indexOf('<th scope="col" class="terminliste-date">Dato</th><th scope="col">Stevne</th><th scope="col">Stevnetype</th>') >= 0,
    'plain headers render in order (cellClass lands on th too, per base semantics)');
assert.ok(pageHtml.indexOf('<th scope="col" class="terminliste-result-cell">Resultater</th>') >= 0,
    'Resultater header carries the column class');

// full row: every cell byte-identical, row attributes through rowAttrs
assert.ok(pageHtml.indexOf('<tr data-dt-row="0" class="terminliste-row--clickable" data-id="c-1" data-status="1" data-title="Høststevne">') >= 0,
    'the clickable-row attributes carry over with data-dt-row and data-title');
assert.ok(pageHtml.indexOf('<td class="terminliste-detail-col"><button type="button" class="comp-detail-btn" data-id="c-1" aria-label="Se detaljer for Høststevne">ⓘ</button></td>') >= 0,
    'the ⓘ button cell with its aria-label');
assert.ok(pageHtml.indexOf('<td class="terminliste-date">16.–17. nov 2026</td>') >= 0, 'Dato cell');
assert.ok(pageHtml.indexOf('<td><a href="https://app.skyting.no/p/c/c-1/details" target="_blank" rel="noopener noreferrer">Høststevne</a><span class="terminliste-sub">Bomba Skytterhus</span></td>') >= 0,
    'Stevne cell: title link + facility sub-line');
assert.ok(pageHtml.indexOf('<td>Åpent stevne</td>') >= 0, 'Stevnetype cell');
assert.ok(pageHtml.indexOf('<td>Kongsvinger Sportsskyttere<span class="terminliste-sub">Glåmdalen skytterkrets</span></td>') >= 0,
    'Arrangør cell: org + krets sub-line');
assert.ok(pageHtml.indexOf('<td>Pistol</td>') >= 0, 'Gren cell');
assert.ok(pageHtml.indexOf('<td>Feltpistol</td>') >= 0, 'Øvelsesgruppe cell');
assert.ok(pageHtml.indexOf('<td class="terminliste-date">1. nov 2026</td>') >= 0, 'Påmeldingsfrist cell');
assert.ok(pageHtml.indexOf('<td class="terminliste-result-cell"><a href="https://example.com/r.pdf" target="_blank" rel="noopener noreferrer" aria-label="Last ned resultater (PDF, åpnes i ny fane)">PDF</a></td>') >= 0,
    'Resultater cell: PDF link');

// sparse row: fallbacks, status label in the ⓘ aria-label, no sub-lines
assert.ok(pageHtml.indexOf('<tr data-dt-row="1" class="terminliste-row--clickable" data-id="c-2" data-status="2" data-title="Julestevne">') >= 0,
    'data-status defaults carried, second row indexed');
assert.ok(pageHtml.indexOf('aria-label="Se detaljer for Julestevne – Avvist"') >= 0,
    'non-approved status appends its label to the ⓘ aria-label');
assert.ok(pageHtml.indexOf('<td class="terminliste-result-cell">–</td>') >= 0, 'no result renders –');
assert.ok(pageHtml.indexOf('<td>–</td>') >= 0, 'empty org/type render –');

// responsive tiers preserve today's CSS hiding exactly: at ≤700 both the
// mobile-hide (Arrangør) and tablet-hide (Gren, Påmeldingsfrist) rules
// fired; at ≤900 only the tablet-hide ones did
var tier700 = StandplassDataTable.renderTable('tl-table', TP.terminlisteTableSpec(resolvedRows, {}), pageState(700));
assert.ok(tier700.indexOf('>Arrangør</th>') < 0, 'tier 700 hides Arrangør');
assert.ok(tier700.indexOf('>Gren</th>') < 0 && tier700.indexOf('>Påmeldingsfrist</th>') < 0, 'tier 700 hides Gren and Påmeldingsfrist');
assert.ok(tier700.indexOf('>Øvelsesgruppe</th>') >= 0 && tier700.indexOf('>Stevne</th>') >= 0, 'tier 700 keeps the always-visible columns');
assert.ok(tier700.indexOf('Kongsvinger Sportsskyttere') < 0, 'tier 700 drops Arrangør cells too');
var tier900 = StandplassDataTable.renderTable('tl-table', TP.terminlisteTableSpec(resolvedRows, {}), pageState(900));
assert.ok(tier900.indexOf('>Arrangør</th>') >= 0, 'tier 900 keeps Arrangør');
assert.ok(tier900.indexOf('>Gren</th>') < 0 && tier900.indexOf('>Påmeldingsfrist</th>') < 0, 'tier 900 hides Gren and Påmeldingsfrist');
assert.ok(pageHtml.indexOf('>Arrangør</th>') >= 0 && pageHtml.indexOf('>Gren</th>') >= 0, 'no tier keeps everything visible');

console.log('terminliste-page.test.js: all assertions passed');
