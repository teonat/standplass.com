// public/js/terminliste-page.js
//
// Page glue for /terminliste: a live NSF competition calendar across all
// 4 branches, plus a compact club-scoped widget mode sharing the same
// engine. Ported from the source's terminliste.js + stevner-widget.js
// (the widget mode replaces the source's separate front-page
// stevner-widget.js). Unlike
// nasjonalt-page.js's processBranchlist, this does NOT flatten to a
// per-discipline list -- terminliste filters by branch (Gren) and
// disciplineGroup (Øvelsesgruppe) only, never by individual discipline.
var StandplassTerminlistePage = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function processBranchlist(rawData) {
        var items = (rawData && rawData.items) || [];
        var branches = [];
        items.forEach(function (branch) {
            if (branch.deleted) { return; }
            var groups = (branch.disciplineGroups || [])
                .filter(function (g) { return !g.deleted; })
                .map(function (g) { return { id: g.id, name: g.name, branchId: g.branchId }; });
            branches.push({ id: branch.id, name: branch.name, groups: groups });
        });
        return { branches: branches };
    }

    var branchlistPromise = null;
    var branchlistData = { branches: [] };
    function ensureBranchlist(fetchFn) {
        if (branchlistPromise) { return branchlistPromise; }
        branchlistPromise = fetchFn('https://nsfapi.azurewebsites.net/query/branchlist')
            .then(function (r) { if (!r.ok) { throw new Error(String(r.status)); } return r.json(); })
            .then(function (data) { branchlistData = processBranchlist(data); return branchlistData; });
        return branchlistPromise;
    }

    var STATUS_LABEL = { 0: 'Søknad', 1: 'Godkjent', 2: 'Avvist', 3: 'Avlyst' };

    // Comma-joined id lists for both the competitionlist API's `in:` JSON-
    // array params and this page's own multi-value URL params. Encoding/
    // decoding is format.js's hardened implementation (per-element
    // try/catch decode fallback, String()-coerced encode) -- exposed here
    // as thin delegates so callers and tests keep using the page's own
    // names; a malformed ?t_gren= must never dead-end init().

    // ponytail: orderBy kept as a literal string, not via qs.set(), same
    // reason as klubb-page.js/nasjonalt-page.js's own URL builders --
    // URLSearchParams would percent-encode the colon, and this keeps the
    // query string byte-identical to what the source itself sends.
    function buildCompetitionListUrl(opts) {
        var qs = new URLSearchParams();
        qs.set('pageIndex', String(opts.pageIndex || 0));
        qs.set('pageSize', String(opts.pageSize));
        if (opts.fra) { qs.set('startDate', 'ge:' + opts.fra + 'T00:00:00.000Z'); }
        if (opts.til) { qs.set('endDate', 'le:' + opts.til + 'T23:59:59.999Z'); }
        if (opts.branchIds && opts.branchIds.length) { qs.set('branches', 'in:' + JSON.stringify(opts.branchIds)); }
        if (opts.orgIds && opts.orgIds.length) { qs.set('organizationId', 'in:' + JSON.stringify(opts.orgIds)); }
        if (opts.kretsIds && opts.kretsIds.length) { qs.set('regionOrganizationId', 'in:' + JSON.stringify(opts.kretsIds)); }
        if (opts.typeIds && opts.typeIds.length) { qs.set('competitionTypeId', 'in:' + JSON.stringify(opts.typeIds)); }
        if (opts.groupIds && opts.groupIds.length) { qs.set('disciplineGroups', 'in:' + JSON.stringify(opts.groupIds)); }
        if (opts.name) { qs.set('title', 'like:' + opts.name); }
        return 'https://nsfapi.azurewebsites.net/query/competitionlist?orderBy=startDate:asc&' + qs.toString();
    }

    function groupsForBranches(branches, selectedBranchIds) {
        var selected = (selectedBranchIds && selectedBranchIds.length) ? selectedBranchIds : null;
        var groups = [];
        branches.forEach(function (b) {
            if (selected && selected.indexOf(b.id) === -1) { return; }
            groups = groups.concat(b.groups);
        });
        return groups;
    }

    function buildCompactMarkup(idPrefix) {
        return '<div class="terminliste-widget" lang="no">'
            + '<div class="terminliste-widget-years" id="' + idPrefix + '-year-nav"></div>'
            + '<div id="' + idPrefix + '-table-wrap" class="terminliste-widget-scroll"><p class="ranking-status-msg">Laster…</p></div>'
            + '<p class="terminliste-widget-link" id="' + idPrefix + '-more-link"></p>'
            + '</div>';
    }

    // Mirrors the source's stevner-widget.js exactly: org-scoped (via the
    // klubb attribute, resolved through nsf-orgs.js's matchClub -- same
    // precedent as klubb-page.js), a 5-year nav, fixed pageSize (no "load
    // more"), links out to the full page pre-filtered to that org + year.
    // No filter bar at all -- this is NOT "terminliste with compact
    // filters", confirmed against the source's own actual widget code
    // during design, not assumed.
    function initCompact(config) {
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var yearNavEl = id('-year-nav');
        var tableWrapEl = id('-table-wrap');
        var moreLinkEl = id('-more-link');
        var CURRENT_YEAR = new Date().getUTCFullYear();
        var selectedYear = CURRENT_YEAR;
        var orgId = null;
        var currentAbort = null;
        // The year's fetched rows, kept so a responsive-tier flip can
        // re-render (same two-breakpoint pattern as the full page; no
        // picker, no auto-load -- one fixed request per year).
        var widgetRows = [];
        // The widget's own hideBelow breakpoints ([700]): Stevnetype
        // hides below 700. Derived from the spec so a new hideBelow
        // value flows here automatically.
        var WIDGET_BREAKPOINTS = specBreakpoints(compactTableSpec([]).columns);
        var currentWidthTier = computeWidthTier(WIDGET_BREAKPOINTS);
        WIDGET_BREAKPOINTS.forEach(function (w) {
            var mql = window.matchMedia('(max-width:' + w + 'px)');
            var onChange = function () {
                var next = computeWidthTier(WIDGET_BREAKPOINTS);
                if (next === currentWidthTier) { return; }
                currentWidthTier = next;
                if (widgetRows.length) { renderWidgetTable(); }
            };
            if (typeof mql.addEventListener === 'function') { mql.addEventListener('change', onChange); }
            else if (typeof mql.addListener === 'function') { mql.addListener(onChange); }
        });

        for (var y = CURRENT_YEAR; y >= CURRENT_YEAR - 4; y--) {
            var btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'terminliste-widget-year-btn'; btn.dataset.year = String(y);
            btn.textContent = String(y);
            btn.setAttribute('aria-current', y === CURRENT_YEAR ? 'true' : 'false');
            yearNavEl.appendChild(btn);
        }
        yearNavEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.terminliste-widget-year-btn');
            if (!btn) { return; }
            selectedYear = parseInt(btn.dataset.year, 10);
            Array.prototype.forEach.call(yearNavEl.querySelectorAll('.terminliste-widget-year-btn'), function (b) {
                b.setAttribute('aria-current', b === btn ? 'true' : 'false');
            });
            fetchYear();
        });

        // The widget resolves only what its five columns read -- no
        // branchlist/org reference data is ever loaded here.
        function resolveCompactRow(c) {
            return {
                id: c.id,
                status: c.status,
                dateRange: StandplassFormat.formatDateRange(c.startDate, c.endDate),
                title: c.title,
                competitionTypeName: c.competitionTypeName || '',
                hasResult: !!(c.hasResult && c.resultFileUrl),
                resultFileUrl: c.resultFileUrl || ''
            };
        }

        function renderWidgetTable() {
            tableWrapEl.innerHTML = StandplassDataTable.renderTable(
                config.idPrefix + '-table',
                compactTableSpec(widgetRows.map(resolveCompactRow)),
                { hidden: {}, runtimeHidden: [], widthTier: currentWidthTier });
        }

        function fetchYear() {
            if (!orgId) { return; }
            if (currentAbort) { currentAbort.abort(); }
            currentAbort = new AbortController();
            var thisAbort = currentAbort;
            tableWrapEl.innerHTML = '<p class="ranking-status-msg">Laster…</p>';
            var url = StandplassTerminlistePage.buildCompetitionListUrl({
                pageIndex: 0, pageSize: 15, fra: selectedYear + '-01-01', til: selectedYear + '-12-31', orgIds: [orgId]
            });
            window.fetch(url, { signal: thisAbort.signal }).then(function (r) {
                if (!r.ok) { throw new Error(String(r.status)); }
                return r.json();
            }).then(function (data) {
                if (thisAbort !== currentAbort) { return; }
                var items = (data && data.items) || [];
                // config.origin (SELF_ORIGIN, set only by embed.js's
                // custom-element path) is required here: this widget is only
                // ever mounted on a 3rd-party page, so a root-relative link
                // would resolve against that page's own domain, not
                // standplass.com. mountDirect never sets config.origin
                // (always same-origin), so '' is the correct fallback there.
                var linkUrl = (config.origin || '') + '/terminliste?t_fra=' + selectedYear + '-01-01&t_til=' + selectedYear + '-12-31&t_org=' + encodeURIComponent(orgId);
                if (!items.length) {
                    widgetRows = [];
                    tableWrapEl.innerHTML = '<p>Ingen stevner registrert for ' + selectedYear + '.</p>';
                } else {
                    widgetRows = items;
                    renderWidgetTable();
                }
                moreLinkEl.innerHTML = '<a href="' + linkUrl + '">Se terminliste →</a>';
            }, function (err) {
                if (err.name === 'AbortError' || thisAbort !== currentAbort) { return; }
                widgetRows = [];
                tableWrapEl.innerHTML = '<p>Kunne ikke laste stevneoversikt.</p>';
            });
        }

        // Modal wiring (Task 7's openCompModal is defined only inside the
        // full-page branch of init() -- the widget needs its own, much
        // smaller instance, since compact mode never shows the Resultater
        // tab's Gren filter interaction, only Detaljer, matching the
        // source's own widget behavior).
        var compDialog = id('-comp-dialog');
        StandplassCompModal.ensureReferenceData(window.fetch.bind(window));
        if (!compDialog) {
            compDialog = document.createElement('dialog');
            compDialog.id = config.idPrefix + '-comp-dialog';
            compDialog.className = 'comp-modal-dialog';
            compDialog.innerHTML = '<div class="comp-modal-header"><h2 class="comp-modal-title"></h2>'
                + '<button type="button" class="comp-modal-close" aria-label="Lukk">×</button></div>'
                + '<p class="comp-modal-meta"></p><div class="comp-modal-body"></div>';
            (root === document ? document.body : root).appendChild(compDialog);
        }
        compDialog.querySelector('.comp-modal-close').addEventListener('click', function () { compDialog.close(); });
        compDialog.addEventListener('click', function (e) { if (e.target === compDialog) { compDialog.close(); } });

        function openCompactModal(compId) {
            var bodyEl = compDialog.querySelector('.comp-modal-body');
            bodyEl.innerHTML = '<p class="ranking-status-msg">Laster…</p>';
            compDialog.querySelector('.comp-modal-meta').textContent = '';
            compDialog.showModal();
            StandplassCompModal.fetchDetailWithFacility(compId, window.fetch.bind(window)).then(function (result) {
                compDialog.querySelector('.comp-modal-title').textContent = result.comp.title || '';
                compDialog.querySelector('.comp-modal-meta').textContent = StandplassCompModal.formatMetaLine(result.comp, result.facility);
                bodyEl.innerHTML = StandplassCompModal.renderDetailBody(result.comp, result.facility);
            }, function () {
                bodyEl.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste stevneinformasjon.</p>';
            });
        }

        // Whole row opens the modal, matching the source's own widget
        // (stevner-widget.js's own click handler) -- only an actual
        // <a>/<button> inside the row (the PDF result link, the ⓘ button
        // itself) is excluded, same guard as the full page's own delegation.
        tableWrapEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.comp-detail-btn');
            if (btn) { openCompactModal(btn.dataset.id); return; }
            var row = e.target.closest('tr.terminliste-row--clickable');
            if (!row) { return; }
            if (e.target.closest('a, button')) { return; }
            if (window.getSelection && window.getSelection().toString()) { return; }
            openCompactModal(row.dataset.id);
        });

        var klubbSlug = config.klubb || (new URLSearchParams(window.location.search)).get('klubb');
        StandplassNsfOrgs.ensureOrgs(window.fetch.bind(window)).then(function (rawOrgs) {
            var clubs = StandplassNsfOrgs.filterClubs(rawOrgs);
            var matched = klubbSlug ? StandplassNsfOrgs.matchClub(clubs, klubbSlug) : null;
            if (!matched) { tableWrapEl.innerHTML = '<p>Ukjent klubb.</p>'; return; }
            orgId = matched.id;
            fetchYear();
        }, function () {
            tableWrapEl.innerHTML = '<p>Kunne ikke laste klubbliste.</p>';
        });
    }

    function init(config) {
        if (config.compact) { return initCompact(config); }
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var urlState = config.urlState;
        var FW = StandplassFilterWidgets;

        var nameInput = id('-name-input');
        var fraInput = id('-fra-input'), tilInput = id('-til-input');
        var grenBtn = id('-gren-btn'), grenPanel = id('-gren-panel'), grenList = id('-gren-list'), grenClear = id('-gren-clear');
        var typeBtn = id('-type-btn'), typePanel = id('-type-panel'), typeList = id('-type-list'), typeClear = id('-type-clear');
        var groupBtn = id('-group-btn'), groupPanel = id('-group-panel'), groupList = id('-group-list'), groupClear = id('-group-clear');
        var orgInput = id('-org-input'), orgList = id('-org-list'), orgTags = id('-org-tags'), orgClear = id('-org-clear');
        var kretsInput = id('-krets-input'), kretsList = id('-krets-list'), kretsTags = id('-krets-tags'), kretsClear = id('-krets-clear');
        var statusEl = id('-status');
        var tableWrapEl = id('-table-wrap');

        var today = new Date();
        var defaultFra = today.toISOString().slice(0, 10);
        var defaultTilDate = new Date(today.getTime());
        defaultTilDate.setUTCMonth(defaultTilDate.getUTCMonth() + 1);
        var defaultTil = defaultTilDate.toISOString().slice(0, 10);

        var params = new URLSearchParams(urlState.getSearch());
        var selectedName = params.get('t_name') || '';
        var selectedFra = params.get('t_fra') || defaultFra;
        var selectedTil = params.get('t_til') || defaultTil;
        var selectedBranchIds = StandplassTerminlistePage.decodeIdList(params.get('t_gren'));
        var selectedOrgIds = StandplassTerminlistePage.decodeIdList(params.get('t_org'));
        var selectedOrgNames = {};
        var selectedKretsIds = StandplassTerminlistePage.decodeIdList(params.get('t_krets'));
        var selectedKretsNames = {};
        var selectedTypeIds = StandplassTerminlistePage.decodeIdList(params.get('t_type'));
        var selectedGroupIds = StandplassTerminlistePage.decodeIdList(params.get('t_group'));
        var allTypes = [];
        var allKretser = [], allClubs = [];

        function setUrlParam(key, value) {
            var qs = new URLSearchParams(urlState.getSearch());
            if (value) { qs.set(key, value); } else { qs.delete(key); }
            urlState.setSearch('?' + qs.toString());
        }

        nameInput.value = selectedName;
        fraInput.value = selectedFra;
        tilInput.value = selectedTil;

        var nameDebounce = null;
        nameInput.addEventListener('input', function () {
            clearTimeout(nameDebounce);
            nameDebounce = setTimeout(function () {
                selectedName = nameInput.value.trim();
                setUrlParam('t_name', selectedName || null);
                fetchAndRender(true);
            }, 300);
        });

        function handleDateChange() {
            selectedFra = fraInput.value; selectedTil = tilInput.value;
            setUrlParam('t_fra', selectedFra === defaultFra ? null : selectedFra);
            setUrlParam('t_til', selectedTil === defaultTil ? null : selectedTil);
            fetchAndRender(true);
        }
        fraInput.addEventListener('change', handleDateChange);
        tilInput.addEventListener('change', handleDateChange);

        var grenDropdown = FW.makeCheckboxDropdown({
            btn: grenBtn, panel: grenPanel, list: grenList, clearAllBtn: grenClear,
            labelNone: 'Alle grener',
            getItems: function () {
                return branchlistData.branches.map(function (b) { return { id: b.id, name: b.name }; });
            },
            getSelected: function () { return selectedBranchIds; },
            onToggle: function (branchId, name, checked) {
                if (checked) { if (selectedBranchIds.indexOf(branchId) < 0) { selectedBranchIds.push(branchId); } }
                else { selectedBranchIds = selectedBranchIds.filter(function (b) { return b !== branchId; }); }
                grenDropdown.rebuild();
                // Øvelsesgruppe's own candidate set is a function of Gren --
                // drop any selected group that's no longer a candidate,
                // rather than leaving a silently-inconsistent filter active.
                var candidates = StandplassTerminlistePage.groupsForBranches(branchlistData.branches, selectedBranchIds).map(function (g) { return g.id; });
                selectedGroupIds = selectedGroupIds.filter(function (g) { return candidates.indexOf(g) !== -1; });
                groupDropdown.rebuild();
                setUrlParam('t_gren', StandplassTerminlistePage.encodeIdList(selectedBranchIds) || null);
                setUrlParam('t_group', StandplassTerminlistePage.encodeIdList(selectedGroupIds) || null);
                fetchAndRender(true);
            },
            onClearAll: function () {
                selectedBranchIds = [];
                grenDropdown.rebuild();
                setUrlParam('t_gren', null);
                fetchAndRender(true);
            }
        });

        var orgCombo = FW.makeTagComboHandlers({
            input: orgInput, list: orgList, tagsEl: orgTags, clear: orgClear,
            getItems: function (q) {
                var lower = (q || '').toLowerCase();
                return allClubs.filter(function (c) { return selectedOrgIds.indexOf(c.id) < 0; })
                    .filter(function (c) { return !lower || c.name.toLowerCase().indexOf(lower) >= 0; })
                    .slice(0, 50);
            },
            getSelected: function () { return selectedOrgIds.map(function (id_) { return { id: id_, name: selectedOrgNames[id_] || id_ }; }); },
            onSelect: function (orgId, orgName) {
                if (selectedOrgIds.indexOf(orgId) < 0) { selectedOrgIds.push(orgId); selectedOrgNames[orgId] = orgName; }
                orgCombo.rebuild();
                setUrlParam('t_org', StandplassTerminlistePage.encodeIdList(selectedOrgIds) || null);
                fetchAndRender(true);
            },
            onRemove: function (orgId) {
                selectedOrgIds = selectedOrgIds.filter(function (o) { return o !== orgId; });
                orgCombo.rebuild();
                setUrlParam('t_org', StandplassTerminlistePage.encodeIdList(selectedOrgIds) || null);
                fetchAndRender(true);
            },
            onClearAll: function () {
                selectedOrgIds = [];
                orgCombo.rebuild();
                setUrlParam('t_org', null);
                fetchAndRender(true);
            }
        });

        var kretsCombo = FW.makeTagComboHandlers({
            input: kretsInput, list: kretsList, tagsEl: kretsTags, clear: kretsClear,
            getItems: function (q) {
                var lower = (q || '').toLowerCase();
                return allKretser.filter(function (k) { return selectedKretsIds.indexOf(k.id) < 0; })
                    .filter(function (k) { return !lower || k.name.toLowerCase().indexOf(lower) >= 0; })
                    .slice(0, 50);
            },
            getSelected: function () { return selectedKretsIds.map(function (id_) { return { id: id_, name: selectedKretsNames[id_] || id_ }; }); },
            onSelect: function (kretsId, kretsName) {
                if (selectedKretsIds.indexOf(kretsId) < 0) { selectedKretsIds.push(kretsId); selectedKretsNames[kretsId] = kretsName; }
                kretsCombo.rebuild();
                setUrlParam('t_krets', StandplassTerminlistePage.encodeIdList(selectedKretsIds) || null);
                fetchAndRender(true);
            },
            onRemove: function (kretsId) {
                selectedKretsIds = selectedKretsIds.filter(function (k) { return k !== kretsId; });
                kretsCombo.rebuild();
                setUrlParam('t_krets', StandplassTerminlistePage.encodeIdList(selectedKretsIds) || null);
                fetchAndRender(true);
            },
            onClearAll: function () {
                selectedKretsIds = [];
                kretsCombo.rebuild();
                setUrlParam('t_krets', null);
                fetchAndRender(true);
            }
        });

        var typeDropdown = FW.makeCheckboxDropdown({
            btn: typeBtn, panel: typePanel, list: typeList, clearAllBtn: typeClear,
            labelNone: 'Alle stevnetyper',
            getItems: function () { return allTypes.map(function (t) { return { id: t.id, name: t.name }; }); },
            getSelected: function () { return selectedTypeIds; },
            onToggle: function (typeId, name, checked) {
                if (checked) { if (selectedTypeIds.indexOf(typeId) < 0) { selectedTypeIds.push(typeId); } }
                else { selectedTypeIds = selectedTypeIds.filter(function (t) { return t !== typeId; }); }
                typeDropdown.rebuild();
                setUrlParam('t_type', StandplassTerminlistePage.encodeIdList(selectedTypeIds) || null);
                fetchAndRender(true);
            },
            onClearAll: function () {
                selectedTypeIds = [];
                typeDropdown.rebuild();
                setUrlParam('t_type', null);
                fetchAndRender(true);
            }
        });

        var groupDropdown = FW.makeCheckboxDropdown({
            btn: groupBtn, panel: groupPanel, list: groupList, clearAllBtn: groupClear,
            labelNone: 'Alle øvelsesgrupper',
            searchable: true,
            getItems: function () {
                return StandplassTerminlistePage.groupsForBranches(branchlistData.branches, selectedBranchIds)
                    .map(function (g) { return { id: g.id, name: g.name }; })
                    .sort(function (a, b) { return a.name.localeCompare(b.name, 'no'); });
            },
            getSelected: function () { return selectedGroupIds; },
            onToggle: function (groupId, name, checked) {
                if (checked) { if (selectedGroupIds.indexOf(groupId) < 0) { selectedGroupIds.push(groupId); } }
                else { selectedGroupIds = selectedGroupIds.filter(function (g) { return g !== groupId; }); }
                groupDropdown.rebuild();
                setUrlParam('t_group', StandplassTerminlistePage.encodeIdList(selectedGroupIds) || null);
                fetchAndRender(true);
            },
            onClearAll: function () {
                selectedGroupIds = [];
                groupDropdown.rebuild();
                setUrlParam('t_group', null);
                fetchAndRender(true);
            }
        });

        var rows = [];
        var pageIndex = 0;
        var PAGE_SIZE = 50;
        var hasMore = false;
        var currentAbort = null;
        // True while a page fetch is in flight -- the scroll auto-load
        // must not stack a second fetch on top of a pending one.
        var loading = false;
        // Session-only view state (never persisted -- standing ruling):
        // the picker's live hidden-column map and the smallest crossed
        // responsive breakpoint (Arrangør 860; Gren/Påmeldingsfrist
        // 1030), converted
        // from the old .terminliste-mobile-hide/.terminliste-tablet-hide
        // CSS rules at identical widths.
        var hidden = {};
        // The page's hideBelow breakpoints (Arrangør 860; Gren and
        // Påmeldingsfrist 1030 — the org column needs a ~770px card and
        // the nine-column table a ~935px card; measured 2026-11-20).
        // Derived from the spec so a new hideBelow value flows here
        // automatically.
        var PAGE_BREAKPOINTS = specBreakpoints(buildColumns(hidden));
        var currentWidthTier = computeWidthTier(PAGE_BREAKPOINTS);

        // Shared column picker: wired once (the button lives outside the
        // re-rendered table wrap, so it survives renderTable), and
        // re-wired destroy-before-rewire on tier change — wirePicker
        // snapshots widthTier at wire time, and the panel's checkbox
        // defaults must follow the new tier. The hidden map is synced IN
        // PLACE (the interplay cells close over it).
        var pickerWire = null;
        function wireColumnPicker() {
            if (pickerWire) { pickerWire.destroy(); pickerWire = null; }
            pickerWire = StandplassDataTable.wirePicker(root, { columns: buildColumns(hidden) }, {
                onColumnsChange: function (next) {
                    Object.keys(hidden).forEach(function (k) { delete hidden[k]; });
                    Object.keys(next).forEach(function (k) { hidden[k] = next[k]; });
                    if (rows.length) { renderTable(); }
                }
            }, tableState());
        }
        wireColumnPicker();

        PAGE_BREAKPOINTS.forEach(function (w) {
            var mql = window.matchMedia('(max-width:' + w + 'px)');
            var onChange = function () {
                var next = computeWidthTier(PAGE_BREAKPOINTS);
                if (next === currentWidthTier) { return; }
                currentWidthTier = next;
                // Rows may still be loading (or empty after a filter) -- a
                // tier flip must not conjure the "ingen stevner" state.
                if (rows.length) { renderTable(); }
                // The picker's checkbox defaults are tier-dependent -- its
                // captured state must carry the new tier.
                wireColumnPicker();
            };
            if (typeof mql.addEventListener === 'function') { mql.addEventListener('change', onChange); }
            else if (typeof mql.addListener === 'function') { mql.addListener(onChange); }
        });

        // Pre-resolves a competitionlist row into the plain shape
        // terminlisteTableSpec's columns read: org/krets/branch/group
        // names looked up against the reference data, dates formatted,
        // the skyting.no href pre-built (pre-escaped).
        function resolveRow(c) {
            var org = allClubs.filter(function (o) { return o.id === c.organizationId; })[0];
            var krets = allKretser.filter(function (k) { return k.id === c.regionOrganizationId; })[0];
            var branchNames = (c.branches || []).map(function (bid) {
                var b = branchlistData.branches.filter(function (x) { return x.id === bid; })[0];
                return b ? b.name : null;
            }).filter(Boolean).join(', ') || '–';
            var groupNames = (c.disciplineGroups || []).map(function (gid) {
                var g = StandplassTerminlistePage.groupsForBranches(branchlistData.branches, []).filter(function (x) { return x.id === gid; })[0];
                return g ? g.name : null;
            }).filter(Boolean).join(', ') || '–';
            return {
                id: c.id,
                status: c.status,
                dateRange: StandplassFormat.formatDateRange(c.startDate, c.endDate),
                title: c.title,
                facilityName: c.facilityName || '',
                competitionTypeName: c.competitionTypeName || '',
                orgName: org ? org.name : (c.organizationName || '–'),
                kretsName: krets ? krets.name : '',
                branchNames: branchNames,
                groupNames: groupNames,
                frist: c.registrationEndDate ? StandplassFormat.formatDate(c.registrationEndDate) : '–',
                hasResult: !!(c.hasResult && c.resultFileUrl),
                resultFileUrl: c.resultFileUrl || '',
                href: 'https://app.skyting.no/p/c/' + esc(c.id) + '/details',
                starttid: c.startDate ? StandplassFormat.formatTime(c.startDate) : '',
                klasseforendeBadge: c.applicableForClassification
                    ? '<span class="comp-modal-badge comp-modal-badge--yes" title="Resultater teller for klasseopprykk og -nedrykk">Klasseførende</span>'
                    : '<span class="comp-modal-badge comp-modal-badge--no">Ikke klasseførende</span>'
            };
        }

        function tableState() {
            return { sort: null, hidden: hidden, runtimeHidden: [], widthTier: currentWidthTier };
        }

        // Rows accumulate across every "Last inn flere" click; every
        // fetch re-renders the whole accumulated array through the base
        // (keeps data-dt-row indices consistent; at 50 rows per page the
        // full re-render stays cheap).
        function renderTable() {
            if (!rows.length) {
                tableWrapEl.innerHTML = '<div class="ranking-blank-state"><p>Ingen stevner funnet.</p></div>';
                return;
            }
            // The scroll container is the CARD the base emits (the
            // spec's wrapClass) — not this outer wrap. A full re-render
            // rebuilds the card, so the scroll position is captured and
            // restored: a freshly-landed page must not snap the user
            // back to the top.
            var prevCard = tableWrapEl.querySelector('.terminliste-scroll-wrap');
            var prevScroll = prevCard ? prevCard.scrollTop : 0;
            tableWrapEl.innerHTML = StandplassDataTable.renderTable(
                config.idPrefix + '-table',
                terminlisteTableSpec(rows.map(resolveRow), hidden),
                tableState());
            // Element scroll events do NOT bubble — the auto-load
            // listener is attached to the card itself on every render;
            // each re-render's old card dies with its listener, the
            // fresh card gets a fresh one.
            var card = tableWrapEl.querySelector('.terminliste-scroll-wrap');
            if (card) {
                card.scrollTop = prevScroll;
                card.addEventListener('scroll', function () {
                    if (hasMore && !loading && shouldLoadMore(card)) {
                        fetchAndRender(false, pageIndex + 1);
                    }
                });
            }
        }

        function fetchAndRender(reset, nextPage) {
            if (reset) {
                pageIndex = 0; rows = [];
                var card = tableWrapEl.querySelector('.terminliste-scroll-wrap');
                if (card) { card.scrollTop = 0; }
            }
            if (currentAbort) { currentAbort.abort(); }
            currentAbort = new AbortController();
            loading = true;
            statusEl.textContent = 'Laster…';
            var thisAbort = currentAbort;
            var page = reset ? 0 : (nextPage != null ? nextPage : pageIndex);
            var url = StandplassTerminlistePage.buildCompetitionListUrl({
                pageIndex: page, pageSize: PAGE_SIZE,
                fra: selectedFra, til: selectedTil,
                branchIds: selectedBranchIds, orgIds: selectedOrgIds, kretsIds: selectedKretsIds,
                typeIds: selectedTypeIds, groupIds: selectedGroupIds, name: selectedName
            });
            window.fetch(url, { signal: thisAbort.signal }).then(function (r) {
                if (!r.ok) { throw new Error(String(r.status)); }
                return r.json();
            }).then(function (data) {
                if (thisAbort !== currentAbort) { return; }
                loading = false;
                // Commit the page index only on success — a failed
                // fetch leaves it where it was, so the auto-load's
                // retry fetches the SAME page instead of skipping it.
                pageIndex = page;
                var items = (data && data.items) || [];
                rows = reset ? items : rows.concat(items);
                hasMore = !!(data && data.paging && data.paging.hasNextPage);
                statusEl.textContent = '';
                renderTable();
            }, function (err) {
                if (err.name === 'AbortError' || thisAbort !== currentAbort) { return; }
                loading = false;
                statusEl.textContent = 'Kunne ikke hente data.';
                statusEl.classList.add('ranking-error');
            });
        }

        Promise.all([
            ensureBranchlist(window.fetch.bind(window)),
            StandplassNsfOrgs.ensureOrgs(window.fetch.bind(window)),
            window.fetch('https://nsfapi.azurewebsites.net/competitiontype').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
        ]).then(function (results) {
            branchlistData = results[0];
            var rawOrgs = results[1];
            allKretser = StandplassNsfOrgs.filterKretser ? StandplassNsfOrgs.filterKretser(rawOrgs) : [];
            allClubs = StandplassNsfOrgs.filterClubs(rawOrgs);
            allTypes = (results[2] || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'no'); });
            // A deep-linked t_gren+t_group combination can be stale/invalid
            // (e.g. a t_group id that belongs to a branch not in
            // selectedBranchIds) -- reconcile once here, the same way Gren's
            // own onToggle handler already does on every later change, so
            // the very first fetch/render never silently sends an
            // impossible filter combination.
            var groupCandidates = StandplassTerminlistePage.groupsForBranches(branchlistData.branches, selectedBranchIds).map(function (g) { return g.id; });
            selectedGroupIds = selectedGroupIds.filter(function (g) { return groupCandidates.indexOf(g) !== -1; });
            // Restore chip labels for deep-linked t_org/t_krets ids -- names
            // only resolve once allClubs/allKretser have loaded (same
            // pattern as nasjonalt-page.js's own post-load id->name
            // restoration).
            selectedOrgIds.forEach(function (id_) {
                var org = allClubs.filter(function (c) { return c.id === id_; })[0];
                if (org) { selectedOrgNames[id_] = org.name; }
            });
            selectedKretsIds.forEach(function (id_) {
                var krets = allKretser.filter(function (k) { return k.id === id_; })[0];
                if (krets) { selectedKretsNames[id_] = krets.name; }
            });
            grenDropdown.rebuild(); typeDropdown.rebuild(); groupDropdown.rebuild(); orgCombo.rebuild(); kretsCombo.rebuild();
            fetchAndRender(true);
        }, function () {
            statusEl.textContent = 'Kunne ikke laste data fra NSF. Prøv å laste siden på nytt.';
            statusEl.classList.add('ranking-error');
        });

        var compModalHost = StandplassCompModal.createDialogHost({ idPrefix: config.idPrefix, root: root });

        // Whole row opens the modal, matching the source's own delegation
        // (terminliste.js's setupModalDelegation) -- only an actual <a>/
        // <button> inside the row (the skyting.no title link, the PDF
        // result link, the ⓘ button itself) is excluded, and an active text
        // selection is respected rather than hijacked into opening a modal.
        tableWrapEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.comp-detail-btn');
            if (btn) {
                var tr = btn.closest('tr');
                compModalHost.open(btn.dataset.id, tr ? tr.getAttribute('data-title') : '');
                return;
            }
            var row = e.target.closest('tr.terminliste-row--clickable');
            if (!row) { return; }
            if (e.target.closest('a, button')) { return; }
            if (window.getSelection && window.getSelection().toString()) { return; }
            compModalHost.open(row.dataset.id, row.getAttribute('data-title') || '');
        });
    }

    // The column list is shared by the table spec and the picker wiring
    // (the picker needs the same keys/labels/defaults). `hidden` is the
    // page's live picker map — the two sub-line-bearing cells read it at
    // render time so a shown column drops the sub-line that would
    // duplicate it (in-place sync keeps this closure valid).
    function buildColumns(hidden) {
        function detailAriaLabel(r) {
            var statusText = r.status !== 1 ? (STATUS_LABEL[r.status] || null) : null;
            return 'Se detaljer for ' + esc(r.title || '–') + (statusText ? ' – ' + esc(statusText) : '');
        }
        return [
            { key: 'detaljer', label: '<span class="visually-hidden">Detaljer</span>', labelRaw: true, pickerLabel: 'Detaljer', cellClass: 'terminliste-detail-col', raw: true,
                cell: function (r) { return '<button type="button" class="comp-detail-btn" data-id="' + esc(r.id) + '" aria-label="' + detailAriaLabel(r) + '">ⓘ</button>'; } },
            { key: 'dateRange', label: 'Dato', cellClass: 'terminliste-date', raw: true, cell: function (r) { return dateRangeCellHtml(r.dateRange); } },
            { key: 'starttid', label: 'Starttid', defaultHidden: true, cellClass: 'terminliste-date', cell: function (r) { return r.starttid || '–'; } },
            { key: 'title', label: 'Stevne', raw: true, cell: function (r) {
                return '<a href="' + r.href + '" target="_blank" rel="noopener noreferrer">' + esc(r.title || '–') + '</a>'
                    + (r.facilityName && hidden.anlegg !== false ? '<span class="terminliste-sub">' + esc(r.facilityName) + '</span>' : '');
            } },
            { key: 'anlegg', label: 'Anlegg', defaultHidden: true, cell: function (r) { return r.facilityName || '–'; } },
            { key: 'competitionTypeName', label: 'Stevnetype', cell: function (r) { return r.competitionTypeName || '–'; } },
            { key: 'status', label: 'Status', defaultHidden: true, cell: function (r) {
                return r.status != null && r.status !== 1 ? (STATUS_LABEL[r.status] || '–') : '–';
            } },
            // Arrangør hides below 860 (not the usual 700): the org
            // column's min-content is the widest unbreakable org word
            // ("Sportsskytterforbund", ~156px with padding — mid-word
            // breaking is an owner-rejected 2026-11-20 ruling), and the
            // seven-column set fits only from a ~740px card. The picker
            // can still re-show it at any width.
            { key: 'orgName', label: 'Arrangør', hideBelow: 860, raw: true, cell: function (r) {
                return esc(r.orgName) + (r.kretsName && hidden.krets !== false ? '<span class="terminliste-sub">' + esc(r.kretsName) + '</span>' : '');
            } },
            { key: 'krets', label: 'Krets', defaultHidden: true, cell: function (r) { return r.kretsName || '–'; } },
            // Gren + Påmeldingsfrist hide below 1030 (not the usual 900):
            // measured 2026-11-20, the nine-column table's floor is 911px
            // (header-floored columns plus the unbreakable org word), so
            // the full set needs a ~935px card; below 1030 it forced either
            // horizontal scroll or mid-word breaking, both rejected by
            // owner ruling. The picker can still re-show these columns at
            // any width (explicit user choice beats the tier).
            { key: 'branchNames', label: 'Gren', hideBelow: 1030, cell: function (r) { return r.branchNames; } },
            { key: 'groupNames', label: 'Øvelses\u00ADgruppe', cell: function (r) { return r.groupNames; } },
            { key: 'frist', label: 'Påmeldings\u00ADfrist', hideBelow: 1030, cellClass: 'terminliste-date', cell: function (r) { return r.frist; } },
            { key: 'klasseforende', label: 'Klasseførende', defaultHidden: true, raw: true, cell: function (r) { return r.klasseforendeBadge || '–'; } },
            { key: 'resultat', label: 'Resultater', cellClass: 'terminliste-result-cell', raw: true, cell: function (r) {
                return (r.hasResult && r.resultFileUrl)
                    ? '<a href="' + esc(r.resultFileUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Last ned resultater (PDF, åpnes i ny fane)">PDF</a>'
                    : '–';
            } }
        ];
    }

    // Date-range cell rendering: nbsp within each half, and the ONLY
    // break opportunity sits right after the en-dash — the natural
    // split for a range (owner ruling 2026-11-20: "breaking at the
    // hyphen"). With slack the string renders on one line (nbsp reads
    // as a space); when the table is tight it wraps as "28. feb–" /
    // "4. mar 2026" instead of at a mid-range space. Generated strings
    // only (month names and digits), safe to emit raw.
    function dateRangeCellHtml(raw) {
        return String(raw || '').replace(/ /g, '\u00A0').replace('–', '–<wbr>');
    }

    // The full page's table as a base spec. Rows are pre-resolved by
    // init's resolveRow (names looked up, dates formatted, hrefs built)
    // so every column reads plain strings off the row shape the plan
    // fixed. `hidden` is the page-owned live picker map.
    function terminlisteTableSpec(rows, hidden) {
        hidden = hidden || {};
        return {
            columns: buildColumns(hidden),
            rows: rows,
            rowAttrs: function (r) {
                return 'class="terminliste-row--clickable" data-id="' + esc(r.id)
                    + '" data-status="' + esc(String(r.status != null ? r.status : 1))
                    + '" data-title="' + esc(r.title || '–') + '"';
            },
            wrapClass: 'ranking-full-table terminliste-scroll-wrap',
            tableClass: 'ranking-table',
            ariaLabel: 'Terminliste'
        };
    }

    // The spec's distinct hideBelow breakpoints, ascending — the same
    // set the base derives for its own matchMedia listeners. Consumed
    // by computeWidthTier and the page/widget resize listeners so a new
    // hideBelow value in a spec flows everywhere (a hardcoded
    // [700, 900] list missed the 1000 tablet breakpoint added
    // 2026-11-20, leaving the initial render with the full column set
    // at widths where the tier should be hiding some).
    function specBreakpoints(columns) {
        var values = [];
        (columns || []).forEach(function (col) {
            if (col.hideBelow != null && values.indexOf(col.hideBelow) === -1) {
                values.push(col.hideBelow);
            }
        });
        return values.sort(function (a, b) { return a - b; });
    }

    // Smallest crossed responsive breakpoint among the given values --
    // the tier the base's hideBelow semantics consume. Shared by the
    // full page (Arrangør 860 / Gren+Frist 1030) and the compact
    // widget (700 only).
    function computeWidthTier(breakpoints) {
        var crossed = (breakpoints || []).filter(function (w) {
            return window.matchMedia('(max-width:' + w + 'px)').matches;
        });
        return crossed.length ? crossed[0] : null;
    }

    // Pure predicate for the scroll auto-load: is the wrap near enough
    // to its bottom (60px of slack) to fetch the next page? Takes a
    // plain { scrollTop, clientHeight, scrollHeight } -- no DOM -- so
    // the threshold is testable. A zero-height (unlaid-out) wrap never
    // triggers a load.
    function shouldLoadMore(wrap) {
        if (!wrap.clientHeight) { return false; }
        return wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 60;
    }

    // The compact widget's table: five columns, no filter resolution
    // (the widget never loads branchlist/org reference data), no picker,
    // no wrap class -- byte-identical to the hand-rolled markup it
    // replaces. The Stevne cell stays PLAIN TEXT: the widget's rows open
    // the modal on title clicks, a link would hijack that.
    function compactTableSpec(rows) {
        return {
            columns: [
                { key: 'detaljer', label: '<span class="visually-hidden">Detaljer</span>', labelRaw: true, pickerLabel: 'Detaljer', cellClass: 'terminliste-detail-col', raw: true,
                    cell: function (r) { return '<button type="button" class="comp-detail-btn" data-id="' + esc(r.id) + '" aria-label="Se detaljer for ' + esc(r.title || '–') + '">ⓘ</button>'; } },
                { key: 'dateRange', label: 'Dato', cellClass: 'terminliste-date', raw: true, cell: function (r) { return dateRangeCellHtml(r.dateRange); } },
                { key: 'title', label: 'Stevne', cell: function (r) { return r.title || '–'; } },
                { key: 'competitionTypeName', label: 'Stevnetype', hideBelow: 700, cell: function (r) { return r.competitionTypeName || '–'; } },
                { key: 'resultat', label: 'Resultater', cellClass: 'terminliste-result-cell', raw: true, cell: function (r) {
                    return (r.hasResult && r.resultFileUrl)
                        ? '<a href="' + esc(r.resultFileUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Last ned resultater (PDF, åpnes i ny fane)">PDF</a>'
                        : '–';
                } }
            ],
            rows: rows,
            rowAttrs: function (r) {
                return 'class="terminliste-row--clickable" data-id="' + esc(r.id)
                    + '" data-status="' + esc(String(r.status != null ? r.status : 1))
                    + '" data-title="' + esc(r.title || '–') + '"';
            },
            tableClass: 'ranking-table',
            ariaLabel: 'Stevner'
        };
    }

    function buildMarkup(idPrefix, compact) {
        if (compact) { return buildCompactMarkup(idPrefix); }
        return '<div class="container">'
            + '<p class="section-label">Resultater</p>'
            + '<h1 class="section-title">Terminliste</h1>'
            + '<p class="section-lead">Oversikt over kommende NSF-stevner '
            + '(<a href="https://www.skyting.no/konkurranse/terminliste-alle-grener/" target="_blank" rel="noopener noreferrer">terminlista for alle grener</a>) '
            + 'på skyting.no.</p>'
            + '<div class="ranking-filters">'
            + '  <div class="filter-group">'
            + '    <label for="' + idPrefix + '-name-input">Navn</label>'
            + '    <input type="text" id="' + idPrefix + '-name-input" class="filter-input" autocomplete="off" placeholder="Søk stevnenavn…">'
            + '  </div>'
            + '  <div class="filter-group"><label for="' + idPrefix + '-fra-input">Fra</label><input type="date" id="' + idPrefix + '-fra-input"></div>'
            + '  <div class="filter-group"><label for="' + idPrefix + '-til-input">Til</label><input type="date" id="' + idPrefix + '-til-input"></div>'
            + '  <div class="filter-group"><label>Gren</label><div class="checkbox-dropdown">'
            + '    <button type="button" id="' + idPrefix + '-gren-btn" class="checkbox-dropdown-btn" aria-expanded="false" aria-controls="' + idPrefix + '-gren-panel">Alle grener</button>'
            + '    <div class="checkbox-dropdown-panel" id="' + idPrefix + '-gren-panel" hidden role="group">'
            + '      <button type="button" id="' + idPrefix + '-gren-clear" class="checkbox-dropdown-clear-all">Fjern alle</button>'
            + '      <ul id="' + idPrefix + '-gren-list" class="checkbox-dropdown-list" aria-label="Velg grener"></ul>'
            + '    </div></div></div>'
            + '  <div class="filter-group"><label>Arrangør</label>'
            + '    <ul class="tag-list" id="' + idPrefix + '-org-tags" aria-label="Valgte arrangører" aria-live="polite"></ul>'
            + '    <div class="autocomplete-wrap" id="' + idPrefix + '-org-wrap">'
            + '      <input type="text" id="' + idPrefix + '-org-input" class="filter-input" autocomplete="off" placeholder="Søk arrangør…" aria-autocomplete="list" aria-controls="' + idPrefix + '-org-list" aria-expanded="false">'
            + '      <button type="button" class="combo-clear" id="' + idPrefix + '-org-clear" aria-label="Fjern alle arrangører">×</button>'
            + '      <ul class="autocomplete-list" id="' + idPrefix + '-org-list" role="listbox" aria-label="Arrangører" hidden></ul>'
            + '    </div></div>'
            + '  <div class="filter-group"><label>Krets</label>'
            + '    <ul class="tag-list" id="' + idPrefix + '-krets-tags" aria-label="Valgte kretser" aria-live="polite"></ul>'
            + '    <div class="autocomplete-wrap" id="' + idPrefix + '-krets-wrap">'
            + '      <input type="text" id="' + idPrefix + '-krets-input" class="filter-input" autocomplete="off" placeholder="Søk krets…" aria-autocomplete="list" aria-controls="' + idPrefix + '-krets-list" aria-expanded="false">'
            + '      <button type="button" class="combo-clear" id="' + idPrefix + '-krets-clear" aria-label="Fjern alle kretser">×</button>'
            + '      <ul class="autocomplete-list" id="' + idPrefix + '-krets-list" role="listbox" aria-label="Kretser" hidden></ul>'
            + '    </div></div>'
            + '  <div class="filter-group"><label>Stevnetype</label><div class="checkbox-dropdown">'
            + '    <button type="button" id="' + idPrefix + '-type-btn" class="checkbox-dropdown-btn" aria-expanded="false" aria-controls="' + idPrefix + '-type-panel">Alle stevnetyper</button>'
            + '    <div class="checkbox-dropdown-panel" id="' + idPrefix + '-type-panel" hidden role="group">'
            + '      <button type="button" id="' + idPrefix + '-type-clear" class="checkbox-dropdown-clear-all">Fjern alle</button>'
            + '      <ul id="' + idPrefix + '-type-list" class="checkbox-dropdown-list" aria-label="Velg stevnetyper"></ul>'
            + '    </div></div></div>'
            + '  <div class="filter-group"><label>Øvelsesgruppe</label><div class="checkbox-dropdown">'
            + '    <button type="button" id="' + idPrefix + '-group-btn" class="checkbox-dropdown-btn" aria-expanded="false" aria-controls="' + idPrefix + '-group-panel">Alle øvelsesgrupper</button>'
            + '    <div class="checkbox-dropdown-panel" id="' + idPrefix + '-group-panel" hidden role="group">'
            + '      <button type="button" id="' + idPrefix + '-group-clear" class="checkbox-dropdown-clear-all">Fjern alle</button>'
            + '      <ul id="' + idPrefix + '-group-list" class="checkbox-dropdown-list" aria-label="Velg øvelsesgrupper"></ul>'
            + '    </div></div></div>'
            + '</div>'
            // Toolbar right above the table card: status message left,
            // shared Kolonner picker right (the stevner stats-bar
            // pattern — no dead space between the button and the
            // table; the status p's min-height keeps the row stable
            // when empty). The anchor WRAPS the button (stevner
            // pattern): the dropdown panel right-aligns against the
            // anchor's box, so the button sits exactly where the
            // panel opens. A bare renderPickerButton() emits button +
            // anchor as siblings — space-between would center the
            // button mid-row with the panel detached at the far right.
            + '<div class="terminliste-toolbar">'
            + '<p class="ranking-status-msg" id="' + idPrefix + '-status" aria-live="polite"></p>'
            + '<div class="dt-picker-anchor"><button type="button" class="dt-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">Kolonner</button></div>'
            + '</div>'
            + '<div id="' + idPrefix + '-table-wrap"></div>'
            // Required by mountDirect's own embed-builder wiring in
            // embed.js, which unconditionally does
            // getElementById(idPrefix + '-embed-builder').innerHTML = ...
            // after init() for every view, felt/bane included -- without
            // this div present, that call throws on the standalone page,
            // silently killing "Opprett innebygging" with no visible error.
            + '<div id="' + idPrefix + '-embed-builder"></div>'
            + '</div>';
    }

    return {
        processBranchlist: processBranchlist,
        ensureBranchlist: ensureBranchlist,
        STATUS_LABEL: STATUS_LABEL,
        encodeIdList: function (ids) { return StandplassFormat.encodeIdList(ids); },
        decodeIdList: function (raw) { return StandplassFormat.decodeIdList(raw); },
        buildCompetitionListUrl: buildCompetitionListUrl,
        groupsForBranches: groupsForBranches,
        buildMarkup: buildMarkup,
        terminlisteTableSpec: terminlisteTableSpec,
        compactTableSpec: compactTableSpec,
        shouldLoadMore: shouldLoadMore,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassTerminlistePage;
}
