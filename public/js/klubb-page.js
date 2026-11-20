// public/js/klubb-page.js
//
// Page glue for /klubb: a club's members ranked per NSF discipline,
// card-per-discipline, live from nsfapi.azurewebsites.net/ranking. Ported
// from the source's resultatliste-klubb.js, generalized from a
// single-club-hardcoded design to any ?klubb= club this project
// already supports elsewhere.
var StandplassKlubbPage = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function yearFrom(y) { return (y - 1) + '-12-31T23:00:00.000Z'; }
    function yearTo(y) { return y + '-12-31T22:59:59.999Z'; }

    // Leaderboard card table spec (shared base). Rows flatten position
    // into a data-anchored rank (position wins, page order falls back) so
    // # travels with its row under sorting; the person button is a raw
    // cell so the page's delegated person-modal wiring — on the grid
    // wrap, above the re-rendered tables — keeps working unchanged.
    function leaderboardCardSpec(entries, discName) {
        entries = entries || [];
        if (!entries.length) { return null; }
        return {
            columns: [
                { key: 'rank', label: '#', align: 'center' },
                { key: 'fullName', label: 'Navn', sortable: true, defaultDir: 'asc', raw: true,
                    cell: function (row) {
                        return '<button type="button" class="stevner-person-btn link-btn" data-person-id="' + esc(row.personId)
                            + '" data-person-name="' + esc(row.fullName) + '" data-discipline="' + esc(discName) + '">'
                            + esc(row.fullName) + '</button>';
                    } },
                { key: 'totalScore', label: 'Poeng', align: 'right', sortable: true, defaultDir: 'desc',
                    cell: function (row) { return row.totalScore != null ? Number(row.totalScore).toFixed(2) : '–'; } }
            ],
            rows: entries.map(function (e, i) {
                return { rank: e.position || (i + 1), personId: e.personId, fullName: e.fullName, totalScore: e.totalScore };
            }),
            // Page order is the ranking (position asc = Poeng desc; a
            // stable desc sort of a rank-ordered list reproduces it,
            // ties included) — Poeng desc is a true initial sort.
            defaultSort: { key: 'totalScore', dir: 'desc' },
            ariaLabel: discName
        };
    }

    // Pure -- no fetch, easy to test the query-string shape directly
    // against the API's documented gotchas.
    //
    // ponytail: orderBy kept as a literal string, not via qs.set(), for
    // parity with this task's own test (URLSearchParams would
    // percent-encode the colon to %3A). The percent-encoded form is likely
    // equivalent against the real API -- other params here already carry
    // percent-encoded colons (periodStart/periodEnd) -- but that hasn't
    // been confirmed against a live call. Every other param goes through
    // URLSearchParams as usual.
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

    function filterRankingEntries(items) {
        return (items || []).filter(function (e) { return (e.totalScore || 0) > 0; });
    }

    function init(config) {
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var urlState = config.urlState;
        var CURRENT_YEAR = new Date().getUTCFullYear();

        var params = new URLSearchParams(urlState.getSearch());
        var klubbSlug = params.get('klubb');
        var programParam = params.get('program');
        var initialProgram = (programParam === 'felt' || programParam === 'bane') ? programParam : 'felt';
        var numParam = parseInt(params.get('num'), 10);
        var initialNumResults = (numParam >= 1 && numParam <= 10) ? numParam : 1;
        var yearParam = parseInt(params.get('year'), 10);
        var initialYear = (yearParam >= CURRENT_YEAR - 5 && yearParam <= CURRENT_YEAR) ? yearParam : CURRENT_YEAR;

        var pickerEl = id('-picker');
        var gridWrapEl = id('-grid-wrap');

        function showPicker(clubs, errorMsg) {
            gridWrapEl.hidden = true;
            pickerEl.hidden = false;
            pickerEl.innerHTML = errorMsg
                ? '<p class="ranking-error ranking-status-msg">' + esc(errorMsg) + '</p>'
                : '<div class="ranking-filters"><div class="filter-group">'
                    + '<label for="' + config.idPrefix + '-picker-input">Velg klubb</label>'
                    + '<div class="autocomplete-wrap" id="' + config.idPrefix + '-picker-wrap">'
                    + '<input type="text" id="' + config.idPrefix + '-picker-input" class="filter-input" autocomplete="off"'
                    + ' aria-autocomplete="list" aria-controls="' + config.idPrefix + '-picker-list" aria-expanded="false" placeholder="Søk klubb…">'
                    + '<button type="button" class="combo-clear" id="' + config.idPrefix + '-picker-clear" aria-label="Fjern">×</button>'
                    + '<ul class="autocomplete-list" id="' + config.idPrefix + '-picker-list" role="listbox" aria-label="Klubber" hidden></ul>'
                    + '</div></div></div>';
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

        StandplassNsfOrgs.ensureOrgs(window.fetch.bind(window)).then(function (rawOrgs) {
            var clubs = StandplassNsfOrgs.filterClubs(rawOrgs);
            if (clubs.length === 0) { showPicker([], 'Kunne ikke laste klubbliste.'); return; }
            var matched = klubbSlug ? StandplassNsfOrgs.matchClub(clubs, klubbSlug) : null;
            if (!matched) { showPicker(clubs); return; }
            showGrid();
            var selectedYear = initialYear;
            var selectedNumResults = initialNumResults;
            var activeProgram = initialProgram;
            var rankingCache = {}; // { "discId|year|num": { time, promise } }
            var RANKING_TTL_MS = 5 * 60 * 1000;
            var activeAborts = [];

            function setUrlParam(key, value) {
                var qs = new URLSearchParams(urlState.getSearch());
                if (value) { qs.set(key, value); } else { qs.delete(key); }
                urlState.setSearch('?' + qs.toString());
            }

            function fetchRanking(disc) {
                var key = disc.id + '|' + selectedYear + '|' + selectedNumResults;
                var cached = rankingCache[key];
                if (cached && (Date.now() - cached.time) < RANKING_TTL_MS) { return cached.promise; }
                var ac = new AbortController();
                activeAborts.push(ac);
                var url = buildRankingUrl({ disciplineId: disc.id, orgId: matched.id, year: selectedYear, numberOfResults: selectedNumResults });
                var promise = window.fetch(url, { signal: ac.signal }).then(function (r) {
                    if (!r.ok) { throw new Error(String(r.status)); }
                    return r.json();
                }).then(function (data) {
                    return filterRankingEntries(data && data.items);
                });
                rankingCache[key] = { time: Date.now(), promise: promise };
                // ponytail: evict on rejection (abort or real failure) so a later
                // call for the same key retries instead of replaying a stuck
                // rejected promise for the rest of the TTL. Guard against a
                // newer call having already replaced this cache entry.
                promise.catch(function () {
                    if (rankingCache[key] && rankingCache[key].promise === promise) { delete rankingCache[key]; }
                });
                return promise;
            }

            function renderCard(cell, disc, entries) {
                var spec = leaderboardCardSpec(entries, disc.name);
                if (!spec) {
                    cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(disc.name) + '</h2></div>'
                        + '<p class="ranking-empty">Ingen resultater for ' + selectedYear + '</p></div>';
                    return;
                }
                cardSpecs[disc.id] = spec;
                cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(disc.name) + '</h2></div>'
                    + '<div class="club-stats-list-scroll">'
                    + StandplassDataTable.renderTable('klubb-card-' + disc.id, spec, cardTableState(disc.id))
                    + '</div></div>';
                wireCardTable(cell, disc.id);
            }

            // Per-card sort state + spec (rebuilt per render, consumed
            // by wiring). Sort survives year/program re-renders — the
            // same session-state policy as klubbstatistikk's toplists.
            var cardSort = {};
            var cardSpecs = {};

            function cardTableState(discId) {
                return { sort: cardSort[discId] || null, hidden: {}, runtimeHidden: [], widthTier: null };
            }

            function wireCardTable(cell, discId) {
                if (!cardSpecs[discId]) { return; }
                if (!cell.querySelector('table[data-dt-id="klubb-card-' + discId + '"]')) { return; }
                StandplassDataTable.wireTable(cell, 'klubb-card-' + discId, cardSpecs[discId], {
                    onSortChange: function (sort) {
                        cardSort[discId] = sort;
                        // Surgical: replace only THIS card's table (bare
                        // table — re-wrapping nests scroll regions, and
                        // sibling cards stay untouched).
                        var tableEl = cell.querySelector('table[data-dt-id="klubb-card-' + discId + '"]');
                        if (tableEl) {
                            tableEl.outerHTML = StandplassDataTable.renderTable('klubb-card-' + discId, cardSpecs[discId], cardTableState(discId));
                            wireCardTable(cell, discId);
                        }
                        var btn = cell.querySelector('table[data-dt-id="klubb-card-' + discId + '"] .dt-sort-btn[data-dt-sort="' + sort.key + '"]');
                        if (btn) { btn.focus(); }
                    }
                }, cardTableState(discId));
            }

            function loadAll() {
                activeAborts.forEach(function (ac) { ac.abort(); });
                activeAborts = [];
                var discs = activeProgram === 'felt'
                    ? StandplassKlubbDisciplineGroups.resolveFelt(StandplassCompModal.getDisciplineGroups())
                    : StandplassKlubbDisciplineGroups.resolveBane(StandplassCompModal.getDisciplineGroups());
                gridWrapEl.innerHTML = '';
                if (discs.length === 0) {
                    gridWrapEl.innerHTML = '<p class="ranking-error ranking-status-msg">Kunne ikke laste øvelsesliste.</p>';
                    return;
                }
                discs.forEach(function (disc) {
                    var cell = document.createElement('div');
                    cell.className = 'ranking-cell';
                    cell.setAttribute('data-disc-id', disc.id);
                    cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(disc.name) + '</h2></div><p class="ranking-loading">Laster…</p></div>';
                    gridWrapEl.appendChild(cell);
                    fetchRanking(disc).then(function (entries) {
                        renderCard(cell, disc, entries);
                    }, function (err) {
                        if (err.name === 'AbortError') { return; }
                        cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(disc.name) + '</h2></div><p class="ranking-error">Kunne ikke hente data</p></div>';
                    });
                });
            }

            var yearSelect = id('-year-select');
            for (var y = CURRENT_YEAR; y >= CURRENT_YEAR - 5; y--) {
                var opt = document.createElement('option');
                opt.value = String(y); opt.textContent = String(y);
                yearSelect.appendChild(opt);
            }
            yearSelect.value = String(selectedYear);
            yearSelect.addEventListener('change', function () {
                selectedYear = parseInt(yearSelect.value, 10);
                personModal.reset({ defaultYear: selectedYear });
                setUrlParam('year', String(selectedYear));
                loadAll();
            });

            var numSelect = id('-num-select');
            numSelect.value = String(selectedNumResults);
            numSelect.addEventListener('change', function () {
                selectedNumResults = parseInt(numSelect.value, 10) || 1;
                setUrlParam('num', String(selectedNumResults));
                loadAll();
            });

            var feltBtn = id('-toggle-felt');
            var baneBtn = id('-toggle-bane');
            // Reflect a ?program=bane initial URL state in the toggle UI --
            // the HTML markup hardcodes Felt as active, which only matched
            // before activeProgram could start as anything but 'felt'.
            feltBtn.classList.toggle('program-btn--active', activeProgram === 'felt');
            feltBtn.setAttribute('aria-pressed', String(activeProgram === 'felt'));
            baneBtn.classList.toggle('program-btn--active', activeProgram === 'bane');
            baneBtn.setAttribute('aria-pressed', String(activeProgram === 'bane'));
            function setProgram(program) {
                activeProgram = program;
                feltBtn.classList.toggle('program-btn--active', program === 'felt');
                feltBtn.setAttribute('aria-pressed', String(program === 'felt'));
                baneBtn.classList.toggle('program-btn--active', program === 'bane');
                baneBtn.setAttribute('aria-pressed', String(program === 'bane'));
                personModal.reset({ initialMetric: program === 'bane' ? 'score' : 'rankingScore' });
                setUrlParam('program', program);
                loadAll();
            }
            feltBtn.addEventListener('click', function () { if (activeProgram !== 'felt') { setProgram('felt'); } });
            baneBtn.addEventListener('click', function () { if (activeProgram !== 'bane') { setProgram('bane'); } });

            var localDataFetcher = StandplassData.createFetcher(window.fetch.bind(window));
            var personModal = StandplassPersonModalController.create({
                idPrefix: config.idPrefix,
                root: root,
                urlState: urlState,
                fetchEntriesForYear: function (personId, year) {
                    var dataBase = activeProgram === 'felt' ? '/data/felt' : '/data/bane';
                    return localDataFetcher.fetchYear(dataBase, year).then(function (yearData) {
                        return StandplassStevnerPage.flattenRows(yearData).filter(function (r) { return r.personId === personId; })
                            .map(function (r) {
                                return { date: r.date, discipline: r.discipline, class: r.class, competitionType: r.competitionType,
                                    competition: r.competition, position: r.position, score: r.score, rankingScore: r.rankingScore, name: r.name };
                            });
                    });
                },
                defaultYear: selectedYear,
                firstYear: 2021,
                currentYear: CURRENT_YEAR,
                initialMetric: activeProgram === 'bane' ? 'score' : 'rankingScore'
            });

            gridWrapEl.addEventListener('click', function (e) {
                var btn = e.target.closest('.stevner-person-btn');
                if (!btn) { return; }
                personModal.open(btn, {
                    personId: btn.dataset.personId,
                    personName: btn.dataset.personName,
                    initialDisc: btn.dataset.discipline || null
                });
            });
            personModal.openFromUrl();

            StandplassCompModal.ensureReferenceData(window.fetch.bind(window)).then(loadAll);
        }, function () {
            showPicker([], 'Kunne ikke laste klubbliste.');
        });
    }

    return { init: init, buildRankingUrl: buildRankingUrl, filterRankingEntries: filterRankingEntries, leaderboardCardSpec: leaderboardCardSpec };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassKlubbPage;
}
