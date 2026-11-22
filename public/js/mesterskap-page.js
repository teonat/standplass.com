// public/js/mesterskap-page.js
//
// The /mesterskap/{nm,dm,km} pages: felt/bane toggle + year picker over
// the per-year mestere indexes, grouped by region (krets for KM,
// distrikt for DM, no grouping for NM), comp cards with podium tables
// on the shared data-table base, person links opening the person modal.
// The pure helpers (resolveInitial, grenDisplayName, tableSpecFor,
// renderYear, emptyYearCard) are node-testable; init() is the DOM
// wiring, verified by manual QA (house rule).
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

    // Podium table spec: medal + name (+ person link) + club + sum for
    // individual sections; medal + team for lag sections. The name
    // column is a raw pre-escaped cell (the house person-link pattern)
    // so the page's delegated person-modal wiring keeps working. The
    // Sum column is dropped when no row carries one.
    function tableSpecFor(section) {
        var podium = (section && section.podium) || [];
        if (!podium.length) { return null; }
        var isTeam = podium[0].team != null;
        var columns = [
            { key: 'medal', label: 'Medalje', align: 'center', cellClass: 'medal-cell' }
        ];
        if (isTeam) {
            columns.push({ key: 'team', label: 'Lag', sortable: true, defaultDir: 'asc' });
        } else {
            columns.push({
                key: 'name', label: 'Navn', sortable: true, defaultDir: 'asc', raw: true,
                cell: function (row) {
                    if (row.personId) {
                        return '<button type="button" class="stevner-person-btn link-btn"'
                            + ' data-person-id="' + esc(row.personId)
                            + '" data-person-name="' + esc(row.name) + '">'
                            + esc(row.name) + '</button>';
                    }
                    return esc(row.name);
                }
            });
            columns.push({
                key: 'club', label: 'Klubb', sortable: true, defaultDir: 'asc',
                cell: function (row) { return row.club || '–'; }
            });
            var hasSum = podium.some(function (r) { return r.sum != null; });
            if (hasSum) {
                columns.push({
                    key: 'sum', label: 'Sum', align: 'right', sortable: true, defaultDir: 'desc',
                    cell: function (row) { return row.sum == null ? '–' : String(row.sum); }
                });
            }
        }
        return {
            columns: columns,
            rows: podium,
            ariaLabel: section.ovelse + (section.klasse ? ' ' + section.klasse : '')
        };
    }

    function tableState(sort) {
        return { sort: sort || null, hidden: {}, runtimeHidden: [], widthTier: null };
    }

    // The year's markup: region groups → comp cards → section tables.
    // tablesOut (optional) collects {id, spec} per rendered table so
    // init can wire sorting without duplicating the id scheme.
    function renderYear(scope, index, tablesOut) {
        var groups = StandplassMestereData.groupByRegion(index || {}, scope);
        var out = [];
        groups.forEach(function (group) {
            if (group.label != null) {
                out.push('<h2 class="mesterskap-region-heading">' + esc(group.label) + '</h2>');
            }
            group.comps.forEach(function (comp) {
                out.push(renderComp(scope, comp, tablesOut));
            });
        });
        return out.join('');
    }

    function renderComp(scope, comp, tablesOut) {
        var meta = [comp.date, comp.organizer].filter(Boolean).map(esc).join(' – ');
        var out = ['<article class="ranking-card mesterskap-comp-card">',
            '<div class="ranking-card-header">',
            '<h3 class="ranking-card-title">' + esc(comp.title) + '</h3>',
            meta ? '<p class="mesterskap-comp-meta">' + meta + '</p>' : '',
            '</div>'];
        // Individual sections first, lag sections alongside (never
        // merged) — the owner ruling on mix-lag and ordinary classes.
        [scope, scope + 'Lag'].forEach(function (key) {
            (comp[key] || []).forEach(function (section, si) {
                var spec = tableSpecFor(section);
                if (!spec) { return; }
                var id = 'mest-' + scope + '-' + comp.compId + '-' + key + '-' + si;
                if (tablesOut) { tablesOut.push({ id: id, spec: spec }); }
                out.push('<h4 class="mesterskap-section-title">'
                    + esc(section.ovelse)
                    + (section.klasse ? ' – ' + esc(section.klasse) : '')
                    + '</h4>');
                out.push('<div class="club-stats-list-scroll">'
                    + StandplassDataTable.renderTable(id, spec, tableState(null))
                    + '</div>');
            });
        });
        out.push('</article>');
        return out.join('');
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
        // surgically re-rendered tables, exactly the klubb-page pattern.
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

        // Per-table sort state, surviving year/gren re-renders — the
        // same session-state policy as the klubb leaderboard cards.
        var tableSort = {};

        function load() {
            statusEl.textContent = 'Laster mesterskapsdata…';
            contentEl.innerHTML = '';
            fetcher.fetchMestere('/data/' + gren + '/mestere', ar)
                .then(function (index) {
                    statusEl.textContent = '';
                    var tables = [];
                    var html = renderYear(scope, index, tables);
                    contentEl.innerHTML = html || emptyYearCard(gren, ar, false);
                    tables.forEach(wireOne);
                })
                .catch(function () {
                    statusEl.textContent = '';
                    contentEl.innerHTML = emptyYearCard(gren, ar, true);
                });
        }

        function wireOne(t) {
            if (!contentEl.querySelector('table[data-dt-id="' + t.id + '"]')) { return; }
            StandplassDataTable.wireTable(contentEl, t.id, t.spec, {
                onSortChange: function (sort) {
                    tableSort[t.id] = sort;
                    // Surgical: replace only this table (bare table —
                    // re-wrapping nests scroll regions).
                    var tableEl = contentEl.querySelector('table[data-dt-id="' + t.id + '"]');
                    if (tableEl) {
                        tableEl.outerHTML = StandplassDataTable.renderTable(
                            t.id, t.spec, tableState(tableSort[t.id]));
                        wireOne(t);
                    }
                    var btn = contentEl.querySelector(
                        'table[data-dt-id="' + t.id + '"] .dt-sort-btn[data-dt-sort="' + sort.key + '"]');
                    if (btn) { btn.focus(); }
                }
            }, tableState(tableSort[t.id]));
        }

        load();
    }

    return {
        resolveInitial: resolveInitial,
        grenDisplayName: grenDisplayName,
        tableSpecFor: tableSpecFor,
        renderYear: renderYear,
        emptyYearCard: emptyYearCard,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassMesterskapPage;
}
