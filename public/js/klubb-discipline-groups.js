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
        return [feltpistol, spesialfelt].filter(Boolean).reduce(function (acc, g) { return acc.concat(nonDeleted(g)); }, []);
    }

    function resolveBane(groups) {
        return (groups || [])
            .filter(function (g) { return BANE_GROUP_NAMES[g.name]; })
            .reduce(function (acc, g) { return acc.concat(nonDeleted(g)); }, []);
    }

    return { resolveFelt: resolveFelt, resolveBane: resolveBane };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassKlubbDisciplineGroups;
}
