// public/js/klubb-discipline-groups.js
//
// Resolves the Felt/Bane discipline sets for the klubb-view ranking-card
// grid, dynamically from the live NSF branchlist's disciplineGroups --
// not from a hardcoded GUID array (the source's resultatliste-klubb.js
// approach) and not from a hardcoded discipline-name list either. See
// docs/superpowers/specs/2026-08-29-klubb-view-design.md's "Discipline
// resolution (Felt/Bane)" section for why: diffing the live API against
// the source's hardcoded Bane list found it missing one discipline
// (Presisjon Landsdelsmatch) that its own matching group actually
// contains -- a real oversight in the original build. This module
// deliberately takes the full group union instead, which both mirrors
// this project's own scrapers (scrape_stevneresultater.py's
// feltpistol/spesialfelt name-matching, scrape_bane.py's
// BANE_GROUP_NAMES) and fixes that gap rather than reproducing it.
var StandplassKlubbDisciplineGroups = (function () {
    'use strict';

    var BANE_GROUP_NAMES = { 'Fin-/grovpistol': true, 'Hurtig': true, 'Standardpistol': true, 'Silhuettpistol': true, 'T96': true };

    // The source's card order isn't derivable from any live API field --
    // checked disciplineCode, disciplineGroupId, useRankingScore on every
    // discipline (2026-08-30 live fetch); none reproduce it. It's a
    // hand-curated sequence in the source's own hardcoded array. These two
    // lists exist only to match that display order -- discipline
    // *membership* stays fully dynamic (resolveFelt/resolveBane below), so
    // this is a small, honest, explicitly-marked exception, not a revert to
    // hardcoding the discipline set itself. Names are copied from the live
    // API's own spelling, not the source's display strings, where they
    // differ (e.g. the API returns "Militærfelt-Rødpunkt", hyphenated with
    // a capital R; the source's own card label is "Militærfelt rødpunkt").
    // A discipline with no entry here (currently only Presisjon
    // Landsdelsmatch, since the source's own list never had it) sorts
    // after every known entry, alphabetically among any other unknowns.
    var FELT_ORDER = ['Finfelt', 'Grovfelt', 'Militærfelt', 'Revolverfelt', 'Spesialpistol', 'Spesialrevolver',
        'Militærfelt-Rødpunkt', 'Revolverfelt-Rødpunkt', 'Magnumfelt 1', 'Magnumfelt 2'];
    var BANE_ORDER = ['25m finpistol', '25m grovpistol', '25m hurtigpistol fin', '25m hurtigpistol grov', '25m hurtig militær',
        '25m hurtig spesialpistol', '25m hurtig revolver', '25m hurtig spesialrevolver', '25m standardpistol', '25m silhuettpistol',
        'T96 fin', 'T96 revolver', 'T96 grov', 'T96 spesialrevolver', 'T96 spesial Magnum 2', 'T96 spesialpistol', 'T96 spesial Magnum 1', 'T96 militær'];

    function sortByOrder(discs, order) {
        return discs.slice().sort(function (a, b) {
            var ia = order.indexOf(a.name), ib = order.indexOf(b.name);
            if (ia === -1 && ib === -1) { return a.name.localeCompare(b.name, 'no'); }
            if (ia === -1) { return 1; }
            if (ib === -1) { return -1; }
            return ia - ib;
        });
    }

    function nonDeleted(group) {
        return (group.disciplines || []).filter(function (d) { return !d.deleted; })
            .map(function (d) { return { id: d.id, name: d.name }; });
    }

    // Same name-matching heuristic as scrape_stevneresultater.py's
    // build_mappings(): the first group whose name contains "felt" but
    // not "spesial" is Feltpistol; the first whose name contains
    // "spesial" is Spesialfelt. Union of both, non-deleted disciplines only.
    function resolveFelt(groups) {
        var feltpistol = null, spesialfelt = null;
        (groups || []).forEach(function (g) {
            var lower = (g.name || '').toLowerCase();
            if (!feltpistol && lower.indexOf('felt') !== -1 && lower.indexOf('spesial') === -1) { feltpistol = g; }
            else if (!spesialfelt && lower.indexOf('spesial') !== -1) { spesialfelt = g; }
        });
        var discs = [feltpistol, spesialfelt].filter(Boolean).reduce(function (acc, g) { return acc.concat(nonDeleted(g)); }, []);
        return sortByOrder(discs, FELT_ORDER);
    }

    function resolveBane(groups) {
        var discs = (groups || [])
            .filter(function (g) { return BANE_GROUP_NAMES[g.name]; })
            .reduce(function (acc, g) { return acc.concat(nonDeleted(g)); }, []);
        return sortByOrder(discs, BANE_ORDER);
    }

    return { resolveFelt: resolveFelt, resolveBane: resolveBane };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassKlubbDisciplineGroups;
}
