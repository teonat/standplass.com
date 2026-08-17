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

    // Shared by the flat-row name/discipline autocomplete (allRows) and the
    // card view (per-competition) — same predicate, two different inputs.
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

    function buildCompetitionCards(competitions, filters) {
        var withLowerQuery = { activeTab: filters.activeTab, activeDiscs: filters.activeDiscs, activeClubs: filters.activeClubs,
            klubbUnmatched: filters.klubbUnmatched, klubb: filters.klubb, nameQuery: (filters.nameQuery || '').toLowerCase() };
        var cards = [];
        (competitions || []).forEach(function (comp) {
            var rows = (comp.results || []).map(function (r) { return decorateRow(comp, r); })
                .filter(function (r) { return matchesFilters(r, withLowerQuery); });
            if (!rows.length) { return; }
            cards.push({
                id: comp.id, title: comp.title, status: comp.status, startDate: comp.startDate,
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

    function fmtNum(n) { return n == null ? '–' : String(n).replace('.', ','); }

    function statsLine(stats) {
        return stats.skyttere + ' skyttere · ' + stats.startere + ' startere · '
            + 'snitt ' + fmtNum(stats.snitt) + ' · median ' + fmtNum(stats.median);
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function formatUpdated(iso) {
        var d = new Date(iso);
        return 'Oppdatert ' + pad2(d.getUTCDate()) + '.' + pad2(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear()
            + ' kl. ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
    }

    function overallStatsBar(cards, lastUpdated, idPrefix) {
        if (cards.length < 2) { return ''; }
        var totals = cards.reduce(function (acc, c) {
            acc.skyttere += c.stats.skyttere; acc.startere += c.stats.startere; return acc;
        }, { skyttere: 0, startere: 0 });
        return '<div class="stevner-overall-stats"><span>' + cards.length + ' stevner · '
            + totals.skyttere + ' skyttere · ' + totals.startere + ' startere</span>'
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
            + '<button type="button" class="stevner-collapse-btn" data-comp-id="' + esc(card.id) + '" aria-expanded="true" aria-label="Fold sammen ' + esc(card.title || '') + '"><span class="stevner-collapse-icon">▾</span></button>'
            + '<div class="ranking-card-header-text">'
            + '<p class="ranking-card-title"><button type="button" class="stevner-comp-btn link-btn" data-comp-id="' + esc(card.id) + '">' + titleHtml + '</button>'
            + (showClassBadge ? ' ' + statusBadge(card.applicableForClassification) : '') + '</p>'
            + '<p class="stevner-comp-meta">' + meta + (links ? ' · ' + links : '') + '</p>'
            + '</div>'
            + '</div>'
            + '<table class="ranking-table"><thead><tr>'
            + '<th scope="col">#</th><th scope="col">Navn</th>'
            + '<th scope="col" class="stevner-tablet-hide">Klubb</th>'
            + '<th scope="col">Øvelse</th><th scope="col">Klasse</th>'
            + '<th scope="col">Poeng</th><th scope="col" class="stevner-tablet-hide">Ranking</th>'
            + '</tr></thead><tbody>' + groupsHtml + '</tbody></table>'
            + '<p class="stevner-comp-stats">' + esc(statsLine(card.stats)) + '</p>'
            + '</div>';
    }

    // Shared across every init() call on the page (both adapters, any number
    // of instances) so that with two open person modals on one page, Escape
    // closes only the most-recently-opened one instead of every instance's
    // modal at once -- see the keydown wiring change in Step 6 below.
    var activeModalCloser = null;
    var escapeHandlerWired = false;
    function wireGlobalEscapeHandler() {
        if (escapeHandlerWired) { return; }
        escapeHandlerWired = true;
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && activeModalCloser) { activeModalCloser(); }
        });
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
        var activeTab = 'alle';                    // 'alle' | 'klasse' | 'ikke'
        var activeGroupMode = 'klasse';            // key of COMPARATORS
        var masterClubs = {};                      // accumulates across loaded years (stevner.js:353-373)
        var masterDiscs = {};
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
            loadMoreBtn.hidden = pagination.state.done;
        }

        // pagination.js only clears state.loading on the success path, so a
        // failed fetch would wedge "Last flere" forever — clear it here and
        // show the failure instead of leaving a dead button.
        function showLoadError() {
            pagination.state.loading = false;
            loadMoreBtn.hidden = true;
            rowsEl.innerHTML = '<p class="ranking-empty">Kunne ikke laste resultater.</p>';
        }

        function load() {
            return pagination.loadMore().then(render, showLoadError);
        }

        loadMoreBtn.addEventListener('click', load);

        function currentFilters() {
            return { activeTab: activeTab, activeDiscs: activeDiscs, activeClubs: activeClubs,
                klubbUnmatched: klubbUnmatched, klubb: klubb, nameQuery: nameQuery, groupMode: activeGroupMode };
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
            return fetcher.fetchYear(dataBase, year).then(function (yearData) {
                allRows = flattenRows(yearData);
                currentCompetitions = yearData.competitions || [];
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
            var qs = new URLSearchParams(urlState.getSearch());
            if (activeClubs.length === 1) { qs.set('klubb', activeClubs[0]); } else { qs.delete('klubb'); }
            urlState.setSearch('?' + qs.toString());
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
            // Only this instance's own still-open modal clears the shared
            // pointer -- if a second instance's modal opened since, closing
            // this one must not null out that instance's active reference.
            if (activeModalCloser === closePersonModal) { activeModalCloser = null; }
            modalEl.hidden = true;
            modalEl.innerHTML = '';
            var qs = StandplassPersonModal.clearPersonFromUrl(urlState.getSearch());
            urlState.setSearch(qs);
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
            activeModalCloser = closePersonModal;
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

        wireGlobalEscapeHandler();

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
            urlState.setSearch(StandplassPersonModal.buildPersonUrl(urlState.getSearch(), personId, activeYear));
            openPersonModal(personId, activeYear);
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

        var personState = StandplassPersonModal.parsePersonFromUrl(urlState.getSearch());
        if (personState) {
            openPersonModal(personState.personId, personState.year || activeYear);
        }
    }

    return { init: init, normalizeClub: normalizeClub, matchesClub: matchesClub, flattenRows: flattenRows,
        buildCompetitionCards: buildCompetitionCards, groupCompetitionRows: groupCompetitionRows,
        competitionStats: competitionStats, columns: columns,
        statsLine: statsLine, formatUpdated: formatUpdated };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassStevnerPage;
}
