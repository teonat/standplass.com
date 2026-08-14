// public/js/stevner-page.js
//
// One shared page engine for the felt and bane result lists, parameterized by
// { view, dataBase, idPrefix } — the same shape the source repo used with
// resultatliste-stevner.js + STEVNER_CONFIG. Field names and the default
// grouping rule are ported from there:
//   - result row fields: personId, name, club, discipline, class, position,
//     score, rankingScore
//   - default "Per klasse" grouping: rows ordered by discipline, then class,
//     then position ascending (missing position sorts last)
var StandplassStevnerPage = (function () {
    'use strict';

    // table-renderer.js's esc() isn't exported, so we keep a tiny local copy
    // for the HTML we build ourselves (person-link cell, person modal).
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // The data's `club` holds full display names ("Eksempel Skytterlag"),
    // while ?klubb= carries a slug ("eksempel"). Compare both sides folded
    // down to bare lowercase letters/digits.
    function normalizeClub(s) {
        return String(s == null ? '' : s).toLowerCase()
            .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
            .replace(/[^a-z0-9]/g, '');
    }

    // ponytail: substring match, so ?klubb=eksempel also matches a
    // hypothetical "Eksempel Pistolklubb". Switch to an explicit
    // slug→club-name map if two clubs ever collide.
    function matchesClub(rowClub, slug) {
        return normalizeClub(rowClub).indexOf(normalizeClub(slug)) !== -1;
    }

    // Flattens the scraper's { competitions: [{ results: [...] }] } shape into
    // one row per result, matching resultatliste-stevner.js's field names.
    // The two competition-level fields the row-based views need are copied down
    // onto every row: `applicableForClassification` (the tab buckets, cf.
    // resultatliste-stevner.js:661-669) and `date` (the person chart's X axis,
    // cf. nsf-ui.js's chart entries).
    function flattenRows(yearData) {
        var rows = [];
        (yearData.competitions || []).forEach(function (comp) {
            (comp.results || []).forEach(function (r) {
                rows.push({
                    position: r.position,
                    name: r.name,
                    personId: r.personId,
                    club: r.club,
                    discipline: r.discipline,
                    class: r.class,
                    score: r.score,
                    rankingScore: r.rankingScore,
                    // Date-only, exactly like nsf-ui.js:2166 — the chart code
                    // keys "best result per date" on this string and parses it
                    // as UTC midnight, both of which break on a full datetime.
                    date: comp.startDate ? String(comp.startDate).slice(0, 10) : '',
                    applicableForClassification: comp.applicableForClassification === true,
                    nameHtml: '<button type="button" class="stevner-person-btn link-btn" data-person-id="'
                        + esc(r.personId) + '" data-person-name="' + esc(r.name) + '">'
                        + esc(r.name || '–') + '</button>'
                });
            });
        });
        return rows;
    }

    function comparePosition(a, b) {
        if (a.position == null) { return 1; }
        if (b.position == null) { return -1; }
        return a.position - b.position;
    }

    function compareByKlasse(a, b) {
        var d = (a.discipline || '').localeCompare(b.discipline || '', 'no');
        if (d !== 0) { return d; }
        var c = (a.class || '').localeCompare(b.class || '', 'no');
        if (c !== 0) { return c; }
        return comparePosition(a, b);
    }

    // The source groups each competition card by discipline and sorts within
    // the group (resultatliste-stevner.js:823-850); this view is one flat table,
    // so the same two modes become row comparators keyed on discipline first.
    function compareByOvelse(a, b) {
        var d = (a.discipline || '').localeCompare(b.discipline || '', 'no');
        return d !== 0 ? d : comparePosition(a, b);
    }

    function compareByPoeng(a, b) {
        var d = (a.discipline || '').localeCompare(b.discipline || '', 'no');
        if (d !== 0) { return d; }
        var sa = Number(a.score), sb = Number(b.score);
        if (isNaN(sa) && isNaN(sb)) { return 0; }
        if (isNaN(sa)) { return 1; }
        if (isNaN(sb)) { return -1; }
        return sb - sa;
    }

    var COMPARATORS = { klasse: compareByKlasse, ovelse: compareByOvelse, poeng: compareByPoeng };

    function num(v) { var n = Number(v); return isNaN(n) ? '–' : String(n); }

    // Column order mirrors the sort order (discipline → class → position), so
    // the "#" column is readable when several disciplines are in view.
    var columns = [
        { key: 'position', format: num },
        { key: 'nameHtml', format: function (v) { return v; }, raw: true },
        { key: 'club' },
        { key: 'discipline' },
        { key: 'class' },
        { key: 'score', format: num },
        { key: 'rankingScore', format: function (v) { return v != null ? Number(v).toFixed(2) : '–'; } }
    ];

    function init(config) {
        var dataBase = config.dataBase;
        var view = config.view;
        var id = function (suffix) { return document.getElementById(config.idPrefix + suffix); };
        var CURRENT_YEAR = new Date().getUTCFullYear();

        var params = new URLSearchParams(window.location.search);
        var club = params.get('club');
        if (club) {
            document.documentElement.setAttribute('data-club', club);
        }
        // Mode (?mode= → localStorage → OS preference) is resolved by
        // site-chrome.js, which runs before this file on every page.
        var klubb = params.get('klubb');
        var yearParam = parseInt(params.get('year'), 10);
        var activeYear = isNaN(yearParam) ? CURRENT_YEAR : yearParam;

        var fetcher = StandplassData.createFetcher(window.fetch.bind(window));
        var FW = StandplassFilterWidgets;
        var FIRST_YEAR = 2021;

        // ── Filter state ──────────────────────────────────────────────────
        // Deliberate design choice: standplass is not affiliated with any
        // club, so the default is unfiltered (no club pre-selected); a
        // ?klubb= param pre-selects that club's chip instead.
        var activeClubs = [];
        var activeDiscs = [];
        var nameQuery = '';
        var activeTab = 'alle';                    // 'alle' | 'klasse' | 'ikke'
        var activeGroupMode = 'klasse';            // key of COMPARATORS
        var masterClubs = {};                      // accumulates across loaded years (stevner.js:353-373)
        var masterDiscs = {};
        var allRows = [];                          // every row of activeYear
        var visibleRows = [];                      // after filters, sorted
        // ?klubb= is a slug; it is resolved against real club names once data is
        // loaded so it shows as a removable chip. If it matches nothing we keep
        // filtering by the slug, so an embed never silently widens to a
        // national list.
        var klubbResolved = false;
        var klubbUnmatched = false;

        var pagination = StandplassPagination.createController({
            pageSize: 50,
            fetchPage: function (offset, limit) {
                return Promise.resolve(visibleRows.slice(offset, offset + limit));
            }
        });

        var rowsEl = id('-rows');
        var loadMoreBtn = id('-load-more');

        function render() {
            if (!pagination.state.items.length) {
                rowsEl.innerHTML = '<tr><td colspan="' + columns.length + '">Ingen resultater.</td></tr>';
            } else {
                StandplassTable.mount(rowsEl, columns, pagination.state.items);
            }
            loadMoreBtn.hidden = pagination.state.done;
        }

        // pagination.js only clears state.loading on the success path, so a
        // failed fetch would wedge "Last flere" forever — clear it here and
        // show the failure instead of leaving a dead button.
        function showLoadError() {
            pagination.state.loading = false;
            loadMoreBtn.hidden = true;
            rowsEl.innerHTML = '<tr><td colspan="' + columns.length + '">Kunne ikke laste resultater.</td></tr>';
        }

        function load() {
            return pagination.loadMore().then(render, showLoadError);
        }

        loadMoreBtn.addEventListener('click', load);

        // ── Filter predicates (resultatliste-stevner.js:687-719, rewritten
        // for one flat row list instead of nested competition objects) ────
        function filterRows() {
            var q = nameQuery.toLowerCase();
            return allRows.filter(function (r) {
                if (activeTab === 'klasse' && !r.applicableForClassification) { return false; }
                if (activeTab === 'ikke' && r.applicableForClassification) { return false; }
                if (activeDiscs.length && activeDiscs.indexOf(r.discipline) < 0) { return false; }
                if (activeClubs.length && activeClubs.indexOf(r.club) < 0) { return false; }
                if (klubbUnmatched && !matchesClub(r.club, klubb)) { return false; }
                if (q && !(r.name && r.name.toLowerCase().indexOf(q) >= 0)) { return false; }
                return true;
            }).sort(COMPARATORS[activeGroupMode]);
        }

        // Every filter change re-filters from scratch and restarts pagination,
        // mirroring the source's render() resetting _shown to PAGE_SIZE.
        function applyFilters() {
            visibleRows = filterRows();
            pagination.reset();
            return load();
        }

        function loadYear(year) {
            return fetcher.fetchYear(dataBase, year).then(function (yearData) {
                allRows = flattenRows(yearData);
                allRows.forEach(function (r) {
                    if (r.club) { masterClubs[r.club] = true; }
                    if (r.discipline) { masterDiscs[r.discipline] = true; }
                });
                if (klubb && !klubbResolved) {
                    klubbResolved = true;
                    activeClubs = Object.keys(masterClubs).filter(function (c) {
                        return matchesClub(c, klubb);
                    });
                    klubbUnmatched = activeClubs.length === 0;
                }
                discDropdown.rebuild();
                clubCombo.rebuild();
                return applyFilters();
            }, showLoadError);
        }

        // ── Year select (stevner.js:562-570 populate, 124-128 change) ─────
        var yearEl = id('-year');
        for (var y = CURRENT_YEAR; y >= FIRST_YEAR; y--) {
            var yearOpt = document.createElement('option');
            yearOpt.value = y;
            yearOpt.textContent = y;
            yearEl.appendChild(yearOpt);
        }
        yearEl.value = String(activeYear);
        yearEl.addEventListener('change', function () {
            activeYear = parseInt(yearEl.value, 10);
            var qs = new URLSearchParams(window.location.search);
            qs.set('year', String(activeYear));
            history.replaceState(null, '', '?' + qs.toString());
            loadYear(activeYear);
        });

        // ── Discipline checkbox dropdown (stevner.js:130-158) ─────────────
        var discDropdown = FW.makeCheckboxDropdown({
            btn: id('-disc-btn'),
            panel: id('-disc-panel'),
            list: id('-disc-list'),
            clearAllBtn: id('-disc-clear'),
            labelNone: 'Alle øvelser',
            getItems: function () {
                return Object.keys(masterDiscs)
                    .sort(function (a, b) { return a.localeCompare(b, 'no'); })
                    .map(function (n) { return { id: n, name: n }; });
            },
            getSelected: function () { return activeDiscs; },
            onToggle: function (id_, name, checked) {
                if (checked) {
                    if (activeDiscs.indexOf(id_) < 0) { activeDiscs.push(id_); }
                } else {
                    activeDiscs = activeDiscs.filter(function (x) { return x !== id_; });
                }
                discDropdown.rebuild();
                applyFilters();
            },
            onClearAll: function () {
                activeDiscs = [];
                discDropdown.rebuild();
                applyFilters();
            }
        });

        // ── Club tag combobox (stevner.js:160-194) ───────────────────────
        // The club selection is the one filter that is URL-synced, because
        // embed-builder.js builds its snippet from the current query string
        // (its ALLOWED_PARAMS whitelist is klubb/club/mode) — without this,
        // "Opprett iframe" would hand a club admin an unfiltered national
        // embed. ?klubb= is single-valued, so 0 or 2+ chips means no param.
        // The other filters (discipline/name/tab/group) stay session-only.
        function syncKlubbParam() {
            // An explicit chip change supersedes an incoming slug that matched
            // no club, otherwise the stale slug filter would keep applying on
            // top of the new selection.
            klubbUnmatched = false;
            var qs = new URLSearchParams(window.location.search);
            if (activeClubs.length === 1) { qs.set('klubb', activeClubs[0]); } else { qs.delete('klubb'); }
            var s = qs.toString();
            history.replaceState(null, '', s ? '?' + s : window.location.pathname);
        }

        var clubCombo = FW.makeTagComboHandlers({
            input: id('-club-input'),
            list: id('-club-list'),
            tagsEl: id('-club-tags'),
            clear: id('-club-clear'),
            getItems: function (q) {
                var lower = (q || '').toLowerCase();
                return Object.keys(masterClubs)
                    .sort(function (a, b) { return a.localeCompare(b, 'no'); })
                    .filter(function (c) { return activeClubs.indexOf(c) < 0; })
                    .filter(function (c) { return !lower || c.toLowerCase().indexOf(lower) >= 0; })
                    .map(function (c) { return { id: c, name: c }; });
            },
            getSelected: function () {
                return activeClubs.map(function (c) { return { id: c, name: c }; });
            },
            onSelect: function (id_) {
                if (activeClubs.indexOf(id_) < 0) { activeClubs.push(id_); }
                clubCombo.rebuild();
                syncKlubbParam();
                applyFilters();
            },
            onRemove: function (id_) {
                activeClubs = activeClubs.filter(function (c) { return c !== id_; });
                clubCombo.rebuild();
                syncKlubbParam();
                applyFilters();
            },
            onClearAll: function () {
                activeClubs = [];
                clubCombo.rebuild();
                syncKlubbParam();
                applyFilters();
            }
        });

        // ── Name search autocomplete (stevner.js:232-292) ────────────────
        var nameEl = id('-name');
        var nameWrap = id('-name-wrap');
        var nameTimer = null;
        var nameDirty = false;

        function commitName() {
            clearTimeout(nameTimer);
            nameDirty = false;
            applyFilters();
            nameWrap.classList.toggle('autocomplete-wrap--has-value', !!nameQuery);
        }

        nameEl.addEventListener('input', function () {
            nameQuery = nameEl.value.trim();
            nameDirty = true;
            clearTimeout(nameTimer);
            nameTimer = setTimeout(commitName, 300);
        });
        nameEl.addEventListener('blur', function () {
            if (nameDirty) { commitName(); }
        });

        FW.makeComboHandlers({
            input: nameEl,
            list: id('-name-list'),
            clear: id('-name-clear'),
            getItems: function (q) {
                var lower = (q || '').toLowerCase();
                var names = {};
                allRows.forEach(function (r) {
                    if (activeDiscs.length && activeDiscs.indexOf(r.discipline) < 0) { return; }
                    if (activeClubs.length && activeClubs.indexOf(r.club) < 0) { return; }
                    if (r.name && (!lower || r.name.toLowerCase().indexOf(lower) >= 0)) {
                        names[r.name] = true;
                    }
                });
                return Object.keys(names)
                    .sort(function (a, b) { return a.localeCompare(b, 'no'); })
                    .slice(0, 50)
                    .map(function (n) { return { id: n, name: n }; });
            },
            restoreOnBlur: function () { return nameQuery; },
            onSelect: function (id_) {
                nameQuery = id_;
                nameEl.value = id_;
                commitName();
            },
            onClear: function () {
                nameQuery = '';
                commitName();
            }
        });

        // ── Tab + group toggles (stevner.js:574-585 / 99-122) ────────────
        function wireToggle(toggleEl, attr, onPick) {
            toggleEl.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-' + attr + ']');
                if (!btn) { return; }
                Array.prototype.forEach.call(toggleEl.querySelectorAll('button'), function (b) {
                    var isActive = b === btn;
                    b.classList.toggle('program-btn--active', isActive);
                    b.setAttribute('aria-pressed', String(isActive));
                });
                onPick(btn.getAttribute('data-' + attr));
            });
        }

        wireToggle(id('-tab-toggle'), 'tab', function (value) {
            activeTab = value;
            applyFilters();
        });
        wireToggle(id('-group-toggle'), 'group', function (value) {
            activeGroupMode = COMPARATORS[value] ? value : 'klasse';
            applyFilters();
        });

        loadYear(activeYear);

        // ── Person modal ─────────────────────────────────────────────────
        // URL-state wiring (StandplassPersonModal) + the real SVG chart
        // (StandplassPersonModal.renderChart) above the per-entry table. The
        // metric toggle mirrors nsf-ui.js:1685-1707; the tooltip / expand-dialog
        // interactivity from that file is still deferred.
        var modalEl = id('-person-modal');
        var METRICS = [
            { key: 'rankingScore', label: 'Ranking' },
            { key: 'score', label: 'Poeng', title: 'Poengsum varierer med stevnets maks-score — ikke direkte sammenlignbar på tvers av stevner' },
            { key: 'position', label: 'Plassering' }
        ];
        var modalMetric = 'rankingScore';
        var modalEntries = [];
        // The element that opened the modal, so focus can go back where it came
        // from on close. Native <dialog>.showModal() (nsf-ui.js:1370) does this
        // for free; a plain <div> has to do it by hand. Stays null when the
        // modal is opened from a ?person= deep link — there is nothing to
        // return to then.
        var modalOpener = null;

        function closePersonModal() {
            modalEl.hidden = true;
            modalEl.innerHTML = '';
            var qs = StandplassPersonModal.clearPersonFromUrl(window.location.search);
            history.replaceState(null, '', qs || window.location.pathname);
            // A row the filters have since re-rendered away is detached, and
            // focus() on a detached node is a harmless no-op.
            if (modalOpener) { modalOpener.focus(); modalOpener = null; }
        }

        function showModal(title, body) {
            modalEl.innerHTML = '<div class="person-modal-shell">'
                + '<div class="comp-modal-header">'
                + '<h2 class="comp-modal-title" id="' + config.idPrefix + '-person-modal-title">'
                + title + '</h2>'
                + '<button type="button" class="comp-modal-close" id="' + config.idPrefix
                + '-person-modal-close" aria-label="Lukk">×</button>'
                + '</div>'
                + '<div class="comp-modal-body">' + body + '</div>'
                + '</div>';
            modalEl.hidden = false;
            id('-person-modal-close').addEventListener('click', closePersonModal);
            id('-person-modal-close').focus();
        }

        function drawChart() {
            var chartEl = id('-person-chart');
            if (chartEl) { StandplassPersonModal.renderChart(chartEl, modalEntries, modalMetric); }
        }

        function renderPersonModal(personName, rows) {
            modalEntries = rows.slice().sort(function (a, b) {
                return (a.date || '') < (b.date || '') ? -1 : 1;
            });
            var body = rows.slice().sort(compareByKlasse).map(function (r) {
                return '<tr><td>' + esc(r.discipline || '') + '</td><td>' + esc(r.class || '') + '</td>'
                    + '<td>' + (r.position == null ? '–' : esc(r.position)) + '</td>'
                    + '<td>' + (r.score == null ? '–' : esc(r.score)) + '</td>'
                    + '<td>' + (r.rankingScore == null ? '–' : esc(Number(r.rankingScore).toFixed(2))) + '</td></tr>';
            }).join('');
            var toggle = '<div class="person-chart-header">'
                + '<div class="program-toggle" role="group" aria-label="Vis i graf">'
                + METRICS.map(function (m) {
                    return '<button type="button" class="program-btn person-chart-toggle'
                        + (m.key === modalMetric ? ' program-btn--active' : '') + '"'
                        + ' data-metric="' + m.key + '" aria-pressed="' + (m.key === modalMetric) + '"'
                        + (m.title ? ' title="' + esc(m.title) + '"' : '')
                        + '>' + m.label + '</button>';
                }).join('')
                + '</div></div>'
                + '<div id="' + config.idPrefix + '-person-chart"></div>';
            showModal(esc(personName || 'Ukjent skytter'), toggle
                + '<table class="ranking-table"><thead><tr><th>Øvelse</th><th>Klasse</th><th>Plass</th><th>Poeng</th><th>Ranking</th></tr></thead>'
                + '<tbody>' + (body || ('<tr><td colspan="5">Ingen resultater for ' + activeYear + '.</td></tr>')) + '</tbody></table>');
            drawChart();
        }

        modalEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.person-chart-toggle');
            if (!btn) { return; }
            modalMetric = btn.getAttribute('data-metric');
            Array.prototype.forEach.call(modalEl.querySelectorAll('.person-chart-toggle'), function (b) {
                var isActive = b === btn;
                b.classList.toggle('program-btn--active', isActive);
                b.setAttribute('aria-pressed', String(isActive));
            });
            drawChart();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !modalEl.hidden) { closePersonModal(); }
        });

        function openPersonModal(personId, year) {
            fetcher.fetchYear(dataBase, year || activeYear).then(function (yearData) {
                var rows = flattenRows(yearData).filter(function (r) { return r.personId === personId; });
                renderPersonModal(rows.length ? rows[0].name : null, rows);
            }, function () {
                showModal('Feil', '<p>Kunne ikke laste resultater.</p>');
            });
        }

        rowsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-person-btn');
            if (!btn) { return; }
            var personId = btn.dataset.personId;
            modalOpener = btn;
            history.replaceState(null, '', StandplassPersonModal.buildPersonUrl(window.location.search, personId, activeYear));
            openPersonModal(personId, activeYear);
        });

        var personState = StandplassPersonModal.parsePersonFromUrl(window.location.search);
        if (personState) {
            openPersonModal(personState.personId, personState.year || activeYear);
        }

        // ── Embed builder ────────────────────────────────────────────────
        id('-embed-builder').innerHTML = '<button type="button" id="' + config.idPrefix
            + '-create-embed">Opprett iframe</button><pre id="' + config.idPrefix + '-embed-snippet"></pre>';
        id('-create-embed').addEventListener('click', function () {
            id('-embed-snippet').textContent = StandplassEmbedBuilder.buildSnippet(view, window.location.search);
        });
    }

    return { init: init, normalizeClub: normalizeClub, matchesClub: matchesClub, flattenRows: flattenRows, columns: columns };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassStevnerPage;
}
