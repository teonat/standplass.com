// public/js/norgesfelt-page.js
//
// Page glue for /norgesfelt: national Norgesfelt field-pistol series
// results, read once from a static public/data/norgesfelt.json (scraped
// daily by .github/scripts/scrape_norgesfelt.py) -- no live API calls at
// all, unlike every other view in this project. Ported from the source's
// resultatliste-norgesfelt.js, generalized from a single-club default
// tab/filter to this project's own "default is unfiltered/national"
// convention.
var StandplassNorgesfeltPage = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Duplicated from stevner-page.js rather than loading that ~900-line
    // felt/bane-specific engine for two pure functions -- duplication
    // is the established pattern for these helpers, not a
    // stevner-page.js-only import.
    //
    // ponytail: substring match, so ?klubb=eksempel also matches a
    // hypothetical "Eksempel Pistolklubb". Switch to an explicit
    // slug→club-name map if two clubs ever collide.
    function normalizeClub(s) {
        return String(s == null ? '' : s).toLowerCase()
            .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
            .replace(/[^a-z0-9]/g, '');
    }

    function matchesClub(rowClub, slug) {
        return normalizeClub(rowClub).indexOf(normalizeClub(slug)) !== -1;
    }

    // type: 'individual' | 'total'. Tags each row with its discipline so
    // the "Alle resultater" tab can show/filter a Gren column across every
    // discipline at once -- the source JSON groups rows by discipline key,
    // this flattens that back into one list.
    function flattenAll(data, type) {
        var out = [];
        var disciplines = (data && data.disciplines) || {};
        Object.keys(disciplines).forEach(function (discName) {
            var rows = (disciplines[discName] && disciplines[discName][type]) || [];
            rows.forEach(function (r) {
                out.push({
                    rank: r.rank, date: r.date, name: r.name, club: r.club,
                    points: r.points, innertreff: r.innertreff, discipline: discName
                });
            });
        });
        return out;
    }

    // Distinct club names across every discipline and both individual/
    // total lists, sorted -- the source's own club filter is populated the
    // same way.
    function enumerateClubs(data) {
        var seen = {};
        var out = [];
        var disciplines = (data && data.disciplines) || {};
        Object.keys(disciplines).forEach(function (discName) {
            ['individual', 'total'].forEach(function (type) {
                (disciplines[discName][type] || []).forEach(function (r) {
                    if (r.club && !seen[r.club]) { seen[r.club] = true; out.push(r.club); }
                });
            });
        });
        return out.sort(function (a, b) { return a.localeCompare(b, 'no'); });
    }

    // Card-order: there is no live API here (unlike klubb/nasjonalt), so
    // the scraper's own DISCIPLINES list -- i.e. this object's own key
    // insertion order -- IS the correct display order. Do not re-sort.
    function disciplineOrder(data) {
        return Object.keys((data && data.disciplines) || {});
    }

    // activeClubs: exact club-name strings as chosen from enumerateClubs(),
    // never a raw slug -- slug resolution (a ?klubb= deep link) happens
    // once at load time via matchesClub(), see init(). Empty = show all.
    function getFilteredEntries(entries, activeClubs) {
        if (!activeClubs || !activeClubs.length) { return entries; }
        return entries.filter(function (e) { return activeClubs.indexOf(e.club) !== -1; });
    }

    // Plain .toLowerCase() substring match on name + club, matching every
    // other search in this project -- no NFC normalization (no evidence
    // this project has ever needed it, see the design doc).
    function searchMatchesEntry(entry, query) {
        var q = (query || '').trim().toLowerCase();
        if (!q) { return true; }
        return (entry.name || '').toLowerCase().indexOf(q) !== -1
            || (entry.club || '').toLowerCase().indexOf(q) !== -1;
    }

    function filterSearchEntries(entries, opts) {
        opts = opts || {};
        var discipline = opts.discipline || '';
        return entries.filter(function (e) {
            if (discipline && e.discipline !== discipline) { return false; }
            return searchMatchesEntry(e, opts.query);
        });
    }

    // Norgesfelt dates display as DD.MM.YYYY, which sorted as text would
    // order day-then-month; the derived YYYYMMDD key sorts
    // chronologically while the display string is untouched.
    function dateSortKey(dateStr) {
        if (!dateStr) { return null; }
        return String(dateStr).split('.').reverse().join('');
    }

    // Both norgesfelt tables flatten entries to the same row shape so
    // every sortable column is row[key]-backed (cell fns are invisible
    // to sorting); dateSort rides along for the Dato columns.
    function entryRow(e) {
        return { rank: e.rank, name: e.name, club: e.club, discipline: e.discipline,
            date: e.date, dateSort: dateSortKey(e.date), points: e.points, innertreff: e.innertreff };
    }

    // "Alle resultater" table spec (shared base). Gren appears only when
    // no discipline is filtered, Dato only for enkeltresultater; the
    // responsive cellClasses keep today's viewport breakpoints exactly
    // (the base applies them to th and td alike). Rows carry the
    // derived dateSort key; rank/name/club/points/innertreff come
    // straight off the entry.
    function searchTableSpec(filtered, showDiscCol, activeType) {
        filtered = filtered || [];
        var cols = [
            { key: 'rank', label: '#', align: 'center', cellClass: 'norgesfelt-mobile-hide', sortable: true, defaultDir: 'asc' },
            { key: 'name', label: 'Navn', sortable: true, defaultDir: 'asc' },
            { key: 'club', label: 'Forening', sortable: true, defaultDir: 'asc' }
        ];
        if (showDiscCol) {
            cols.push({ key: 'discipline', label: 'Gren', sortable: true, defaultDir: 'asc' });
        }
        if (activeType === 'individual') {
            cols.push({ key: 'dateSort', label: 'Dato', cellClass: 'norgesfelt-mobile-hide', sortable: true, defaultDir: 'asc',
                cell: function (row) { return row.date || '–'; } });
        }
        cols.push({ key: 'points', label: 'Poeng', align: 'right', sortable: true, defaultDir: 'desc' });
        cols.push({ key: 'innertreff', label: 'Innertreff', align: 'right', cellClass: 'norgesfelt-tablet-hide', sortable: true, defaultDir: 'desc' });
        return {
            columns: cols,
            rows: filtered.map(entryRow)
        };
    }

    // "Toppliste klubb" card spec (shared base). Same row shape as the
    // flat table (incl. dateSort). # is NOT sortable here — it is the
    // entry's own rank, not a placement. Klubb appears only when
    // exactly-one-club isn't selected, Dato only for enkeltresultater;
    // the responsive cellClasses keep today's card breakpoints exactly.
    // Null for empty entries — the page renders a message-only card.
    function toplisteCardSpec(filtered, showClubCol, activeSubType) {
        filtered = filtered || [];
        if (!filtered.length) { return null; }
        var cols = [
            { key: 'rank', label: '#', align: 'center' },
            { key: 'name', label: 'Navn', sortable: true, defaultDir: 'asc' }
        ];
        if (showClubCol) {
            cols.push({ key: 'club', label: 'Klubb', cellClass: 'norgesfelt-tablet-hide', sortable: true, defaultDir: 'asc' });
        }
        if (activeSubType === 'individual') {
            cols.push({ key: 'dateSort', label: 'Dato', cellClass: 'norgesfelt-mobile-hide', sortable: true, defaultDir: 'asc',
                cell: function (row) { return row.date || '–'; } });
        }
        cols.push({ key: 'points', label: 'Poeng', align: 'right', sortable: true, defaultDir: 'desc' });
        cols.push({ key: 'innertreff', label: 'Innertreff', cellClass: 'norgesfelt-tablet-hide', sortable: true, defaultDir: 'desc' });
        return {
            columns: cols,
            rows: filtered.map(entryRow)
        };
    }

    // Multi-value `clubs` URL param, comma-joined per-element encoded --
    // url-state.js's tracked params are opaque strings with no shape
    // assumption. Encoding/decoding is format.js's hardened implementation
    // (per-element try/catch decode fallback, String()-coerced encode) --
    // exposed here as thin delegates so callers and tests keep using the
    // page's own names; a malformed ?clubs= must never dead-end init().
    function parseClubsParam(raw) {
        return StandplassFormat.decodeIdList(raw);
    }

    function buildClubsParam(clubs) {
        return StandplassFormat.encodeIdList(clubs);
    }

    function init(config) {
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var urlState = config.urlState;
        var dataUrl = config.dataUrl || '/data/norgesfelt.json';

        var DEBOUNCE_MS = 300;

        var params = new URLSearchParams(urlState.getSearch());
        var activeTab = params.get('tab') === 'toppliste' ? 'toppliste' : 'sok';
        var activeType = params.get('type') === 'total' ? 'total' : 'individual';
        var activeDisc = params.get('disc') || '';
        var activeQuery = params.get('q') || '';
        var klubbSlug = params.get('klubb');
        var activeClubs = parseClubsParam(params.get('clubs'));
        var activeSubType = params.get('subtype') === 'total' ? 'total' : 'individual';

        var statusEl = id('-status');
        var updatedEl = id('-updated');
        var tabSokBtn = id('-tab-sok');
        var tabToppBtn = id('-tab-toppliste');
        var panelSok = id('-panel-sok');
        var panelTopp = id('-panel-toppliste');
        var searchInput = id('-search-input');
        var discSelect = id('-disc-select');
        var typeSelect = id('-type-select');
        var tableWrap = id('-search-table-wrap');
        var clubInput = id('-club-input');
        var clubList = id('-club-list');
        var clubTags = id('-club-tags');
        var clubClear = id('-club-clear');
        var subIndividualBtn = id('-sub-individual');
        var subTotalBtn = id('-sub-total');
        var cardsWrap = id('-cards-wrap');

        // "Rader" — one select per tab panel (the page's precedent: the
        // individual/total choice is also per-panel), kept in sync via
        // onChange. No persistence (owner ruling 2026-11-19): both
        // panels open at the markup default (30). The var is set on the
        // root — the common ancestor of both panels' scroll regions.
        // wireRowsSelect's initial apply fires onChange too; the
        // sibling-sync guard makes that a no-op (same value).
        var rowsSokSelect = id('-rows');
        var rowsToppSelect = id('-rows-topp');
        StandplassFilterWidgets.wireRowsSelect({
            select: rowsSokSelect,
            contentEl: id('-root'),
            onChange: function (v) { if (rowsToppSelect.value !== v) { rowsToppSelect.value = v; } }
        });
        StandplassFilterWidgets.wireRowsSelect({
            select: rowsToppSelect,
            contentEl: id('-root'),
            onChange: function (v) { if (rowsSokSelect.value !== v) { rowsSokSelect.value = v; } }
        });

        var data = null;
        var debounceTimer = null;
        var clubWidget = null;

        function setUrl() {
            var qs = new URLSearchParams();
            qs.set('tab', activeTab);
            if (activeType !== 'individual') { qs.set('type', activeType); }
            if (activeDisc) { qs.set('disc', activeDisc); }
            if (activeQuery) { qs.set('q', activeQuery); }
            if (activeClubs.length) { qs.set('clubs', buildClubsParam(activeClubs)); }
            if (activeSubType !== 'individual') { qs.set('subtype', activeSubType); }
            urlState.setSearch('?' + qs.toString());
        }

        function setTab(tab, moveFocus) {
            activeTab = tab;
            tabSokBtn.classList.toggle('program-btn--active', tab === 'sok');
            tabSokBtn.setAttribute('aria-pressed', String(tab === 'sok'));
            tabToppBtn.classList.toggle('program-btn--active', tab === 'toppliste');
            tabToppBtn.setAttribute('aria-pressed', String(tab === 'toppliste'));
            panelSok.hidden = tab !== 'sok';
            panelTopp.hidden = tab !== 'toppliste';
            if (moveFocus) { (tab === 'sok' ? panelSok : panelTopp).focus(); }
            setUrl();
        }

        tabSokBtn.addEventListener('click', function () { if (activeTab !== 'sok') { setTab('sok', true); } });
        tabToppBtn.addEventListener('click', function () { if (activeTab !== 'toppliste') { setTab('toppliste', true); } });
        setTab(activeTab, false); // wire tab switching before data arrives, so it works even mid-load -- never move focus on initial setup, only on a real user click

        // --- "Alle resultater" tab ---

        // Sort state for the shared-base table (session-only). Survives
        // search debounce and disc/type re-renders.
        var searchSort = null;
        var searchSpec = null;

        function searchTableState() {
            return { sort: searchSort, hidden: {}, runtimeHidden: [], widthTier: null };
        }

        function wireSearchTable() {
            if (!searchSpec) { return; }
            if (!tableWrap.querySelector('table[data-dt-id="norgesfelt-search"]')) { return; }
            StandplassDataTable.wireTable(tableWrap, 'norgesfelt-search', searchSpec, {
                onSortChange: function (sort) {
                    searchSort = sort;
                    // Wrap+table replace tableWrap.innerHTML together —
                    // nothing else lives in the wrap, and re-rendering
                    // through renderSearchTable re-applies the active
                    // filters with the new sort.
                    renderSearchTable();
                    var btn = tableWrap.querySelector('table[data-dt-id="norgesfelt-search"] .dt-sort-btn[data-dt-sort="' + sort.key + '"]');
                    if (btn) { btn.focus(); }
                }
            }, searchTableState());
        }

        function renderSearchTable() {
            if (!data) { return; }
            var entries = flattenAll(data, activeType);
            var filtered = filterSearchEntries(entries, { discipline: activeDisc, query: activeQuery });
            statusEl.textContent = 'Viser ' + filtered.length + ' av ' + entries.length + ' resultater.';
            if (!filtered.length) {
                searchSpec = null;
                tableWrap.innerHTML = '<p class="ranking-status-msg">Ingen treff.</p>';
                return;
            }
            var showDiscCol = !activeDisc;
            searchSpec = searchTableSpec(filtered, showDiscCol, activeType);
            // Previously deliberately uncapped (owner-ruled change): a
            // contained scroll region now caps the height; every row
            // stays real DOM (Ctrl+F reaches all of them).
            tableWrap.innerHTML = '<div class="club-stats-list-scroll">'
                + StandplassDataTable.renderTable('norgesfelt-search', searchSpec, searchTableState())
                + '</div>';
            wireSearchTable();
        }

        function populateDiscSelect() {
            discSelect.innerHTML = '<option value="">Alle grener</option>' + disciplineOrder(data).map(function (d) {
                return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
            }).join('');
            discSelect.value = activeDisc;
        }

        searchInput.value = activeQuery;
        searchInput.addEventListener('input', function () {
            var val = searchInput.value;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                activeQuery = val;
                setUrl();
                renderSearchTable();
            }, DEBOUNCE_MS);
        });

        discSelect.addEventListener('change', function () {
            activeDisc = discSelect.value;
            setUrl();
            renderSearchTable();
        });

        typeSelect.value = activeType;
        typeSelect.addEventListener('change', function () {
            activeType = typeSelect.value;
            setUrl();
            renderSearchTable();
        });

        // --- "Toppliste klubb" tab ---

        // Per-card sort state + spec, keyed by discName (session-only).
        // Survives club-filter re-renders — changing the club selection
        // re-sorts nothing.
        var toplisteSort = {};
        var toplisteSpecs = {};

        function cardTableState(discName) {
            return { sort: toplisteSort[discName] || null, hidden: {}, runtimeHidden: [], widthTier: null };
        }

        function wireCardTable(cell, discName) {
            var spec = toplisteSpecs[discName];
            if (!spec) { return; }
            var dtId = 'norgesfelt-card-' + discName;
            var tableSel = 'table[data-dt-id="' + dtId.replace(/"/g, '\\"') + '"]';
            if (!cell.querySelector(tableSel)) { return; }
            StandplassDataTable.wireTable(cell, dtId, spec, {
                onSortChange: function (sort) {
                    toplisteSort[discName] = sort;
                    // Surgical: replace only this card's BARE table —
                    // re-wrapping would nest scroll regions, and sibling
                    // cards stay untouched.
                    var tableEl = cell.querySelector(tableSel);
                    if (tableEl) {
                        tableEl.outerHTML = StandplassDataTable.renderTable(dtId, spec, cardTableState(discName));
                        wireCardTable(cell, discName);
                    }
                    var btn = cell.querySelector(tableSel + ' .dt-sort-btn[data-dt-sort="' + sort.key + '"]');
                    if (btn) { btn.focus(); }
                }
            }, cardTableState(discName));
        }

        function renderCard(discName) {
            var cell = cardsWrap.querySelector('[data-disc-name="' + discName.replace(/"/g, '\\"') + '"]');
            if (!cell) { return; }
            var rows = (data.disciplines[discName][activeSubType] || []);
            var filtered = getFilteredEntries(rows, activeClubs);
            var spec = toplisteCardSpec(filtered, activeClubs.length !== 1, activeSubType);
            if (!spec) {
                cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(discName) + '</h2></div>'
                    + '<p class="ranking-status-msg">Ingen resultater</p></div>';
                return;
            }
            toplisteSpecs[discName] = spec;
            // club-stats-list-scroll is ADDED alongside the existing
            // ranking-card-table-wrap (that rule is untouched) — the
            // contained scroll region caps height, Rader-driven.
            cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(discName) + '</h2></div>'
                + '<div class="ranking-card-table-wrap club-stats-list-scroll">'
                + StandplassDataTable.renderTable('norgesfelt-card-' + discName, spec, cardTableState(discName))
                + '</div></div>';
            wireCardTable(cell, discName);
        }

        function renderCards() {
            if (!data) { return; }
            var discs = disciplineOrder(data).filter(function (discName) {
                var rows = data.disciplines[discName][activeSubType] || [];
                return getFilteredEntries(rows, activeClubs).length > 0;
            });
            if (!discs.length) {
                cardsWrap.innerHTML = '<p class="ranking-status-msg">Ingen resultater for valgt klubb.</p>';
                return;
            }
            cardsWrap.innerHTML = discs.map(function (discName) {
                return '<div class="ranking-cell" data-disc-name="' + esc(discName) + '"></div>';
            }).join('');
            discs.forEach(function (discName) { renderCard(discName); });
        }

        function setSubType(type) {
            activeSubType = type;
            subIndividualBtn.classList.toggle('program-btn--active', type === 'individual');
            subIndividualBtn.setAttribute('aria-pressed', String(type === 'individual'));
            subTotalBtn.classList.toggle('program-btn--active', type === 'total');
            subTotalBtn.setAttribute('aria-pressed', String(type === 'total'));
            setUrl();
            renderCards();
        }
        subIndividualBtn.addEventListener('click', function () { if (activeSubType !== 'individual') { setSubType('individual'); } });
        subTotalBtn.addEventListener('click', function () { if (activeSubType !== 'total') { setSubType('total'); } });
        setSubType(activeSubType); // sync button state (and URL) with a ?subtype= deep link before data arrives, same as setTab(activeTab, false) above -- renderCards() no-ops until data loads

        function onClubsChanged() {
            setUrl();
            renderCards();
        }

        function wireClubWidget() {
            var allClubs = enumerateClubs(data).map(function (name) { return { id: name, name: name }; });
            clubWidget = StandplassFilterWidgets.makeTagComboHandlers({
                input: clubInput, list: clubList, tagsEl: clubTags, clear: clubClear,
                getItems: function (q) {
                    var query = (q || '').trim().toLowerCase();
                    return (query ? allClubs.filter(function (c) { return c.name.toLowerCase().indexOf(query) !== -1; }) : allClubs).slice(0, 50);
                },
                getSelected: function () { return activeClubs.map(function (name) { return { id: name, name: name }; }); },
                onSelect: function (clubId) {
                    if (activeClubs.indexOf(clubId) === -1) { activeClubs.push(clubId); }
                    clubWidget.rebuild();
                    onClubsChanged();
                },
                onRemove: function (clubId) {
                    activeClubs = activeClubs.filter(function (c) { return c !== clubId; });
                    clubWidget.rebuild();
                    onClubsChanged();
                },
                onClearAll: function () {
                    activeClubs = [];
                    clubWidget.rebuild();
                    onClubsChanged();
                }
            });
            clubWidget.rebuild();
        }

        window.fetch(dataUrl).then(function (r) {
            if (!r.ok) { throw new Error(String(r.status)); }
            return r.json();
        }).then(function (json) {
            data = json;
            if (data.lastUpdated) { updatedEl.textContent = 'Oppdatert ' + StandplassFormat.formatDate(data.lastUpdated); }
            if (klubbSlug && !activeClubs.length) {
                var matched = enumerateClubs(data).filter(function (name) { return matchesClub(name, klubbSlug); });
                if (matched.length) { activeClubs = matched; setUrl(); }
            }
            populateDiscSelect();
            renderSearchTable();
            wireClubWidget();
            renderCards();
        }, function () {
            statusEl.textContent = '';
            tableWrap.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste norgesfelt-data.</p>';
            cardsWrap.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste norgesfelt-data.</p>';
        });
    }

    return {
        init: init,
        normalizeClub: normalizeClub,
        matchesClub: matchesClub,
        flattenAll: flattenAll,
        enumerateClubs: enumerateClubs,
        disciplineOrder: disciplineOrder,
        getFilteredEntries: getFilteredEntries,
        searchMatchesEntry: searchMatchesEntry,
        filterSearchEntries: filterSearchEntries,
        dateSortKey: dateSortKey,
        searchTableSpec: searchTableSpec,
        toplisteCardSpec: toplisteCardSpec,
        parseClubsParam: parseClubsParam,
        buildClubsParam: buildClubsParam
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassNorgesfeltPage;
}
