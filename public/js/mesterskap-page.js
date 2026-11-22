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

    // The filter URL codec. Params: ovelse, class, krets are
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
            krets: StandplassFormat.decodeIdList(params.get('krets')),
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
        if (f.krets && f.krets.length) { out.push(['krets', StandplassFormat.encodeIdList(f.krets)]); }
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
        if (scope !== 'nm') {
            out.push(dropdownGroup('krets', 'Krets', 'Alle kretser'));
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
    // plain text otherwise (team rows carry the team as name — the
    // house raw-cell person-link pattern).
    function personCell(row) {
        if (row.personId && !row.isTeam) {
            return '<button type="button" class="stevner-person-btn link-btn"'
                + ' data-person-id="' + esc(row.personId)
                + '" data-person-name="' + esc(row.name) + '">'
                + esc(row.name) + '</button>';
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
    // column or a filter. Øvelse and Medalje display names but sort by
    // their rank fields (the base compares cells as strings — a name
    // key cannot sort Gull first). The region column (krets on km,
    // distrikt on dm) is defaultHidden behind its group row; nm carries
    // neither column nor grouping. hideBelow tiers follow the
    // norgesfelt search table (700/900).
    function tableSpecFor(rows, scope) {
        rows = rows || [];
        var regionKey = scope === 'km' ? 'region' : scope === 'dm' ? 'distrikt' : null;
        var columns = [
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
            { key: 'name', label: 'Navn', sortable: true, defaultDir: 'asc', raw: true, cell: personCell },
            {
                key: 'club', label: 'Klubb', sortable: true, defaultDir: 'asc', hideBelow: 900,
                cell: function (row) { return row.club == null ? '–' : row.club; }
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

    function tableState(sort) {
        return { sort: sort || null, hidden: {}, runtimeHidden: [], widthTier: null };
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

        var initial = resolveInitial(urlState.getSearch(), CURRENT_YEAR);
        var gren = initial.gren;
        var ar = initial.ar;

        var statusEl = root.getElementById('mesterskap-status');
        var contentEl = root.getElementById('mesterskap-content');
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
            setUrlParam('gren', gren);
            load();
        }
        reflectGren();
        feltBtn.addEventListener('click', function () { if (gren !== 'felt') { setGren('felt'); } });
        baneBtn.addEventListener('click', function () { if (gren !== 'bane') { setGren('bane'); } });

        // One table per page; sort state survives year/gren re-renders —
        // the same session-state policy as the klubb leaderboard cards.
        var tableSort = null;
        var spec = null;
        var TABLE_ID = 'mesterskap-podium';

        function load() {
            statusEl.textContent = 'Laster mesterskapsdata…';
            contentEl.innerHTML = '';
            fetcher.fetchMestere('/data/' + gren + '/mestere', ar)
                .then(function (index) {
                    statusEl.textContent = '';
                    var rows = StandplassMestereData.podiumRows(index || {}, scope);
                    if (!rows.length) {
                        contentEl.innerHTML = emptyYearCard(gren, ar, false);
                        return;
                    }
                    spec = tableSpecFor(rows, scope);
                    render();
                })
                .catch(function () {
                    statusEl.textContent = '';
                    contentEl.innerHTML = emptyYearCard(gren, ar, true);
                });
        }

        function render() {
            if (!spec || !contentEl.querySelector('table[data-dt-id="' + TABLE_ID + '"]')) { return; }
            contentEl.querySelector('#mesterskap-table-host').innerHTML =
                StandplassDataTable.renderTable(TABLE_ID, spec, tableState(tableSort));
            wire();
        }

        function wire() {
            if (!contentEl.querySelector('table[data-dt-id="' + TABLE_ID + '"]')) { return; }
            StandplassDataTable.wireTable(contentEl, TABLE_ID, spec, {
                onSortChange: function (sort) {
                    tableSort = sort;
                    // Surgical: replace only the table (bare table —
                    // re-wrapping nests scroll regions).
                    var tableEl = contentEl.querySelector('table[data-dt-id="' + TABLE_ID + '"]');
                    if (tableEl) {
                        tableEl.outerHTML = StandplassDataTable.renderTable(
                            TABLE_ID, spec, tableState(tableSort));
                        wire();
                    }
                    var btn = contentEl.querySelector(
                        'table[data-dt-id="' + TABLE_ID + '"] .dt-sort-btn[data-dt-sort="' + sort.key + '"]');
                    if (btn) { btn.focus(); }
                }
            }, tableState(tableSort));
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
        emptyYearCard: emptyYearCard,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassMesterskapPage;
}
