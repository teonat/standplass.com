'use strict';
var assert = require('node:assert');
// nsf-orgs.js (used further down) probes localStorage, which Node 26
// implements experimentally behind a flag -- its absence is handled
// gracefully there, but Node still emits a warning per access. Silence
// just the warning channel to keep this file's output clean.
process.removeAllListeners('warning');
global.StandplassFormat = require('../public/js/format.js');
// renderResultsBody renders through the shared base now
global.StandplassDataTable = require('../public/js/data-table.js');
var CM = require('../public/js/comp-modal.js');

var events = [
    { discipline: 'Grovfelt', class: 'A', entryFee: 150 },
    { discipline: 'Grovfelt', class: 'B', entryFee: 150 },
    { discipline: 'Fellesfelt', class: 'A', entryFee: 100 }
];
var grouped = CM.groupEventsByDiscipline(events);
assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].discipline, 'Fellesfelt', 'groups sort alphabetically');
assert.strictEqual(grouped[1].events.length, 2);

// Resultater tables render through the shared base: the spec builder
// turns per-class groups (rows pre-sorted by position) into a base spec.
assert.strictEqual(typeof CM.competitionResultsTableSpec, 'function', 'competitionResultsTableSpec is exported');
var resultsSpec = CM.competitionResultsTableSpec([
    { label: 'Senior', rows: [
        { position: 1, fullName: 'A Person', organizationName: 'Klubb A', score: 50 },
        { position: null, fullName: 'C Person', organizationName: 'Klubb C', score: 10 }
    ] },
    { label: 'Junior', rows: [
        { position: 2, fullName: 'B Person', organizationName: 'Klubb B', score: 40 },
        { position: 3, organizationName: 'Klubb D', score: 5 }
    ] }
]);
var resultsTable = StandplassDataTable.renderTable('comp-results-0', resultsSpec, { hidden: {}, runtimeHidden: [], widthTier: null });
assert.ok(resultsTable.indexOf('<table class="ranking-full-table ranking-table" data-dt-id="comp-results-0">') >= 0, 'the table keeps its classes and gains a data-dt-id');
assert.ok(resultsTable.indexOf('<thead><tr><th scope="col">Plass</th><th scope="col">Navn</th><th scope="col">Klubb</th><th scope="col">Klasse</th><th scope="col">Poeng</th></tr></thead>') >= 0, 'the five headers render in order');
assert.ok(resultsTable.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="5">Senior</th></tr>') >= 0, 'class headers render as base group rows');
assert.ok(resultsTable.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="5">Junior</th></tr>') >= 0, 'every class gets a group row');
assert.ok(resultsTable.indexOf('<tr data-dt-row="0"><td>1</td><td>A Person</td><td>Klubb A</td><td>Senior</td><td>50</td></tr>') >= 0, 'data cells are byte-identical to the hand-rolled markup');
assert.ok(resultsTable.indexOf('<tr data-dt-row="1"><td>–</td><td>C Person</td><td>Klubb C</td><td>Senior</td><td>10</td></tr>') >= 0, 'null position falls back to –');
assert.ok(resultsTable.indexOf('<tr data-dt-row="2"><td>2</td><td>B Person</td><td>Klubb B</td><td>Junior</td><td>40</td></tr>') >= 0, 'rows keep caller order within groups');
assert.ok(resultsTable.indexOf('<tr data-dt-row="3"><td>3</td><td>–</td><td>Klubb D</td><td>Junior</td><td>5</td></tr>') >= 0, 'missing fullName falls back to –');

// description comes from a third-party API and must be escaped
var xssBody = CM.renderDetailBody({ competitionNumber: '1', description: '<img src=x onerror=alert(1)>', events: [] });

// ── contact address, registration times ─────────────────────────────────
// (Arrangør/Stevnetype resolution is tested further down, after the async
// reference-data seeding -- the detail API returns only GUIDs for both.)

var contactBody = CM.renderDetailBody({ contactAddress1: 'v/ Wenche <script>', contactAddress2: 'Eidskogvegen 38', contactZipCode: '2211', contactCity: 'KONGSVINGER', events: [] });
assert.ok(contactBody.indexOf('Kontaktadresse') >= 0, 'contact address row');
assert.ok(contactBody.indexOf('v/ Wenche &lt;script&gt;') >= 0, 'contact address escaped');
assert.ok(contactBody.indexOf('2211 KONGSVINGER') >= 0, 'zip + city composed');

var regTimeBody = CM.renderDetailBody({ registrationEndDate: '2026-01-05T10:00:00', useRegistrationEndTime: true, events: [] });
assert.ok(regTimeBody.indexOf('Påmeldingsfrist') >= 0 && regTimeBody.indexOf('kl 11:00') >= 0, 'registration time shown when flagged (UTC 10:00 -> Oslo 11:00)');
var regNoTimeBody = CM.renderDetailBody({ registrationEndDate: '2026-01-05T10:00:00', events: [] });
assert.ok(regNoTimeBody.indexOf('kl 11:00') < 0, 'registration time hidden without flag');
var regPlainDate = CM.renderDetailBody({ registrationEndDate: '2026-01-05', useRegistrationEndTime: true, events: [] });
assert.ok(regPlainDate.indexOf(', kl ') < 0, 'flagged but date-only string renders no time');
assert.ok(xssBody.indexOf('<img src=x') < 0, 'description markup is not emitted raw');
assert.ok(xssBody.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0, 'description is escaped');

// the common case (plain text) still renders inside the description div
var plainBody = CM.renderDetailBody({ competitionNumber: '2', description: 'Vanlig stevne', events: [] });
assert.ok(plainBody.indexOf('<div class="comp-modal-description">Vanlig stevne</div>') >= 0, 'plain description renders unchanged');

// allowlisted formatting tags survive as real markup, not literal text
var richBody = CM.renderDetailBody({ description: '<p>Line one</p><p>Line <strong>two</strong><br>more</p>', events: [] });
assert.ok(richBody.indexOf('<p>Line one</p>') >= 0, 'allowed <p> tag is preserved');
assert.ok(richBody.indexOf('<strong>two</strong>') >= 0, 'allowed <strong> tag is preserved');
assert.ok(richBody.indexOf('<br>') >= 0, 'allowed <br> tag is preserved');

// a formatting tag carrying an attribute is dropped whole (stays escaped),
// not rendered with the attribute stripped -- keeps the sanitizer's output
// limited to the fixed set of bare allowed tags
var attrBody = CM.renderDetailBody({ description: '<p onclick="alert(1)">x</p>', events: [] });
assert.ok(attrBody.indexOf('<p>') < 0 && attrBody.indexOf('onclick') >= 0, 'a tag with attributes is left fully escaped');

// venue row uses the swapped lat/lng fields and drops it entirely if the
// facility has nothing renderable
var venueBody = CM.renderDetailBody({ events: [] }, { name: 'Maridalen 50 meter', latitude: 10.756951, longitude: 59.972218 });
assert.ok(venueBody.indexOf('q=59.972218%2C10.756951') >= 0, 'maps link swaps the API\'s mislabeled lat/lng fields');
var noVenueBody = CM.renderDetailBody({ events: [] }, null);
assert.ok(noVenueBody.indexOf('comp-modal-infocard-label">Bane') < 0, 'no venue row when facility is unavailable');

// status/classification badges and registration dates
var badgeBody = CM.renderDetailBody({ status: 3, applicableForClassification: true, registrationEndDate: '2026-01-05T00:00:00Z', events: [] });
assert.ok(badgeBody.indexOf('Avlyst') >= 0 && badgeBody.indexOf('comp-modal-badge--warn') >= 0, 'cancelled status renders as a warn badge');
assert.ok(badgeBody.indexOf('Klasseførende') >= 0, 'classification badge still renders alongside the status badge');
assert.ok(badgeBody.indexOf('5. jan 2026') >= 0, 'registration deadline is formatted via StandplassFormat');

// event/class definitions dedup by discipline+class id and fall back to the
// raw id when no name is available, instead of collapsing to one blank group
var eventsBody = CM.renderDetailBody({
    events: [
        { disciplineId: 'd1', classId: 'c1', entryFee: 100 },
        { disciplineId: 'd1', classId: 'c1', entryFee: 100 }, // duplicate, deduped
        { disciplineId: 'd1', classId: 'c2', entryFee: 100 }
    ]
});
var classTagCount = (eventsBody.match(/class="comp-modal-class-tag"/g) || []).length;
assert.strictEqual(classTagCount, 2, 'duplicate disciplineId+classId events are deduped');
assert.ok(eventsBody.indexOf('>c1<') >= 0, 'falls back to the raw classId when no class name is available');

// the results endpoint returns a { paging, orderBy, items } envelope, not a
// bare array -- unwrapping it is what fixed a permanently-stuck "Laster..."
// Resultater tab (renderResultsBody's .map() threw on the raw envelope)
var mockFetch = function () {
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ paging: {}, orderBy: null, items: [{ foo: 1 }] }); } });
};
CM.fetchResults('env-test', mockFetch).then(function (results) {
    assert.deepStrictEqual(results, [{ foo: 1 }], 'fetchResults unwraps the {items} envelope');

    // discipline/class names resolve via ensureReferenceData's one-time
    // reference-list fetch (mirrors nsf-ui.js's own auto-fetched branchlist),
    // with the branch-prefix stripped from class names same as the source
    var mockBranchlist = {
        items: [{
            name: 'Pistol',
            classes: [{ id: 'c1', name: 'Pistol\\A', deleted: false }],
            disciplineGroups: [{ name: 'Spesialpistol-gruppe', disciplines: [{ id: 'd1', name: 'Spesialpistol', deleted: false }] }]
        }, {
            // a non-Pistol branch -- its disciplineGroups must not leak into
            // getDisciplineGroups(), which is scoped to Pistol only
            name: 'Leirdue',
            disciplineGroups: [{ name: 'Some Leirdue Group', disciplines: [{ id: 'x1', name: 'Leirdue Disc', deleted: false }] }]
        }]
    };
    // URL-routed stub: ensureReferenceData fetches branchlist, competitiontype
    // and the org list -- each endpoint gets its own fixture. The org request
    // routes through nsf-orgs.js (the shared module production pages use),
    // exercising that delegation instead of comp-modal's direct fallback.
    global.StandplassNsfOrgs = require('../public/js/nsf-orgs.js');
    var jsonResponse = function (body) {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
    };
    return CM.ensureReferenceData(function (url) {
        if (url.indexOf('branchlist') >= 0) { return jsonResponse(mockBranchlist); }
        if (url.indexOf('competitiontype') >= 0) { return jsonResponse([{ id: 'ct-1', name: 'Åpent stevne' }]); }
        if (url.indexOf('organization') >= 0) {
            return jsonResponse([{ id: 'org-1', organizationName: 'Eidskog Sportsskyttere', organizationFederationType: 3 }]);
        }
        return Promise.resolve({ ok: false, json: function () { return Promise.resolve(null); } });
    });
}).then(function () {
    // Arrangør/Stevnetype: the detail API returns only organizationId and
    // competitionTypeId GUIDs -- names resolve through the reference maps,
    // and an unresolved GUID omits the row entirely rather than rendering
    // the raw id.
    var ctxBody = CM.renderDetailBody({ organizationId: 'org-1', competitionTypeId: 'ct-1', events: [] });
    assert.ok(ctxBody.indexOf('Arrangør') >= 0 && ctxBody.indexOf('Eidskog Sportsskyttere') >= 0, 'organizer name resolves via the shared org list');
    assert.ok(ctxBody.indexOf('Stevnetype') >= 0 && ctxBody.indexOf('Åpent stevne') >= 0, 'stevnetype name resolves via /competitiontype');
    var noCtxBody = CM.renderDetailBody({ organizationId: 'unresolved-guid', competitionTypeId: 'unresolved-guid', events: [] });
    assert.ok(noCtxBody.indexOf('Arrangør') < 0 && noCtxBody.indexOf('unresolved-guid') < 0, 'unresolved GUIDs omit the row instead of rendering the raw id');

    // the shared meta line pages use under the modal title
    var meta = CM.formatMetaLine(
        { startDate: '2026-11-16T16:00:00', endDate: '2026-11-16T16:00:00', organizationId: 'org-1' },
        { name: 'Bomba' }
    );
    assert.strictEqual(meta, '16. nov 2026, kl 17:00 · Bomba · Eidskog Sportsskyttere', 'formatMetaLine composes start time (Oslo), venue and organizer');
    assert.strictEqual(
        CM.formatMetaLine({ startDate: '2026-11-16', endDate: '2026-11-16', organizationId: 'unresolved' }, null),
        '16. nov 2026',
        'formatMetaLine silently drops an unresolved venue/organizer'
    );

    var resolvedBody = CM.renderDetailBody({ events: [{ disciplineId: 'd1', classId: 'c1', entryFee: 50 }] });
    assert.ok(resolvedBody.indexOf('Spesialpistol') >= 0, 'discipline name resolves via the reference-list fetch');
    assert.ok(resolvedBody.indexOf('>A<') >= 0, 'class name resolves and the branch prefix is stripped');

    assert.ok(typeof CM.getDisciplineGroups === 'function', 'getDisciplineGroups is exported');
    var groups = CM.getDisciplineGroups();
    assert.ok(Array.isArray(groups) && groups.length >= 1, 'getDisciplineGroups returns the Pistol branch\'s raw disciplineGroups array');
    assert.strictEqual(groups[0].name, 'Spesialpistol-gruppe', 'group name and nested disciplines are preserved, not flattened');
    assert.ok(groups.every(function (g) { return g.name !== 'Some Leirdue Group'; }), 'getDisciplineGroups is scoped to the Pistol branch, not other branches like Leirdue');

    var resultsBody = CM.renderResultsBody([
        { disciplineId: 'd1', classId: 'c1', position: 2, fullName: 'B Person', organizationName: 'Klubb B', score: 40 },
        { disciplineId: 'd1', classId: 'c1', position: 1, fullName: 'A Person', organizationName: 'Klubb A', score: 50 },
        { disciplineId: 'd1', classId: 'c1', position: null, fullName: 'C Person', organizationName: 'Klubb C', score: 10 }
    ]);
    assert.ok(resultsBody.indexOf('Spesialpistol') >= 0, 'results group header resolves the discipline name');
    assert.ok(resultsBody.indexOf('Klubb A') >= 0 && resultsBody.indexOf('A Person') >= 0, 'result rows use fullName/organizationName, not name/club');
    var posA = resultsBody.indexOf('A Person');
    var posB = resultsBody.indexOf('B Person');
    var posC = resultsBody.indexOf('C Person');
    assert.ok(posA < posB && posB < posC, 'rows sort by position ascending, missing position sorts last');

    // Rows from different classes must not interleave by raw position --
    // each class gets its own header row and its own 1..N position sort,
    // matching the source's _renderResultTable class sub-grouping.
    var twoClassResults = [
        { disciplineId: 'd1', classId: 'cB', position: 1, fullName: 'B1 Person', organizationName: 'Klubb B', score: 40 },
        { disciplineId: 'd1', classId: 'cA', position: 2, fullName: 'A2 Person', organizationName: 'Klubb A', score: 30 },
        { disciplineId: 'd1', classId: 'cA', position: 1, fullName: 'A1 Person', organizationName: 'Klubb A', score: 50 }
    ];
    var classGroupedBody = CM.renderResultsBody(twoClassResults);
    var headerA = classGroupedBody.indexOf('dt-group-row');
    var posA1 = classGroupedBody.indexOf('A1 Person');
    var posA2 = classGroupedBody.indexOf('A2 Person');
    var posB1 = classGroupedBody.indexOf('B1 Person');
    assert.ok(headerA >= 0, 'a class-header row is rendered');
    assert.ok(posA1 < posA2, 'within a class, rows sort by position ascending');
    assert.ok(posA2 < posB1, 'class cA (sorted before cB) is fully rendered before class cB starts');
    assert.ok(classGroupedBody.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="5">cA</th></tr>') >= 0, 'class headers render as base group rows with full colspan');
    assert.ok(classGroupedBody.indexOf('<tr data-dt-row="0"><td>1</td><td>A1 Person</td><td>Klubb A</td><td>cA</td><td>50</td></tr>') >= 0, 'class-grouped rows render byte-identical through the base');
    assert.ok(classGroupedBody.indexOf('data-dt-id="comp-results-0"') >= 0, 'each discipline table gets a base data-dt-id');
    assert.ok(classGroupedBody.indexOf('<table class="ranking-full-table ranking-table"') >= 0, 'the results tables keep their styling classes');

    // the Gren filter lists every distinct discipline present, and selecting
    // one hides rows from every other discipline
    var twoDiscResults = [
        { disciplineId: 'd1', classId: 'c1', position: 1, fullName: 'A Person', organizationName: 'Klubb A', score: 50 },
        { disciplineId: 'd2', classId: 'c1', position: 1, fullName: 'X Person', organizationName: 'Klubb X', score: 30 }
    ];
    var unfilteredBody = CM.renderResultsBody(twoDiscResults, '', 'felt');
    assert.ok(unfilteredBody.indexOf('<option value="">Alle grener</option>') >= 0, 'the Gren filter defaults to an "Alle grener" option');
    assert.ok(unfilteredBody.indexOf('A Person') >= 0 && unfilteredBody.indexOf('X Person') >= 0, 'both disciplines render with no filter selected');
    var filteredBody = CM.renderResultsBody(twoDiscResults, 'd1', 'felt');
    assert.ok(filteredBody.indexOf('A Person') >= 0 && filteredBody.indexOf('X Person') < 0, 'selecting a discipline hides rows from the other one');
    assert.ok(filteredBody.indexOf('value="d1" selected') >= 0, 'the selected option is marked selected so it survives the re-render');

    console.log('comp-modal.test.js: all assertions passed');
}).catch(function (err) {
    console.error(err);
    process.exitCode = 1;
});

// sanitizeDescription: everything is escaped first, then only the
// allowed tags are re-opened -- links are rebuilt around a
// scheme-checked href with this module's own target/rel.
var san = CM.sanitizeDescription('<p>Hei <a href="https://kart.1881.no/?r=F8192783">kart</a> &amp; <script>x()</script></p>');
assert.strictEqual(san,
    '<p>Hei <a href="https://kart.1881.no/?r=F8192783" target="_blank" rel="noopener noreferrer">kart</a> &amp;amp; &lt;script&gt;x()&lt;/script&gt;</p>',
    'an https link survives with a rebuilt safe opener; script text and raw ampersands stay escaped');
assert.strictEqual(CM.sanitizeDescription('<a href="javascript:alert(1)">x</a>'),
    '&lt;a href=&quot;javascript:alert(1)&quot;&gt;x</a>',
    'a javascript: href is not re-opened');
assert.strictEqual(CM.sanitizeDescription('<a href="https://x.example/?a=1&b=2">x</a>'),
    '<a href="https://x.example/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>',
    'the href stays attribute-escaped (& -> &amp;) so it cannot break out');

// skyting.no descriptions carry &nbsp; entities for spacing (e.g.
// Lygnafelten 2026: "OBS! &nbsp;Selv om..."). Un-escaped back to the
// entity the browser renders as a non-breaking space — the same
// fixed-literal whitelist class as the allowed tags; without it the
// modal shows literal "&nbsp;" text.
assert.strictEqual(CM.sanitizeDescription('OBS! &nbsp;Selv om det &nbsp;'),
    'OBS! &nbsp;Selv om det &nbsp;',
    'the nbsp entity survives as an entity, not escaped text');
assert.strictEqual(CM.sanitizeDescription('A &amp;nbsp; B'),
    'A &amp;amp;nbsp; B',
    'a double-encoded nbsp stays escaped text');
assert.strictEqual(CM.sanitizeDescription('<a class="btn" href="https://x.example/">x</a>'),
    '&lt;a class=&quot;btn&quot; href=&quot;https://x.example/&quot;&gt;x</a>',
    'anchors carrying other attributes stay literal');
assert.strictEqual(CM.sanitizeDescription('<A HREF="mailto:post@example.no">epost</A>'),
    '<a href="mailto:post@example.no" target="_blank" rel="noopener noreferrer">epost</a>',
    'mailto and uppercase markup are handled');
assert.strictEqual(CM.sanitizeDescription('<a href="https://kart.1881.no/">kart</a>Avkjøringen fra E16'),
    '<a href="https://kart.1881.no/" target="_blank" rel="noopener noreferrer">kart</a> Avkjøringen fra E16',
    'a word crowded right after the closing anchor gets its space back (stevne 16681 quirk)');
assert.strictEqual(CM.sanitizeDescription('<a href="https://kart.1881.no/">url</a>. Avkjøringen er skiltet'),
    '<a href="https://kart.1881.no/" target="_blank" rel="noopener noreferrer">url</a>. Avkjøringen er skiltet',
    'punctuation directly after the link is left alone');
