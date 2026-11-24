// public/js/mesterskap-page.js
//
// The unified /mesterskap/ page: felt/bane/alle toggle + year picker
// over the per-year mestere indexes, one dense podium table
// (the norgesfelt-search pattern): program-ordered rows, filter row
// above (mesterskapstype, øvelse, klasse, krets, distrikt, klubb,
// navn, type), person links opening the person modal. The table
// shape follows the rows' own stamped types: single-type views group
// by region (krets on km, distrikt on dm; nm flat), mixed views go
// flat with Mesterskap and Region columns seeded type-first. The pure
// helpers (resolveInitial, grenDisplayName, resolveFilters,
// filterParams, filterBarMarkup, tableSpecFor, mergeMestereIndexes,
// regionDropdownsFor, initialSortFor, emptyYearCard) are
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
        if (gren === 'bane') { return 'baneskyting'; }
        if (gren === 'alle') { return 'feltskyting og baneskyting'; }
        return 'feltskyting';
    }

    // '?gren=bane&ar=2024' → {gren, ar} with alle/current-year defaults
    // (the unified page opens fully merged — owner ruling 2026-11-24);
    // invalid or out-of-range values fall back to the defaults.
    function resolveInitial(search, currentYear) {
        var params = new URLSearchParams(search || '');
        var gren = params.get('gren');
        if (gren !== 'felt' && gren !== 'bane' && gren !== 'alle') { gren = 'alle'; }
        var ar = parseInt(params.get('ar'), 10);
        if (isNaN(ar) || ar < FIRST_YEAR || ar > currentYear) { ar = currentYear; }
        return { gren: gren, ar: ar };
    }

    // The filter URL codec. Params: mesterskap, ovelse, class, krets,
    // distrikt are comma-joined, per-element-encoded lists (the
    // felt/bane disc convention); klubb, name, type are single values.
    // mesterskap validates its values (nm/dm/km — junk drops out).
    // resolveFilters parses, filterParams inverts — the page writes
    // pairs via URLSearchParams.set so the browser round-trip is exact.
    function resolveFilters(search) {
        var params = new URLSearchParams(search || '');
        var type = params.get('type');
        if (type !== 'individuelt' && type !== 'lag') { type = ''; }
        return {
            mesterskap: StandplassFormat.decodeIdList(params.get('mesterskap')).filter(function (v) {
                return v === 'nm' || v === 'dm' || v === 'km';
            }),
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
        if (f.mesterskap && f.mesterskap.length) { out.push(['mesterskap', StandplassFormat.encodeIdList(f.mesterskap)]); }
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
    // implementation for the unified page: every dropdown always in
    // the markup, availability data-driven at runtime by what the
    // loaded rows carry). Static markup only — widget items are
    // injected at runtime through textContent, no escaping surface.    // Select-all stores ids, never the {id, name} label objects the
    // mesterskapstype dropdown's items carry — every other dropdown's
    // raw items are the ids themselves, and the filter state must hold
    // one shape for matching, labels and the URL codec alike.
    function toItemIds(items) {
        return (items || []).map(function (n) {
            return typeof n === 'string' ? n : n.id;
        });
    }

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

    function filterBarMarkup() {
        var out = [];
        out.push(dropdownGroup('mesterskap', 'Mesterskapstype', 'Alle mesterskap'));
        out.push(dropdownGroup('ovelse', 'Øvelse', 'Alle øvelser'));
        out.push(dropdownGroup('klasse', 'Klasse', 'Alle klasser'));
        out.push(dropdownGroup('medal', 'Medalje', 'Alle medaljer'));
        out.push(dropdownGroup('krets', 'Krets', 'Alle kretser'));
        out.push(dropdownGroup('distrikt', 'Distrikt', 'Alle distrikter'));
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

    // Ruling 13 (2026-11-24): the Medalje column renders medal chips —
    // golden/silver/bronze like the other tables' badges; unknown
    // medal names stay plain text.
    var MEDAL_CLASSES = { 'Gull': 'medal--gold', 'Sølv': 'medal--silver', 'Bronse': 'medal--bronze' };

    function medalChip(medal) {
        var cls = MEDAL_CLASSES[medal];
        return cls ? '<span class="medal ' + cls + '">' + esc(medal) + '</span>' : esc(medal);
    }

    // Ruling 15 (2026-11-24): the Arrangement column carries the
    // resultfile link — the parsed result file in its own dialog (the
    // "Resultatfil beta" action from the felt/bane pages). Rows
    // without a compId or branch render plain text; the button mirrors
    // the felt/bane trigger's attributes so the click wiring stays the
    // same shape.
    function arrangementCell(row) {
        if (row.title == null) { return '–'; }
        if (row.compId == null || row.gren == null) { return esc(row.title); }
        return '<button type="button" class="stevner-resultfile-btn"'
            + ' data-comp-id="' + esc(row.compId) + '"'
            + ' data-gren="' + esc(row.gren) + '"'
            + ' data-title="' + esc(row.title) + '">'
            + esc(row.title) + '</button>';
    }

    var TYPE_LABELS = { nm: 'NM', dm: 'DM', km: 'KM' };

    // The distinct championship types present in a row set — rows are
    // stamped by podiumRows; test-shaped bare rows carry none.
    function typesPresent(rows) {
        var seen = {};
        (rows || []).forEach(function (r) { if (r.type) { seen[r.type] = true; } });
        return Object.keys(seen);
    }

    // The dense podium table: one row per medal, everything else a
    // column or a filter. Navn leads (owner ruling — the person is the
    // row's identity). Øvelse and Medalje display names but sort by
    // their rank fields (the base compares cells as strings — a name
    // key cannot sort Gull first). Klubb: member rows carry their
    // resolved club, and one with nothing resolved shows '–' (owner
    // ruling — never a club derived from the lag name); only the
    // memberless team-row fallback derives a display club from the
    // lag name.
    // Single type in view: exactly the per-type page shape — km
    // carries the krets column behind its group row, dm the distrikt
    // column, nm neither. Mixed types (spec ruling 6): flat, no
    // groupRows, with the Mesterskap column (NM/DM/KM chips, sorted
    // by typeRank so NM → DM → KM, øvelse program order tie-breaking)
    // and the unified Region column (the row's own championship
    // region, visible by default, '–' for nm rows).
    // hideBelow tiers follow the norgesfelt search table (700/900).
    function tableSpecFor(rows) {
        rows = rows || [];
        var types = typesPresent(rows);
        var mixed = types.length > 1;
        var regionKey = !mixed && types[0] === 'km' ? 'region'
            : !mixed && types[0] === 'dm' ? 'distrikt' : null;
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
                cellClass: 'medal-cell', raw: true, cell: function (row) { return medalChip(row.medal); }
            },
            {
                key: 'club', label: 'Klubb', sortable: true, defaultDir: 'asc', hideBelow: 900,
                cell: function (row) {
                    if (row.club != null) { return row.club; }
                    if (row.isTeam && row.lag == null) {
                        return StandplassMestereData.teamClub(row.name);
                    }
                    return '–';
                }
            }
        ];
        if (rows.some(function (r) { return r.sum != null; })) {
            columns.push({
                key: 'sum', label: 'Sum', align: 'right', sortable: true, defaultDir: 'desc',
                raw: true,
                // A lag member's sum carries the team's sum as a muted
                // sub-line under the member's own (owner ruling
                // 2026-11-23 — mirrors the lag-name sub-line under
                // Navn); sorting stays on the member's own sum.
                cell: function (row) {
                    var main = row.sum == null ? '–' : String(row.sum);
                    if (row.lag != null && row.lagSum != null) {
                        return main
                            + '<span class="mesterskap-lag-sub">'
                            + String(row.lagSum) + '</span>';
                    }
                    return main;
                }
            });
        }
        if (regionKey) {
            columns.push({
                key: regionKey, label: regionKey === 'region' ? 'Krets' : 'Distrikt',
                sortable: true, defaultDir: 'asc', defaultHidden: true,
                cell: function (row) { return row[regionKey] == null ? '–' : row[regionKey]; }
            });
        }
        if (mixed) {
            columns.push({
                key: 'typeRank', label: 'Mesterskap', align: 'center',
                sortable: true, defaultDir: 'asc', secondaryKey: 'ovelseRank',
                hideBelow: 700, raw: true,
                cell: function (row) {
                    return '<span class="mesterskap-type-chip">'
                        + esc(TYPE_LABELS[row.type] || String(row.type || '').toUpperCase())
                        + '</span>';
                }
            });
            columns.push({
                key: 'champRegion', label: 'Region', sortable: true, defaultDir: 'asc',
                hideBelow: 900,
                cell: function (row) { return row.champRegion == null ? '–' : row.champRegion; }
            });
        }
        // Ruling 15 (2026-11-24): the Arrangement column (the stevne
        // name) carries the resultfile link — see arrangementCell.
        columns.push({
            key: 'title', label: 'Arrangement', sortable: true, defaultDir: 'asc',
            raw: true, cell: arrangementCell
        });
        columns.push({
            key: 'date', label: 'Dato', sortable: true, defaultDir: 'desc', defaultHidden: true,
            cell: function (row) { return row.date == null ? '–' : row.date; }
        });
        columns.push({
            // Ruling 14 (2026-11-24): the Arrangør cell links the comp
            // modal (the full result list — the same beta modal the
            // felt/bane pages use), titled by the comp; visible by
            // default now that it carries the affordance.
            key: 'organizer', label: 'Arrangør', sortable: true, defaultDir: 'asc',
            raw: true,
            cell: function (row) {
                if (row.organizer == null) { return '–'; }
                if (row.compId == null) { return esc(row.organizer); }
                return '<button type="button" class="stevner-comp-btn"'
                    + ' data-comp-id="' + esc(row.compId) + '"'
                    + ' data-comp-title="' + esc(row.title == null ? '' : row.title) + '">'
                    + esc(row.organizer) + '</button>';
            }
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

    // Gren=alle merge: a failed branch fetch passes null and vanishes —
    // the other branch renders (both null → the page's failed-year card).
    function mergeMestereIndexes(indexes) {
        var comps = [];
        (indexes || []).forEach(function (index) {
            if (index && index.comps) { comps = comps.concat(index.comps); }
        });
        return { comps: comps };
    }

    // Branch-stamps an index's comps (felt/bane) so podium rows can
    // address the right detaljer directory for the Arrangement
    // column's resultfile link (ruling 15). Mutates and returns the
    // index — each comp belongs to exactly one branch's index, so
    // re-stamping is idempotent.
    function stampGren(index, gren) {
        if (index && index.comps) {
            index.comps.forEach(function (c) { c.gren = gren; });
        }
        return index;
    }

    // Region-filter availability is data-driven: a dropdown renders only
    // when the loaded rows carry its field (nm rows carry neither).
    function regionDropdownsFor(rows) {
        var krets = false;
        var distrikt = false;
        (rows || []).forEach(function (r) {
            if (r.region != null) { krets = true; }
            if (r.distrikt != null) { distrikt = true; }
        });
        return { krets: krets, distrikt: distrikt };
    }

    // Ruling 12 (2026-11-24): availability is computed per view, on a
    // basis that excludes the region filters' own selections — a krets
    // pick must not deactivate its own dropdown, and adding DM/KM back
    // to the type filter reactivates a greyed-out filter. Pure: the DOM
    // half (grey out, inert, stale-selection clearing) lives in init's
    // setRegionFilterActive/applyFilters.
    function regionFilterAvailability(rows, filters) {
        var basis = StandplassMestereData.filterPodiumRows(rows, {
            mesterskap: filters.mesterskap,
            ovelse: filters.ovelse,
            klasse: filters.klasse,
            medal: filters.medal,
            klubb: filters.klubb,
            navn: filters.navn,
            type: filters.type
        });
        return regionDropdownsFor(basis);
    }

    // The mixed view's opening sort: type-first sections (NM, DM, KM),
    // each in program order via the base's secondary key over the
    // pre-sorted rows. Single-type views open unsorted (page order).
    function initialSortFor(rows) {
        return typesPresent(rows).length > 1 ? { key: 'typeRank', dir: 'asc' } : null;
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
        var alleBtn = root.getElementById('mesterskap-toggle-alle');
        var feltBtn = root.getElementById('mesterskap-toggle-felt');
        var baneBtn = root.getElementById('mesterskap-toggle-bane');
        var yearSelect = root.getElementById('mesterskap-year-select');

        var fetcher = StandplassData.createFetcher(window.fetch.bind(window));

        // The comp modal host (ruling 14): podium rows' Arrangør links
        // and the Meritter tab's comp links open the full result list
        // here — branch-agnostic, fetched by compId from the API.
        var compModalHost = null;

        var personModal = StandplassPersonModalController.create({
            idPrefix: 'mesterskap',
            root: root,
            urlState: urlState,
            onOpenComp: function (compId, compTitle) {
                if (compModalHost) { compModalHost.open(compId, compTitle); }
            },
            fetchEntriesForYear: function (personId, year) {
                function fromBase(dataBase) {
                    return fetcher.fetchYear(dataBase, year).then(function (yearData) {
                        return StandplassStevnerPage.flattenRows(yearData)
                            .filter(function (r) { return r.personId === personId; })
                            .map(function (r) {
                                return { date: r.date, discipline: r.discipline, class: r.class,
                                    competitionType: r.competitionType, competition: r.competition,
                                    position: r.position, score: r.score, rankingScore: r.rankingScore, name: r.name };
                            });
                    }).catch(function () { return []; });
                }
                // gren=alle: both branches' entries (the controller
                // already handles mixed-branch entries + the switcher).
                if (gren === 'alle') {
                    return Promise.all([fromBase('/data/felt'), fromBase('/data/bane')])
                        .then(function (pair) { return pair[0].concat(pair[1]); });
                }
                return fromBase(gren === 'felt' ? '/data/felt' : '/data/bane');
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
        // Comp-modal wiring for the Arrangør links (ruling 14) — the
        // same delegated pattern; the stevner pages' trigger shape.
        compModalHost = StandplassCompModal.createDialogHost({ idPrefix: 'mesterskap', root: root });
        contentEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-comp-btn');
            if (!btn) { return; }
            compModalHost.open(btn.dataset.compId, btn.dataset.compTitle || btn.textContent);
        });
        // Resultatfil modal (ruling 15): the Arrangement links open the
        // parsed result file. Every open carries the row's branch via
        // comp.detailBase — the host default never matters here;
        // person buttons inside route through the page's person modal.
        var resultfileHost = StandplassResultfileModal.ensureDialog({
            idPrefix: 'mesterskap',
            root: root,
            onPerson: function (btn) {
                personModal.open(btn, {
                    personId: btn.dataset.personId,
                    personName: btn.dataset.personName,
                    initialDisc: btn.dataset.discipline || null
                });
            }
        });
        contentEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-resultfile-btn');
            if (!btn) { return; }
            resultfileHost.open({
                id: btn.dataset.compId,
                year: ar,
                title: btn.dataset.title || '',
                resultFileUrl: btn.dataset.resultfile || null,
                detailBase: '/data/detaljer/' + btn.dataset.gren
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
        // never a silent blank); resets on gren switches — the øvelse
        // universe differs between felt and bane entirely — except
        // mesterskapstype, which survives (nm/dm/km exist in both
        // branches, owner ruling 2026-11-24).
        var allRows = [];
        var filters = resolveFilters(urlState.getSearch());
        var emptyFilters = function () {
            return { mesterskap: [], ovelse: [], klasse: [], medal: [], krets: [], distrikt: [], klubb: '', navn: '', type: '' };
        };

        // Gren toggle (alle/felt/bane), reflecting the ?gren= state.
        function reflectGren() {
            [[alleBtn, 'alle'], [feltBtn, 'felt'], [baneBtn, 'bane']].forEach(function (pair) {
                pair[0].classList.toggle('program-btn--active', gren === pair[1]);
                pair[0].setAttribute('aria-pressed', String(gren === pair[1]));
            });
        }
        function setGren(next) {
            gren = next;
            reflectGren();
            personModal.reset({ initialMetric: gren === 'bane' ? 'score' : 'rankingScore' });
            var keepMesterskap = filters.mesterskap;
            filters = emptyFilters();
            filters.mesterskap = keepMesterskap;
            if (barBuilt) {
                navnInput.value = '';
                typeSelect.value = '';
                rebuildWidgets();
            }
            setUrlParam('gren', gren);
            load();
        }
        reflectGren();
        alleBtn.addEventListener('click', function () { if (gren !== 'alle') { setGren('alle'); } });
        feltBtn.addEventListener('click', function () { if (gren !== 'felt') { setGren('felt'); } });
        baneBtn.addEventListener('click', function () { if (gren !== 'bane') { setGren('bane'); } });

        // ── The filter bar (built once, items follow the loaded year) ─

        var barBuilt = false;
        var navnInput = null;
        var typeSelect = null;
        var kretsGroupEl = null;      // ruled inert/active per view
        var distriktGroupEl = null;
        var regionDropdownEls = {};   // krets/distrikt dropdowns — rebuilt when a view clears their stale selection (ruling 12)
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
                    return itemsFn().map(function (n) {
                        // strings pass through as {id, name}; objects
                        // (the mesterskapstype NM/DM/KM labels) as-is.
                        return typeof n === 'string' ? { id: n, name: n } : n;
                    });
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
                    filters[selKey] = toItemIds(itemsFn());
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
            filterbarEl.innerHTML = filterBarMarkup();
            kretsGroupEl = root.getElementById('mesterskap-krets-btn').closest('.filter-group');
            distriktGroupEl = root.getElementById('mesterskap-distrikt-btn').closest('.filter-group');

            // Mesterskapstype: fixed typeRank order, NM/DM/KM labels —
            // the canonical types, never derived from the data.
            wireDropdown('mesterskap', 'Alle mesterskap', function () {
                return ['nm', 'dm', 'km'].map(function (t) {
                    return { id: t, name: TYPE_LABELS[t] };
                });
            }, 'mesterskap');
            wireDropdown('ovelse', 'Alle øvelser', function () { return distinctSorted('ovelse'); }, 'ovelse');
            wireDropdown('klasse', 'Alle klasser', function () { return distinctSorted('klasse'); }, 'klasse');
            // Fixed medal order — Gull first is the meaningful order,
            // not collation (which would put Bronse first).
            wireDropdown('medal', 'Alle medaljer', function () { return ['Gull', 'Sølv', 'Bronse']; }, 'medal');
            regionDropdownEls.krets = wireDropdown('krets', 'Alle kretser', function () { return distinctSorted('region'); }, 'krets');
            regionDropdownEls.distrikt = wireDropdown('distrikt', 'Alle distrikter', function () { return distinctSorted('distrikt'); }, 'distrikt');

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
                function () { filters.mesterskap = []; },
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
            ['mesterskap', 'ovelse', 'class', 'medal', 'krets', 'distrikt', 'klubb', 'name', 'type'].forEach(function (k) {
                qs.delete(k);
            });
            filterParams(filters).forEach(function (p) { qs.set(p[0], p[1]); });
            urlState.setSearch(qs.toString());
        }

        // Region filters read the rows' stamped championship fields
        // directly, exact-match (the krets rule): krets matches the
        // km championship's own krets AND the dm comp's host krets;
        // distrikt matches both km and dm rows. Rows without the field
        // (nm rows) never match — availability gating below keeps the
        // dropdowns honest about when the filters can bite.
        // Ruling 12 (2026-11-24): region filters with nothing to filter
        // grey out and go inert, never disappear — they reactivate when
        // the view again carries their field (adding DM/KM back to the
        // type filter). A deactivated dropdown clears its stale
        // selection so no invisible filter zeroes the table.
        function setRegionFilterActive(groupEl, active) {
            if (!groupEl) { return; }
            groupEl.classList.toggle('filter-group--inactive', !active);
            if (active) { groupEl.removeAttribute('inert'); }
            else { groupEl.setAttribute('inert', ''); }
        }

        function applyFilters() {
            var avail = regionFilterAvailability(allRows, filters);
            // A deactivated dropdown drops its stale selection (no
            // invisible filter zeroing the table) and rebuilds so the
            // closed button's label resets — the widget's state IS the
            // filters object (getSelected), rebuild is the sync.
            if (!avail.krets && filters.krets.length) {
                filters.krets = [];
                if (regionDropdownEls.krets) { regionDropdownEls.krets.rebuild(); }
            }
            if (!avail.distrikt && filters.distrikt.length) {
                filters.distrikt = [];
                if (regionDropdownEls.distrikt) { regionDropdownEls.distrikt.rebuild(); }
            }
            syncUrl();
            setRegionFilterActive(kretsGroupEl, avail.krets);
            setRegionFilterActive(distriktGroupEl, avail.distrikt);
            var filtered = StandplassMestereData.filterPodiumRows(allRows, {
                mesterskap: filters.mesterskap,
                ovelse: filters.ovelse,
                klasse: filters.klasse,
                medal: filters.medal,
                region: filters.krets,
                distrikt: filters.distrikt,
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
            var s = StandplassMestereData.statsFor(rows);
            var parts = [
                plural(s.medaljer, 'medalje', 'medaljer'),
                plural(s.ovselser, 'øvelse', 'øvelser')
            ];
            if (s.regioner > 0) {
                var types = typesPresent(rows);
                if (types.length === 1 && types[0] === 'km') {
                    parts.push(plural(s.regioner, 'krets', 'kretser'));
                } else if (types.length === 1 && types[0] === 'dm') {
                    parts.push(plural(s.regioner, 'distrikt', 'distrikter'));
                } else {
                    parts.push(plural(s.regioner, 'region', 'regioner'));
                }
            }
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
            spec = tableSpecFor(rows);
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

        // Gren=alle fetches both branches; a failed branch (null)
        // vanishes into the merge so the other renders. Both null →
        // null, the page's failed-year signal.
        function fetchMestereIndex() {
            function from(grenName) {
                return fetcher.fetchMestere('/data/' + grenName + '/mestere', ar)
                    .then(function (index) { return stampGren(index, grenName); })
                    .catch(function () { return null; });
            }
            if (gren === 'alle') {
                return Promise.all([from('felt'), from('bane')])
                    .then(function (pair) {
                        if (pair[0] == null && pair[1] == null) { return null; }
                        return mergeMestereIndexes(pair);
                    });
            }
            return from(gren);
        }

        function load() {
            statusEl.textContent = 'Laster mesterskapsdata…';
            contentEl.innerHTML = '';
            fetchMestereIndex()
                .then(function (index) {
                    if (index == null) { throw new Error('mestere fetch failed'); }
                    statusEl.textContent = '';
                    allRows = StandplassMestereData.podiumRows(index);
                    // Seeded sort: while no user sort exists, mixed views
                    // open type-first (NM → DM → KM sections); a user's
                    // sort persists across loads and filter changes
                    // (the house session-state policy).
                    tableSort = tableSort || initialSortFor(allRows);
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
        toItemIds: toItemIds,
        tableSpecFor: tableSpecFor,
        bareSpec: bareSpec,
        mergeMestereIndexes: mergeMestereIndexes,
        stampGren: stampGren,
        regionDropdownsFor: regionDropdownsFor,
        regionFilterAvailability: regionFilterAvailability,
        initialSortFor: initialSortFor,
        emptyYearCard: emptyYearCard,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassMesterskapPage;
}
