'use strict';
var assert = require('node:assert');
global.StandplassFormat = require('../public/js/format.js');
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

// description comes from a third-party API and must be escaped
var xssBody = CM.renderDetailBody({ competitionNumber: '1', description: '<img src=x onerror=alert(1)>', events: [] });
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
            classes: [{ id: 'c1', name: 'Pistol\\A', deleted: false }],
            disciplineGroups: [{ disciplines: [{ id: 'd1', name: 'Spesialpistol', deleted: false }] }]
        }]
    };
    return CM.ensureReferenceData(function () {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve(mockBranchlist); } });
    });
}).then(function () {
    var resolvedBody = CM.renderDetailBody({ events: [{ disciplineId: 'd1', classId: 'c1', entryFee: 50 }] });
    assert.ok(resolvedBody.indexOf('Spesialpistol') >= 0, 'discipline name resolves via the reference-list fetch');
    assert.ok(resolvedBody.indexOf('>A<') >= 0, 'class name resolves and the branch prefix is stripped');

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
