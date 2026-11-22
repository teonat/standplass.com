// public/js/mestere-data.js
//
// Pure helpers over the per-year mestere indexes
// (public/data/{felt,bane}/mestere-<year>.json): region grouping for the
// mesterskap pages, medal counting, per-person merit lists (the person
// modal's Meritter tab) and per-club medal summaries (klubbstatistikk).
// No DOM, no fetching — node-testable.
var StandplassMestereData = (function () {
    'use strict';

    var MEDALS = ['Gull', 'Sølv', 'Bronse'];
    var INDIVIDUAL_SCOPES = ['nm', 'dm', 'km'];

    // Region names normalize for grouping only (casefold, collapse
    // dashes/slashes to spaces): 'Østlandet-Nord' and 'østlandet nord'
    // are one region. Display keeps whichever spelling the data carries.
    function normalizeRegionName(name) {
        return String(name == null ? '' : name)
            .toLowerCase()
            .replace(/[-–—/]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function hasScopeSections(comp, scope) {
        return (comp[scope] || []).length > 0
            || (comp[scope + 'Lag'] || []).length > 0;
    }

    function regionKeyFor(comp, scope) {
        if (scope === 'km') { return comp.region; }
        if (scope === 'dm') { return comp.distrikt; }
        return null; // nm: no grouping
    }

    // scope 'km' groups by krets, 'dm' by distrikt, 'nm' is one
    // ungrouped list. Groups sort alphabetically (Norwegian collation);
    // region-less comps land in a final 'Ukjent region' bucket rather
    // than vanishing — the corpus has known coverage gaps.
    function groupByRegion(index, scope) {
        var comps = ((index || {}).comps || []).filter(function (c) {
            return hasScopeSections(c, scope);
        });
        if (scope === 'nm') {
            return comps.length ? [{ key: null, label: null, comps: comps }] : [];
        }
        var groups = [];
        var byKey = {};
        var unknown = [];
        comps.forEach(function (c) {
            var raw = regionKeyFor(c, scope);
            if (raw == null || raw === '') {
                unknown.push(c);
                return;
            }
            var key = normalizeRegionName(raw);
            if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
                byKey[key] = { key: key, label: raw, comps: [] };
                groups.push(byKey[key]);
            }
            byKey[key].comps.push(c);
        });
        groups.sort(function (a, b) {
            return a.label.localeCompare(b.label, 'no');
        });
        if (unknown.length) {
            groups.push({ key: null, label: 'Ukjent region', comps: unknown });
        }
        return groups;
    }

    function zeroMedals() {
        var out = {};
        MEDALS.forEach(function (m) { out[m] = 0; });
        return out;
    }

    function medalCounts(sections) {
        var out = zeroMedals();
        (sections || []).forEach(function (section) {
            (section.podium || []).forEach(function (row) {
                if (out[row.medal] != null) { out[row.medal] += 1; }
            });
        });
        return out;
    }

    // entries: [{year, index}] — one per branch-year, both branches mixed.
    // Returns one row per individual podium finish by the person, newest
    // year first (comp order within a year). Team podiums carry no
    // personId and never produce merits. The merit's region is the krets
    // for km, the distrikt for dm, nothing for nm.
    function meritterForPerson(entries, personId) {
        if (!personId) { return []; }
        var rows = [];
        (entries || []).forEach(function (entry) {
            var index = entry.index || {};
            (index.comps || []).forEach(function (comp) {
                INDIVIDUAL_SCOPES.forEach(function (scope) {
                    (comp[scope] || []).forEach(function (section) {
                        (section.podium || []).forEach(function (row) {
                            if (row.personId !== personId) { return; }
                            rows.push({
                                year: entry.year,
                                scope: scope,
                                ovelse: section.ovelse,
                                klasse: section.klasse == null ? null : section.klasse,
                                region: scope === 'km' ? (comp.region || null)
                                    : scope === 'dm' ? (comp.distrikt || null) : null,
                                medal: row.medal,
                                compId: comp.compId
                            });
                        });
                    });
                });
            });
        });
        rows.sort(function (a, b) { return b.year - a.year; });
        return rows;
    }

    // indexes: both branches' indexes for one year. Individual podiums
    // only — team podiums have no club field (a team string is not a
    // canonical club name), so lag medals never count toward club totals.
    // Rows with no club at all land in 'Ukjent klubb'.
    function summarizeByClub(indexes) {
        var clubs = {};
        (indexes || []).forEach(function (index) {
            (index.comps || []).forEach(function (comp) {
                INDIVIDUAL_SCOPES.forEach(function (scope) {
                    (comp[scope] || []).forEach(function (section) {
                        (section.podium || []).forEach(function (row) {
                            var club = row.club || 'Ukjent klubb';
                            if (!Object.prototype.hasOwnProperty.call(clubs, club)) {
                                clubs[club] = { club: club, nm: zeroMedals(), dm: zeroMedals(), km: zeroMedals() };
                            }
                            if (clubs[club][scope][row.medal] != null) {
                                clubs[club][scope][row.medal] += 1;
                            }
                        });
                    });
                });
            });
        });
        return Object.keys(clubs).map(function (name) { return clubs[name]; })
            .sort(function (a, b) {
                var order = ['nm', 'dm', 'km'];
                var medals = ['Gull', 'Sølv', 'Bronse'];
                for (var m = 0; m < medals.length; m++) {
                    var va = 0, vb = 0;
                    for (var s = 0; s < order.length; s++) {
                        va += a[order[s]][medals[m]];
                        vb += b[order[s]][medals[m]];
                    }
                    if (va !== vb) { return vb - va; }
                }
                return a.club.localeCompare(b.club, 'no');
            });
    }

    return {
        normalizeRegionName: normalizeRegionName,
        groupByRegion: groupByRegion,
        medalCounts: medalCounts,
        meritterForPerson: meritterForPerson,
        summarizeByClub: summarizeByClub
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassMestereData;
}
