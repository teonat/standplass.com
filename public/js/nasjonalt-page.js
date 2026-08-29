// public/js/nasjonalt-page.js
//
// Page glue for /nasjonalt: full NSF national ranking search across all 4
// branches (Pistol, Rifle, Leirdue, Viltmål) -- unlike klubb (Pistol-only,
// fixed discipline set), nasjonalt is the general-purpose search this
// project's other views don't need to be. Ported from the source's
// resultatliste-nasjonalt.js, generalized nowhere (the source itself is
// already club-neutral) except in how shooter-name clickability is gated
// -- see docs/superpowers/specs/2026-08-30-nasjonalt-view-design.md's
// "Clickability gate" section for why this project's own
// klubb-discipline-groups.js resolution is used instead of the source's
// own STEVNERESULTATER_DISC_IDS/BANE_IDS sets (found overinclusive during
// design: it wrongly counts PPC-group disciplines as felt-covered, which
// the felt scraper never actually collects).
var StandplassNasjonaltPage = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Class names carry a "Branch\" or "Branch/" prefix (e.g. "Pistol\A")
    // -- same stripping convention as comp-modal.js's ensureReferenceData.
    function cleanClassName(name) {
        return (name || '').replace(/^[^\\/]+[\\/]/, '');
    }

    // Deliberately independent of comp-modal.js's ensureReferenceData,
    // which is Pistol-branch-scoped on purpose (klubb/felt/bane's
    // competition modal only ever needs Pistol) -- nasjonalt needs every
    // branch, so it does its own fetch/processing rather than widen an
    // existing, already-reviewed Pistol-only contract. Pure: takes already-
    // fetched raw branchlist JSON, no fetch inside -- ensureBranchlist
    // below wraps this with the actual fetch + module-level cache.
    function processBranchlist(rawData) {
        var items = (rawData && rawData.items) || [];
        var branches = [];
        var disciplines = [];
        items.forEach(function (branch) {
            var sortedClasses = (branch.classes || [])
                .filter(function (c) { return !c.deleted; })
                .map(function (c) { return { id: c.id, name: cleanClassName(c.name), code: c.classCode }; });
            var seen = {};
            var branchDiscs = [];
            (branch.disciplineGroups || []).forEach(function (g) {
                (g.disciplines || []).forEach(function (d) {
                    if (!d.deleted && d.id && !seen[d.id]) {
                        seen[d.id] = true;
                        var disc = { id: d.id, name: d.name, branchId: d.branchId, classes: sortedClasses };
                        branchDiscs.push(disc);
                        disciplines.push(disc);
                    }
                });
            });
            if (branchDiscs.length) {
                branchDiscs.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'no'); });
                branches.push({ name: branch.name, disciplines: branchDiscs });
            }
        });
        return { branches: branches, disciplines: disciplines };
    }

    var branchlistPromise = null;
    var branchlistData = { branches: [], disciplines: [] };
    function ensureBranchlist(fetchFn) {
        if (branchlistPromise) { return branchlistPromise; }
        branchlistPromise = fetchFn('https://nsfapi.azurewebsites.net/query/branchlist')
            .then(function (r) { if (!r.ok) { throw new Error(String(r.status)); } return r.json(); })
            .then(function (data) { branchlistData = processBranchlist(data); return branchlistData; });
        return branchlistPromise;
    }

    // Clickability gate (see file header comment): a discipline is
    // clickable only if it's in klubb's own dynamically-resolved
    // Feltpistol+Spesialfelt or 5-bane-group membership -- computed once
    // whenever the branchlist is (re)loaded, not per-row.
    var clickableDiscIds = null;
    function computeClickableIds(groups) {
        var ids = {};
        StandplassKlubbDisciplineGroups.resolveFelt(groups).forEach(function (d) { ids[d.id] = true; });
        StandplassKlubbDisciplineGroups.resolveBane(groups).forEach(function (d) { ids[d.id] = true; });
        return ids;
    }
    function isClickable(disciplineId) {
        return !!(clickableDiscIds && clickableDiscIds[disciplineId]);
    }

    function init(config) {
        // Filled in by Tasks 5-8.
    }

    return {
        processBranchlist: processBranchlist,
        ensureBranchlist: ensureBranchlist,
        computeClickableIds: computeClickableIds,
        isClickable: isClickable,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassNasjonaltPage;
}
