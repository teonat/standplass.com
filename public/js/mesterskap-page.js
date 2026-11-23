// public/js/mesterskap-page.js
//
// The /mesterskap/{nm,dm,km} pages: felt/bane toggle + year picker over
// the per-year mestere indexes, one dense podium table per page (the
// norgesfelt-search pattern): program-ordered rows, filter row above
// (øvelse, klasse, krets — region on km, krets→distrikt finder on dm —
// klubb, navn, type), group rows by region (krets on km, distrikt on
// dm, flat on nm), person links opening the person modal. The pure
// helpers (resolveInitial, grenDisplayName, resolveFilters,
// filterParams, filterBarMarkup, tableSpecFor, emptyYearCard) are
// node-testable; init() is the DOM wiring, verified by manual QA
// (house rule).
var StandplassMesterskapPage = (function () {
    'use strict';

    var FIRST_YEAR = 2021;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function grenDisplayName(gren) {
        return gren === 'bane' ? 'baneskyting' : 'feltskyting';
    }

    // '?gren=bane&ar=2024' → {gren, ar} with felt/current-year defaults;
    // invalid or out-of-range values fall back to the defaults.
    function resolveInitial(search, currentYear) {
        var params = new URLSearchParams(search || '');
        var gren = params.get('gren') === 'bane' ? 'bane' : 'felt';
        var ar = parseInt(params.get('ar'), 10);
        if (isNaN(ar) || ar < FIRST_YEAR || ar > currentYear) { ar = currentYear; }
        return { gren: gren, ar: ar };
    }

    // The filter URL codec. Params: ovelse, class, krets, distrikt are
    // comma-joined, per-element-encoded lists (the felt/bane disc
    // convention); klubb, name, type are single values. resolveFilters
    // parses, filterParams inverts — the page writes pairs via
    // URLSearchParams.set so the browser round-trip is exact.
    function resolveFilters(search) {
        var params = new URLSearchParams(search || '');
        var type = params.get('type');
        if (type !== 'individuelt' && type !== 'lag') { type = ''; }
        return {
            ovelse: StandplassFormat.decodeIdList(params.get('ovelse')),
            klasse: StandplassFormat.decodeIdList(params.get('class')),
            medal: StandplassFormat.decodeIdList(params.get('medal')),
            krets: StandplassFormat.decodeIdList(params.get('krets')),
            distrikt: StandplassFormat.decodeIdList(params.get('distrikt')),
            klubb: params.get('klubb') || '',
            navn: params.get('name') || '',
            type: type
        };
    }

    function filterParams(filters) {
        var f = filters || {};
        var out = [];
        if (f.ovelse && f.ovelse.length) { out.push(['ovelse', StandplassFormat.encodeIdList(f.ovelse)]); }
        if (f.klasse && f.klasse.length) { out.push(['class', StandplassFormat.encodeIdList(f.klasse)]); }
        if (f.medal && f.medal.length) { out.push(['medal', StandplassFormat.encodeIdList(f.medal)]); }
        if (f.krets && f.krets.length) { out.push(['krets', StandplassFormat.encodeIdList(f.krets)]); }
        if (f.distrikt && f.distrikt.length) { out.push(['distrikt', StandplassFormat.encodeIdList(f.distrikt)]); }
        if (f.klubb) { out.push(['klubb', f.klubb]); }
        if (f.navn) { out.push(['name', f.navn]); }
        if (f.type) { out.push(['type', f.type]); }
        return out;
    }

    // The filter row, JS-built (the felt/bane embed pattern — one
    // implementation behind all three pages, scope differences included:
    // nm has no krets filter, dm's krets filter doubles as the
    // krets→distrikt finder). Static markup only — widget items are
    // injected at runtime through textContent, no escaping surface.
    function dropdownGroup(param, label, listLabel) {
        return '<div class="filter-group">'
            + '<label>' + label + '</label>'
            + '<div class="checkbox-dropdown">'
            + '<button type="button" id="mesterskap-' + param + '-btn" class="checkbox-dropdown-btn"'
            + ' aria-expanded="false" aria-controls="mesterskap-' + param + '-panel">' + listLabel + '</button>'
            + '<div class="checkbox-dropdown-panel" id="mesterskap-' + param + '-panel" hidden role="group">'
            + '<div class="checkbox-dropdown-bulk">'
            + '<button type="button" id="mesterskap-' + param + '-select" class="checkbox-dropdown-select-all">Merk alle</button>'
            + '<button type="button" id="mesterskap-' + param + '-clear" class="checkbox-dropdown-clear-all">Fjern alle</button>'
            + '</div>'
            + '<ul id="mesterskap-' + param + '-list" class="checkbox-dropdown-list" aria-label="Velg ' + label.toLowerCase() + '"></ul>'
            + '</div>'
            + '</div>'
            + '</div>';
    }

    function filterBarMarkup(scope) {
        var out = [];
        out.push(dropdownGroup('ovelse', 'Øvelse', 'Alle øvelser'));
        out.push(dropdownGroup('klasse', 'Klasse', 'Alle klasser'));
        out.push(dropdownGroup('medal', 'Medalje', 'Alle medaljer'));
        if (scope === 'km') {
            out.push(dropdownGroup('krets', 'Krets', 'Alle kretser'));
        }
        if (scope !== 'nm') {
            out.push(dropdownGroup('distrikt', 'Distrikt', 'Alle distrikter'));
        }
        out.push('<div class="filter-group">'
            + '<label>Klubb</label>'
            + '<ul class="tag-list" id="mesterskap-klubb-tags" aria-label="Valgte klubber" aria-live="polite"></ul>'
            + '<div class="autocomplete-wrap" id="mesterskap-klubb-wrap">'
            + '<input type="text" id="mesterskap-klubb-input" class="filter-input" autocomplete="off"'
            + ' aria-autocomplete="list" aria-controls="mesterskap-klubb-list" aria-expanded="false" placeholder="Søk klubb…">'
            + '<button type="button" class="combo-clear" id="mesterskap-klubb-clear" aria-label="Fjern klubb">×</button>'
            + '<ul class="autocomplete-list" id="mesterskap-klubb-list" role="listbox" aria-label="Klubber" hidden></ul>'
            + '</div>'
            + '</div>');
        out.push('<div class="filter-group">'
            + '<label for="mesterskap-navn">Navn</label>'
            + '<input type="text" id="mesterskap-navn" class="filter-input" autocomplete="off" placeholder="Søk navn…">'
            + '</div>');
        out.push('<div class="filter-group">'
            + '<label for="mesterskap-type">Type</label>'
            + '<select id="mesterskap-type">'
            + '<option value="">Alle</option>'
            + '<option value="individuelt">Individuelt</option>'
            + '<option value="lag">Lag</option>'
            + '</select>'
            + '</div>');
        out.push('<div class="filter-group">'
            + '<label for="mesterskap-rows">Rader</label>'
            + '<select id="mesterskap-rows">'
            + '<option value="15">15</option>'
            + '<option value="30" selected>30</option>'
            + '<option value="50">50</option>'
            + '<option value="all">Alle</option>'
            + '</select>'
            + '</div>');
        out.push('<button type="button" class="clear-all-filters-btn" id="mesterskap-clear-filters">Nullstill filtre</button>');
        return out.join('');
    }

    // The Navn column: a person-modal button on person rows, escaped
    // plain text otherwise. Lag member rows link like person rows and
    // carry the lag name as a muted sub-line (owner ruling 2026-11-23
    // — no dedicated Lag column); fallback team rows keep the lag tag
    // so they don't read as club-less persons (owner QA) — the house
    // raw-cell person-link pattern.
    function personCell(row) {
        if (row.lag != null) {
            var label = row.personId
                ? '<button type="button" class="stevner-person-btn link-btn"'
                    + ' data-person-id="' + esc(row.personId)
                    + '" data-person-name="' + esc(row.name) + '">'
                    + esc(row.name) + '</button>'
                : esc(row.name);
            return label
                + '<span class="mesterskap-lag-sub">Lag: '
                + esc(row.lag) + '</span>';
        }
        if (row.personId && !row.isTeam) {
            return '<button type="button" class="stevner-person-btn link-btn"'
                + ' data-person-id="' + esc(row.personId)
                + '" data-person-name="' + esc(row.name) + '">'
                + esc(row.name) + '</button>';
        }
        if (row.isTeam) {
            return esc(row.name)
                + ' <span class="mesterskap-lag-tag">lag</span>';
        }
        return esc(row.name);
    }

    // Region group rows over flattened podium rows — the groupByRegion
    // policy (normalize for grouping, display spelling kept, groups
    // alphabetical, null region in a final 'Ukjent region' bucket).
    function rowsToGroups(rows, key) {
        var groups = [];
        var byKey = {};
        var unknown = [];
        (rows || []).forEach(function (r) {
            var raw = r[key];
            if (raw == null || raw === '') { unknown.push(r); return; }
            var norm = StandplassMestereData.normalizeRegionName(raw);
            if (!Object.prototype.hasOwnProperty.call(byKey, norm)) {
                byKey[norm] = { label: raw, rows: [] };
                groups.push(byKey[norm]);
            }
            byKey[norm].rows.push(r);
        });
        groups.sort(function (a, b) { return a.label.localeCompare(b.label, 'no'); });
        if (unknown.length) { groups.push({ label: 'Ukjent region', rows: unknown }); }
        return groups;
    }

    // The dense podium table: one row per medal, everything else a
    // column or a filter. Navn leads (owner ruling — the person is the
    // row's identity). Øvelse and Medalje display names but sort by
    // their rank fields (the base compares cells as strings — a name
    // key cannot sort Gull first). Team rows show the club embedded in
    // the lag name in their Klubb cell (display-only — row.club stays
    // null, so club filters and stats stay individual-only). The
    // region column (krets on km, distrikt on dm) is defaultHidden
    // behind its group row; nm carries neither column nor grouping.
    // hideBelow tiers follow the norgesfelt search table (700/900).
    function tableSpecFor(rows, scope) {
        rows = rows || [];
        var regionKey = scope === 'km' ? 'region' : scope === 'dm' ? 'distrikt' : null;
        var columns = [
            { key: 'name', label: 'Navn', sortable: true, defaultDir: 'asc', raw: true, cell: personCell },
            {
                key: 'ovelseRank', label: 'Øvelse', sortable: true, defaultDir: 'asc', hideBelow: 700,
                cell: function (row) { return row.ovelse; }
            },
            {
                key: 'klasse', label: 'Klasse', align: 'center', sortable: true, defaultDir: 'asc',
                cell: function (row) { return row.klasse == null ? '–' : row.klasse; }
            },
            {
                key: 'medalRank', label: 'Medalje', align: 'center', sortable: true, defaultDir: 'asc',
                cellClass: 'medal-cell', cell: function (row) { return row.medal; }
            },
            {
                key: 'club', label: 'Klubb', sortable: true, defaultDir: 'asc', hideBelow: 900,
                cell: function (row) {
                    if (row.club != null) { return row.club; }
                    if (row.isTeam) {
                        return StandplassMestereData.teamClub(
                            row.lag != null ? row.lag : row.name);
                    }
                    return '–';
                }
            }
        ];
        if (rows.some(function (r) { return r.sum != null; })) {
            columns.push({
                key: 'sum', label: 'Sum', align: 'right', sortable: true, defaultDir: 'desc',
                cell: function (row) { return row.sum == null ? '–' : String(row.sum); }
            });
        }
        if (regionKey) {
            columns.push({
                key: regionKey, label: scope === 'km' ? 'Krets' : 'Distrikt',
                sortable: true, defaultDir: 'asc', defaultHidden: true,
                cell: function (row) { return row[regionKey] == null ? '–' : row[regionKey]; }
            });
        }
        columns.push({
            key: 'date', label: 'Dato', sortable: true, defaultDir: 'desc', defaultHidden: true,
            cell: function (row) { return row.date == null ? '–' : row.date; }
        });
        columns.push({
            key: 'organizer', label: 'Arrangør', sortable: true, defaultDir: 'asc', defaultHidden: true,
            cell: function (row) { return row.organizer == null ? '–' : row.organizer; }
        });
        return {
            columns: columns,
            rows: rows,
            groupRows: regionKey ? function (rs) { return rowsToGroups(rs, regionKey); } : null,
            wrapClass: 'ranking-card-table-wrap club-stats-list-scroll',
            picker: { buttonLabel: 'Kolonner' },
            ariaLabel: 'Mesterskapspodium'
        };
    }

    // The surgical re-render shape: columns/rows/groupRows/ariaLabel
    // only — no wrapClass (re-wrapping nests scroll regions) and no
    // picker (the surviving toolbar button keeps its live wiring; a
    // re-wire would stack handlers on it).
    function bareSpec(spec) {
        return {
            columns: spec.columns,
            rows: spec.rows,
            groupRows: spec.groupRows,
            ariaLabel: spec.ariaLabel
        };
    }

    // The message-only empty card for a year that failed to load or
    // holds no championships — never a bare string.
    function emptyYearCard(gren, ar, failed) {
        var msg = failed
            ? 'Kunne ikke laste mesterskapsdata for ' + grenDisplayName(gren) + ' ' + ar + '.'
            : 'Ingen mesterskap funnet for ' + grenDisplayName(gren) + ' ' + ar + '.';
        return '<div class="ranking-card"><div class="ranking-card-header">'
            + '<h3 class="ranking-card-title">' + ar + '</h3></div>'
            + '<p class="ranking-empty">' + msg + '</p></div>';
    }

    function init(config) {
        config = config || {};
        var root = config.root || document;
        var scope = config.scope;
        var urlState = config.urlState;
        var CURRENT_YEAR = new Date().getUTCFullYear();
        var FW = StandplassFilterWidgets;

        var initial = resolveInitial(urlState.getSearch(), CURRENT_YEAR);
        var gren = initial.gren;
        var ar = initial.ar;

        var statusEl = root.getElementById('mesterskap-status');
        var contentEl = root.getElementById('mesterskap-content');
        var filterbarEl = root.getElementById('mesterskap-filterbar');
        var statsEl = root.getElementById('mesterskap-stats');
        var feltBtn = root.getElementById('mesterskap-toggle-felt');
        var baneBtn = root.getElementById('mesterskap-toggle-bane');
        var yearSelect = root.getElementById('mesterskap-year-select');

        var fetcher = StandplassData.createFetcher(window.fetch.bind(window));

        var personModal = StandplassPersonModalController.create({
            idPrefix: 'mesterskap',
            root: root,
            urlState: urlState,
            fetchEntriesForYear: function (personId, year) {
                var dataBase = gren === 'felt' ? '/data/felt' : '/data/bane';
                return fetcher.fetchYear(dataBase, year).then(function (yearData) {
                    return StandplassStevnerPage.flattenRows(yearData)
                        .filter(function (r) { return r.personId === personId; })
                        .map(function (r) {
                            return { date: r.date, discipline: r.discipline, class: r.class,
                                competitionType: r.competitionType, competition: r.competition,
                                position: r.position, score: r.score, rankingScore: r.rankingScore, name: r.name };
                        });
                });
            },
            defaultYear: ar,
            firstYear: FIRST_YEAR,
            currentYear: CURRENT_YEAR,
            initialMetric: gren === 'bane' ? 'score' : 'rankingScore'
        });

        // Delegated person-modal wiring on the content area — above the
        // surgically re-rendered table, exactly the klubb-page pattern.
        contentEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-person-btn');
            if (!btn) { return; }
            personModal.open(btn, {
                personId: btn.dataset.personId,
                personName: btn.dataset.personName,
                initialDisc: null
            });
        });
        personModal.openFromUrl();

        function setUrlParam(key, value) {
            var qs = new URLSearchParams(urlState.getSearch());
            qs.set(key, value);
            urlState.setSearch(qs.toString());
        }

        // Year select: 2021 → current year, newest first.
        for (var y = CURRENT_YEAR; y >= FIRST_YEAR; y--) {
            var opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            yearSelect.appendChild(opt);
        }
        yearSelect.value = String(ar);
        yearSelect.addEventListener('change', function () {
            ar = parseInt(yearSelect.value, 10);
            personModal.reset({ defaultYear: ar });
            setUrlParam('ar', String(ar));
            load();
        });

        // ── Filter state ─────────────────────────────────────────────
        // Survives year switches (stale values filter to a visible zero,
        // never a silent blank); reset on gren switches — the øvelse
        // universe differs between felt and bane entirely.
        var allRows = [];
        var filters = resolveFilters(urlState.getSearch());
        // krets is km-only (the championship's own krets); a stale
        // ?krets= param on dm/nm never round-trips.
        if (scope !== 'km') { filters.krets = []; }
        var emptyFilters = function () {
            return { ovelse: [], klasse: [], medal: [], krets: [], distrikt: [], klubb: '', navn: '', type: '' };
        };

        // Felt/bane toggle, reflecting a ?gren=bane initial state.
        function reflectGren() {
            feltBtn.classList.toggle('program-btn--active', gren === 'felt');
            feltBtn.setAttribute('aria-pressed', String(gren === 'felt'));
            baneBtn.classList.toggle('program-btn--active', gren === 'bane');
            baneBtn.setAttribute('aria-pressed', String(gren === 'bane'));
        }
        function setGren(next) {
            gren = next;
            reflectGren();
            personModal.reset({ initialMetric: gren === 'bane' ? 'score' : 'rankingScore' });
            filters = emptyFilters();
            if (barBuilt) {
                navnInput.value = '';
                typeSelect.value = '';
                rebuildWidgets();
            }
            setUrlParam('gren', gren);
            load();
        }
        reflectGren();
        feltBtn.addEventListener('click', function () { if (gren !== 'felt') { setGren('felt'); } });
        baneBtn.addEventListener('click', function () { if (gren !== 'bane') { setGren('bane'); } });

        // ── The filter bar (built once, items follow the loaded year) ─

        var barBuilt = false;
        var navnInput = null;
        var typeSelect = null;
        var dropdowns = [];   // every checkbox dropdown, for Nullstill
        var combos = [];      // the klubb combo

        function distinctSorted(key) {
            var seen = {};
            allRows.forEach(function (r) { if (r[key] != null) { seen[r[key]] = true; } });
            return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'no'); });
        }

        function wireDropdown(param, labelAll, itemsFn, selKey) {
            var dropdown;
            dropdown = FW.makeCheckboxDropdown({
                btn: root.getElementById('mesterskap-' + param + '-btn'),
                panel: root.getElementById('mesterskap-' + param + '-panel'),
                list: root.getElementById('mesterskap-' + param + '-list'),
                clearAllBtn: root.getElementById('mesterskap-' + param + '-clear'),
                selectAllBtn: root.getElementById('mesterskap-' + param + '-select'),
                labelNone: labelAll,
                getItems: function () {
                    return itemsFn().map(function (n) { return { id: n, name: n }; });
                },
                getSelected: function () { return filters[selKey]; },
                onToggle: function (id, name, checked) {
                    if (checked) { filters[selKey].push(id); }
                    else {
                        filters[selKey] = filters[selKey].filter(function (x) { return x !== id; });
                    }
                    dropdown.rebuild();
                    applyFilters();
                },
                onClearAll: function () {
                    filters[selKey] = [];
                    dropdown.rebuild();
                    applyFilters();
                },
                onSelectAll: function () {
                    filters[selKey] = itemsFn().slice();
                    dropdown.rebuild();
                    applyFilters();
                }
            });
            dropdowns.push(dropdown);
            return dropdown;
        }

        var klubbCombo = null;

        function ensureFilterBar() {
            if (barBuilt) { return; }
            barBuilt = true;
            filterbarEl.innerHTML = filterBarMarkup(scope);

            wireDropdown('ovelse', 'Alle øvelser', function () { return distinctSorted('ovelse'); }, 'ovelse');
            wireDropdown('klasse', 'Alle klasser', function () { return distinctSorted('klasse'); }, 'klasse');
            // Fixed medal order — Gull first is the meaningful order,
            // not collation (which would put Bronse first).
            wireDropdown('medal', 'Alle medaljer', function () { return ['Gull', 'Sølv', 'Bronse']; }, 'medal');
            if (scope === 'km') {
                wireDropdown('krets', 'Alle kretser', function () { return distinctSorted('region'); }, 'krets');
            }
            if (scope !== 'nm') {
                wireDropdown('distrikt', 'Alle distrikter', function () { return distinctSorted('distrikt'); }, 'distrikt');
            }

            klubbCombo = FW.makeTagComboHandlers({
                input: root.getElementById('mesterskap-klubb-input'),
                list: root.getElementById('mesterskap-klubb-list'),
                tagsEl: root.getElementById('mesterskap-klubb-tags'),
                clear: root.getElementById('mesterskap-klubb-clear'),
                getItems: function (q) {
                    var lower = (q || '').toLowerCase();
                    return distinctSorted('club')
                        .filter(function (c) { return c !== filters.klubb; })
                        .filter(function (c) { return !lower || c.toLowerCase().indexOf(lower) >= 0; })
                        .map(function (c) { return { id: c, name: c }; });
                },
                getSelected: function () {
                    return filters.klubb ? [{ id: filters.klubb, name: filters.klubb }] : [];
                },
                onSelect: function (id) {
                    filters.klubb = id;
                    klubbCombo.rebuild();
                    applyFilters();
                },
                onRemove: function () {
                    filters.klubb = '';
                    klubbCombo.rebuild();
                    applyFilters();
                },
                onClearAll: function () {
                    filters.klubb = '';
                    klubbCombo.rebuild();
                    applyFilters();
                }
            });
            combos.push(klubbCombo);

            navnInput = root.getElementById('mesterskap-navn');
            navnInput.value = filters.navn;
            var navnTimer = null;
            navnInput.addEventListener('input', function () {
                clearTimeout(navnTimer);
                navnTimer = setTimeout(function () {
                    filters.navn = navnInput.value.trim();
                    applyFilters();
                }, 200);
            });

            typeSelect = root.getElementById('mesterskap-type');
            typeSelect.value = filters.type;
            typeSelect.addEventListener('change', function () {
                filters.type = typeSelect.value;
                applyFilters();
            });

            // Rader: the cap applies to the one scroll region on the
            // page; the var lives on the main element it sits inside.
            FW.wireRowsSelect({
                select: root.getElementById('mesterskap-rows'),
                contentEl: root.getElementById('mesterskap-root')
            });

            FW.wireClearAllFilters(root.getElementById('mesterskap-clear-filters'), [
                function () { filters.ovelse = []; },
                function () { filters.klasse = []; },
                function () { filters.medal = []; },
                function () { filters.krets = []; },
                function () { filters.distrikt = []; },
                function () { filters.klubb = ''; },
                function () { filters.navn = ''; navnInput.value = ''; },
                function () { filters.type = ''; typeSelect.value = ''; }
            ], dropdowns.concat(combos), applyFilters);
        }

        function rebuildWidgets() {
            dropdowns.forEach(function (w) { w.rebuild(); });
            combos.forEach(function (w) { w.rebuild(); });
        }

        // The URL always carries gren/ar; filter params only when set.
        function syncUrl() {
            var qs = new URLSearchParams(urlState.getSearch());
            qs.set('gren', gren);
            qs.set('ar', String(ar));
            ['ovelse', 'class', 'medal', 'krets', 'distrikt', 'klubb', 'name', 'type'].forEach(function (k) {
                qs.delete(k);
            });
            filterParams(filters).forEach(function (p) { qs.set(p[0], p[1]); });
            urlState.setSearch(qs.toString());
        }

        // The region filters read the rows' stamped championship
        // fields directly: krets scopes to the km championship's own
        // krets (km-only), distrikt to the distrikt on km and dm.
        function activeRegionFilters() {
            return {
                region: scope === 'km' ? filters.krets : [],
                distrikt: scope !== 'nm' ? filters.distrikt : []
            };
        }

        function applyFilters() {
            syncUrl();
            var rf = activeRegionFilters();
            var filtered = StandplassMestereData.filterPodiumRows(allRows, {
                ovelse: filters.ovelse,
                klasse: filters.klasse,
                medal: filters.medal,
                region: rf.region,
                distrikt: rf.distrikt,
                klubb: filters.klubb,
                navn: filters.navn,
                type: filters.type
            });
            renderStats(filtered);
            renderTable(filtered);
        }

        function plural(n, one, many) {
            return n + ' ' + (n === 1 ? one : many);
        }

        function renderStats(rows) {
            var s = StandplassMestereData.statsFor(rows, scope);
            var parts = [
                plural(s.medaljer, 'medalje', 'medaljer'),
                plural(s.ovselser, 'øvelse', 'øvelser')
            ];
            if (scope === 'km') { parts.push(plural(s.regioner, 'krets', 'kretser')); }
            if (scope === 'dm') { parts.push(plural(s.regioner, 'distrikt', 'distrikter')); }
            parts.push(plural(s.klubber, 'klubb', 'klubber'));
            statsEl.textContent = parts.join(' · ');
        }

        // One table per page. Sort state, column choices and the width
        // tier survive filter and year/gren re-renders — the same
        // session-state policy as the klubb leaderboard cards.
        var tableSort = null;
        var hiddenMap = {};       // picker state, synced in place
        var currentTier = computeWidthTier();
        var tableWire = null;     // the full wiring (incl. the picker)
        var spec = null;
        var TABLE_ID = 'mesterskap-podium';

        function syncHiddenMap(map, next) {
            Object.keys(map).forEach(function (k) { delete map[k]; });
            Object.keys(next || {}).forEach(function (k) { map[k] = next[k]; });
        }

        // norgesfelt's tier rule: the smallest crossed breakpoint wins
        // (tier T hides every column with hideBelow >= T).
        function computeWidthTier() {
            if (window.matchMedia('(max-width: 700px)').matches) { return 700; }
            if (window.matchMedia('(max-width: 900px)').matches) { return 900; }
            return null;
        }

        function tableState() {
            return { sort: tableSort, hidden: hiddenMap, runtimeHidden: [], widthTier: currentTier };
        }

        function renderTable(rows) {
            if (tableWire) { tableWire.destroy(); tableWire = null; }
            if (!rows.length) {
                spec = null;
                contentEl.innerHTML = '<p class="ranking-empty">Ingen rader matcher de valgte filtrene.</p>';
                return;
            }
            spec = tableSpecFor(rows, scope);
            contentEl.innerHTML = StandplassDataTable.renderTable(
                TABLE_ID, spec, tableState());
            wire(true);
        }

        function wire(initialWire) {
            var tableEl = contentEl.querySelector('table[data-dt-id="' + TABLE_ID + '"]');
            if (!tableEl || !spec) { return; }
            // The reduced re-wire after surgical replaces carries only
            // what the sort path reads — no picker, so the surviving
            // toolbar button's wiring (and an open dropdown panel)
            // stays untouched: the club-stats drilldown pattern.
            var wireSpec = initialWire ? spec : bareSpec(spec);
            if (initialWire && tableWire) { tableWire.destroy(); tableWire = null; }
            var wired = StandplassDataTable.wireTable(contentEl, TABLE_ID, wireSpec, {
                onSortChange: function (sort) {
                    tableSort = sort;
                    rerenderTable();
                    var btn = contentEl.querySelector(
                        'table[data-dt-id="' + TABLE_ID + '"] .dt-sort-btn[data-dt-sort="' + sort.key + '"]');
                    if (btn) { btn.focus(); }
                },
                onColumnsChange: function (hidden) {
                    syncHiddenMap(hiddenMap, hidden);
                    rerenderTable();
                }
            }, tableState());
            if (initialWire) { tableWire = wired; }
        }

        function rerenderTable() {
            // Surgical: replace only the table element with a BARE
            // table — re-wrapping would nest scroll regions and
            // re-emitting a toolbar would stack a second Kolonner
            // button (the club-stats drilldown lesson).
            var tableEl = contentEl.querySelector('table[data-dt-id="' + TABLE_ID + '"]');
            if (!tableEl || !spec) { return; }
            tableEl.outerHTML = StandplassDataTable.renderTable(
                TABLE_ID, bareSpec(spec), tableState());
            wire(false);
        }

        // Width tiers: re-render (surgically) when the viewport crosses
        // a hideBelow breakpoint; the picker's checkbox list rebuilds
        // on every open from the live state.
        [700, 900].forEach(function (t) {
            var mql = window.matchMedia('(max-width: ' + t + 'px)');
            var listener = function () {
                var next = computeWidthTier();
                if (next !== currentTier) {
                    currentTier = next;
                    rerenderTable();
                }
            };
            if (typeof mql.addEventListener === 'function') { mql.addEventListener('change', listener); }
            else if (typeof mql.addListener === 'function') { mql.addListener(listener); }
        });

        function load() {
            statusEl.textContent = 'Laster mesterskapsdata…';
            contentEl.innerHTML = '';
            fetcher.fetchMestere('/data/' + gren + '/mestere', ar)
                .then(function (index) {
                    statusEl.textContent = '';
                    allRows = StandplassMestereData.podiumRows(index || {}, scope);
                    if (!allRows.length) {
                        filterbarEl.hidden = true;
                        statsEl.hidden = true;
                        contentEl.innerHTML = emptyYearCard(gren, ar, false);
                        return;
                    }
                    ensureFilterBar();
                    // Unconditional: a later successful load after an
                    // empty year or failed fetch must bring the bar
                    // back (ensureFilterBar only runs once).
                    filterbarEl.hidden = false;
                    statsEl.hidden = false;
                    rebuildWidgets();
                    applyFilters();
                })
                .catch(function () {
                    statusEl.textContent = '';
                    filterbarEl.hidden = true;
                    statsEl.hidden = true;
                    contentEl.innerHTML = emptyYearCard(gren, ar, true);
                });
        }

        load();
    }

    return {
        resolveInitial: resolveInitial,
        grenDisplayName: grenDisplayName,
        resolveFilters: resolveFilters,
        filterParams: filterParams,
        filterBarMarkup: filterBarMarkup,
        tableSpecFor: tableSpecFor,
        bareSpec: bareSpec,
        emptyYearCard: emptyYearCard,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassMesterskapPage;
}
