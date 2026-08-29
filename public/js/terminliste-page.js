// public/js/terminliste-page.js
//
// Page glue for /terminliste: a live NSF competition calendar across all
// 4 branches, plus a compact club-scoped widget mode sharing the same
// engine. Ported from the source's terminliste.js + stevner-widget.js
// (the widget mode replaces the source's separate front-page
// stevner-widget.js -- see
// docs/superpowers/specs/2026-08-30-terminliste-view-design.md). Unlike
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
    // array params and this page's own multi-value URL params -- url-state.js
    // itself needs no changes (every tracked param is already an opaque
    // string; see this plan's "Corrections to the approved spec"), this is
    // just the page-local encode/decode terminliste needs that no other
    // view has needed yet, since felt/bane's own multi-select filters
    // choose not to URL-sync past a single selection.
    function encodeIdList(ids) { return (ids || []).map(encodeURIComponent).join(','); }
    function decodeIdList(param) {
        if (!param) { return []; }
        return param.split(',').map(decodeURIComponent).filter(Boolean);
    }

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
        return '<div class="terminliste-widget">'
            + '<div class="terminliste-widget-years" id="' + idPrefix + '-year-nav"></div>'
            + '<div id="' + idPrefix + '-table-wrap"><p class="ranking-status-msg">Laster…</p></div>'
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
                    tableWrapEl.innerHTML = '<p>Ingen stevner registrert for ' + selectedYear + '.</p>';
                } else {
                    tableWrapEl.innerHTML = '<table class="ranking-table" aria-label="Stevner">'
                        + '<thead><tr><th class="terminliste-detail-col"><span class="visually-hidden">Detaljer</span></th>'
                        + '<th>Dato</th><th>Stevne</th><th class="terminliste-mobile-hide">Stevnetype</th><th>Resultater</th></tr></thead>'
                        + '<tbody>' + items.map(renderCompactRow).join('') + '</tbody></table>';
                }
                moreLinkEl.innerHTML = '<a href="' + linkUrl + '">Se terminliste →</a>';
            }, function (err) {
                if (err.name === 'AbortError' || thisAbort !== currentAbort) { return; }
                tableWrapEl.innerHTML = '<p>Kunne ikke laste stevneoversikt.</p>';
            });
        }

        function renderCompactRow(c) {
            var resultCell = (c.hasResult && c.resultFileUrl)
                ? '<a href="' + esc(c.resultFileUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Last ned resultater (PDF, åpnes i ny fane)">PDF</a>'
                : '–';
            return '<tr data-status="' + esc(String(c.status != null ? c.status : 1)) + '">'
                + '<td class="terminliste-detail-col"><button type="button" class="comp-detail-btn" data-id="' + esc(c.id) + '" aria-label="Se detaljer for ' + esc(c.title || '–') + '">ⓘ</button></td>'
                + '<td class="terminliste-date">' + esc(StandplassFormat.formatDateRange(c.startDate, c.endDate)) + '</td>'
                + '<td>' + esc(c.title || '–') + '</td>'
                + '<td class="terminliste-mobile-hide">' + esc(c.competitionTypeName || '–') + '</td>'
                + '<td class="terminliste-result-cell">' + resultCell + '</td></tr>';
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
        tableWrapEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.comp-detail-btn');
            if (!btn) { return; }
            var bodyEl = compDialog.querySelector('.comp-modal-body');
            bodyEl.innerHTML = '<p class="ranking-status-msg">Laster…</p>';
            compDialog.showModal();
            StandplassCompModal.fetchDetailWithFacility(btn.dataset.id, window.fetch.bind(window)).then(function (result) {
                compDialog.querySelector('.comp-modal-title').textContent = result.comp.title || '';
                bodyEl.innerHTML = StandplassCompModal.renderDetailBody(result.comp, result.facility);
            }, function () {
                bodyEl.innerHTML = '<p class="ranking-status-msg ranking-error">Kunne ikke laste stevneinformasjon.</p>';
            });
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
        var moreBtn = id('-more-btn');

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

        function renderRow(c) {
            var href = 'https://app.skyting.no/p/c/' + esc(c.id) + '/details';
            var frist = c.registrationEndDate ? StandplassFormat.formatDate(c.registrationEndDate) : '–';
            var resultCell = (c.hasResult && c.resultFileUrl)
                ? '<a href="' + esc(c.resultFileUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Last ned resultater (PDF, åpnes i ny fane)">PDF</a>'
                : '–';
            var statusText = c.status !== 1 ? (StandplassTerminlistePage.STATUS_LABEL[c.status] || null) : null;
            var detailAriaLabel = 'Se detaljer for ' + esc(c.title || '–') + (statusText ? ' – ' + esc(statusText) : '');
            var orgName = allClubs.filter(function (o) { return o.id === c.organizationId; })[0];
            var kretsName = allKretser.filter(function (k) { return k.id === c.regionOrganizationId; })[0];
            var branchNames = (c.branches || []).map(function (bid) {
                var b = branchlistData.branches.filter(function (x) { return x.id === bid; })[0];
                return b ? b.name : null;
            }).filter(Boolean).join(', ') || '–';
            var groupNames = (c.disciplineGroups || []).map(function (gid) {
                var g = StandplassTerminlistePage.groupsForBranches(branchlistData.branches, []).filter(function (x) { return x.id === gid; })[0];
                return g ? g.name : null;
            }).filter(Boolean).join(', ') || '–';

            return '<tr class="terminliste-row--clickable" data-id="' + esc(c.id) + '" data-status="' + esc(String(c.status != null ? c.status : 1)) + '">'
                + '<td class="terminliste-detail-col"><button type="button" class="comp-detail-btn" data-id="' + esc(c.id) + '" aria-label="' + detailAriaLabel + '">ⓘ</button></td>'
                + '<td class="terminliste-date">' + esc(StandplassFormat.formatDateRange(c.startDate, c.endDate)) + '</td>'
                + '<td><a href="' + href + '" target="_blank" rel="noopener noreferrer">' + esc(c.title || '–') + '</a>'
                + (c.facilityName ? '<span class="terminliste-sub">' + esc(c.facilityName) + '</span>' : '') + '</td>'
                + '<td>' + esc(c.competitionTypeName || '–') + '</td>'
                + '<td class="terminliste-mobile-hide">' + esc(orgName ? orgName.name : (c.organizationName || '–'))
                + (kretsName ? '<span class="terminliste-sub">' + esc(kretsName.name) + '</span>' : '') + '</td>'
                + '<td class="terminliste-tablet-hide">' + esc(branchNames) + '</td>'
                + '<td>' + esc(groupNames) + '</td>'
                + '<td class="terminliste-tablet-hide terminliste-date">' + esc(frist) + '</td>'
                + '<td class="terminliste-result-cell">' + resultCell + '</td>'
                + '</tr>';
        }

        // `appendItems`, when given, is just the newly-fetched page -- only
        // those rows get rendered/appended, since `rows` (the full
        // accumulated history across every "Last inn flere" click) is
        // already on the page from earlier calls. Omit it (reset load) to
        // render the full current `rows` array fresh.
        function renderTable(appendItems) {
            if (!appendItems && !rows.length) {
                tableWrapEl.innerHTML = '<div class="ranking-blank-state"><p>Ingen stevner funnet.</p></div>';
                moreBtn.hidden = true;
                return;
            }
            if (appendItems) {
                tableWrapEl.querySelector('tbody').insertAdjacentHTML('beforeend', appendItems.map(renderRow).join(''));
            } else {
                var bodyHtml = rows.map(renderRow).join('');
                tableWrapEl.innerHTML = '<div class="ranking-full-table"><table class="ranking-table" aria-label="Terminliste">'
                    + '<thead><tr>'
                    + '<th scope="col" class="terminliste-detail-col"><span class="visually-hidden">Detaljer</span></th>'
                    + '<th scope="col">Dato</th><th scope="col">Stevne</th><th scope="col">Stevnetype</th>'
                    + '<th scope="col" class="terminliste-mobile-hide">Arrangør</th>'
                    + '<th scope="col" class="terminliste-tablet-hide">Gren</th>'
                    + '<th scope="col">Øvelsesgruppe</th>'
                    + '<th scope="col" class="terminliste-tablet-hide">Påmeldingsfrist</th>'
                    + '<th scope="col">Resultater</th>'
                    + '</tr></thead><tbody>' + bodyHtml + '</tbody></table></div>';
            }
            moreBtn.hidden = !hasMore;
        }

        function fetchAndRender(reset) {
            if (reset) { pageIndex = 0; rows = []; }
            if (currentAbort) { currentAbort.abort(); }
            currentAbort = new AbortController();
            statusEl.textContent = 'Laster…';
            var thisAbort = currentAbort;
            var url = StandplassTerminlistePage.buildCompetitionListUrl({
                pageIndex: pageIndex, pageSize: PAGE_SIZE,
                fra: selectedFra, til: selectedTil,
                branchIds: selectedBranchIds, orgIds: selectedOrgIds, kretsIds: selectedKretsIds,
                typeIds: selectedTypeIds, groupIds: selectedGroupIds, name: selectedName
            });
            window.fetch(url, { signal: thisAbort.signal }).then(function (r) {
                if (!r.ok) { throw new Error(String(r.status)); }
                return r.json();
            }).then(function (data) {
                if (thisAbort !== currentAbort) { return; }
                var items = (data && data.items) || [];
                rows = reset ? items : rows.concat(items);
                hasMore = !!(data && data.paging && data.paging.hasNextPage);
                statusEl.textContent = '';
                renderTable(reset ? null : items);
            }, function (err) {
                if (err.name === 'AbortError' || thisAbort !== currentAbort) { return; }
                statusEl.textContent = 'Kunne ikke hente data.';
                statusEl.classList.add('ranking-error');
            });
        }

        moreBtn.addEventListener('click', function () { pageIndex++; fetchAndRender(false); });

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

        var compDialog = id('-comp-dialog');
        StandplassCompModal.ensureReferenceData(window.fetch.bind(window));
        var compOpenSeq = 0;
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
            // A single-body-replace design (this file's own first draft, and
            // stevner-page.js's already-shipped compDialog) loses the
            // Detaljer content the moment Resultater is viewed, with no way
            // back short of a cache-and-restore patch -- the real fix is to
            // never destroy it in the first place.
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
        compDialog.addEventListener('click', function (e) { if (e.target === compDialog) { compDialog.close(); } });

        function openCompModal(compId, title) {
            var mySeq = ++compOpenSeq;
            compDialog.dataset.compId = compId;
            compDialog.querySelector('.comp-modal-title').textContent = title || '';
            compDialog.querySelector('.comp-modal-meta').textContent = '';
            var detailViewEl = compDialog.querySelector('[data-comp-view="detaljer"]');
            var resultsViewEl = compDialog.querySelector('[data-comp-view="resultater"]');
            detailViewEl.innerHTML = '<p class="ranking-status-msg">Laster…</p>';
            resultsViewEl.innerHTML = '';
            detailViewEl.hidden = false;
            resultsViewEl.hidden = true;
            Array.prototype.forEach.call(compDialog.querySelectorAll('.program-toggle button'), function (b) {
                var isDetaljer = b.getAttribute('data-comp-tab') === 'detaljer';
                b.classList.toggle('program-btn--active', isDetaljer);
                b.setAttribute('aria-pressed', String(isDetaljer));
            });
            compDialog.showModal();
            StandplassCompModal.fetchDetailWithFacility(compId, window.fetch.bind(window)).then(function (result) {
                if (mySeq !== compOpenSeq) { return; }
                compDialog.querySelector('.comp-modal-meta').textContent = [
                    StandplassFormat.formatDateRange(result.comp.startDate, result.comp.endDate),
                    result.comp.facilityName, result.comp.organizationName
                ].filter(Boolean).join(' · ');
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

        compDialog.addEventListener('change', function (e) {
            var select = e.target.closest('.comp-results-disc-filter');
            if (!select) { return; }
            compDialog.querySelector('[data-comp-view="resultater"]').innerHTML =
                StandplassCompModal.renderResultsBody(compResults, select.value, config.idPrefix);
        });

        tableWrapEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.comp-detail-btn');
            if (!btn) { return; }
            var tr = btn.closest('tr');
            var titleLink = tr && tr.querySelector('td:nth-child(3) a');
            openCompModal(btn.dataset.id, titleLink ? titleLink.textContent : '');
        });
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
            + '<p class="ranking-status-msg" id="' + idPrefix + '-status" aria-live="polite"></p>'
            + '<div id="' + idPrefix + '-table-wrap"></div>'
            + '<button class="ranking-more-btn" id="' + idPrefix + '-more-btn" type="button" hidden>Last inn flere</button>'
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
        encodeIdList: encodeIdList,
        decodeIdList: decodeIdList,
        buildCompetitionListUrl: buildCompetitionListUrl,
        groupsForBranches: groupsForBranches,
        buildMarkup: buildMarkup,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassTerminlistePage;
}
