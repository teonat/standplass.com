// public/js/norgesfelt-page.js
//
// Page glue for /norgesfelt: national Norgesfelt field-pistol series
// results, read once from a static public/data/norgesfelt.json (scraped
// daily by .github/scripts/scrape_norgesfelt.py) -- no live API calls at
// all, unlike every other view in this project. Ported from the source's
// resultatliste-norgesfelt.js, generalized from a single-club default
// tab/filter to this project's own "default is unfiltered/national"
// convention -- see docs/superpowers/specs/2026-09-04-norgesfelt-view-design.md.
var StandplassNorgesfeltPage = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Duplicated from stevner-page.js rather than loading that ~900-line
    // felt/bane-specific engine for two pure functions -- CLAUDE.md's
    // "Conventions" section already documents this as the pattern any view
    // should follow, not a stevner-page.js-only helper.
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

    // Page-local comma-join/split for the multi-value `clubs` URL param --
    // url-state.js's tracked params are opaque strings with no shape
    // assumption, same pattern terminliste-page.js already uses for its
    // own multi-selects.
    function parseClubsParam(raw) {
        if (!raw) { return []; }
        return raw.split(',').map(function (s) { return decodeURIComponent(s); }).filter(Boolean);
    }

    function buildClubsParam(clubs) {
        return clubs.map(encodeURIComponent).join(',');
    }

    function init(config) {
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var urlState = config.urlState;
        var dataUrl = config.dataUrl || '/data/norgesfelt.json';

        var TOP_N = 10;
        var DEBOUNCE_MS = 300;

        var params = new URLSearchParams(urlState.getSearch());
        var activeTab = params.get('tab') === 'toppliste' ? 'toppliste' : 'sok';
        var activeType = params.get('type') === 'total' ? 'total' : 'individual';
        var activeDisc = params.get('disc') || '';
        var activeQuery = params.get('q') || '';
        var klubbSlug = params.get('klubb');
        var activeClubs = parseClubsParam(params.get('clubs'));

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

        var data = null;
        var debounceTimer = null;
        var cardState = {}; // { discName: expanded }
        var activeSubType = 'individual';
        var clubWidget = null;

        function setUrl() {
            var qs = new URLSearchParams();
            qs.set('tab', activeTab);
            if (activeType !== 'individual') { qs.set('type', activeType); }
            if (activeDisc) { qs.set('disc', activeDisc); }
            if (activeQuery) { qs.set('q', activeQuery); }
            if (activeClubs.length) { qs.set('clubs', buildClubsParam(activeClubs)); }
            urlState.setSearch('?' + qs.toString());
        }

        function setTab(tab) {
            activeTab = tab;
            tabSokBtn.classList.toggle('program-btn--active', tab === 'sok');
            tabSokBtn.setAttribute('aria-pressed', String(tab === 'sok'));
            tabToppBtn.classList.toggle('program-btn--active', tab === 'toppliste');
            tabToppBtn.setAttribute('aria-pressed', String(tab === 'toppliste'));
            panelSok.hidden = tab !== 'sok';
            panelTopp.hidden = tab !== 'toppliste';
            (tab === 'sok' ? panelSok : panelTopp).focus();
            setUrl();
        }

        tabSokBtn.addEventListener('click', function () { if (activeTab !== 'sok') { setTab('sok'); } });
        tabToppBtn.addEventListener('click', function () { if (activeTab !== 'toppliste') { setTab('toppliste'); } });
        setTab(activeTab); // wire tab switching before data arrives, so it works even mid-load

        // --- "Alle resultater" tab ---

        function renderSearchTable() {
            if (!data) { return; }
            var entries = flattenAll(data, activeType);
            var filtered = filterSearchEntries(entries, { discipline: activeDisc, query: activeQuery });
            statusEl.textContent = 'Viser ' + filtered.length + ' av ' + entries.length + ' resultater.';
            if (!filtered.length) {
                tableWrap.innerHTML = '<p class="ranking-status-msg">Ingen treff.</p>';
                return;
            }
            var showDiscCol = !activeDisc;
            var rows = filtered.map(function (e) {
                return '<tr><td class="norgesfelt-mobile-hide">' + esc(e.rank) + '</td>'
                    + '<td>' + esc(e.name) + '</td>'
                    + '<td>' + esc(e.club) + '</td>'
                    + (showDiscCol ? '<td>' + esc(e.discipline) + '</td>' : '')
                    + (activeType === 'individual' ? '<td class="norgesfelt-mobile-hide">' + esc(e.date || '–') + '</td>' : '')
                    + '<td class="ranking-score">' + esc(e.points) + '</td>'
                    + '<td class="norgesfelt-tablet-hide">' + esc(e.innertreff) + '</td></tr>';
            }).join('');
            tableWrap.innerHTML = '<table class="ranking-table"><thead><tr>'
                + '<th class="norgesfelt-mobile-hide">#</th><th>Navn</th><th>Forening</th>'
                + (showDiscCol ? '<th>Gren</th>' : '')
                + (activeType === 'individual' ? '<th class="norgesfelt-mobile-hide">Dato</th>' : '')
                + '<th>Poeng</th><th class="norgesfelt-tablet-hide">Innertreff</th>'
                + '</tr></thead><tbody>' + rows + '</tbody></table>';
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

        function renderCard(discName) {
            var cell = cardsWrap.querySelector('[data-disc-name="' + discName.replace(/"/g, '\\"') + '"]');
            if (!cell) { return; }
            var rows = (data.disciplines[discName][activeSubType] || []);
            var filtered = getFilteredEntries(rows, activeClubs);
            var expanded = !!cardState[discName];
            var visible = expanded ? filtered : filtered.slice(0, TOP_N);
            var showClubCol = activeClubs.length !== 1;
            var colCount = 4 + (showClubCol ? 1 : 0) + (activeSubType === 'individual' ? 1 : 0); // #, Navn, Poeng, Innertreff always shown
            var body = !filtered.length
                ? '<tr><td colspan="' + colCount + '" class="ranking-empty">Ingen resultater</td></tr>'
                : visible.map(function (e) {
                    return '<tr><td class="ranking-rank">' + esc(e.rank) + '</td>'
                        + '<td>' + esc(e.name) + '</td>'
                        + (showClubCol ? '<td class="norgesfelt-tablet-hide">' + esc(e.club) + '</td>' : '')
                        + (activeSubType === 'individual' ? '<td class="norgesfelt-mobile-hide">' + esc(e.date || '–') + '</td>' : '')
                        + '<td class="ranking-score">' + esc(e.points) + '</td>'
                        + '<td class="norgesfelt-tablet-hide">' + esc(e.innertreff) + '</td></tr>';
                }).join('');
            var toggleHtml = filtered.length > TOP_N
                ? '<button type="button" class="ranking-toggle" data-disc-name="' + esc(discName) + '" aria-label="'
                    + (expanded ? 'Vis kun topp ' + TOP_N + ' for ' + esc(discName) : 'Vis alle ' + filtered.length + ' resultater for ' + esc(discName)) + '">'
                    + (expanded ? 'Vis topp ' + TOP_N : 'Vis alle (' + filtered.length + ')') + '</button>'
                : '';
            cell.innerHTML = '<div class="ranking-card"><div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(discName) + '</h2></div>'
                + '<table class="ranking-table"><thead><tr><th>#</th><th>Navn</th>'
                + (showClubCol ? '<th class="norgesfelt-tablet-hide">Klubb</th>' : '')
                + (activeSubType === 'individual' ? '<th class="norgesfelt-mobile-hide">Dato</th>' : '')
                + '<th>Poeng</th><th class="norgesfelt-tablet-hide">Innertreff</th></tr></thead><tbody>' + body + '</tbody></table>'
                + toggleHtml + '</div>';
        }

        function renderCards() {
            if (!data) { return; }
            cardState = {};
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

        cardsWrap.addEventListener('click', function (e) {
            var btn = e.target.closest('.ranking-toggle');
            if (!btn) { return; }
            var discName = btn.getAttribute('data-disc-name');
            cardState[discName] = !cardState[discName];
            renderCard(discName);
        });

        function setSubType(type) {
            activeSubType = type;
            subIndividualBtn.classList.toggle('program-btn--active', type === 'individual');
            subIndividualBtn.setAttribute('aria-pressed', String(type === 'individual'));
            subTotalBtn.classList.toggle('program-btn--active', type === 'total');
            subTotalBtn.setAttribute('aria-pressed', String(type === 'total'));
            renderCards();
        }
        subIndividualBtn.addEventListener('click', function () { if (activeSubType !== 'individual') { setSubType('individual'); } });
        subTotalBtn.addEventListener('click', function () { if (activeSubType !== 'total') { setSubType('total'); } });

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
                if (matched.length) { activeClubs = matched; }
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
        parseClubsParam: parseClubsParam,
        buildClubsParam: buildClubsParam
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassNorgesfeltPage;
}
