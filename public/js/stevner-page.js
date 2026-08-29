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

    function decorateRow(comp, r) {
        return {
            position: r.position,
            name: r.name,
            personId: r.personId,
            club: r.club,
            discipline: r.discipline,
            class: r.class,
            score: r.score,
            rankingScore: r.rankingScore,
            competitionType: comp.competitionTypeName || '',
            competition: comp.title,
            // Date-only, exactly like nsf-ui.js:2166 — the chart code keys "best result per
            // date" on this string and parses it as UTC midnight, both of which break on
            // a full datetime.
            date: comp.startDate ? String(comp.startDate).slice(0, 10) : '',
            applicableForClassification: comp.applicableForClassification === true,
            // data-discipline lets a future click handler resolve initialDisc
            // for the person modal (Task 7) without a second data pass.
            nameHtml: '<button type="button" class="stevner-person-btn link-btn" data-person-id="'
                + esc(r.personId) + '" data-person-name="' + esc(r.name) + '"'
                + ' data-discipline="' + esc(r.discipline) + '">'
                + esc(r.name || '–') + '</button>'
        };
    }

    function flattenRows(yearData) {
        var rows = [];
        (yearData.competitions || []).forEach(function (comp) {
            (comp.results || []).forEach(function (r) { rows.push(decorateRow(comp, r)); });
        });
        return rows;
    }

    // Row-level filter predicate for the card view (buildCompetitionCards is
    // its only caller; the name autocomplete does its own inline filtering).
    function matchesFilters(row, filters) {
        if (filters.activeTab === 'klasse' && !row.applicableForClassification) { return false; }
        if (filters.activeTab === 'ikke' && row.applicableForClassification) { return false; }
        if (filters.activeDiscs.length && filters.activeDiscs.indexOf(row.discipline) < 0) { return false; }
        if (filters.activeClubs.length && filters.activeClubs.indexOf(row.club) < 0) { return false; }
        if (filters.klubbUnmatched && !matchesClub(row.club, filters.klubb)) { return false; }
        if (filters.nameQuery && !(row.name && row.name.toLowerCase().indexOf(filters.nameQuery) >= 0)) { return false; }
        return true;
    }

    function competitionStats(rows) {
        var byPerson = {};
        rows.forEach(function (r) { if (r.personId) { byPerson[r.personId] = true; } });
        var scores = rows.map(function (r) { return Number(r.score); }).filter(function (n) { return !isNaN(n); });
        var sorted = scores.slice().sort(function (a, b) { return a - b; });
        var snitt = scores.length ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length : null;
        var median = sorted.length
            ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
            : null;
        return { skyttere: Object.keys(byPerson).length, startere: rows.length, snitt: snitt, median: median };
    }

    // Mirrors resultatliste-stevner.js:794-850: 'klasse' groups by
    // discipline+class; any other mode groups by discipline only (its row
    // order within the group still comes from COMPARATORS[groupMode]).
    function groupCompetitionRows(rows, groupMode) {
        var comparator = COMPARATORS[groupMode] || compareByKlasse;
        var sorted = rows.slice().sort(comparator);
        var keyed = groupMode === 'klasse';
        var groups = [], byKey = {};
        sorted.forEach(function (r) {
            var key = keyed ? (r.discipline || '') + '|' + (r.class || '') : (r.discipline || '');
            if (!byKey[key]) {
                byKey[key] = { key: key, label: keyed ? (r.discipline || '–') + ' – ' + (r.class || '–') : (r.discipline || '–'), rows: [] };
                groups.push(byKey[key]);
            }
            byKey[key].rows.push(r);
        });
        return groups;
    }

    // Competition-level guard, separate from matchesFilters (which filters
    // individual rows): organizer/title narrow which competitions appear at
    // all, before any row-level filtering happens.
    function matchesCompetition(comp, filters) {
        if (filters.activeOrganizers && filters.activeOrganizers.length
            && filters.activeOrganizers.indexOf(comp.organizationName) < 0) { return false; }
        if (filters.compQuery && !(comp.title && comp.title.toLowerCase().indexOf(filters.compQuery) >= 0)) { return false; }
        return true;
    }

    function buildCompetitionCards(competitions, filters) {
        var withLowerQuery = { activeTab: filters.activeTab, activeDiscs: filters.activeDiscs, activeClubs: filters.activeClubs,
            klubbUnmatched: filters.klubbUnmatched, klubb: filters.klubb, nameQuery: (filters.nameQuery || '').toLowerCase(),
            activeOrganizers: filters.activeOrganizers || [], compQuery: (filters.compQuery || '').toLowerCase() };
        var cards = [];
        (competitions || []).forEach(function (comp) {
            if (!matchesCompetition(comp, withLowerQuery)) { return; }
            var rows = (comp.results || []).map(function (r) { return decorateRow(comp, r); })
                .filter(function (r) { return matchesFilters(r, withLowerQuery); });
            if (!rows.length) { return; }
            cards.push({
                id: comp.id, title: comp.title, status: comp.status, startDate: comp.startDate, endDate: comp.endDate,
                facilityName: comp.facilityName, organizationName: comp.organizationName,
                resultFileUrl: comp.resultFileUrl, deepLink: comp.deepLink,
                applicableForClassification: comp.applicableForClassification === true,
                groups: groupCompetitionRows(rows, filters.groupMode),
                stats: competitionStats(rows)
            });
        });
        return cards;
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

    // Rounds for display only -- competitionStats keeps its raw numbers. The
    // extra Number() drops a trailing ".0" so whole numbers stay whole.
    function fmtNum(n) { return n == null ? '–' : String(Number(Number(n).toFixed(1))).replace('.', ','); }

    function statsLine(stats) {
        return stats.skyttere + ' skytter' + (stats.skyttere !== 1 ? 'e' : '') + ' · '
            + stats.startere + ' start' + (stats.startere !== 1 ? 'er' : '') + ' · '
            + 'snitt ' + fmtNum(stats.snitt) + ' · median ' + fmtNum(stats.median);
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function formatUpdated(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) { return ''; }
        return 'Oppdatert ' + pad2(d.getUTCDate()) + '.' + pad2(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear()
            + ' kl. ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
    }

    function overallStatsBar(cards, lastUpdated, idPrefix) {
        if (cards.length < 2) { return ''; }
        var totals = cards.reduce(function (acc, c) {
            acc.skyttere += c.stats.skyttere; acc.startere += c.stats.startere; return acc;
        }, { skyttere: 0, startere: 0 });
        return '<div class="stevner-overall-stats"><span>' + cards.length + ' stevne' + (cards.length !== 1 ? 'r' : '') + ' · '
            + totals.skyttere + ' skytter' + (totals.skyttere !== 1 ? 'e' : '') + ' · '
            + totals.startere + ' start' + (totals.startere !== 1 ? 'er' : '') + '</span>'
            + '<span class="stevner-stats-right">' + esc(formatUpdated(lastUpdated))
            + ' <button type="button" class="stevner-collapse-all-btn" id="' + idPrefix + '-collapse-all">Fold alle</button></span></div>';
    }

    function statusBadge(applicableForClassification) {
        return applicableForClassification
            ? '<span class="comp-modal-badge comp-modal-badge--yes" title="Resultater teller for klasseopprykk og -nedrykk">Klasseførende</span>'
            : '<span class="comp-modal-badge comp-modal-badge--no">Ikke klasseførende</span>';
    }

    function renderCard(card, showClassBadge) {
        var titleHtml = esc(card.title || 'Ukjent stevne') + (card.status === 3 ? ' (Avlyst)' : '');
        var links = (card.resultFileUrl ? '<a href="' + esc(card.resultFileUrl) + '" target="_blank" rel="noopener">PDF</a> ' : '')
            + (card.deepLink ? '<a href="' + esc(card.deepLink) + '" target="_blank" rel="noopener">skyting.no</a>' : '');
        var meta = [card.startDate ? String(card.startDate).slice(0, 10) : '', card.facilityName, card.organizationName]
            .filter(Boolean).map(esc).join(' · ');
        var groupsHtml = card.groups.map(function (g) {
            var headerRow = card.groups.length > 1
                ? '<tr class="stevner-disc-group"><th scope="colgroup" colspan="' + columns.length + '">' + esc(g.label) + '</th></tr>'
                : '';
            return headerRow + StandplassTable.renderRows(columns, g.rows);
        }).join('');
        return '<div class="ranking-card" data-comp-id="' + esc(card.id) + '">'
            + '<div class="ranking-card-header">'
            + '<div class="stevner-card-info">'
            + '<div class="stevner-comp-title-row">'
            + '<button type="button" class="stevner-comp-btn" data-comp-id="' + esc(card.id) + '">' + titleHtml + '</button>'
            + (showClassBadge ? statusBadge(card.applicableForClassification) : '')
            + (links ? '<span class="stevner-comp-links">' + links + '</span>' : '')
            + '</div>'
            + '<span class="stevner-comp-meta">' + meta + '</span>'
            + '<span class="stevner-comp-stats">' + esc(statsLine(card.stats)) + '</span>'
            + '</div>'
            + '<button type="button" class="stevner-collapse-btn" data-comp-id="' + esc(card.id) + '" aria-expanded="true" aria-label="Fold sammen ' + esc(card.title || '') + '"><span class="stevner-collapse-icon">▾</span></button>'
            + '</div>'
            + '<table class="ranking-table"><thead><tr>'
            + '<th scope="col">#</th><th scope="col">Navn</th>'
            + '<th scope="col">Klubb</th>'
            + '<th scope="col">Øvelse</th><th scope="col">Klasse</th>'
            + '<th scope="col">Poeng</th><th scope="col">Ranking</th>'
            + '</tr></thead><tbody>' + groupsHtml + '</tbody></table>'
            + '</div>';
    }

    function init(config) {
        var dataBase = config.dataBase;
        var view = config.view;
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var CURRENT_YEAR = new Date().getUTCFullYear();

        var urlState = config.urlState;
        var params = new URLSearchParams(urlState.getSearch());
        var klubb = params.get('klubb');
        var yearParam = parseInt(params.get('year'), 10);
        var activeYear = isNaN(yearParam) ? CURRENT_YEAR : yearParam;

        // A single fetcher is shared by every init() call on the page (both
        // adapters), not created per-instance -- otherwise two instances of
        // the same view+year (e.g. two <standplass-results> on one host
        // page) would each fetch the identical data.json independently.
        var fetcher = config.fetcher;
        var FW = StandplassFilterWidgets;
        var FIRST_YEAR = 2021;

        // ── Filter state ──────────────────────────────────────────────────
        // Deliberate design choice: standplass is not affiliated with any
        // club, so the default is unfiltered (no club pre-selected); a
        // ?klubb= param pre-selects that club's chip instead.
        var activeClubs = [];
        var activeDiscs = [];
        var nameQuery = '';
        var activeOrganizers = [];
        var compQuery = '';
        var activeTab = 'alle';                    // 'alle' | 'klasse' | 'ikke'
        var activeGroupMode = 'klasse';            // key of COMPARATORS
        var tabParam = params.get('tab');
        if (tabParam && ['alle', 'klasse', 'ikke'].indexOf(tabParam) >= 0) { activeTab = tabParam; }
        var groupParam = params.get('group');
        if (groupParam && COMPARATORS[groupParam]) { activeGroupMode = groupParam; }
        var discParam = params.get('disc');
        if (discParam) { activeDiscs = [discParam]; }
        var nameParamInit = params.get('name');
        if (nameParamInit) { nameQuery = nameParamInit; }
        var organizerParam = params.get('organizer');
        if (organizerParam) { activeOrganizers = [organizerParam]; }
        var compParam = params.get('comp');
        if (compParam) { compQuery = compParam; }
        var masterClubs = {};                      // accumulates across loaded years (stevner.js:353-373)
        var masterDiscs = {};
        var masterOrganizers = {};
        var allRows = [];                          // every row of activeYear
        var currentCompetitions = [];               // raw competitions of activeYear, feeds card pagination
        var visibleCards = [];                      // after filters, built into cards
        var lastUpdated = null;                     // yearData.lastUpdated, for the overall stats bar
        // ?klubb= is a slug; it is resolved against real club names once data is
        // loaded so it shows as a removable chip. If it matches nothing we keep
        // filtering by the slug, so an embed never silently widens to a
        // national list.
        var klubbResolved = false;
        var klubbUnmatched = false;
        // Same idea as personOpenSeq/compOpenSeq below: year files are several
        // MB, so rapid year-switching can let a slow older response land after
        // a newer one and leave the page showing a year nothing else agrees on.
        var yearSeq = 0;

        var pagination = StandplassPagination.createController({
            pageSize: 20, // matches the source's competition-count-based paging (a later task's concern to tune further; 20 is the right value now)
            fetchPage: function (offset, limit) {
                return Promise.resolve(visibleCards.slice(offset, offset + limit));
            }
        });

        var rowsEl = id('-rows');
        var loadMoreBtn = id('-load-more');

        function render() {
            if (!pagination.state.items.length) {
                rowsEl.innerHTML = '<p class="ranking-empty">Ingen stevner for valgt filter.</p>';
            } else {
                rowsEl.innerHTML = overallStatsBar(pagination.state.items, lastUpdated, config.idPrefix)
                    + pagination.state.items.map(function (card) {
                        return renderCard(card, activeTab === 'alle');
                    }).join('');
            }
            rowsEl.classList.toggle('stevner-hide-club-col', activeClubs.length === 1);
            loadMoreBtn.textContent = 'Last flere (viser ' + pagination.state.items.length + ' av ' + visibleCards.length + ' stevner)';
            loadMoreBtn.hidden = pagination.state.done;
        }

        function setStatus(msg, isError) {
            var el = id('-status');
            el.textContent = msg || '';
            el.classList.toggle('ranking-error', !!isError);
        }

        function load() {
            setStatus('Laster…');
            return pagination.loadMore().then(function () {
                render();
                setStatus('');
            }, showLoadError);
        }

        // pagination.js only clears state.loading on the success path, so a
        // failed fetch would wedge "Last flere" forever — clear it here and
        // show the failure instead of leaving a dead button. err is only
        // present on the loadYear() -> fetchYear() failure path; load()'s
        // own fetchPage can't reject, so this also has to work called bare.
        function showLoadError(err) {
            pagination.state.loading = false;
            loadMoreBtn.hidden = true;
            var msg = (err && err.status === 404)
                ? 'Ingen data for ' + activeYear + '.'
                : 'Kunne ikke laste data. Prøv igjen senere.';
            rowsEl.innerHTML = '';
            setStatus(msg, true);
        }

        loadMoreBtn.addEventListener('click', load);

        function currentFilters() {
            return { activeTab: activeTab, activeDiscs: activeDiscs, activeClubs: activeClubs,
                klubbUnmatched: klubbUnmatched, klubb: klubb, nameQuery: nameQuery, groupMode: activeGroupMode,
                activeOrganizers: activeOrganizers, compQuery: compQuery };
        }

        // Every filter change re-builds cards from scratch and restarts
        // pagination, mirroring the source's render() resetting _shown to
        // PAGE_SIZE.
        function applyFilters() {
            visibleCards = buildCompetitionCards(currentCompetitions, currentFilters());
            pagination.reset();
            return load();
        }

        function loadYear(year) {
            var mySeq = ++yearSeq;
            setStatus('Laster…');
            return fetcher.fetchYear(dataBase, year).then(function (yearData) {
                if (mySeq !== yearSeq) { return; } // a newer year was picked since this fetch started
                allRows = flattenRows(yearData);
                currentCompetitions = yearData.competitions || [];
                currentCompetitions.forEach(function (c) {
                    if (c.organizationName) { masterOrganizers[c.organizationName] = true; }
                });
                lastUpdated = yearData.lastUpdated;
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
                organizerCombo.rebuild();
                return applyFilters();
            }, function (err) { if (mySeq === yearSeq) { showLoadError(err); } });
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
            var qs = new URLSearchParams(urlState.getSearch());
            qs.set('year', String(activeYear));
            urlState.setSearch('?' + qs.toString());
            loadYear(activeYear);
        });

        // ── Discipline checkbox dropdown (stevner.js:130-158) ─────────────
        var discDropdown = FW.makeCheckboxDropdown({
            btn: id('-disc-btn'),
            panel: id('-disc-panel'),
            list: id('-disc-list'),
            clearAllBtn: id('-disc-clear'),
            labelNone: 'Alle øvelser',
            searchable: true,
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
                setUrlParam('disc', activeDiscs.length === 1 ? activeDiscs[0] : null);
                applyFilters();
            },
            onClearAll: function () {
                activeDiscs = [];
                discDropdown.rebuild();
                setUrlParam('disc', null);
                applyFilters();
            }
        });

        // ── Club tag combobox (stevner.js:160-194) ───────────────────────
        // The club selection has to be URL-synced, because embed-builder.js
        // builds its snippet from the current query string (its ALLOWED_PARAMS
        // whitelist is klubb/club/mode) — without this, "Opprett iframe" would
        // hand a club admin an unfiltered national embed. ?klubb= is
        // single-valued, so 0 or 2+ chips means no param. tab/group/disc/name/
        // organizer/comp are URL-synced too, via setUrlParam below.
        function setUrlParam(key, value) {
            var qs = new URLSearchParams(urlState.getSearch());
            if (value) { qs.set(key, value); } else { qs.delete(key); }
            urlState.setSearch('?' + qs.toString());
        }

        function syncKlubbParam() {
            // An explicit chip change supersedes an incoming slug that matched
            // no club, otherwise the stale slug filter would keep applying on
            // top of the new selection.
            klubbUnmatched = false;
            setUrlParam('klubb', activeClubs.length === 1 ? activeClubs[0] : null);
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

        // ── Organizer combo (competition-level filter, mirrors clubCombo) ─
        function syncOrganizerParam() {
            setUrlParam('organizer', activeOrganizers.length === 1 ? activeOrganizers[0] : null);
        }

        var organizerCombo = FW.makeTagComboHandlers({
            input: id('-organizer-input'),
            list: id('-organizer-list'),
            tagsEl: id('-organizer-tags'),
            clear: id('-organizer-clear'),
            getItems: function (q) {
                var lower = (q || '').toLowerCase();
                return Object.keys(masterOrganizers)
                    .sort(function (a, b) { return a.localeCompare(b, 'no'); })
                    .filter(function (o) { return activeOrganizers.indexOf(o) < 0; })
                    .filter(function (o) { return !lower || o.toLowerCase().indexOf(lower) >= 0; })
                    .map(function (o) { return { id: o, name: o }; });
            },
            getSelected: function () {
                return activeOrganizers.map(function (o) { return { id: o, name: o }; });
            },
            onSelect: function (id_) {
                if (activeOrganizers.indexOf(id_) < 0) { activeOrganizers.push(id_); }
                organizerCombo.rebuild();
                syncOrganizerParam();
                applyFilters();
            },
            onRemove: function (id_) {
                activeOrganizers = activeOrganizers.filter(function (o) { return o !== id_; });
                organizerCombo.rebuild();
                syncOrganizerParam();
                applyFilters();
            },
            onClearAll: function () {
                activeOrganizers = [];
                organizerCombo.rebuild();
                syncOrganizerParam();
                applyFilters();
            }
        });

        // ── Name search autocomplete (stevner.js:232-292) ────────────────
        var nameEl = id('-name');
        if (nameQuery) { nameEl.value = nameQuery; }
        var nameWrap = id('-name-wrap');
        var nameTimer = null;
        var nameDirty = false;

        function commitName() {
            clearTimeout(nameTimer);
            nameDirty = false;
            applyFilters();
            nameWrap.classList.toggle('autocomplete-wrap--has-value', !!nameQuery);
            setUrlParam('name', nameQuery || null);
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

        // ── Competition-title search (competition-level filter, plain
        // substring, no autocomplete list -- mirrors the name search's
        // debounce pattern without its pick-from-suggestions dropdown) ────
        var compEl = id('-comp');
        if (compQuery) { compEl.value = compQuery; }
        var compWrap = id('-comp-wrap');
        var compTimer = null;

        function commitComp() {
            clearTimeout(compTimer);
            applyFilters();
            compWrap.classList.toggle('autocomplete-wrap--has-value', !!compQuery);
            setUrlParam('comp', compQuery || null);
        }

        compEl.addEventListener('input', function () {
            compQuery = compEl.value.trim();
            clearTimeout(compTimer);
            compTimer = setTimeout(commitComp, 300);
        });
        id('-comp-clear').addEventListener('click', function () {
            compEl.value = '';
            compQuery = '';
            commitComp();
            compEl.focus();
        });

        // ── Tab + group toggles (stevner.js:574-585 / 99-122) ────────────
        // Marks the button matching `value` active, mirrors the html's own
        // hardcoded default (alle/klasse) so a restored ?tab=/?group= from
        // the URL is reflected visually too, same as yearEl.value/nameEl.value
        // above.
        function setToggleActive(toggleEl, attr, value) {
            Array.prototype.forEach.call(toggleEl.querySelectorAll('button'), function (b) {
                var isActive = b.getAttribute('data-' + attr) === value;
                b.classList.toggle('program-btn--active', isActive);
                b.setAttribute('aria-pressed', String(isActive));
            });
        }

        function wireToggle(toggleEl, attr, onPick) {
            toggleEl.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-' + attr + ']');
                if (!btn) { return; }
                setToggleActive(toggleEl, attr, btn.getAttribute('data-' + attr));
                onPick(btn.getAttribute('data-' + attr));
            });
        }

        var tabToggleEl = id('-tab-toggle');
        var groupToggleEl = id('-group-toggle');
        setToggleActive(tabToggleEl, 'tab', activeTab);
        setToggleActive(groupToggleEl, 'group', activeGroupMode);
        wireToggle(tabToggleEl, 'tab', function (value) {
            activeTab = value;
            setUrlParam('tab', value);
            applyFilters();
        });
        wireToggle(groupToggleEl, 'group', function (value) {
            activeGroupMode = COMPARATORS[value] ? value : 'klasse';
            setUrlParam('group', activeGroupMode);
            applyFilters();
        });

        // ── Clear all filters ────────────────────────────────────────────
        // activeGroupMode (Per klasse/Per øvelse/Poengsum) is a display
        // preference, not a filter -- nothing is hidden by it -- so it's
        // deliberately left untouched here.
        FW.wireClearAllFilters(id('-clear-filters'), [
            function () { activeDiscs = []; },
            function () { activeClubs = []; klubbUnmatched = false; },
            function () { activeOrganizers = []; },
            function () { nameQuery = ''; nameEl.value = ''; nameWrap.classList.remove('autocomplete-wrap--has-value'); },
            function () { compQuery = ''; compEl.value = ''; compWrap.classList.remove('autocomplete-wrap--has-value'); },
            function () { activeTab = 'alle'; setToggleActive(tabToggleEl, 'tab', 'alle'); }
        ], [discDropdown, clubCombo, organizerCombo], function () {
            setUrlParam('disc', null); setUrlParam('klubb', null); setUrlParam('organizer', null);
            setUrlParam('name', null); setUrlParam('comp', null); setUrlParam('tab', null);
            applyFilters();
        });

        loadYear(activeYear);

        var personModal = StandplassPersonModalController.create({
            idPrefix: config.idPrefix,
            root: root,
            urlState: urlState,
            fetchEntriesForYear: function (personId, year) {
                return fetcher.fetchYear(dataBase, year).then(function (yearData) {
                    return flattenRows(yearData).filter(function (r) { return r.personId === personId; })
                        .map(function (r) {
                            return { date: r.date, discipline: r.discipline, class: r.class, competitionType: r.competitionType,
                                competition: r.competition, position: r.position, score: r.score, rankingScore: r.rankingScore, name: r.name };
                        });
                });
            },
            defaultYear: activeYear,
            firstYear: FIRST_YEAR,
            currentYear: CURRENT_YEAR,
            initialMetric: view === 'bane' ? 'score' : 'rankingScore'
        });

        // Competition-detail modal (native <dialog>, not the person modal's
        // activeModalCloser system -- <dialog> handles Escape/focus-trap on
        // its own). Appended onto `root` directly when `root` is a shadow
        // root (the <standplass-results> embed case), since a shadow root
        // has no `.body`; onto document.body for the direct-mount case.
        var compDialog = id('-comp-dialog');
        // Fire-and-forget, module-singleton (see ensureReferenceData's own
        // guard) -- discipline/class names for the modal's events list and
        // Resultater tab, same one-time reference fetch the source performs
        // at load rather than per page/instance.
        StandplassCompModal.ensureReferenceData(window.fetch.bind(window));
        // Same idea as personOpenSeq above: guards the async fetchDetail/
        // fetchResults writes into the shared bodyEl against a race where a
        // stale response resolves after the modal was reopened for a
        // different competition, or the tab was switched away and back.
        var compOpenSeq = 0;
        // Last-fetched Resultater rows, so the Gren filter can re-filter and
        // re-render client-side instead of re-fetching on every change.
        var compResults = [];
        if (!compDialog) {
            compDialog = document.createElement('dialog');
            compDialog.id = config.idPrefix + '-comp-dialog';
            compDialog.className = 'comp-modal-dialog';
            // Two persistent body containers, toggled via `hidden` -- not a
            // single shared body replaced by innerHTML on every tab switch.
            // Matches the source's own NSFUI.CompModal (#comp-view-detaljer/
            // #comp-view-resultater, _switchTab toggling .hidden), which
            // never destroys the Detaljer render when Resultater is shown.
            // A single-body-replace design (this file's own prior version)
            // loses the Detaljer content the moment Resultater is viewed,
            // with no way back short of a cache-and-restore patch -- the
            // real fix is to never destroy it in the first place.
            compDialog.innerHTML = '<div class="comp-modal-header"><h2 class="comp-modal-title"></h2>'
                + '<button type="button" class="comp-modal-close" aria-label="Lukk">×</button></div>'
                + '<p class="comp-modal-meta"></p>'
                + '<div class="program-toggle" role="group" aria-label="Vis"><button type="button" class="program-btn program-btn--active" data-comp-tab="detaljer" aria-pressed="true">Detaljer</button>'
                + '<button type="button" class="program-btn" data-comp-tab="resultater" aria-pressed="false">Resultater</button></div>'
                + '<div class="comp-modal-body" data-comp-view="detaljer"></div>'
                + '<div class="comp-modal-body" data-comp-view="resultater" hidden></div>';
            (root === document ? document.body : root).appendChild(compDialog);
        }
        compDialog.querySelector('.comp-modal-close').addEventListener('click', function () { compDialog.close(); });
        // A native <dialog>'s ::backdrop delivers its click with the dialog
        // itself as e.target (no separate backdrop node) -- same check the
        // source uses for its own competition/person dialogs.
        compDialog.addEventListener('click', function (e) { if (e.target === compDialog) { compDialog.close(); } });

        function openCompModal(compId, title, card) {
            var mySeq = ++compOpenSeq;
            compDialog.dataset.compId = compId;
            compDialog.querySelector('.comp-modal-title').textContent = title || '';
            compDialog.querySelector('.comp-modal-meta').textContent = card
                ? [StandplassFormat.formatDateRange(card.startDate, card.endDate), card.facilityName, card.organizationName].filter(Boolean).join(' · ')
                : '';
            var detailViewEl = compDialog.querySelector('[data-comp-view="detaljer"]');
            var resultsViewEl = compDialog.querySelector('[data-comp-view="resultater"]');
            detailViewEl.innerHTML = '<p class="ranking-status-msg">Laster…</p>';
            resultsViewEl.innerHTML = '';
            detailViewEl.hidden = false;
            resultsViewEl.hidden = true;
            // Reset to the Detaljer tab every time the modal opens for a new
            // competition, so a previous open's Resultater selection doesn't
            // leak into the next.
            Array.prototype.forEach.call(compDialog.querySelectorAll('.program-toggle button'), function (b) {
                var isDetaljer = b.getAttribute('data-comp-tab') === 'detaljer';
                b.classList.toggle('program-btn--active', isDetaljer);
                b.setAttribute('aria-pressed', String(isDetaljer));
            });
            compDialog.showModal();
            StandplassCompModal.fetchDetailWithFacility(compId, window.fetch.bind(window)).then(function (result) {
                if (mySeq !== compOpenSeq) { return; } // a newer competition was opened since this fetch started
                detailViewEl.innerHTML = StandplassCompModal.renderDetailBody(result.comp, result.facility);
            }, function () {
                if (mySeq !== compOpenSeq) { return; }
                detailViewEl.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste stevneinformasjon.</p>';
            });
        }

        compDialog.querySelector('.program-toggle').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-comp-tab]');
            if (!btn) { return; }
            var isDetaljer = btn.getAttribute('data-comp-tab') === 'detaljer';
            Array.prototype.forEach.call(compDialog.querySelectorAll('.program-toggle button'), function (b) {
                var isActive = b === btn;
                b.classList.toggle('program-btn--active', isActive);
                b.setAttribute('aria-pressed', String(isActive));
            });
            compDialog.querySelector('[data-comp-view="detaljer"]').hidden = !isDetaljer;
            compDialog.querySelector('[data-comp-view="resultater"]').hidden = isDetaljer;
            if (isDetaljer) { return; }
            var mySeq = compOpenSeq;
            var resultsViewEl = compDialog.querySelector('[data-comp-view="resultater"]');
            var compId = compDialog.dataset.compId;
            resultsViewEl.innerHTML = '<p class="ranking-status-msg">Laster…</p>';
            // compOpenSeq alone catches "a different competition opened since
            // this fetch started"; it doesn't change on a same-competition
            // tab click, so also re-check that Resultater is still the
            // active tab when the fetch resolves (covers switching back to
            // Detaljer before this fetch settles).
            function stillCurrent() {
                return mySeq === compOpenSeq
                    && compDialog.querySelector('.program-toggle button[aria-pressed="true"]').getAttribute('data-comp-tab') === 'resultater';
            }
            StandplassCompModal.fetchResults(compId, window.fetch.bind(window)).then(function (results) {
                if (!stillCurrent()) { return; }
                compResults = results;
                resultsViewEl.innerHTML = StandplassCompModal.renderResultsBody(compResults, '', config.idPrefix);
            }, function () {
                if (!stillCurrent()) { return; }
                resultsViewEl.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste resultater.</p>';
            });
        });

        // Delegated on compDialog (not the filter select itself) since the
        // Resultater body -- select included -- is torn down and rebuilt by
        // innerHTML on every filter change.
        compDialog.addEventListener('change', function (e) {
            var select = e.target.closest('.comp-results-disc-filter');
            if (!select) { return; }
            compDialog.querySelector('[data-comp-view="resultater"]').innerHTML =
                StandplassCompModal.renderResultsBody(compResults, select.value, config.idPrefix);
        });

        rowsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-comp-btn');
            if (!btn) { return; }
            var card = visibleCards.filter(function (c) { return String(c.id) === btn.dataset.compId; })[0];
            openCompModal(btn.dataset.compId, btn.textContent, card);
        });

        rowsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-person-btn');
            if (!btn) { return; }
            personModal.open(btn, {
                personId: btn.dataset.personId,
                personName: btn.dataset.personName,
                initialDisc: btn.dataset.discipline || null
            });
        });

        rowsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-collapse-btn');
            if (btn) {
                var card = btn.closest('.ranking-card');
                var collapsed = card.classList.toggle('ranking-card--collapsed');
                card.querySelector('table').hidden = collapsed;
                btn.setAttribute('aria-expanded', String(!collapsed));
                return;
            }
            if (e.target.classList.contains('stevner-collapse-all-btn')) {
                var allCollapsed = rowsEl.querySelectorAll('.ranking-card:not(.ranking-card--collapsed)').length === 0;
                Array.prototype.forEach.call(rowsEl.querySelectorAll('.ranking-card'), function (c) {
                    c.classList.toggle('ranking-card--collapsed', !allCollapsed);
                    c.querySelector('table').hidden = !allCollapsed;
                    c.querySelector('.stevner-collapse-btn').setAttribute('aria-expanded', String(allCollapsed));
                });
                e.target.textContent = allCollapsed ? 'Fold alle' : 'Åpne alle';
            }
        });

        personModal.openFromUrl();
    }

    return { init: init, normalizeClub: normalizeClub, matchesClub: matchesClub, flattenRows: flattenRows,
        buildCompetitionCards: buildCompetitionCards, matchesCompetition: matchesCompetition,
        groupCompetitionRows: groupCompetitionRows,
        competitionStats: competitionStats, columns: columns,
        statsLine: statsLine, formatUpdated: formatUpdated };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassStevnerPage;
}
