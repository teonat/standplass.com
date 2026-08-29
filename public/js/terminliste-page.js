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
    // Only 0/2/3 get a tint -- 1 (Godkjent) is the common case, no styling.
    var STATUS_CLASS = { 0: 'terminliste-status--pending', 2: 'terminliste-status--rejected', 3: 'terminliste-status--rejected' };
    function statusClass(status) { return STATUS_CLASS[status] || ''; }

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

    function init(config) {
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

        // Task 5 continues here: Arrangør/Krets tag-combos, Stevnetype/
        // Øvelsesgruppe (groupDropdown referenced above), initial data load.
    }

    function buildMarkup(idPrefix, compact) {
        // Filled in by Task 8 (full page) and Task 9 (compact widget).
        return '';
    }

    return {
        processBranchlist: processBranchlist,
        ensureBranchlist: ensureBranchlist,
        STATUS_LABEL: STATUS_LABEL,
        statusClass: statusClass,
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
