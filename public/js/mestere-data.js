// public/js/mestere-data.js
//
// Pure helpers over the per-year mestere indexes
// (public/data/{felt,bane}/mestere-<year>.json): region grouping for the
// mesterskap pages, medal counting, per-person merit lists (the person
// modal's Meritter tab) and per-club medal summaries (klubbstatistikk),
// plus the dense-table surface — program-ordered podium flattening,
// filtering and stats. No DOM, no fetching — node-testable.
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

    // Championship program order (felt): Fin, Grov, Revolver, Militær,
    // Spesial, Magnum; øvelser outside the families rank after them.
    // The scan is specificity-ordered — 'Sp-Revolver' contains 'revolver'
    // but is a spesial øvelse, so the sp- keywords check first. Bane
    // øvelse names only match by accident of the scan; the bane order
    // is settled when bane data exists (dense-table spec ruling).
    var PROGRAM_KEYWORDS = [
        ['sp-', 5], ['spesial', 5],
        ['fin', 1], ['grov', 2], ['revolver', 3], ['militær', 4], ['magnum', 6]
    ];
    var UNKNOWN_RANK = 90;

    function programRank(ovelse) {
        // A standalone 'sp' token ('Hurtig Sp Revolver' — bane prints it
        // without the hyphen) normalizes to 'sp-' so the same keyword
        // catches it.
        var name = String(ovelse == null ? '' : ovelse).toLowerCase()
            .replace(/\bsp(?![\w-])/g, 'sp-');
        for (var i = 0; i < PROGRAM_KEYWORDS.length; i++) {
            if (name.indexOf(PROGRAM_KEYWORDS[i][0]) !== -1) {
                return PROGRAM_KEYWORDS[i][1];
            }
        }
        return UNKNOWN_RANK;
    }

    function medalRank(medal) {
        var i = MEDALS.indexOf(medal);
        return i === -1 ? null : i + 1;
    }

    // The club inside a lag name: team names carry the club with a
    // trailing team number, spaced ('GPK 1') or fused ('SSSK10').
    // Names without digits are already the club. Display-level
    // derivation only — the row's club field stays null for team rows
    // (club filters and stats stay individual-only by ruling).
    function teamClub(team) {
        return String(team == null ? '' : team)
            .replace(/\s*\d+$/, '')
            .trim();
    }

    // One row per podium finish for the scope, individual and lag
    // sections together, each stamped with its comp's context and
    // pre-sorted into the order the mesterskap pages open with:
    // øvelse program rank, klasse (Norwegian collation, nulls last),
    // medal rank, then name. Team rows carry the team string as name
    // and no personId; their club is the index's member-resolved
    // canonical club when present, and they keep their lag sum.
    function podiumRows(index, scope) {
        var rows = [];
        var sectionKeys = [scope, scope + 'Lag'];
        ((index || {}).comps || []).forEach(function (comp) {
            sectionKeys.forEach(function (key) {
                (comp[key] || []).forEach(function (section) {
                    (section.podium || []).forEach(function (row) {
                        var isTeam = row.team != null;
                        rows.push({
                            ovelse: section.ovelse,
                            ovelseRank: programRank(section.ovelse),
                            klasse: section.klasse == null ? null : section.klasse,
                            medal: row.medal,
                            medalRank: medalRank(row.medal),
                            name: isTeam ? row.team : row.name,
                            personId: isTeam ? null : (row.personId || null),
                            club: row.club || null,
                            sum: row.sum == null ? null : row.sum,
                            isTeam: isTeam,
                            region: comp.region || null,
                            distrikt: comp.distrikt || null,
                            date: comp.date || null,
                            organizer: comp.organizer || null,
                            compId: comp.compId
                        });
                    });
                });
            });
        });
        rows.sort(function (a, b) {
            if (a.ovelseRank !== b.ovelseRank) { return a.ovelseRank - b.ovelseRank; }
            if (a.klasse == null && b.klasse == null) { /* fall through */ }
            else if (a.klasse == null) { return 1; }
            else if (b.klasse == null) { return -1; }
            else {
                var c = String(a.klasse).localeCompare(String(b.klasse), 'no');
                if (c !== 0) { return c; }
            }
            var ma = a.medalRank == null ? 9 : a.medalRank;
            var mb = b.medalRank == null ? 9 : b.medalRank;
            if (ma !== mb) { return ma - mb; }
            return String(a.name).localeCompare(String(b.name), 'no');
        });
        return rows;
    }

    // filters: {ovelse: [], klasse: [], region: [], distrikt: [],
    // klubb: '', navn: '', type: ''} — empty array/string is a no-op.
    // The page maps the URL's krets param to region (km) or distrikt
    // (dm, via the krets→distrikt mapping) before calling; null row
    // values never match a non-empty filter.
    function filterPodiumRows(rows, filters) {
        var f = filters || {};
        var ovelse = f.ovelse || [];
        var klasse = f.klasse || [];
        var region = f.region || [];
        var distrikt = f.distrikt || [];
        var klubb = f.klubb || '';
        var navn = String(f.navn || '').toLowerCase();
        var type = f.type || '';
        return (rows || []).filter(function (r) {
            if (ovelse.length && ovelse.indexOf(r.ovelse) === -1) { return false; }
            if (klasse.length && klasse.indexOf(r.klasse) === -1) { return false; }
            if (region.length && region.indexOf(r.region) === -1) { return false; }
            if (distrikt.length && distrikt.indexOf(r.distrikt) === -1) { return false; }
            if (klubb && r.club !== klubb) { return false; }
            if (navn && String(r.name || '').toLowerCase().indexOf(navn) === -1) { return false; }
            if (type === 'individuelt' && r.isTeam) { return false; }
            if (type === 'lag' && !r.isTeam) { return false; }
            return true;
        });
    }

    // Counts for the stats line over the filtered rows: medals, distinct
    // øvelser, distinct regions (krets for km, distrikt for dm, none for
    // nm) and distinct clubs (team rows carry none).
    function statsFor(rows, scope) {
        var ovelser = {};
        var regions = {};
        var clubs = {};
        (rows || []).forEach(function (r) {
            ovelser[r.ovelse] = true;
            if (r.club != null) { clubs[r.club] = true; }
            if (scope === 'km' && r.region != null) { regions[r.region] = true; }
            if (scope === 'dm' && r.distrikt != null) { regions[r.distrikt] = true; }
        });
        return {
            medaljer: (rows || []).length,
            ovselser: Object.keys(ovelser).length,
            regioner: scope === 'nm' ? null : Object.keys(regions).length,
            klubber: Object.keys(clubs).length
        };
    }

    return {
        normalizeRegionName: normalizeRegionName,
        groupByRegion: groupByRegion,
        medalCounts: medalCounts,
        meritterForPerson: meritterForPerson,
        summarizeByClub: summarizeByClub,
        programRank: programRank,
        podiumRows: podiumRows,
        filterPodiumRows: filterPodiumRows,
        statsFor: statsFor,
        teamClub: teamClub
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassMestereData;
}
