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

    function init(config) {
        // Filled in by Tasks 4-6 (full page) and Task 9 (compact widget).
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
        buildMarkup: buildMarkup,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassTerminlistePage;
}
