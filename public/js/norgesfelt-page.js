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

    // Escapes a value for use inside a double-quoted CSS attribute
    // selector. Backslash FIRST — an unescaped backslash would eat the
    // following character's escape (CodeQL flagged the quote-only
    // version as js/incomplete-sanitization); then the quote itself.
    // Site reference data carries neither, so this is hardening, not
    // a data fix.
    function selAttr(v) {
        return String(v == null ? '' : v)
            .replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
    // hideBelow tiers keep today's viewport breakpoints exactly (700 =
    // the old mobile-hide rule, 900 = the old tablet-hide one). Rows
    // carry the derived dateSort key; rank/name/club/points/innertreff
    // come straight off the entry.
    function searchTableSpec(filtered, showDiscCol, activeType) {
        filtered = filtered || [];
        var cols = [
            { key: 'rank', label: '#', align: 'center', hideBelow: 700, sortable: true, defaultDir: 'asc' },
            { key: 'name', label: 'Navn', sortable: true, defaultDir: 'asc' },
            { key: 'club', label: 'Forening', sortable: true, defaultDir: 'asc' }
        ];
        if (showDiscCol) {
            cols.push({ key: 'discipline', label: 'Gren', sortable: true, defaultDir: 'asc' });
        }
        if (activeType === 'individual') {
            cols.push({ key: 'dateSort', label: 'Dato', hideBelow: 700, sortable: true, defaultDir: 'asc',
                cell: function (row) { return row.date || '–'; } });
        }
        cols.push({ key: 'points', label: 'Poeng', align: 'right', sortable: true, defaultDir: 'desc' });
        cols.push({ key: 'innertreff', label: 'Innertreff', align: 'right', hideBelow: 900, sortable: true, defaultDir: 'desc' });
        return {
            columns: cols,
            // Page order is the ranking (every entry carries an
            // ascending rank — verified against the full data set) —
            // # asc is a true initial sort. The column hides below
            // 700px, where the marking is invisible anyway.
            defaultSort: { key: 'rank', dir: 'asc' },
            rows: filtered.map(entryRow)
        };
    }

    // "Toppliste klubb" card spec (shared base). Same row shape as the
    // flat table (incl. dateSort). # is NOT sortable here — it is the
    // entry's own rank, not a placement. Klubb appears only when
    // exactly-one-club isn't selected, Dato only for enkeltresultater;
    // the hideBelow tiers keep today's card breakpoints exactly (700 =
    // old mobile-hide, 900 = old tablet-hide). Null for empty entries — the page renders a message-only card.
    function toplisteCardSpec(filtered, showClubCol, activeSubType) {
        filtered = filtered || [];
        if (!filtered.length) { return null; }
        var cols = [
            { key: 'rank', label: '#', align: 'center' },
            { key: 'name', label: 'Navn', sortable: true, defaultDir: 'asc' }
        ];
        if (showClubCol) {
            cols.push({ key: 'club', label: 'Klubb', hideBelow: 900, sortable: true, defaultDir: 'asc' });
        }
        if (activeSubType === 'individual') {
            cols.push({ key: 'dateSort', label: 'Dato', hideBelow: 700, sortable: true, defaultDir: 'asc',
                cell: function (row) { return row.date || '–'; } });
        }
        cols.push({ key: 'points', label: 'Poeng', align: 'right', sortable: true, defaultDir: 'desc' });
        cols.push({ key: 'innertreff', label: 'Innertreff', hideBelow: 900, sortable: true, defaultDir: 'desc' });
        return {
            columns: cols,
            // Page order is the ranking (rank asc = Poeng desc for
            // ranked data; # itself is not sortable here) — Poeng desc
            // is a true initial sort.
            defaultSort: { key: 'points', dir: 'desc' },
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

    // Smallest crossed responsive breakpoint (700 mobile / 900 tablet) —
    // the tier the base's hideBelow semantics consume. Same two-value
    // scheme as terminliste's.
    function computeWidthTier() {
        var crossed = [700, 900].filter(function (w) {
            return window.matchMedia('(max-width:' + w + 'px)').matches;
        });
        return crossed.length ? crossed[0] : null;
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

        // Session-only view state (never persisted — standing ruling):
        // two INDEPENDENT picker maps, one per tab (owner ruling
        // 2026-11-20: the tabs share column keys with different
        // meanings — "Klubb" on the cards vs "Forening" on the search
        // table — so hiding one must not hide the other), plus the
        // smallest crossed responsive breakpoint (700/900), converted
        // from the old CSS hide-class media queries at identical
        // widths.
        var sokHidden = {};
        var topplisteHidden = {};
        var currentWidthTier = computeWidthTier();
        [700, 900].forEach(function (w) {
            var mql = window.matchMedia('(max-width:' + w + 'px)');
            var onTierChange = function () {
                var next = computeWidthTier();
                if (next === currentWidthTier) { return; }
                currentWidthTier = next;
                renderSearchTable();
                renderCards();
                wireSearchPicker();
                wireTopplistePicker();
            };
            if (typeof mql.addEventListener === 'function') { mql.addEventListener('change', onTierChange); }
            else if (typeof mql.addListener === 'function') { mql.addListener(onTierChange); }
        });

        // Each tab panel's own Kolonner button, appended INTO the panel's
        // filter row (the page markup is static HTML, so the button is
        // injected here at init — post-dependencies, the base is
        // available). The anchor WRAPS the button (stevner pattern): the
        // panel right-aligns against the anchor, so the button sits
        // exactly where the panel opens; the filter row's
        // align-items: flex-end puts it on the controls' baseline.
        [panelSok, panelTopp].forEach(function (panel) {
            var filters = panel.querySelector('.ranking-filters');
            if (!filters) { return; }
            var wrap = document.createElement('div');
            wrap.className = 'dt-picker-anchor';
            var pickerBtn = document.createElement('button');
            pickerBtn.type = 'button';
            pickerBtn.className = 'dt-picker-btn';
            pickerBtn.setAttribute('data-dt-picker', '');
            pickerBtn.setAttribute('aria-haspopup', 'true');
            pickerBtn.setAttribute('aria-expanded', 'false');
            pickerBtn.textContent = 'Kolonner';
            wrap.appendChild(pickerBtn);
            filters.appendChild(wrap);
        });

        function syncHiddenMap(map, next) {
            Object.keys(map).forEach(function (k) { delete map[k]; });
            Object.keys(next || {}).forEach(function (k) { map[k] = next[k]; });
        }

        // destroy-before-rewire — but ONLY when the column list or tier
        // actually changed: onColumnsChange re-renders through these
        // functions too, and a destroy-before-rewire on every toggle
        // would close the user's OPEN panel mid-click (owner QA:
        // "clicking a column immediately closes it"). The hidden map
        // syncs in place either way; the picker's checkbox defaults are
        // tier- and column-set-dependent (Gren only unfiltered, Dato
        // only enkeltresultater), which is what the signature captures.
        var searchPickerWire = null;
        var searchPickerSig = null;
        function wireSearchPicker() {
            if (!searchSpec) {
                if (searchPickerWire) { searchPickerWire.destroy(); searchPickerWire = null; }
                searchPickerSig = null;
                return;
            }
            var sig = currentWidthTier + '|' + searchSpec.columns.map(function (c) { return c.key; }).join(',');
            if (searchPickerWire && sig === searchPickerSig) { return; }
            if (searchPickerWire) { searchPickerWire.destroy(); searchPickerWire = null; }
            searchPickerWire = StandplassDataTable.wirePicker(panelSok, { columns: searchSpec.columns }, {
                onColumnsChange: function (next) {
                    syncHiddenMap(sokHidden, next);
                    renderSearchTable();
                }
            }, searchTableState());
            searchPickerSig = sig;
        }

        var toppPickerWire = null;
        var toppPickerSig = null;
        function wireTopplistePicker() {
            var first = Object.keys(toplisteSpecs)[0];
            if (!first) {
                if (toppPickerWire) { toppPickerWire.destroy(); toppPickerWire = null; }
                toppPickerSig = null;
                return;
            }
            var sig = currentWidthTier + '|' + toplisteSpecs[first].columns.map(function (c) { return c.key; }).join(',');
            if (toppPickerWire && sig === toppPickerSig) { return; }
            if (toppPickerWire) { toppPickerWire.destroy(); toppPickerWire = null; }
            toppPickerWire = StandplassDataTable.wirePicker(panelTopp, { columns: toplisteSpecs[first].columns }, {
                onColumnsChange: function (next) {
                    syncHiddenMap(topplisteHidden, next);
                    renderCards();
                }
            }, cardTableState(first));
            toppPickerSig = sig;
        }

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
            return { sort: searchSort, hidden: sokHidden, runtimeHidden: [], widthTier: currentWidthTier };
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
            wireSearchPicker();
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
            return { sort: toplisteSort[discName] || null, hidden: topplisteHidden, runtimeHidden: [], widthTier: currentWidthTier };
        }

        function wireCardTable(cell, discName) {
            var spec = toplisteSpecs[discName];
            if (!spec) { return; }
            var dtId = 'norgesfelt-card-' + discName;
            var tableSel = 'table[data-dt-id="' + selAttr(dtId) + '"]';
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
            var cell = cardsWrap.querySelector('[data-disc-name="' + selAttr(discName) + '"]');
            if (!cell) { return; }
            var rows = (data.disciplines[discName][activeSubType] || []);
            var filtered = getFilteredEntries(rows, activeClubs);
            var spec = toplisteCardSpec(filtered, activeClubs.length !== 1, activeSubType);
            if (!spec) {
                cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(discName) + '</h2></div>'
                    + '<p class="ranking-empty">Ingen resultater</p></div>';
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
            // Stale spec shapes from earlier renders (e.g. before a
            // subtype switch) must not feed the picker — only the
            // current pass's cards are listed.
            toplisteSpecs = {};
            var discs = disciplineOrder(data).filter(function (discName) {
                var rows = data.disciplines[discName][activeSubType] || [];
                return getFilteredEntries(rows, activeClubs).length > 0;
            });
            if (!discs.length) {
                cardsWrap.innerHTML = '<p class="ranking-status-msg">Ingen resultater for valgt klubb.</p>';
                wireTopplistePicker(); // destroys the stale wiring; nothing to list
                return;
            }
            cardsWrap.innerHTML = discs.map(function (discName) {
                return '<div class="ranking-cell" data-disc-name="' + esc(discName) + '"></div>';
            }).join('');
            discs.forEach(function (discName) { renderCard(discName); });
            wireTopplistePicker();
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
