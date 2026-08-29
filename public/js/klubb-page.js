// public/js/klubb-page.js
//
// Page glue for /klubb: a club's members ranked per NSF discipline,
// card-per-discipline, live from nsfapi.azurewebsites.net/ranking. Ported
// from the source's resultatliste-klubb.js, generalized from a
// single-club (KSS-hardcoded) design to any ?klubb= club this project
// already supports elsewhere -- see
// docs/superpowers/specs/2026-08-29-klubb-view-design.md for the full
// design and every deliberate divergence from the source.
var StandplassKlubbPage = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function yearFrom(y) { return (y - 1) + '-12-31T23:00:00.000Z'; }
    function yearTo(y) { return y + '-12-31T22:59:59.999Z'; }

    // Pure -- no fetch, easy to test the query-string shape directly
    // against the documented gotchas (docs/superpowers/nsf-skyting-api-reference.md).
    //
    // ponytail: orderBy is appended as a literal string, not via qs.set(),
    // because URLSearchParams#toString() percent-encodes the ':' (produces
    // totalScore%3Adesc) -- the API wants the literal colon. Every other
    // param goes through URLSearchParams as usual.
    function buildRankingUrl(opts) {
        var qs = new URLSearchParams();
        qs.set('pageIndex', '0');
        qs.set('pageSize', '200');
        qs.set('disciplineId', opts.disciplineId);
        qs.set('numberOfResults', String(opts.numberOfResults));
        qs.set('periodStart', yearFrom(opts.year));
        qs.set('periodEnd', yearTo(opts.year));
        qs.set('personOrganizationId', JSON.stringify([opts.orgId]));
        return 'https://nsfapi.azurewebsites.net/ranking?orderBy=totalScore:desc&' + qs.toString();
    }

    function init(config) {
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var urlState = config.urlState;
        var fetcher = config.fetcher;
        var CURRENT_YEAR = new Date().getUTCFullYear();

        var params = new URLSearchParams(urlState.getSearch());
        var klubbSlug = params.get('klubb');

        var pickerEl = id('-picker');
        var gridWrapEl = id('-grid-wrap');

        function showPicker(clubs, errorMsg) {
            gridWrapEl.hidden = true;
            pickerEl.hidden = false;
            pickerEl.innerHTML = errorMsg
                ? '<p class="ranking-error ranking-status-msg">' + esc(errorMsg) + '</p>'
                : '<label for="' + config.idPrefix + '-picker-input">Velg klubb</label>'
                    + '<div class="autocomplete-wrap" id="' + config.idPrefix + '-picker-wrap">'
                    + '<input type="text" id="' + config.idPrefix + '-picker-input" class="filter-input" autocomplete="off"'
                    + ' aria-autocomplete="list" aria-controls="' + config.idPrefix + '-picker-list" aria-expanded="false" placeholder="Søk klubb…">'
                    + '<button type="button" class="combo-clear" id="' + config.idPrefix + '-picker-clear" aria-label="Fjern">×</button>'
                    + '<ul class="autocomplete-list" id="' + config.idPrefix + '-picker-list" role="listbox" aria-label="Klubber" hidden></ul>'
                    + '</div>';
            if (errorMsg) { return; }
            var inputEl = id('-picker-input');
            var listEl = id('-picker-list');
            var clearEl = id('-picker-clear');
            StandplassFilterWidgets.makeComboHandlers({
                input: inputEl, list: listEl, clear: clearEl,
                getItems: function (query) {
                    var q = (query || '').trim().toLowerCase();
                    var filtered = q ? clubs.filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }) : clubs;
                    return filtered.slice(0, 50);
                },
                restoreOnBlur: function () { return ''; },
                onSelect: function (clubId, clubName) {
                    var qs = new URLSearchParams(urlState.getSearch());
                    qs.set('klubb', clubName);
                    urlState.setSearch('?' + qs.toString());
                    window.location.reload();
                },
                onClear: function () { inputEl.value = ''; }
            });
        }

        function showGrid() {
            pickerEl.hidden = true;
            gridWrapEl.hidden = false;
        }

        StandplassNsfOrgs.ensureOrgs(window.fetch.bind(window)).then(function (clubs) {
            var matched = klubbSlug ? StandplassNsfOrgs.matchClub(clubs, klubbSlug) : null;
            if (!matched) { showPicker(clubs); return; }
            showGrid();
            // Task 6/7 continue here: discipline resolution, ranking
            // fetch, card rendering, program/year/num filters, person
            // modal wiring -- this task only proves club resolution and
            // the picker/grid toggle work.
        }, function () {
            showPicker([], 'Kunne ikke laste klubbliste.');
        });
    }

    return { init: init, buildRankingUrl: buildRankingUrl };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassKlubbPage;
}
