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
// not reusable from outside that one call.
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
    // prior convention exactly (a single shared pointer, not a stack:
    // with two modals open, Escape reaches only the newest until it
    // closes; a known limitation, carried over unchanged).
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
        var liveDropdowns = {};  // suffix -> widget instance, so a remount
                                 // can destroy() the previous one's root-node
                                 // listener instead of leaking it
        var personOpenSeq = 0;
        var modalMetric = cfg.initialMetric || 'rankingScore';
        var modalEntries = [];
        // The activated entry's identity (p_entry): set by every
        // activation path — chart dot click, table row click, opening
        // from a result row or a shared link — and cleared by
        // deactivation or by anything that re-renders the table/chart
        // (metric toggle, filter change), mirroring the visual
        // activation. syncPersonModalUrl serializes it.
        var activeEntrySpec = null;
        var chartHandle = null; // set by drawChart; row clicks use it to
                                // activate the chart's dot for that entry
        var syncCurrentPersonModalUrl = function () {};

        // The identity spec an activated entry serializes as — the same
        // fields the felt/bane row buttons carry and findEntryIndex
        // matches on.
        function entrySpecOf(e) {
            return e ? { date: e.date, competitionId: e.competitionId,
                         discipline: e.discipline, class: e.class } : null;
        }

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
            modalEl.classList.add('person-modal');
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

        function showModal(title, body, headerExtras) {
            ensureModalEl();
            modalEl.innerHTML = '<div class="person-modal-shell">'
                + '<div class="comp-modal-header">'
                + '<h2 class="comp-modal-title" id="' + cfg.idPrefix + '-person-modal-title">' + title + '</h2>'
                + (headerExtras || '')
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
            if (chartEl) {
                chartHandle = StandplassPersonModal.renderChart(chartEl, modalEntries, modalMetric, {
                    onDotSelect: onChartDotSelected
                });
            }
        }

        // Opening from a clicked result row: activate that entry like
        // an in-modal row click (dot ring + chart scroll + row
        // highlight/focus). A rankless entry has no dot on the ranking
        // graph, so the poeng graph takes over first (owner ruling) —
        // the toggle buttons and the URL follow, exactly as a manual
        // metric switch. An entry with no value on the final metric
        // either way gets the row highlight only.
        function activateInitialEntry(spec) {
            var idx = StandplassPersonModal.findEntryIndex(modalEntries, spec);
            if (idx < 0) { return; }
            var entry = modalEntries[idx];
            var metric = StandplassPersonModal.activationMetric(entry, modalMetric);
            if (metric !== modalMetric) {
                modalMetric = metric;
                Array.prototype.forEach.call(modalEl.querySelectorAll('.person-chart-toggle'), function (b) {
                    var active = b.getAttribute('data-metric') === metric;
                    b.classList.toggle('program-btn--active', active);
                    b.setAttribute('aria-pressed', String(active));
                });
                syncCurrentPersonModalUrl();
                drawChart();
            }
            // A single-point chart (a person with one result in the
            // pre-filtered discipline) renders renderChart's noop handle
            // — activateDot would be silently swallowed — so the guard is
            // hasChartDot, not just hasMetricValue: no dot means the row
            // fallback (and its p_entry write) takes over.
            if (chartHandle && StandplassPersonModal.hasChartDot(modalEntries, modalMetric, entry)) {
                chartHandle.activateDot(String(idx));
            } else {
                var row = modalEl.querySelector('tr[data-idx="' + idx + '"]');
                if (row) {
                    row.classList.add('person-row-highlight');
                    row.scrollIntoView({ block: 'nearest' });
                    row.focus();
                }
                // No dot on either metric — the row highlight is the whole
                // activation, so the URL carries it here rather than through
                // the chart's notify path.
                activeEntrySpec = entrySpecOf(entry);
                syncCurrentPersonModalUrl();
            }
        }

        function fetchPersonYear(personId, year) {
            personYearCache[personId] = personYearCache[personId] || {};
            if (personYearCache[personId][year]) { return Promise.resolve(personYearCache[personId][year]); }
            return cfg.fetchEntriesForYear(personId, year).then(function (entries) {
                // Lazily re-init the bucket rather than assume it survived --
                // reset() below can wipe personYearCache wholesale while this
                // fetch is in flight.
                (personYearCache[personId] = personYearCache[personId] || {})[year] = entries;
                return entries;
            });
        }

        // The Meritter tab's data: both branches' mestere indexes, every
        // year, fetched once per widget instance (the underlying fetcher
        // also dedupes by URL for its TTL). Each entry carries its
        // branch — the panel's Alle/Felt/Bane switcher filters merits
        // on it. Per-year fetch failures are skipped years, not a
        // broken tab; only every-fetch-failed surfaces an error in the
        // panel. cfg.mestereBases defaults to the site-relative
        // felt/bane bases every standplass.com-hosted page can use;
        // only the embeddable pages pass origin-absolute bases.
        var mestereEntriesPromise = null;
        function ensureMestereEntries() {
            if (!mestereEntriesPromise) {
                var fetcher = StandplassData.createFetcher(
                    cfg.fetchImpl || window.fetch.bind(window));
                var bases = cfg.mestereBases || [
                    { branch: 'felt', base: '/data/felt/mestere' },
                    { branch: 'bane', base: '/data/bane/mestere' }
                ];
                var years = [];
                for (var y = cfg.firstYear; y <= cfg.currentYear; y++) { years.push(y); }
                var jobs = [];
                years.forEach(function (year) {
                    bases.forEach(function (b) {
                        jobs.push(fetcher.fetchMestere(b.base, year).then(function (index) {
                            return { year: year, branch: b.branch, index: index };
                        }));
                    });
                });
                mestereEntriesPromise = Promise.all(jobs.map(function (job) {
                    return job.catch(function () { return null; });
                })).then(function (entries) {
                    return entries.filter(Boolean);
                });
            }
            return mestereEntriesPromise;
        }

        // The Skammekroken tab's data: both branches' utfall indexes,
        // every year, fetched once per widget instance — the
        // ensureMestereEntries pattern (per-year fetch failures are
        // skipped years, not a broken tab; only every-fetch-failed
        // surfaces an error in the panel). cfg.utfallBases defaults to
        // the site-relative bases every standplass.com-hosted page can
        // use; only the embeddable pages pass origin-absolute bases.
        var statusEntriesPromise = null;
        function ensureStatusEntries() {
            if (!statusEntriesPromise) {
                var fetcher = StandplassData.createFetcher(
                    cfg.fetchImpl || window.fetch.bind(window));
                var bases = cfg.utfallBases || [
                    { branch: 'felt', base: '/data/felt/utfall' },
                    { branch: 'bane', base: '/data/bane/utfall' }
                ];
                var years = [];
                for (var y = cfg.firstYear; y <= cfg.currentYear; y++) { years.push(y); }
                var jobs = [];
                years.forEach(function (year) {
                    bases.forEach(function (b) {
                        jobs.push(fetcher.fetchUtfall(b.base, year).then(function (index) {
                            return { year: year, branch: b.branch, index: index };
                        }));
                    });
                });
                statusEntriesPromise = Promise.all(jobs.map(function (job) {
                    return job.catch(function () { return null; });
                })).then(function (entries) {
                    return entries.filter(Boolean);
                });
            }
            return statusEntriesPromise;
        }

        // Ruling 4 (skammekroken design): a tab with nothing to show
        // greys out and goes inert — never disappears, reactivates
        // when the view again carries data (the mesterskap filter
        // idiom). inert blocks clicks and keyboard only; programmatic
        // switches (deep links) still work.
        function setTabAvailable(btn, available) {
            if (!btn) { return; }
            btn.classList.toggle('person-modal-tab-btn--inactive', !available);
            if (available) { btn.removeAttribute('inert'); }
            else { btn.setAttribute('inert', ''); }
        }

        var METRICS = [
            { key: 'rankingScore', label: 'Ranking' },
            { key: 'score', label: 'Poeng', title: 'Poengsum varierer med stevnets maks-score — ikke direkte sammenlignbar på tvers av stevner' },
            { key: 'position', label: 'Plassering' }
        ];

        // openYear (from open()'s opts.year) opens a fresh modal on a
        // specific year — a resultfile member click resolves its entry
        // on the comp's year. Deep links (urlFilters.years) still win.
        function renderPersonModal(personId, personName, initialDisc, urlFilters, initialEntry, openYear) {
            var mySeq = ++personOpenSeq;
            var selectedYears = (urlFilters && urlFilters.years) ? urlFilters.years.slice()
                : [openYear || cfg.defaultYear];
            var entriesByYear = {};
            // Value filters use the felt/terminliste convention: nothing
            // picked = everything shown. [] (or a normalized null from the
            // URL parse) is the unfiltered state.
            var filters = {
                types: (urlFilters && urlFilters.types) || [],
                discs: (urlFilters && urlFilters.discs) || [],
                classes: (urlFilters && urlFilters.classes) || []
            };
            // Every fresh open starts on the page's default chart — the
            // previous session's toggle does not carry across opens
            // (owner ruling 2026-11-23: too many starting points already
            // manipulate the metric — p_metric deep links, explicit
            // entry-point metrics, the activation's rankless fallback —
            // for an invisible fourth one on top). Explicit starting
            // points still win: a p_metric deep link or an entry point's
            // opts.metric.
            modalMetric = (urlFilters && urlFilters.metric)
                || cfg.initialMetric || 'rankingScore';
            // Deep-link state for the Meritter/Skammekroken tabs and
            // their shared branch filter (p_tab/p_branch); plain row
            // opens never carry it — Resultater/Alle.
            var personTab = (urlFilters && urlFilters.tab) || null;
            var merittBranch = (urlFilters && urlFilters.branch) || null;
            // A fresh open starts unactivated; a p_entry deep link
            // activates after the year data lands.
            activeEntrySpec = null;

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
                    metric: modalMetric, defaultMetric: cfg.initialMetric || 'rankingScore',
                    tab: personTab, branch: merittBranch,
                    entry: activeEntrySpec
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

            // The table's sort state — created per open (renderPersonModal
            // runs per open), so every fresh open starts at the date-asc
            // default, and filter refreshes keep the active sort.
            var tableSort = null;
            var modalDisplayName = personName || 'Ukjent skytter';

            function renderPersonTable() {
                var host = id('-person-table');
                if (!host) { return; }
                // data-idx is the entry's index into modalEntries — the
                // same index renderChart stamps on its dots, so the
                // row↔dot linking keeps working. The base's data-dt-row
                // would be the index into the array as passed (the
                // date-sorted display order), so the map goes by object.
                var rowIdx = new Map();
                modalEntries.forEach(function (e, i) { rowIdx.set(e, i); });
                // date-asc is the order this table has always shown. The
                // base only APPLIES state.sort (a user sort); defaultSort
                // merely marks the initial aria-sort, so the rows are
                // passed pre-sorted — every base table's contract. The
                // same defaultSort is also what wireTable's toggle falls
                // back to while no user sort is active, so a FIRST click
                // on Dato flips to desc (the table already shows asc)
                // instead of re-applying asc.
                var displayRows = modalEntries.slice().sort(function (a, b) {
                    return (a.date || '') < (b.date || '') ? -1 : 1;
                });
                var tableOpts = {
                    columns: StandplassPersonModal.resultsTableColumns(),
                    defaultSort: { key: 'date', dir: 'asc' }
                };
                host.innerHTML = StandplassDataTable.renderTable('person-results', {
                    columns: tableOpts.columns,
                    rows: displayRows,
                    ariaLabel: 'Resultater for ' + modalDisplayName,
                    defaultSort: tableOpts.defaultSort,
                    rowAttrs: function (row) {
                        return 'data-idx="' + rowIdx.get(row) + '" tabindex="-1"'
                            + ' aria-label="Klikk for å markere resultatet i grafen"';
                    }
                }, { sort: tableSort });
                if (!modalEntries.length) {
                    var tbody = host.querySelector('tbody');
                    if (tbody) { tbody.innerHTML = '<tr><td colspan="7">Ingen resultater.</td></tr>'; }
                    return;
                }
                StandplassDataTable.wireTable(modalEl, 'person-results', tableOpts, {
                    onSortChange: function (sort) {
                        tableSort = sort;
                        renderPersonTable();
                        // Same focus-restoration convention as every
                        // other base table: the clicked header button was
                        // destroyed with the re-render.
                        var btn = modalEl.querySelector('table[data-dt-id="person-results"] .dt-sort-btn[data-dt-sort="' + sort.key + '"]');
                        if (btn) { btn.focus(); }
                    }
                // The 5th argument is the state the toggle computes
                // against — without it every click re-applies the
                // column's defaultDir and no direction ever flips.
                }, { sort: tableSort });
            }

            function refresh() {
                // The table and chart re-render below — the current
                // activation (row highlight, dot ring, p_entry) dies with
                // them. The open flow re-activates after refresh; filter
                // changes land unactivated.
                activeEntrySpec = null;
                syncPersonModalUrl();
                var merged = StandplassPersonModal.mergeYearEntries(entriesByYear, selectedYears);
                modalEntries = StandplassPersonModal.getFilteredEntries(merged, filters);
                renderPersonTable();
                drawChart();
            }

            function loadYearIfNeeded(year) {
                if (entriesByYear[year]) { return Promise.resolve(); }
                return fetchPersonYear(personId, year).then(function (entries) {
                    if (mySeq !== personOpenSeq) { return; }
                    entriesByYear[year] = entries;
                });
            }

            // The tab pair lives in the fixed header, not the scrollable
            // body: the open-from-row activation scrolls the chart into
            // view, which would push a body-mounted pair out of sight
            // (owner QA). HeaderExtras slot on showModal. Meritter and
            // Skammekroken carry the house beta tag (nav-beta-tag, the
            // Mesterskap/Resultatfil convention) — it comes off when
            // the tabs leave beta.
            function personModalTabsMarkup() {
                return '<div class="program-toggle person-modal-tabs" role="group" aria-label="Visning">'
                    + '<button type="button" class="program-btn person-modal-tab-btn program-btn--active" data-person-tab="resultater" aria-pressed="true">Resultater</button>'
                    + '<button type="button" class="program-btn person-modal-tab-btn" data-person-tab="meritter" aria-pressed="false">Meritter<span class="nav-beta-tag" aria-hidden="true">beta</span></button>'
                    + '<button type="button" class="program-btn person-modal-tab-btn" data-person-tab="skammekroken" aria-pressed="false">Skammekroken<span class="nav-beta-tag" aria-hidden="true">beta</span></button>'
                    + '</div>';
            }

            function personModalBodyMarkup() {
                return '<div class="person-modal-tab-panel" id="' + cfg.idPrefix + '-person-tab-resultater">'
                    + '<div class="person-filters">'
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
                    + '<div class="person-table-scroll" id="' + cfg.idPrefix + '-person-table"></div>'
                    + '</div>'
                    + '<div class="person-modal-tab-panel" id="' + cfg.idPrefix + '-person-tab-meritter" hidden></div>'
                    + '<div class="person-modal-tab-panel" id="' + cfg.idPrefix + '-person-tab-skammekroken" hidden></div>';
            }

            // The Resultater/Meritter/Skammekroken tabs. The buttons
            // are fresh per open (showModal replaces the body), so
            // they're wired per open too; the active tab lives in the
            // DOM (button classes + panel hidden), every fresh open
            // starts on Resultater by markup default — unless the URL
            // deep-links another tab, which the open flow handles with
            // the returned switcher. Tab, and the shared branch filter
            // (ruling 7), sync to p_tab/p_branch (non-default only).
            // Panels re-render on every activation: the data is
            // instance-cached (no refetch), and a render-once panel
            // would go stale when the other tab's switcher moved the
            // shared branch state.
            function wirePersonTabs() {
                function wireBranchToggle(panel, rerender) {
                    Array.prototype.forEach.call(
                        panel.querySelectorAll('.person-meritt-branch-btn'),
                        function (btn) {
                            btn.addEventListener('click', function () {
                                merittBranch = btn.getAttribute('data-branch') || null;
                                rerender();
                                syncCurrentPersonModalUrl();
                            });
                        });
                }
                function renderMerittPanel(panel) {
                    panel.innerHTML = '<p class="ranking-status-msg">Laster mesterskapsdata…</p>';
                    ensureMestereEntries().then(function (entries) {
                        if (mySeq !== personOpenSeq) { return; }
                        if (!entries.length) {
                            panel.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste mesterskapsdata.</p>';
                            return;
                        }
                        var merits = StandplassMestereData.meritterForPerson(entries, personId);
                        panel.innerHTML = StandplassPersonModal.renderMeritterBody(merits, {
                            compLinks: !!cfg.onOpenResultfile,
                            branch: merittBranch
                        });
                        // The switcher buttons re-render the panel from
                        // the instance-cached entries — no refetch.
                        wireBranchToggle(panel, function () { renderMerittPanel(panel); });
                    });
                }
                function renderSkammekrokenPanel(panel) {
                    panel.innerHTML = '<p class="ranking-status-msg">Laster utfall…</p>';
                    ensureStatusEntries().then(function (entries) {
                        if (mySeq !== personOpenSeq) { return; }
                        if (!entries.length) {
                            panel.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste utfall.</p>';
                            return;
                        }
                        var statuses = StandplassPersonModal.collectStatusEntries(entries, personId);
                        panel.innerHTML = StandplassPersonModal.renderSkammekrokenBody(statuses, {
                            compLinks: !!cfg.onOpenResultfile,
                            branch: merittBranch
                        });
                        wireBranchToggle(panel, function () { renderSkammekrokenPanel(panel); });
                    });
                }
                function switchTab(tab) {
                    personTab = tab;
                    Array.prototype.forEach.call(
                        modalEl.querySelectorAll('.person-modal-tab-btn'),
                        function (b) {
                            var active = b.getAttribute('data-person-tab') === tab;
                            b.classList.toggle('program-btn--active', active);
                            b.setAttribute('aria-pressed', String(active));
                        });
                    id('-person-tab-resultater').hidden = tab !== 'resultater';
                    var merittPanel = id('-person-tab-meritter');
                    merittPanel.hidden = tab !== 'meritter';
                    var skamPanel = id('-person-tab-skammekroken');
                    skamPanel.hidden = tab !== 'skammekroken';
                    if (tab === 'meritter') { renderMerittPanel(merittPanel); }
                    if (tab === 'skammekroken') { renderSkammekrokenPanel(skamPanel); }
                    syncCurrentPersonModalUrl();
                }
                Array.prototype.forEach.call(
                    modalEl.querySelectorAll('.person-modal-tab-btn'),
                    function (btn) {
                        btn.addEventListener('click', function () {
                            switchTab(btn.getAttribute('data-person-tab'));
                        });
                    });
                return switchTab;
            }

            function toggleSetValue(current, v, checked) {
                var base = (current || []).slice();
                if (checked) { if (base.indexOf(v) < 0) { base.push(v); } } else { base = base.filter(function (x) { return x !== v; }); }
                return base;
            }

            // opts: { suffix, items, getSelected(), labelNone, labelEmpty?,
            //         searchable?, clearLabel?, selectAllLabel?,
            //         onToggle(v, checked), onClearAll(), onSelectAll?() }
            // The bulk pair sits above the list: "Merk alle" (when
            // selectAllLabel is passed) ticks every box, "Fjern alle"
            // unticks every box. Nothing picked means everything shown,
            // so a null/empty selection renders as zero boxes ticked —
            // and "Merk alle" is how you set up everything-EXCEPT
            // filtering: tick all, then untick the one you don't want.
            function mountFilterDropdown(opts) {
                var container = id(opts.suffix);
                if (liveDropdowns[opts.suffix]) { liveDropdowns[opts.suffix].destroy(); }
                if (container.parentElement.classList.contains('filter-group')) { container.parentElement.hidden = false; }
                container.innerHTML = '<button type="button" class="checkbox-dropdown-btn" aria-expanded="false"></button>'
                    + '<div class="checkbox-dropdown-panel" hidden role="group">'
                    + '<div class="checkbox-dropdown-bulk">'
                    + (opts.selectAllLabel ? '<button type="button" class="checkbox-dropdown-select-all">' + esc(opts.selectAllLabel) + '</button>' : '')
                    + '<button type="button" class="checkbox-dropdown-clear-all">' + esc(opts.clearLabel || 'Fjern alle') + '</button>'
                    + '</div>'
                    + '<ul class="checkbox-dropdown-list"></ul></div>';
                var dropdown = StandplassFilterWidgets.makeCheckboxDropdown({
                    btn: container.querySelector('.checkbox-dropdown-btn'), panel: container.querySelector('.checkbox-dropdown-panel'),
                    list: container.querySelector('.checkbox-dropdown-list'), clearAllBtn: container.querySelector('.checkbox-dropdown-clear-all'),
                    selectAllBtn: container.querySelector('.checkbox-dropdown-select-all'),
                    labelNone: opts.labelNone,
                    // Only the year dropdown passes labelEmpty — its zero
                    // state genuinely means nothing. The value filters'
                    // zero state means everything, which labelNone already
                    // says truthfully.
                    labelEmpty: opts.labelEmpty,
                    searchable: !!opts.searchable,
                    getItems: function () { return opts.items.map(function (i) { return { id: i, name: i }; }); },
                    getSelected: function () { var s = opts.getSelected(); return s == null ? [] : s; },
                    onToggle: function (v, name, checked) { opts.onToggle(v, checked); dropdown.rebuild(); },
                    onClearAll: function () { opts.onClearAll(); dropdown.rebuild(); },
                    onSelectAll: opts.onSelectAll ? function () { opts.onSelectAll(); dropdown.rebuild(); } : null
                });
                dropdown.rebuild();
                liveDropdowns[opts.suffix] = dropdown;
                return dropdown;
            }

            function wireYearFilter() {
                var years = [];
                for (var y = cfg.firstYear; y <= cfg.currentYear; y++) { years.push(y); }
                mountFilterDropdown({
                    suffix: '-person-year-filter',
                    items: years.map(String),
                    getSelected: function () { return selectedYears.map(String); },
                    labelNone: 'Alle år',
                    onToggle: function (yearStr, checked) {
                        var yr = parseInt(yearStr, 10);
                        if (checked) { selectedYears.push(yr); } else { selectedYears = selectedYears.filter(function (v) { return v !== yr; }); }
                        loadYearIfNeeded(yr).then(function () {
                            if (mySeq !== personOpenSeq) { return; }
                            // Only the value-derived dropdowns need remounting
                            // when a year's data lands (their options are built
                            // from it). The Year dropdown's own list is static --
                            // remounting it too would close its open panel and
                            // drop keyboard focus on every year toggle.
                            wireValueDerivedFilters();
                            refresh();
                        });
                    },
                    // The year dropdown's bulk button is its reset: back to
                    // the single default year, not an untick-all — zero
                    // years would leave nothing to show at all. Its zero
                    // state IS "nothing", so it gets the honest
                    // labelEmpty; the value filters' zero state means
                    // everything and keeps labelNone.
                    onClearAll: function () { selectedYears = [cfg.defaultYear]; refresh(); },
                    labelEmpty: 'Ingen valgt',
                    clearLabel: 'Kun ' + cfg.defaultYear
                });
            }

            function wireValueDerivedFilters() {
                // Bulk semantics (nothing picked = everything shown):
                // "Fjern alle" unticks every box — the unfiltered state,
                // no URL param. "Merk alle" ticks every box — the view
                // stays everything until an untick narrows it, which is
                // the shortcut for everything-EXCEPT filtering.
                if (knownValues('competitionType').length > 1) {
                    mountFilterDropdown({
                        suffix: '-person-type-filter',
                        items: knownValues('competitionType'),
                        getSelected: function () { return filters.types; },
                        labelNone: 'Alle stevnetyper',
                        clearLabel: 'Fjern alle',
                        selectAllLabel: 'Merk alle',
                        onToggle: function (v, checked) { filters.types = toggleSetValue(filters.types, v, checked); refresh(); },
                        onClearAll: function () { filters.types = []; refresh(); },
                        onSelectAll: function () { filters.types = knownValues('competitionType'); refresh(); }
                    });
                }
                if (knownValues('discipline').length > 1) {
                    mountFilterDropdown({
                        suffix: '-person-disc-filter',
                        items: knownValues('discipline'),
                        getSelected: function () { return filters.discs; },
                        labelNone: 'Alle øvelser',
                        clearLabel: 'Fjern alle',
                        selectAllLabel: 'Merk alle',
                        searchable: true,
                        onToggle: function (v, checked) { filters.discs = toggleSetValue(filters.discs, v, checked); refresh(); },
                        onClearAll: function () { filters.discs = []; refresh(); },
                        onSelectAll: function () { filters.discs = knownValues('discipline'); refresh(); }
                    });
                }
                if (knownValues('class').length > 1) {
                    mountFilterDropdown({
                        suffix: '-person-class-filter',
                        items: knownValues('class'),
                        getSelected: function () { return filters.classes; },
                        labelNone: 'Alle klasser',
                        clearLabel: 'Fjern alle',
                        selectAllLabel: 'Merk alle',
                        onToggle: function (v, checked) { filters.classes = toggleSetValue(filters.classes, v, checked); refresh(); },
                        onClearAll: function () { filters.classes = []; refresh(); },
                        onSelectAll: function () { filters.classes = knownValues('class'); refresh(); }
                    });
                }
            }

            function wirePersonModalFilters() {
                wireYearFilter();
                wireValueDerivedFilters();
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
                modalDisplayName = resolvedName || modalDisplayName;
                showModal(esc(resolvedName || 'Ukjent skytter'), personModalBodyMarkup(), personModalTabsMarkup());
                wirePersonModalFilters();
                var switchTab = wirePersonTabs();
                if (personTab === 'meritter') { switchTab('meritter'); }
                if (personTab === 'skammekroken') { switchTab('skammekroken'); }
                // Ruling 4 (skammekroken design): Meritter and Skammekroken
                // grey out and go inert when this person has nothing for
                // them. Emptiness is only known once the indexes load, so
                // the grey-out lands a beat after open; deep links still
                // switch programmatically (inert blocks user events only).
                ensureMestereEntries().then(function (entries) {
                    if (mySeq !== personOpenSeq) { return; }
                    // All fetches failed → unknown, not empty: keep the
                    // tab clickable (its panel carries the error
                    // message); grey out only a known-empty person.
                    setTabAvailable(
                        modalEl.querySelector('.person-modal-tab-btn[data-person-tab="meritter"]'),
                        !entries.length
                        || StandplassMestereData.meritterForPerson(entries, personId).length > 0);
                });
                ensureStatusEntries().then(function (entries) {
                    if (mySeq !== personOpenSeq) { return; }
                    setTabAvailable(
                        modalEl.querySelector('.person-modal-tab-btn[data-person-tab="skammekroken"]'),
                        !entries.length
                        || StandplassPersonModal.collectStatusEntries(entries, personId).length > 0);
                });
                refresh();
                if (initialEntry) { activateInitialEntry(initialEntry); }
            }, function () { showModal('Feil', '<p>Kunne ikke laste resultater.</p>'); });
        }

        wireGlobalEscapeHandler();
        ensureModalEl();
        // Meritter-tab comp links (delegated once on the persistent
        // modal element -- the buttons are re-rendered per person).
        // Both tabs' comp links open the host's resultfile modal
        // (owner ruling 2026-11-27: the parsed file is the evidence
        // for merits and statuses alike; the comp modal stays a
        // main-table affordance); the guard keeps a stray click a
        // no-op even if markup changed underneath.
        modalEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.person-meritt-comp');
            if (!btn || !cfg.onOpenResultfile) { return; }
            cfg.onOpenResultfile(btn.getAttribute('data-comp-id'),
                btn.getAttribute('data-comp-year'),
                btn.getAttribute('data-comp-title'),
                btn.getAttribute('data-comp-branch'),
                btn.getAttribute('data-comp-file'));
        });
        // Skammekroken-tab comp links (delegated once on the persistent
        // modal element, same guard pattern): the host's resultfile
        // modal opens with everything it needs — the resultFileUrl
        // feeds its PDF fallback, and data-comp-branch lets a
        // cross-branch row resolve its detaljer base.
        modalEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.person-utfall-comp');
            if (!btn || !cfg.onOpenResultfile) { return; }
            cfg.onOpenResultfile(btn.getAttribute('data-comp-id'),
                btn.getAttribute('data-comp-year'),
                btn.getAttribute('data-comp-title'),
                btn.getAttribute('data-comp-branch'),
                btn.getAttribute('data-comp-file'));
        });
        modalEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.person-chart-toggle');
            if (!btn) { return; }
            modalMetric = btn.getAttribute('data-metric');
            Array.prototype.forEach.call(modalEl.querySelectorAll('.person-chart-toggle'), function (b) {
                var isActive = b === btn;
                b.classList.toggle('program-btn--active', isActive);
                b.setAttribute('aria-pressed', String(isActive));
            });
            // The chart re-renders (killing any linked-dot ring), so the
            // row tint must not linger either — nor the p_entry param.
            clearRowHighlight();
            activeEntrySpec = null;
            syncCurrentPersonModalUrl();
            drawChart();
        });

        // Row↔dot linking. Chart-side activation (click/tap/keyboard on the
        // chart) lives in person-modal.js's chart wiring and reports back
        // through onDotSelect; this side owns the reverse direction (row
        // click → chart) plus the row highlight itself. Both delegated on
        // the persistent modal element so they survive every refresh. Dots
        // remain the keyboard entry point: rows are tabindex="-1", focused
        // programmatically only when a dot is activated from the chart.
        function clearRowHighlight() {
            Array.prototype.forEach.call(modalEl.querySelectorAll('.person-row-highlight'), function (el) {
                el.classList.remove('person-row-highlight');
            });
        }
        function onChartDotSelected(dotEl) {
            clearRowHighlight();
            // Every activation path reports here (chart dot click,
            // table row click via activateDot, open-from-row/URL) — so the
            // p_entry param tracks the activation, and deactivation
            // (dotEl null) strips it.
            activeEntrySpec = null;
            if (dotEl) {
                activeEntrySpec = entrySpecOf(
                    modalEntries[parseInt(dotEl.getAttribute('data-idx'), 10)]);
                var row = modalEl.querySelector('tr[data-idx="' + dotEl.getAttribute('data-idx') + '"]');
                if (row) {
                    row.classList.add('person-row-highlight');
                    row.scrollIntoView({ block: 'nearest' });
                    row.focus();
                }
            }
            syncCurrentPersonModalUrl();
        }
        modalEl.addEventListener('click', function (e) {
            var row = e.target.closest('tr[data-idx]');
            if (!row) { return; }
            // Rows whose entry has no dot on the current metric's chart
            // resolve to nothing inside the chart — activateDot then clears
            // the active state instead of silently leaving a stale one.
            if (chartHandle) { chartHandle.activateDot(row.getAttribute('data-idx')); }
        });

        function open(triggerEl, opts) {
            modalOpener = triggerEl || null;
            // opts.year opens the modal on a specific year — a resultfile
            // member click resolves its entry on the comp's year; without
            // it every open starts on the page's default year. The year
            // rides renderPersonModal's openYear slot (urlFilters carries
            // no years on this path, and p_year is only a deep-link input).
            cfg.urlState.setSearch(StandplassPersonModal.buildPersonUrl(cfg.urlState.getSearch(), opts.personId, opts.year || cfg.defaultYear));
            // opts.metric rides renderPersonModal's urlFilters slot — the
            // same path a p_metric deep link takes — so an entry point can
            // ask for a specific chart (a placements leaderboard opens
            // Plassering). Without it every fresh open starts on the
            // page's default chart.
            renderPersonModal(opts.personId, opts.personName, opts.initialDisc || null,
                opts.metric ? { metric: opts.metric } : null, opts.entry || null,
                opts.year || null);
        }

        function openFromUrl() {
            var personState = StandplassPersonModal.parsePersonFromUrl(cfg.urlState.getSearch());
            if (personState) {
                var urlFilters = StandplassPersonModal.parsePersonFilterParams(cfg.urlState.getSearch());
                // A p_entry deep link activates its entry after the data
                // lands, exactly like opening from a clicked result row.
                renderPersonModal(personState.personId, null, null, urlFilters,
                    urlFilters.entry || null);
            }
        }

        // For a host page whose data source changes at runtime (e.g. klubb-page.js's
        // Felt/Bane toggle) -- stevner-page.js's own felt/bane usage never calls this,
        // since its program is page-fixed. Clears the personId+year cache (entries from
        // the old program would otherwise be served stale) and updates the metric
        // default for the next modal opened fresh.
        function reset(newCfg) {
            if (newCfg && newCfg.initialMetric) { modalMetric = newCfg.initialMetric; cfg.initialMetric = newCfg.initialMetric; }
            if (newCfg && newCfg.defaultYear) { cfg.defaultYear = newCfg.defaultYear; }
            personYearCache = {};
            // Bumping this makes any render already in flight under the old
            // sequence number (see renderPersonModal's own mySeq checks)
            // stale, so it bails instead of rendering into a modal that's
            // since moved on -- same guard variable/pattern renderPersonModal
            // already uses against overlapping open() calls.
            personOpenSeq++;
        }

        return { open: open, close: close, openFromUrl: openFromUrl, reset: reset };
    }

    return { create: create };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassPersonModalController;
}
