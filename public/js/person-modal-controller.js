// public/js/person-modal-controller.js
//
// The shooter-detail modal as a self-contained widget: creates and owns
// its own DOM (no host-page markup contract required), reads/writes URL
// state via a caller-supplied StandplassUrlState controller, and fetches
// per-year entries via a caller-supplied callback (felt/bane and klubb
// each have their own way of getting to data/felt|data/bane, but the
// entries shape once fetched is identical -- see fetchEntriesForYear in
// create()'s cfg). Extracted 2026-08-29 out of stevner-page.js, which
// used to nest this ~290 lines directly inside its own init() closure --
// not reusable from outside that one call. See
// docs/superpowers/specs/2026-08-29-klubb-view-design.md's "Person-modal
// widget extraction" section for the full reasoning.
var StandplassPersonModalController = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Shared across every widget instance on the page (any number of
    // klubb/felt/bane instances), so with two open modals, Escape closes
    // only the most-recently-opened one -- matches stevner-page.js's own
    // prior convention exactly (a single shared pointer, not a stack; see
    // that file's STATUS.md-documented limitation, carried over unchanged).
    var activeModalCloser = null;
    var escapeHandlerWired = false;
    function wireGlobalEscapeHandler() {
        if (escapeHandlerWired) { return; }
        escapeHandlerWired = true;
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && activeModalCloser) { activeModalCloser(); }
        });
    }

    function create(cfg) {
        var root = cfg.root || document;
        var modalEl = null;
        var modalOpener = null;
        var personYearCache = {}; // { personId: { year: entry[] } }
        var personOpenSeq = 0;
        var modalMetric = cfg.initialMetric || 'rankingScore';
        var modalEntries = [];
        var syncCurrentPersonModalUrl = function () {};

        // Same "use it if the host page already rendered one, otherwise
        // make it" pattern stevner-page.js's own competition-modal code
        // already uses (compDialog, stevner-page.js:1040-1051) -- brought
        // to the person modal too, which never had this before.
        function ensureModalEl() {
            if (modalEl) { return modalEl; }
            modalEl = (root.getElementById ? root.getElementById(cfg.idPrefix + '-person-modal') : null);
            if (!modalEl) {
                modalEl = document.createElement('div');
                modalEl.id = cfg.idPrefix + '-person-modal';
                modalEl.hidden = true;
                (root === document ? document.body : root).appendChild(modalEl);
            }
            modalEl.setAttribute('role', 'dialog');
            modalEl.setAttribute('aria-labelledby', cfg.idPrefix + '-person-modal-title');
            modalEl.addEventListener('click', function (e) {
                if (e.target === modalEl) { close(); }
            });
            return modalEl;
        }

        function id(suffix) { return root.getElementById(cfg.idPrefix + suffix); }

        function close() {
            if (activeModalCloser === close) { activeModalCloser = null; }
            modalEl.hidden = true;
            modalEl.innerHTML = '';
            var qs = StandplassPersonModal.clearPersonFromUrl(cfg.urlState.getSearch());
            cfg.urlState.setSearch(qs);
            if (modalOpener) { modalOpener.focus(); modalOpener = null; }
        }

        function showModal(title, body) {
            ensureModalEl();
            modalEl.innerHTML = '<div class="person-modal-shell">'
                + '<div class="comp-modal-header">'
                + '<h2 class="comp-modal-title" id="' + cfg.idPrefix + '-person-modal-title">' + title + '</h2>'
                + '<button type="button" class="comp-modal-close" id="' + cfg.idPrefix + '-person-modal-close" aria-label="Lukk">×</button>'
                + '</div>'
                + '<div class="comp-modal-body">' + body + '</div>'
                + '</div>';
            modalEl.hidden = false;
            activeModalCloser = close;
            id('-person-modal-close').addEventListener('click', close);
            id('-person-modal-close').focus();
        }

        function drawChart() {
            var chartEl = id('-person-chart');
            if (chartEl) { StandplassPersonModal.renderChart(chartEl, modalEntries, modalMetric); }
        }

        function fetchPersonYear(personId, year) {
            personYearCache[personId] = personYearCache[personId] || {};
            if (personYearCache[personId][year]) { return Promise.resolve(personYearCache[personId][year]); }
            return cfg.fetchEntriesForYear(personId, year).then(function (entries) {
                personYearCache[personId][year] = entries;
                return entries;
            });
        }

        var METRICS = [
            { key: 'rankingScore', label: 'Ranking' },
            { key: 'score', label: 'Poeng', title: 'Poengsum varierer med stevnets maks-score — ikke direkte sammenlignbar på tvers av stevner' },
            { key: 'position', label: 'Plassering' }
        ];

        function renderPersonModal(personId, personName, initialDisc, urlFilters) {
            var mySeq = ++personOpenSeq;
            var selectedYears = (urlFilters && urlFilters.years) ? urlFilters.years.slice() : [cfg.defaultYear];
            var entriesByYear = {};
            var filters = {
                types: (urlFilters && urlFilters.types) || null,
                discs: (urlFilters && urlFilters.discs) || null,
                classes: (urlFilters && urlFilters.classes) || null
            };
            if (urlFilters && urlFilters.metric) { modalMetric = urlFilters.metric; }

            function knownValues(key) {
                var all = {};
                Object.keys(entriesByYear).forEach(function (y) {
                    entriesByYear[y].forEach(function (e) { if (e[key]) { all[e[key]] = true; } });
                });
                return Object.keys(all).sort(function (a, b) { return a.localeCompare(b, 'no'); });
            }

            function syncPersonModalUrl() {
                var patch = StandplassPersonModal.buildPersonFilterParams({
                    selectedYears: selectedYears, activeYear: cfg.defaultYear,
                    types: filters.types, discs: filters.discs, classes: filters.classes,
                    metric: modalMetric, defaultMetric: cfg.initialMetric || 'rankingScore'
                });
                var qs = new URLSearchParams(cfg.urlState.getSearch());
                Object.keys(patch).forEach(function (k) {
                    // Truthy check, not == null -- matches stevner-page.js's
                    // own original setUrlParam(key, value) exactly (a falsy
                    // patch value, same as an absent one, means "no param").
                    if (patch[k]) { qs.set(k, patch[k]); } else { qs.delete(k); }
                });
                cfg.urlState.setSearch('?' + qs.toString());
            }
            syncCurrentPersonModalUrl = syncPersonModalUrl;

            function refresh() {
                syncPersonModalUrl();
                var merged = StandplassPersonModal.mergeYearEntries(entriesByYear, selectedYears);
                modalEntries = StandplassPersonModal.getFilteredEntries(merged, filters);
                var body = modalEntries.slice().sort(function (a, b) {
                    return (a.date || '') < (b.date || '') ? -1 : 1;
                }).map(function (r) {
                    return '<tr><td>' + (r.date ? esc(StandplassPersonModal.shortDate(r.date)) : '–') + '</td>'
                        + '<td>' + esc(r.competition || '–') + '</td>'
                        + '<td>' + esc(r.discipline || '') + '</td><td>' + esc(r.class || '') + '</td>'
                        + '<td>' + (r.position == null ? '–' : esc(r.position)) + '</td>'
                        + '<td>' + (r.score == null ? '–' : esc(r.score)) + '</td>'
                        + '<td>' + (r.rankingScore == null ? '–' : esc(Number(r.rankingScore).toFixed(2))) + '</td></tr>';
                }).join('');
                var tbody = id('-person-table-body');
                if (tbody) { tbody.innerHTML = body || '<tr><td colspan="7">Ingen resultater.</td></tr>'; }
                drawChart();
            }

            function loadYearIfNeeded(year) {
                if (entriesByYear[year]) { return Promise.resolve(); }
                return fetchPersonYear(personId, year).then(function (entries) {
                    if (mySeq !== personOpenSeq) { return; }
                    entriesByYear[year] = entries;
                });
            }

            function personModalBodyMarkup() {
                return '<div class="person-filters">'
                    + '<div class="filter-group"><label>År</label><div class="checkbox-dropdown" id="' + cfg.idPrefix + '-person-year-filter"></div></div>'
                    + '<div class="filter-group" hidden><label>Stevnetype</label><div class="checkbox-dropdown" id="' + cfg.idPrefix + '-person-type-filter"></div></div>'
                    + '<div class="filter-group" hidden><label>Øvelse</label><div class="checkbox-dropdown" id="' + cfg.idPrefix + '-person-disc-filter"></div></div>'
                    + '<div class="filter-group" hidden><label>Klasse</label><div class="checkbox-dropdown" id="' + cfg.idPrefix + '-person-class-filter"></div></div>'
                    + '</div>'
                    + '<div class="person-chart-header"><div class="program-toggle" role="group" aria-label="Vis i graf">'
                    + METRICS.map(function (m) {
                        return '<button type="button" class="program-btn person-chart-toggle' + (m.key === modalMetric ? ' program-btn--active' : '') + '"'
                            + ' data-metric="' + m.key + '" aria-pressed="' + (m.key === modalMetric) + '"'
                            + (m.title ? ' title="' + esc(m.title) + '"' : '') + '>' + m.label + '</button>';
                    }).join('') + '</div></div>'
                    + '<div id="' + cfg.idPrefix + '-person-chart"></div>'
                    + '<table class="ranking-table"><thead><tr><th>Dato</th><th>Stevne</th><th>Øvelse</th><th>Klasse</th><th>Plass</th><th>Poeng</th><th>Ranking</th></tr></thead>'
                    + '<tbody id="' + cfg.idPrefix + '-person-table-body"></tbody></table>';
            }

            function toggleSetValue(current, known, v, checked) {
                var base = current === null ? known.slice() : current.slice();
                if (checked) { if (base.indexOf(v) < 0) { base.push(v); } } else { base = base.filter(function (x) { return x !== v; }); }
                return base;
            }

            function mountFilterDropdown(suffix, items, getSelected, labelNone, onToggle, onClear, searchable, clearLabel) {
                var container = id(suffix);
                if (container.parentElement.classList.contains('filter-group')) { container.parentElement.hidden = false; }
                container.innerHTML = '<button type="button" class="checkbox-dropdown-btn" aria-expanded="false"></button>'
                    + '<div class="checkbox-dropdown-panel" hidden role="group"><button type="button" class="checkbox-dropdown-clear-all">' + esc(clearLabel || 'Fjern alle') + '</button>'
                    + '<ul class="checkbox-dropdown-list"></ul></div>';
                var dropdown = StandplassFilterWidgets.makeCheckboxDropdown({
                    btn: container.querySelector('.checkbox-dropdown-btn'), panel: container.querySelector('.checkbox-dropdown-panel'),
                    list: container.querySelector('.checkbox-dropdown-list'), clearAllBtn: container.querySelector('.checkbox-dropdown-clear-all'),
                    labelNone: labelNone,
                    searchable: !!searchable,
                    getItems: function () { return items.map(function (i) { return { id: i, name: i }; }); },
                    getSelected: function () { var s = getSelected(); return s === null ? items : s; },
                    onToggle: function (v, name, checked) { onToggle(v, checked); dropdown.rebuild(); },
                    onClearAll: function () { onClear(); dropdown.rebuild(); }
                });
                dropdown.rebuild();
                return dropdown;
            }

            function wirePersonModalFilters() {
                var years = [];
                for (var y = cfg.firstYear; y <= cfg.currentYear; y++) { years.push(y); }
                mountFilterDropdown('-person-year-filter', years.map(String), function () { return selectedYears.map(String); }, 'Alle år', function (yearStr, checked) {
                    var yr = parseInt(yearStr, 10);
                    if (checked) { selectedYears.push(yr); } else { selectedYears = selectedYears.filter(function (v) { return v !== yr; }); }
                    loadYearIfNeeded(yr).then(function () {
                        if (mySeq !== personOpenSeq) { return; }
                        wirePersonModalFilters();
                        refresh();
                    });
                }, function () { selectedYears = [cfg.defaultYear]; refresh(); }, false, 'Kun ' + cfg.defaultYear);
                if (knownValues('competitionType').length > 1) {
                    mountFilterDropdown('-person-type-filter', knownValues('competitionType'), function () { return filters.types; }, 'Alle stevnetyper',
                        function (v, checked) { filters.types = toggleSetValue(filters.types, knownValues('competitionType'), v, checked); refresh(); },
                        function () { filters.types = null; refresh(); });
                }
                if (knownValues('discipline').length > 1) {
                    mountFilterDropdown('-person-disc-filter', knownValues('discipline'), function () { return filters.discs; }, 'Alle øvelser',
                        function (v, checked) { filters.discs = toggleSetValue(filters.discs, knownValues('discipline'), v, checked); refresh(); },
                        function () { filters.discs = null; refresh(); }, true);
                }
                if (knownValues('class').length > 1) {
                    mountFilterDropdown('-person-class-filter', knownValues('class'), function () { return filters.classes; }, 'Alle klasser',
                        function (v, checked) { filters.classes = toggleSetValue(filters.classes, knownValues('class'), v, checked); refresh(); },
                        function () { filters.classes = null; refresh(); });
                }
            }

            Promise.all(selectedYears.map(loadYearIfNeeded)).then(function () {
                if (mySeq !== personOpenSeq) { return; }
                var resolvedName = personName;
                for (var i = 0; i < selectedYears.length && !resolvedName; i++) {
                    resolvedName = ((entriesByYear[selectedYears[i]] || [])[0] || {}).name;
                }
                if (!urlFilters) {
                    filters.discs = StandplassPersonModal.resolveInitialFilter(initialDisc, knownValues('discipline'));
                }
                showModal(esc(resolvedName || 'Ukjent skytter'), personModalBodyMarkup());
                wirePersonModalFilters();
                refresh();
            }, function () { showModal('Feil', '<p>Kunne ikke laste resultater.</p>'); });
        }

        wireGlobalEscapeHandler();
        ensureModalEl();
        modalEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.person-chart-toggle');
            if (!btn) { return; }
            modalMetric = btn.getAttribute('data-metric');
            Array.prototype.forEach.call(modalEl.querySelectorAll('.person-chart-toggle'), function (b) {
                var isActive = b === btn;
                b.classList.toggle('program-btn--active', isActive);
                b.setAttribute('aria-pressed', String(isActive));
            });
            syncCurrentPersonModalUrl();
            drawChart();
        });

        function open(triggerEl, opts) {
            modalOpener = triggerEl || null;
            cfg.urlState.setSearch(StandplassPersonModal.buildPersonUrl(cfg.urlState.getSearch(), opts.personId, cfg.defaultYear));
            renderPersonModal(opts.personId, opts.personName, opts.initialDisc || null, null);
        }

        function openFromUrl() {
            var personState = StandplassPersonModal.parsePersonFromUrl(cfg.urlState.getSearch());
            if (personState) {
                renderPersonModal(personState.personId, null, null, StandplassPersonModal.parsePersonFilterParams(cfg.urlState.getSearch()));
            }
        }

        return { open: open, close: close, openFromUrl: openFromUrl };
    }

    return { create: create };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassPersonModalController;
}
