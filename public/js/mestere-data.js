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
    var TYPE_RANKS = { nm: 1, dm: 2, km: 3 };

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

    // entries: [{year, index, branch?}] — one per branch-year, both
    // branches mixed. Returns one merit per championship podium finish
    // by the person, newest year first (comp order within a year):
    // individual podiums matched by row personId, and — owner ruling
    // 2026-11-23 — lag/mix-lag team podiums matched by the member
    // personId, carrying the team name and the lag's own class ('Lag
    // Å', 'Mix-lag'). The merit's region is the krets for km, the
    // distrikt for dm, nothing for nm; compTitle rides along for the
    // Meritter tab's comp link, and the entry's branch (owner ruling
    // 2026-11-23: the Alle/Felt/Bane switcher filters on it; null when
    // the caller passes none).
    function meritterForPerson(entries, personId) {
        if (!personId) { return []; }
        var rows = [];
        function push(entry, comp, scope, section, medal, klasse, team) {
            rows.push({
                year: entry.year,
                scope: scope,
                ovelse: section.ovelse,
                klasse: klasse,
                region: scope === 'km' ? (comp.region || null)
                    : scope === 'dm' ? (comp.distrikt || null) : null,
                medal: medal,
                compId: comp.compId,
                compTitle: comp.title || null,
                team: team,
                branch: entry.branch || null
            });
        }
        (entries || []).forEach(function (entry) {
            var index = entry.index || {};
            (index.comps || []).forEach(function (comp) {
                INDIVIDUAL_SCOPES.forEach(function (scope) {
                    (comp[scope] || []).forEach(function (section) {
                        (section.podium || []).forEach(function (row) {
                            if (row.personId !== personId) { return; }
                            push(entry, comp, scope, section, row.medal,
                                section.klasse == null ? null : section.klasse,
                                null);
                        });
                    });
                    (comp[scope + 'Lag'] || []).forEach(function (section) {
                        (section.podium || []).forEach(function (row) {
                            (row.members || []).forEach(function (m) {
                                if (m.personId !== personId) { return; }
                                push(entry, comp, scope, section, row.medal,
                                    lagRowKlasse(section.klasse),
                                    row.team || null);
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
    // by the row's club; lag team podiums once per team under the
    // team's resolved club, falling back to the first member club
    // (owner ruling 2026-11-23 — a team medal counts toward the club's
    // total). The six scope keys stay separate so a consumer merges
    // or splits individual and lag as it chooses. Rows with no club
    // at all land in 'Ukjent klubb'.
    var CLUB_SCOPES = ['nm', 'nmLag', 'dm', 'dmLag', 'km', 'kmLag'];

    function summarizeByClub(indexes) {
        var clubs = {};
        function bucket(club) {
            if (!Object.prototype.hasOwnProperty.call(clubs, club)) {
                var row = { club: club };
                CLUB_SCOPES.forEach(function (s) { row[s] = zeroMedals(); });
                clubs[club] = row;
            }
            return clubs[club];
        }
        (indexes || []).forEach(function (index) {
            (index.comps || []).forEach(function (comp) {
                INDIVIDUAL_SCOPES.forEach(function (scope) {
                    (comp[scope] || []).forEach(function (section) {
                        (section.podium || []).forEach(function (row) {
                            var b = bucket(row.club || 'Ukjent klubb');
                            if (b[scope][row.medal] != null) {
                                b[scope][row.medal] += 1;
                            }
                        });
                    });
                    (comp[scope + 'Lag'] || []).forEach(function (section) {
                        (section.podium || []).forEach(function (row) {
                            var club = row.club;
                            if (!club) {
                                (row.members || []).some(function (m) {
                                    if (m.club) { club = m.club; return true; }
                                    return false;
                                });
                            }
                            var b = bucket(club || 'Ukjent klubb');
                            var key = scope + 'Lag';
                            if (b[key][row.medal] != null) {
                                b[key][row.medal] += 1;
                            }
                        });
                    });
                });
            });
        });
        return Object.keys(clubs).map(function (name) { return clubs[name]; })
            .sort(function (a, b) {
                var medals = ['Gull', 'Sølv', 'Bronse'];
                for (var m = 0; m < medals.length; m++) {
                    var va = 0, vb = 0;
                    CLUB_SCOPES.forEach(function (s) {
                        va += a[s][medals[m]];
                        vb += b[s][medals[m]];
                    });
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
    // derivation only — member rows carry their resolved club, so
    // this feeds just the memberless team-row fallback.
    function teamClub(team) {
        return String(team == null ? '' : team)
            .replace(/\s*\d+$/, '')
            .trim();
    }

    // A lag row's class cell: the lag's OWN class, read from the
    // section — lag øvelser carry their own class system (Å, M, K,
    // V55… — per the official NM lag table), the single letters
    // spelled out, prefixed with 'Lag': 'Lag Å', 'Lag Menn'. Mix
    // teams are their own type ('Mix-lag' — one male + one female;
    // the participants' classes don't define the team).
    var KLASSER = { M: 'Menn', K: 'Kvinner' };

    function lagKlasse(klasse) {
        if (klasse == null) { return null; }
        var full = Object.prototype.hasOwnProperty.call(KLASSER, klasse)
            ? KLASSER[klasse]
            : klasse;
        return 'Lag ' + full;
    }

    // The one lag-class form every consumer renders (owner rulings
    // 2026-11-23): 'Mix-lag' for mix teams — the natural noun, never
    // 'Lag Mix' — else lagKlasse's 'Lag Å'/'Lag Menn'.
    function lagRowKlasse(klasse) {
        if (klasse === 'Mix') { return 'Mix-lag'; }
        return lagKlasse(klasse);
    }

    // One row per podium finish for the scope, individual and lag
    // sections together, each stamped with its comp's context and
    // pre-sorted into the order the mesterskap pages open with:
    // øvelse program rank, klasse (Norwegian collation, nulls last),
    // medal rank, then name. Øvelse keeps its bare name on every row
    // (owner ruling — the lag variants merge into their øvelse; the
    // type filter separates row kinds). Lag sections expand each
    // membered team into one row per member — the member's name,
    // personId, own sum and resolved club, the team's medal, a
    // 'Lag Å'-style klasse (the section's own class — the lag's class
    // system, not the member's), and the lag name + the team's sum on
    // the row for the sub-lines under Navn and Sum. Teammates share a
    // podiumKey so stats count the team's medal once. Memberless
    // teams fall back to the team row (never lose a medal).
    function podiumRows(index, scopes) {
        // scopes: a 'nm'|'dm'|'km' string (the historical single-scope
        // form), a list of them, or null/undefined for all three. A dual
        // comp (km+dm sections in one) contributes to both scopes — one
        // entry per scope's podium, never merged (owner ruling
        // 2026-11-24).
        if (scopes == null) { scopes = ['nm', 'dm', 'km']; }
        if (typeof scopes === 'string') { scopes = [scopes]; }
        var rows = [];
        var sectionKeys = [];
        scopes.forEach(function (scope) {
            sectionKeys.push({ key: scope, scope: scope, isLagKey: false });
            sectionKeys.push({ key: scope + 'Lag', scope: scope, isLagKey: true });
        });
        ((index || {}).comps || []).forEach(function (comp) {
            sectionKeys.forEach(function (sk) {
                var key = sk.key;
                var isLagKey = sk.isLagKey;
                var scope = sk.scope;
                (comp[key] || []).forEach(function (section) {
                    var ovelse = section.ovelse;
                    var rank = programRank(section.ovelse);
                    var context = {
                        region: comp.region || null,
                        distrikt: comp.distrikt || null,
                        date: comp.date || null,
                        organizer: comp.organizer || null,
                        title: comp.title || null,
                        compId: comp.compId,
                        type: scope,
                        typeRank: TYPE_RANKS[scope],
                        champRegion: scope === 'km' ? (comp.region || null)
                            : scope === 'dm' ? (comp.distrikt || null) : null
                    };
                    (section.podium || []).forEach(function (row) {
                        var isTeam = row.team != null;
                        var members = isTeam ? (row.members || []) : [];
                        var podiumKey = isTeam
                            ? [comp.compId, key, section.ovelse,
                               section.klasse, row.medal, row.team].join('|')
                            : null;
                        if (members.length) {
                            members.forEach(function (m) {
                                rows.push({
                                    ovelse: ovelse,
                                    ovelseRank: rank,
                                    klasse: lagRowKlasse(section.klasse),
                                    medal: row.medal,
                                    medalRank: medalRank(row.medal),
                                    name: m.name,
                                    personId: m.personId || null,
                                    club: m.club || row.club || null,
                                    sum: m.sum == null ? null : m.sum,
                                    lagSum: row.sum == null ? null : row.sum,
                                    isTeam: true,
                                    lag: row.team,
                                    podiumKey: podiumKey,
                                    region: context.region,
                                    distrikt: context.distrikt,
                                    date: context.date,
                                    organizer: context.organizer,
                                    title: context.title,
                                    compId: context.compId,
                                    type: context.type,
                                    typeRank: context.typeRank,
                                    champRegion: context.champRegion
                                });
                            });
                            return;
                        }
                        rows.push({
                            ovelse: ovelse,
                            ovelseRank: rank,
                            klasse: isLagKey ? lagRowKlasse(section.klasse)
                                : (section.klasse == null ? null : section.klasse),
                            medal: row.medal,
                            medalRank: medalRank(row.medal),
                            name: isTeam ? row.team : row.name,
                            personId: isTeam ? null : (row.personId || null),
                            club: row.club || null,
                            sum: row.sum == null ? null : row.sum,
                            lagSum: null,
                            isTeam: isTeam,
                            lag: null,
                            podiumKey: podiumKey,
                            region: context.region,
                            distrikt: context.distrikt,
                            date: context.date,
                            organizer: context.organizer,
                            title: context.title,
                            compId: context.compId,
                            type: context.type,
                            typeRank: context.typeRank,
                            champRegion: context.champRegion
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

    // filters: {ovelse: [], klasse: [], medal: [], mesterskap: [],
    // region: [], distrikt: [], klubb: '', navn: '', type: ''} — empty
    // array/string is a no-op. mesterskap filters by row type (the
    // unified page's mesterskapstype filter); null row values never
    // match a non-empty filter.
    function filterPodiumRows(rows, filters) {
        var f = filters || {};
        var ovelse = f.ovelse || [];
        var klasse = f.klasse || [];
        var medal = f.medal || [];
        var mesterskap = f.mesterskap || [];
        var region = f.region || [];
        var distrikt = f.distrikt || [];
        var klubb = f.klubb || '';
        var navn = String(f.navn || '').toLowerCase();
        var type = f.type || '';
        return (rows || []).filter(function (r) {
            if (mesterskap.length && mesterskap.indexOf(r.type) === -1) { return false; }
            if (ovelse.length && ovelse.indexOf(r.ovelse) === -1) { return false; }
            if (klasse.length && klasse.indexOf(r.klasse) === -1) { return false; }
            if (medal.length && medal.indexOf(r.medal) === -1) { return false; }
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
    // øvelser, distinct championship regions (champRegion — krets for km
    // rows, distrikt for dm rows, nothing for nm) and distinct clubs. A
    // team's medal counts once — its member rows share a podiumKey
    // (owner ruling 2026-11-23). The legacy scope arg (the pre-unified
    // pages pass one) is ignored: the count is scope-independent.
    function statsFor(rows) {
        var ovelser = {};
        var regions = {};
        var clubs = {};
        var medals = 0;
        var teamMedals = {};
        (rows || []).forEach(function (r) {
            ovelser[r.ovelse] = true;
            if (r.club != null) { clubs[r.club] = true; }
            if (r.champRegion != null) { regions[r.champRegion] = true; }
            if (r.isTeam && r.podiumKey != null) {
                teamMedals[r.podiumKey] = true;
            } else {
                medals += 1;
            }
        });
        return {
            medaljer: medals + Object.keys(teamMedals).length,
            ovselser: Object.keys(ovelser).length,
            regioner: Object.keys(regions).length,
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
