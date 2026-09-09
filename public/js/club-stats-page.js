// public/js/club-stats-page.js
//
// Club statistics for standplass.com: toplists ranking clubs across multiple
// metrics, and a drilldown view with in-depth stats per club. Uses the same
// data/felt + data/bane JSON the felt/bane results views already use.
//
// Pure stats functions (computeClubStats, rankClubs, computeYearOverYear,
// renderLineChart) are exported for node:assert testing. init() handles DOM
// wiring and is manual-QA'd per project convention.
var StandplassClubStats = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── Stats computation ──────────────────────────────────────────────

    // Groups flattened rows by exact club name string. Each row comes from
    // StandplassStevnerPage.flattenRows — fields: personId, name, club,
    // discipline, class, position, score, rankingScore, competition, date.
    // Returns { "ClubName": { uniqueShooters, totalStarts, ... }, ... }.
    function computeClubStats(rows) {
        var clubs = {};
        (rows || []).forEach(function (r) {
            var name = r.club || 'Ukjent';
            if (!clubs[name]) {
                clubs[name] = {
                    shooters: {},
                    starts: 0,
                    competitions: {},
                    topThree: 0,
                    disciplines: {},
                    classes: {}
                };
            }
            var c = clubs[name];
            c.starts++;
            if (r.personId) { c.shooters[r.personId] = true; }
            if (r.competitionId) { c.competitions[r.competitionId] = true; }
            var pos = Number(r.position);
            if (!isNaN(pos) && pos >= 1 && pos <= 3) { c.topThree++; }
            if (r.discipline) { c.disciplines[r.discipline] = true; }
            if (r.class) { c.classes[r.class] = true; }
        });

        // Collapse sets to counts
        Object.keys(clubs).forEach(function (name) {
            var c = clubs[name];
            c.uniqueShooters = Object.keys(c.shooters).length;
            c.totalStarts = c.starts;
            c.competitionsAttended = Object.keys(c.competitions).length;
            c.disciplinesRepresented = Object.keys(c.disciplines).length;
            c.classesRepresented = Object.keys(c.classes).length;
            delete c.shooters;
            delete c.starts;
            delete c.competitions;
            delete c.disciplines;
            delete c.classes;
        });

        return clubs;
    }

    // Converts stats object to a sorted array. options:
    //   metric: 'uniqueShooters' | 'totalStarts' | 'competitionsAttended' |
    //           'topThree' | 'disciplinesRepresented'
    //   minShooters: default 3 — clubs with fewer are excluded
    //   minStarts: default 5 — clubs with fewer are excluded
    // A club appears if it meets EITHER threshold.
    // Ties broken alphabetically by club name (localeCompare, 'no').
    function rankClubs(stats, metric, options) {
        options = options || {};
        var minShooters = options.minShooters != null ? options.minShooters : 3;
        var minStarts = options.minStarts != null ? options.minStarts : 5;

        return Object.keys(stats)
            .map(function (name) {
                var s = stats[name];
                return {
                    club: name,
                    uniqueShooters: s.uniqueShooters,
                    totalStarts: s.totalStarts,
                    competitionsAttended: s.competitionsAttended,
                    topThree: s.topThree,
                    disciplinesRepresented: s.disciplinesRepresented,
                    classesRepresented: s.classesRepresented
                };
            })
            .filter(function (entry) {
                return entry.uniqueShooters >= minShooters || entry.totalStarts >= minStarts;
            })
            .sort(function (a, b) {
                var diff = (b[metric] || 0) - (a[metric] || 0);
                if (diff !== 0) { return diff; }
                return a.club.localeCompare(b.club, 'no');
            });
    }

    // Per-club delta in unique shooters between two years.
    // Returns array of { club, current, previous, delta, isNew }.
    // isNew = true when the club had 0 shooters in the previous year.
    // Clubs only in previous year (gone) are included with current=0.
    function computeYearOverYear(currentStats, previousStats) {
        var allClubs = {};
        Object.keys(currentStats || {}).forEach(function (k) { allClubs[k] = true; });
        Object.keys(previousStats || {}).forEach(function (k) { allClubs[k] = true; });

        return Object.keys(allClubs).map(function (club) {
            var cur = (currentStats && currentStats[club]) ? currentStats[club].uniqueShooters : 0;
            var prev = (previousStats && previousStats[club]) ? previousStats[club].uniqueShooters : 0;
            return {
                club: club,
                current: cur,
                previous: prev,
                delta: cur - prev,
                isNew: prev === 0 && cur > 0
            };
        });
    }

    // ── Klasse semantics (Klassefordeling / topp-3) ────────────────────
    // Skill classes are exactly A–D, single letters. Age/gender classes
    // (Menn, Kvinner, Ungdom 14, Veteran 55, SH Åpen, Åpen2, …) are
    // fact-based, not klassering-based, and pass through untouched.

    var SKILL_CLASSES = ['A', 'B', 'C', 'D'];

    // Øvelser without ferdighetsklasser: any A–D entry there is a
    // mis-entry and remaps to "Åpen" regardless of stevne status.
    // Exact data strings (verified against public/data/felt + bane);
    // cross-check against NSF vedlegg 1 when touching this list.
    var ALWAYS_OPEN_DISCIPLINES = [
        'Spesialpistol', 'Spesialrevolver', 'Magnumfelt 1', 'Magnumfelt 2',
        'Militærfelt-Rødpunkt', 'Revolverfelt-Rødpunkt',
        'T96 fin', 'T96 grov', 'T96 militær', 'T96 revolver',
        'T96 spesialpistol', 'T96 spesialrevolver',
        'T96 spesial Magnum 1', 'T96 spesial Magnum 2',
        '25m NAIS fin', '25m NAIS grov', '10m luftsprint, pistol'
    ];

    // Pure: returns the row's effective class without mutating the row.
    function effectiveClass(row) {
        var cls = row.class;
        if (!cls || SKILL_CLASSES.indexOf(cls) < 0) { return cls; }
        if (!row.applicableForClassification) { return 'Åpen'; }
        if (ALWAYS_OPEN_DISCIPLINES.indexOf(row.discipline) >= 0) { return 'Åpen'; }
        return cls;
    }

    // Per-øvelse class distribution for one club.
    // - A–D rows: emitted only for classes where ≥1 shooter's modal class
    //   (most starts; tie-break lowest: D < C < B < A) equals that class.
    //   A shooter counts ONLY in their modal class — their skill-class
    //   starts are attributed to that class too, and a class whose
    //   shooters were all deduped elsewhere is not displayed at all.
    // - "Åpen" counts additively: any shooter with Åpen participation
    //   (literal Åpen, remapped A–D) counts once more in Åpen.
    // - All other class values (age/gender, Åpen2, …) pass through with
    //   their own unique-shooter counts.
    // - Pass-through rows use raw row counts; rows without a class value
    //   are skipped (unchanged behavior).
    function computeClassDistribution(rows, clubName) {
        var target = StandplassStevnerPage.normalizeClub(clubName);
        var cells = {};               // disc -> class -> { shooters: {pid: true}, starts: n }
        var shooterClassStarts = {};  // disc -> pid -> class -> startCount
        (rows || []).forEach(function (r) {
            if (!r.club || StandplassStevnerPage.normalizeClub(r.club) !== target) { return; }
            if (!r.discipline || !r.class) { return; }
            var cls = effectiveClass(r);
            var d = cells[r.discipline] || (cells[r.discipline] = {});
            var cell = d[cls] || (d[cls] = { shooters: {}, starts: 0 });
            cell.starts++;
            if (r.personId) {
                cell.shooters[r.personId] = true;
                if (SKILL_CLASSES.indexOf(cls) >= 0) {
                    var byClass = shooterClassStarts[r.discipline] || (shooterClassStarts[r.discipline] = {});
                    var sc = byClass[r.personId] || (byClass[r.personId] = {});
                    sc[cls] = (sc[cls] || 0) + 1;
                }
            }
        });

        var out = [];
        Object.keys(cells).forEach(function (disc) {
            var d = cells[disc];
            var byClass = shooterClassStarts[disc] || {};
            var modal = {};
            Object.keys(byClass).forEach(function (pid) {
                var sc = byClass[pid];
                var best = null, bestN = -1;
                ['D', 'C', 'B', 'A'].forEach(function (cls) {
                    if (sc[cls] && sc[cls] > bestN) { best = cls; bestN = sc[cls]; }
                });
                if (best) { modal[pid] = best; }
            });
            SKILL_CLASSES.forEach(function (cls) {
                var pids = Object.keys(byClass).filter(function (pid) { return modal[pid] === cls; });
                if (!pids.length) { return; }
                var starts = 0;
                pids.forEach(function (pid) {
                    var sc = byClass[pid];
                    Object.keys(sc).forEach(function (c) { starts += sc[c]; });
                });
                out.push({ discipline: disc, class: cls, shooters: pids.length, starts: starts });
            });
            Object.keys(d).forEach(function (cls) {
                if (SKILL_CLASSES.indexOf(cls) >= 0) { return; }
                var cell = d[cls];
                out.push({ discipline: disc, class: cls, shooters: Object.keys(cell.shooters).length, starts: cell.starts });
            });
        });
        out.sort(function (a, b) { return b.starts - a.starts; });
        return out;
    }

    // Pure HTML builder for the Klassefordeling card. The disclaimer's
    // øvelse list is generated from ALWAYS_OPEN_DISCIPLINES so text and
    // behavior cannot drift apart.
    function renderClassDistributionHtml(dist, clubName) {
        if (!dist || !dist.length) { return ''; }
        var rowsHtml = dist.map(function (dc) {
            return '<tr><td>' + esc(dc.discipline) + '</td><td>' + esc(dc.class) + '</td>'
                + '<td class="ranking-score">' + dc.shooters + '</td>'
                + '<td class="ranking-score">' + dc.starts + '</td></tr>';
        }).join('');
        var apenList = ALWAYS_OPEN_DISCIPLINES.map(function (d) { return esc(d); }).join(', ');
        return '<section class="ranking-card club-stats-section"><div class="ranking-card-header"><h2 class="ranking-card-title">Klassefordeling</h2></div>'
            + '<table class="ranking-table" aria-label="Klassefordeling for ' + esc(clubName) + '"><thead><tr><th scope="col">Øvelse</th><th scope="col">Klasse</th><th scope="col" class="ranking-score">Skyttere</th><th scope="col" class="ranking-score">Starter</th></tr></thead><tbody>'
            + rowsHtml + '</tbody></table>'
            + '<details class="club-stats-note"><summary>Om klassene</summary>'
            + '<p>Klassene A–D gjelder per kalenderår, med opprykk og nedrykk kun ved årsskiftet '
            + '(jf. NSF Fellesreglementet pkt 2.3.1.4). I ikke-klasseførende stevner, og i øvelsene '
            + apenList + ', vises klassene A–D som «Åpen». Skyttere telles én gang per øvelse, '
            + 'i klassen med flest starter (laveste klasse ved likt) — starter deres føres til '
            + 'samme klasse, og klasser uten tildelte skyttere vises ikke; deltakelse uten '
            + 'ferdighetsklasse telles i tillegg som «Åpen». Alders- og kjønnsklasser vises som egne rader. '
            + 'Klasseringen føres per øvelse, og kildedata kan inneholde registreringsfeil — '
            + 'fordelingen er et beste-estimat.</p>'
            + '</details></section>';
    }

    // Shooter top-list of most top-3 placements. Podiums are NOT deduped:
    // every top-3 result row counts in its own øvelse–klasse column
    // (positions are class-relative facts of the result lists). Tied
    // positions ("delt 2. plass") count for both shooters. Combo keys use
    // the effective (post-remap) class so columns match Klassefordeling.
    // position: null/undefined counts all top-3 rows; 1, 2, or 3 counts only
    // rows with that exact placement.
    function computeTopThreeRanking(rows, clubName, position) {
        var target = StandplassStevnerPage.normalizeClub(clubName);
        var shooters = {};
        (rows || []).forEach(function (r) {
            if (!r.club || StandplassStevnerPage.normalizeClub(r.club) !== target) { return; }
            if (r.position == null) { return; }
            var pos = Number(r.position);
            if (isNaN(pos) || pos < 1 || pos > 3) { return; }
            if (position != null && pos !== position) { return; }
            if (!r.personId) { return; }
            var s = shooters[r.personId];
            if (!s) { s = shooters[r.personId] = { personId: r.personId, name: r.name || 'Ukjent', total: 0, combos: {} }; }
            if (r.name) { s.name = r.name; }
            var key = (r.discipline || '–') + '|' + (effectiveClass(r) || '–');
            s.combos[key] = (s.combos[key] || 0) + 1;
            s.total++;
        });
        return Object.keys(shooters).map(function (pid) { return shooters[pid]; })
            .sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name, 'no'); });
    }

    function modePosition(mode) {
        if (mode === 'p1') { return 1; }
        if (mode === 'p2') { return 2; }
        if (mode === 'p3') { return 3; }
        return null;
    }

    function top3ModeLabel(mode) {
        if (mode === 'p1') { return '1. plasser'; }
        if (mode === 'p2') { return '2. plasser'; }
        if (mode === 'p3') { return '3. plasser'; }
        return 'topp-3 plasseringer';
    }

    var TOP3_ROW_PAGE = 10;

    // Pure HTML builder for the shooter top-3 card. Wide tables MUST sit in
    // .ranking-card-table-wrap (overflow-x: auto) — .ranking-card itself is
    // overflow: hidden and would silently clip columns.
    function renderTopThreeHtml(ranking, clubName, year, opts) {
        opts = opts || {};
        var mode = opts.mode || 'top3';
        var showOvelser = !!opts.showOvelser;
        var showAllShooters = !!opts.showAllShooters;
        var empty = !ranking || !ranking.length;
        // Initial render only: no ranking in the default view means the card
        // has never shown anything — omit it entirely. In every other empty
        // state the shell MUST stay so the mode buttons and øvelser toggle
        // remain reachable in-card.
        if (empty && mode === 'top3' && !showOvelser) { return ''; }
        var MODES = [
            { key: 'top3', label: 'Topp-3' },
            { key: 'p1', label: '1. plass' },
            { key: 'p2', label: '2. plass' },
            { key: 'p3', label: '3. plass' }
        ];
        var modeHtml = '<div class="top3-mode" id="top3-mode" role="group" aria-label="Plasseringstype">'
            + MODES.map(function (m) {
                return '<button type="button" class="top3-mode-btn" data-mode="' + m.key + '"'
                    + ' aria-pressed="' + (mode === m.key ? 'true' : 'false') + '">' + m.label + '</button>';
            }).join('')
            + '<button type="button" class="top3-mode-btn top3-ovelser-btn" id="top3-ovelser-btn" aria-pressed="' + (showOvelser ? 'true' : 'false') + '">'
            + (showOvelser ? 'Skjul øvelser' : 'Vis øvelser') + '</button></div>';
        if (empty) {
            return '<section class="ranking-card club-stats-section" data-card="top3"><div class="ranking-card-header"><h2 class="ranking-card-title">Flest topp-3 plasseringer</h2></div>'
                + modeHtml
                + '<p class="ranking-status-msg">Ingen ' + esc(top3ModeLabel(mode)) + ' for denne klubben i ' + esc(String(year)) + '.</p>'
                + '</section>';
        }
        var comboTotals = {};
        ranking.forEach(function (s) {
            Object.keys(s.combos).forEach(function (k) { comboTotals[k] = (comboTotals[k] || 0) + s.combos[k]; });
        });
        var comboOrder = Object.keys(comboTotals)
            .sort(function (a, b) { return comboTotals[b] - comboTotals[a] || a.localeCompare(b, 'no'); });
        var visibleShooters = showAllShooters ? ranking : ranking.slice(0, TOP3_ROW_PAGE);
        var headers = showOvelser
            ? comboOrder.map(function (k) {
                var parts = k.split('|');
                return '<th scope="col" class="ranking-score">' + esc(parts[0]) + ' ' + esc(parts[1]) + '</th>';
            }).join('')
            : '';
        var rowsHtml = visibleShooters.map(function (s, i) {
            var cells = showOvelser
                ? comboOrder.map(function (k) {
                    return '<td class="ranking-score">' + (s.combos[k] || '') + '</td>';
                }).join('')
                : '';
            return '<tr><td class="ranking-rank">' + (i + 1) + '</td>'
                + '<th scope="row">' + esc(s.name) + '</th>' + cells
                + '<td class="ranking-score">' + s.total + '</td></tr>';
        }).join('');
        var rowToggle = ranking.length > TOP3_ROW_PAGE
            ? '<button type="button" class="ranking-toggle" id="top3-row-toggle" aria-expanded="' + (showAllShooters ? 'true' : 'false') + '" aria-controls="top3-table">'
                + (showAllShooters ? 'Vis færre' : 'Vis alle (' + ranking.length + ')') + '</button>'
            : '';
        return '<section class="ranking-card club-stats-section" data-card="top3"><div class="ranking-card-header"><h2 class="ranking-card-title">Flest topp-3 plasseringer</h2></div>'
            + modeHtml
            + '<div class="ranking-card-table-wrap">'
            + '<table class="ranking-table" id="top3-table" aria-label="Flest topp-3 plasseringer i ' + esc(String(year)) + ' for ' + esc(clubName) + '">'
            + '<thead><tr><th scope="col" class="ranking-rank">#</th><th scope="col">Navn</th>' + headers + '<th scope="col" class="ranking-score">Totalt</th></tr></thead>'
            + '<tbody>' + rowsHtml + '</tbody></table></div>'
            + rowToggle + '</section>';
    }

    // ── SVG line chart ─────────────────────────────────────────────────

    // Pure function: returns an SVG string. data: [{ year, shooters, starts }, ...].
    // opts.showStarts: if true, render a second line for starts.
    // Returns a <p> message (not an SVG) if fewer than 2 data points.
    function renderLineChart(data, opts) {
        opts = opts || {};
        var pts = (data || []).filter(function (d) {
            return d.year != null && (d.shooters != null || d.starts != null);
        }).slice().sort(function (a, b) {
            return a.year - b.year;
        });

        if (pts.length < 2) {
            return '<p class="ranking-status-msg">Ikke nok data for graf.</p>';
        }

        var W = 400, H = 140, PL = 44, PR = 12, PT = 10, PB = 28;

        var maxVal = 0;
        pts.forEach(function (d) {
            if (d.shooters != null) { maxVal = Math.max(maxVal, d.shooters); }
            if (opts.showStarts && d.starts != null) { maxVal = Math.max(maxVal, d.starts); }
        });
        if (maxVal === 0) { maxVal = 1; }
        var range = maxVal || 1;

        function xPos(i) {
            if (pts.length === 1) { return PL; }
            return PL + (i / (pts.length - 1)) * (W - PL - PR);
        }
        function yPos(v) { return PT + (1 - v / range) * (H - PT - PB); }

        function buildLine(key, color, label) {
            var valid = pts.filter(function (d) { return d[key] != null; });
            if (valid.length < 2) { return ''; }
            var polyPts = valid.map(function (d) {
                var i = pts.indexOf(d);
                return xPos(i).toFixed(1) + ',' + yPos(d[key]).toFixed(1);
            }).join(' ');
            var dots = valid.map(function (d) {
                var i = pts.indexOf(d);
                var x = xPos(i).toFixed(1);
                var y = yPos(d[key]).toFixed(1);
                return '<circle class="club-chart-dot" tabindex="0"'
                    + ' aria-label="' + esc(String(d.year) + ': ' + d[key] + ' ' + label) + '"'
                    + ' cx="' + x + '" cy="' + y + '" r="3" fill="' + color + '"/>';
            }).join('');
            return '<polyline points="' + esc(polyPts) + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round"/>'
                + dots;
        }

        var shootersLine = buildLine('shooters', 'var(--brand-accent)', 'skyttere');
        var startsLine = opts.showStarts ? buildLine('starts', '#4a90d9', 'starter') : '';

        // Y-axis labels (top, middle, bottom)
        var yTop = String(Math.round(maxVal));
        var yMid = String(Math.round(maxVal / 2));
        var yBot = '0';
        var yLabels =
              '<text x="' + (PL - 6) + '" y="' + (PT + 4) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + esc(yTop) + '</text>'
            + '<text x="' + (PL - 6) + '" y="' + (((PT + (H - PB)) / 2) + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + esc(yMid) + '</text>'
            + '<text x="' + (PL - 6) + '" y="' + (H - PB) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + esc(yBot) + '</text>';

        // X-axis labels (years) — show all if ≤6, otherwise every other
        var xTicks = pts.map(function (d, i) {
            if (pts.length > 6 && i % 2 !== 0) { return ''; }
            var px = xPos(i).toFixed(1);
            return '<text x="' + px + '" y="' + (H - PB + 12) + '" text-anchor="middle" font-size="8" fill="var(--text-muted)">' + esc(String(d.year)) + '</text>';
        }).join('');

        // Legend
        var legend = '<div class="chart-legend">'
            + '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--brand-accent)"></span>Skyttere</span>'
            + (opts.showStarts ? '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#4a90d9"></span>Starter</span>' : '')
            + '</div>';

        var ariaLabel = 'Aktivitet per år' + (opts.showStarts ? ': skyttere og starter' : ': skyttere');
        var svg = '<div class="club-chart-wrap">'
            + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(ariaLabel) + '" style="display:block;overflow:visible;">'
            + '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + shootersLine
            + startsLine
            + yLabels
            + xTicks
            + '</svg>'
            + legend
            + '</div>';

        return svg;
    }

    // Multi-series line chart: one SVG with multiple lines (e.g. felt vs bane).
    // series: [{ label, color, points: [{ year, value }] }]
    // title: chart title for aria-label
    // yLabel: label for the Y axis (e.g. "Skyttere" or "Starter")
    // Returns a <p> message if fewer than 2 data points across all series.
    function renderMultiSeriesChart(series, opts) {
        opts = opts || {};
        var title = opts.title || 'Aktivitet';

        // Collect all years and all values across series
        var yearSet = {};
        var maxVal = 0;
        series.forEach(function (s) {
            (s.points || []).forEach(function (p) {
                if (p.year != null) { yearSet[p.year] = true; }
                if (p.value != null && p.value > maxVal) { maxVal = p.value; }
            });
        });
        var years = Object.keys(yearSet).map(Number).sort(function (a, b) { return a - b; });

        if (years.length < 2) {
            return '<p class="ranking-status-msg">Ikke nok data for graf.</p>';
        }

        var W = 400, H = 160, PL = 44, PR = 12, PT = 22, PB = 28;
        var range = maxVal || 1;

        function xPos(i) {
            if (years.length === 1) { return PL; }
            return PL + (i / (years.length - 1)) * (W - PL - PR);
        }
        function yPos(v) { return PT + (1 - v / range) * (H - PT - PB); }

        // Build all dots across all series, grouped by year for collision detection
        var allDots = [];
        series.forEach(function (s, si) {
            var valid = (s.points || []).filter(function (p) { return p.value != null; });
            valid.forEach(function (p) {
                var yi = years.indexOf(p.year);
                if (yi < 0) { return; }
                allDots.push({
                    x: xPos(yi), y: yPos(p.value), yi: yi,
                    value: p.value, year: p.year,
                    color: s.color, label: s.label, seriesIdx: si
                });
            });
        });

        // Build polylines and dots per series
        var lines = series.map(function (s) {
            var valid = (s.points || []).filter(function (p) { return p.value != null; });
            var indexed = valid.map(function (p) {
                var yi = years.indexOf(p.year);
                return { yi: yi, value: p.value };
            }).filter(function (p) { return p.yi >= 0; });
            if (indexed.length < 2) { return ''; }

            var polyPts = indexed.map(function (p) {
                return xPos(p.yi).toFixed(1) + ',' + yPos(p.value).toFixed(1);
            }).join(' ');
            var dots = indexed.map(function (p) {
                var x = xPos(p.yi).toFixed(1);
                var y = yPos(p.value).toFixed(1);
                return '<circle class="club-chart-dot" tabindex="0"'
                    + ' aria-label="' + esc(String(years[p.yi]) + ': ' + p.value + ' ' + s.label) + '"'
                    + ' cx="' + x + '" cy="' + y + '" r="3" fill="' + s.color + '"/>';
            }).join('');
            return '<polyline points="' + esc(polyPts) + '" fill="none" stroke="' + s.color + '" stroke-width="1.5" stroke-linejoin="round"/>'
                + dots;
        }).join('');

        // Value labels above dots with collision avoidance per X position.
        // Group dots by year index, sort by Y within each group, then
        // stagger labels so close ones don't overlap.
        var byYear = {};
        allDots.forEach(function (d) {
            if (!byYear[d.yi]) { byYear[d.yi] = []; }
            byYear[d.yi].push(d);
        });

        var labels = '';
        Object.keys(byYear).forEach(function (yi) {
            var group = byYear[yi].sort(function (a, b) { return a.y - b.y; });
            var lastLabelY = -Infinity;
            group.forEach(function (d) {
                var labelY = d.y - 8;
                // If too close to the previous label at this X, push it up
                if (labelY < lastLabelY + 10) {
                    labelY = lastLabelY + 1;
                }
                lastLabelY = labelY;
                labels += '<text x="' + d.x.toFixed(1) + '" y="' + labelY.toFixed(1)
                    + '" text-anchor="middle" font-size="9" font-weight="600" fill="' + d.color + '">'
                    + esc(String(d.value)) + '</text>';
            });
        });

        // Y-axis labels
        var yTop = String(Math.round(maxVal));
        var yMid = String(Math.round(maxVal / 2));
        var yBot = '0';
        var yLabels =
              '<text x="' + (PL - 6) + '" y="' + (PT + 4) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + esc(yTop) + '</text>'
            + '<text x="' + (PL - 6) + '" y="' + (((PT + (H - PB)) / 2) + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + esc(yMid) + '</text>'
            + '<text x="' + (PL - 6) + '" y="' + (H - PB) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + esc(yBot) + '</text>';

        // X-axis labels (years)
        var xTicks = years.map(function (yr, i) {
            if (years.length > 6 && i % 2 !== 0) { return ''; }
            var px = xPos(i).toFixed(1);
            return '<text x="' + px + '" y="' + (H - PB + 12) + '" text-anchor="middle" font-size="8" fill="var(--text-muted)">' + esc(String(yr)) + '</text>';
        }).join('');

        // Legend
        var legend = '<div class="chart-legend">'
            + series.map(function (s) {
                return '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:' + s.color + '"></span>' + esc(s.label) + '</span>';
            }).join('')
            + '</div>';

        var svg = '<div class="club-chart-wrap">'
            + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(title) + '" style="display:block;overflow:visible;">'
            + '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + lines
            + labels
            + yLabels
            + xTicks
            + '</svg>'
            + legend
            + '</div>';

        return svg;
    }

    // ── init / DOM wiring ──────────────────────────────────────────────

    var TOPLIST_PAGE_SIZE = 10;
    var MIN_SHOOTERS = 3;
    var MIN_STARTS = 5;
    var FIRST_YEAR = 2021;
    var EXCLUDED_ORGANIZERS = ['Norges Sportsskytterforbund'];

    function init(config) {
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var urlState = config.urlState;
        var CURRENT_YEAR = new Date().getUTCFullYear();

        var params = new URLSearchParams(urlState.getSearch());
        var klubbParam = params.get('klubb');
        var programParam = params.get('program');
        var activeProgram = (programParam === 'felt' || programParam === 'bane') ? programParam : 'alle';
        var yearParam = parseInt(params.get('year'), 10);
        var activeYear = isNaN(yearParam) ? CURRENT_YEAR : yearParam;

        var fetcher = StandplassData.createFetcher(window.fetch.bind(window));
        var FW = StandplassFilterWidgets;

        // yearData cache: { "felt|2025": yearData, "bane|2025": yearData, ... }
        var yearData = {};
        // stats cache: { "alle|2025": statsObj, "felt|2025": statsObj, ... }
        var statsCache = {};
        // allClubNames accumulated across all loaded years
        var allClubNames = {};
        var dataLoaded = false;
        var top3State = { mode: 'top3', showOvelser: false, showAllShooters: false };
        var top3Rows = [];
        var top3Club = '';

        var filtersEl = id('-filters');
        var contentEl = id('-content');
        var statusEl = id('-status');
        var titleEl = id('-title');
        var leadEl = id('-lead');

        function setUrlParam(key, value) {
            var qs = new URLSearchParams(urlState.getSearch());
            if (value) { qs.set(key, value); } else { qs.delete(key); }
            urlState.setSearch('?' + qs.toString());
        }

        function clubHref(clubName) {
            var qs = new URLSearchParams(urlState.getSearch());
            qs.set('klubb', clubName);
            return '?' + qs.toString();
        }

        // ── Filter UI ──────────────────────────────────────────────────

        function buildFilters() {
            filtersEl.innerHTML = '<div class="ranking-filters">'
                + '<div class="filter-group">'
                + '<label for="' + config.idPrefix + '-year">År</label>'
                + '<select id="' + config.idPrefix + '-year"></select>'
                + '</div>'
                + '<div class="program-toggle" role="group" aria-label="Program">'
                + '<button type="button" class="program-btn' + (activeProgram === 'alle' ? ' program-btn--active' : '') + '" data-program="alle" aria-pressed="' + (activeProgram === 'alle') + '">Alle</button>'
                + '<button type="button" class="program-btn' + (activeProgram === 'felt' ? ' program-btn--active' : '') + '" data-program="felt" aria-pressed="' + (activeProgram === 'felt') + '">Felt</button>'
                + '<button type="button" class="program-btn' + (activeProgram === 'bane' ? ' program-btn--active' : '') + '" data-program="bane" aria-pressed="' + (activeProgram === 'bane') + '">Bane</button>'
                + '</div>'
                + '<div class="filter-group" id="' + config.idPrefix + '-club-search-group">'
                + '<label for="' + config.idPrefix + '-club-input">Søk klubb</label>'
                + '<div class="autocomplete-wrap" id="' + config.idPrefix + '-club-wrap">'
                + '<input type="text" id="' + config.idPrefix + '-club-input" class="filter-input" autocomplete="off"'
                + ' aria-autocomplete="list" aria-controls="' + config.idPrefix + '-club-list" aria-expanded="false"'
                + ' placeholder="Søk klubb…">'
                + '<button type="button" class="combo-clear" id="' + config.idPrefix + '-club-clear" aria-label="Fjern">×</button>'
                + '<ul class="autocomplete-list" id="' + config.idPrefix + '-club-list" role="listbox" aria-label="Klubber" hidden></ul>'
                + '</div></div>'
                + '</div>';

            // Year select
            var yearEl = id('-year');
            for (var y = CURRENT_YEAR; y >= FIRST_YEAR; y--) {
                var opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                yearEl.appendChild(opt);
            }
            yearEl.value = String(activeYear);
            yearEl.addEventListener('change', function () {
                activeYear = parseInt(yearEl.value, 10);
                setUrlParam('year', activeYear === CURRENT_YEAR ? null : String(activeYear));
                render();
            });

            // Program toggle
            var toggleEl = filtersEl.querySelector('.program-toggle');
            toggleEl.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-program]');
                if (!btn) { return; }
                activeProgram = btn.getAttribute('data-program');
                Array.prototype.forEach.call(toggleEl.querySelectorAll('button'), function (b) {
                    var isActive = b === btn;
                    b.classList.toggle('program-btn--active', isActive);
                    b.setAttribute('aria-pressed', String(isActive));
                });
                setUrlParam('program', activeProgram === 'alle' ? null : activeProgram);
                render();
            });

            // Club search (only visible in toplist view)
            var clubInput = id('-club-input');
            var clubList = id('-club-list');
            var clubClear = id('-club-clear');
            FW.makeComboHandlers({
                input: clubInput, list: clubList, clear: clubClear,
                getItems: function (query) {
                    var q = (query || '').trim().toLowerCase();
                    return Object.keys(allClubNames)
                        .sort(function (a, b) { return a.localeCompare(b, 'no'); })
                        .filter(function (c) { return !q || c.toLowerCase().indexOf(q) !== -1; })
                        .slice(0, 50)
                        .map(function (c) { return { id: c, name: c }; });
                },
                restoreOnBlur: function () { return ''; },
                onSelect: function (clubId) {
                    var qs = new URLSearchParams(urlState.getSearch());
                    qs.set('klubb', clubId);
                    window.location.href = '?' + qs.toString();
                },
                onClear: function () { clubInput.value = ''; }
            });
        }

        // ── Data loading ───────────────────────────────────────────────

        function loadDataBasesForYear(year) {
            var bases = activeProgram === 'alle' ? ['/data/felt', '/data/bane']
                : activeProgram === 'felt' ? ['/data/felt'] : ['/data/bane'];
            return Promise.all(bases.map(function (base) {
                var key = base + '|' + year;
                if (yearData[key]) { return Promise.resolve(yearData[key]); }
                return fetcher.fetchYear(base, year).then(function (data) {
                    yearData[key] = data;
                    return data;
                });
            }));
        }

        function loadAllYears() {
            var promises = [];
            for (var y = FIRST_YEAR; y <= CURRENT_YEAR; y++) {
                ['/data/felt', '/data/bane'].forEach(function (base) {
                    var key = base + '|' + y;
                    if (!yearData[key]) {
                        promises.push(fetcher.fetchYear(base, y).then(function (data) {
                            yearData[key] = data;
                            return data;
                        }));
                    }
                });
            }
            return Promise.all(promises);
        }

        function getRowsForYear(year, program) {
            program = program || activeProgram;
            var bases = program === 'alle' ? ['/data/felt', '/data/bane']
                : program === 'felt' ? ['/data/felt'] : ['/data/bane'];
            var rows = [];
            bases.forEach(function (base) {
                var key = base + '|' + year;
                if (yearData[key]) {
                    rows = rows.concat(StandplassStevnerPage.flattenRows(yearData[key]));
                }
            });
            return rows;
        }

        function getStatsForYear(year, program) {
            program = program || activeProgram;
            var cacheKey = program + '|' + year;
            if (statsCache[cacheKey]) { return statsCache[cacheKey]; }
            var rows = getRowsForYear(year, program);
            var stats = computeClubStats(rows);
            statsCache[cacheKey] = stats;
            return stats;
        }

        // ── Toplist rendering ──────────────────────────────────────────

        function buildToplistTable(title, ranked, valueKey, valueLabel, caption) {
            var visible = ranked.slice(0, TOPLIST_PAGE_SIZE);
            var rows = visible.map(function (entry, i) {
                return '<tr><td class="ranking-rank">' + (i + 1) + '</td>'
                    + '<td><a href="' + esc(clubHref(entry.club)) + '">' + esc(entry.club) + '</a></td>'
                    + '<td class="ranking-score">' + esc(String(entry[valueKey])) + '</td></tr>';
            }).join('');
            var toggleHtml = ranked.length > TOPLIST_PAGE_SIZE
                ? '<button type="button" class="ranking-toggle" data-toplist="' + esc(title) + '">Vis alle (' + ranked.length + ')</button>'
                : '';
            return '<section class="ranking-card club-stats-toplist">'
                + '<div class="ranking-card-header"><h2 class="ranking-card-title">' + esc(title) + '</h2></div>'
                + '<table class="ranking-table" aria-label="' + esc(caption || title) + '">'
                + '<thead><tr><th scope="col" class="ranking-rank">#</th><th scope="col">Klubb</th><th scope="col" class="ranking-score">' + esc(valueLabel) + '</th></tr></thead>'
                + '<tbody>' + rows + '</tbody></table>'
                + toggleHtml + '</section>';
        }

        function renderToplists() {
            titleEl.textContent = 'Klubbstatistikk';
            leadEl.innerHTML = 'Topplister og statistikk for skytteklubber. '
                + 'Data fra skyting.no – kun pistol og revolver (feltskyting og baneskyting).';
            id('-club-search-group').style.display = '';

            var stats = getStatsForYear(activeYear, activeProgram);
            var prevYear = activeYear - 1;
            var prevStats = getStatsForYear(prevYear, activeProgram);

            var byShooters = rankClubs(stats, 'uniqueShooters', { minShooters: 0, minStarts: 0 });
            var byStarts = rankClubs(stats, 'totalStarts', { minShooters: 0, minStarts: 0 });
            var byCompetitions = rankClubs(stats, 'competitionsAttended', { minShooters: 0, minStarts: 0 });
            var byTopThree = rankClubs(stats, 'topThree', { minShooters: 0, minStarts: 0 });

            // Year-over-year (størst økning)
            var yoyHtml = '';
            if (prevStats && Object.keys(prevStats).length) {
                var yoy = computeYearOverYear(stats, prevStats)
                    .filter(function (c) { return c.previous >= 5 && !c.isNew; })
                    .sort(function (a, b) { return b.delta - a.delta; });
                yoyHtml = buildToplistTable('Størst økning av skyttere', yoy.slice(0, TOPLIST_PAGE_SIZE), 'delta', '+ skyttere',
                    'Størst økning av aktive skyttere siden ' + prevYear);
            }

            // Flest stevner arrangert (competition-level organizationName)
            var organizerCounts = {};
            Object.keys(yearData).forEach(function (key) {
                if (key.indexOf('|' + activeYear) === -1) { return; }
                var base = key.split('|')[0];
                if (activeProgram === 'felt' && base !== '/data/felt') { return; }
                if (activeProgram === 'bane' && base !== '/data/bane') { return; }
                var comps = yearData[key].competitions || [];
                comps.forEach(function (comp) {
                    var org = comp.organizationName;
                    if (!org || EXCLUDED_ORGANIZERS.indexOf(org) >= 0) { return; }
                    organizerCounts[org] = (organizerCounts[org] || 0) + 1;
                });
            });
            var rankedOrganizers = Object.keys(organizerCounts)
                .map(function (name) { return { club: name, delta: organizerCounts[name] }; })
                .sort(function (a, b) { return b.delta - a.delta; })
                .slice(0, TOPLIST_PAGE_SIZE);
            var organizerHtml = rankedOrganizers.length
                ? buildToplistTable('Flest stevner arrangert', rankedOrganizers, 'delta', 'stevner',
                    'Flest stevner arrangert')
                : '';

            var yearNote = activeYear === CURRENT_YEAR
                ? '<p class="club-stats-note">' + activeYear + ': foreløpig, oppdateres jevnlig.</p>'
                : '';

            // Summary cards: true national totals for the selected year/program
            var allRows = getRowsForYear(activeYear, activeProgram);
            var nationalShooters = {};
            var nationalComps = {};
            var nationalClubs = {};
            allRows.forEach(function (r) {
                if (r.personId) { nationalShooters[r.personId] = true; }
                if (r.competitionId) { nationalComps[r.competitionId] = true; }
                if (r.club) { nationalClubs[r.club] = true; }
            });
            var summaryHtml = '<div class="club-stats-summary">'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + Object.keys(nationalShooters).length + '</span><span class="club-stats-summary-label">Unike skyttere</span></div>'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + allRows.length + '</span><span class="club-stats-summary-label">Starter</span></div>'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + Object.keys(nationalComps).length + '</span><span class="club-stats-summary-label">Stevner</span></div>'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + Object.keys(nationalClubs).length + '</span><span class="club-stats-summary-label">Aktive klubber</span></div>'
                + '</div>';

            // Overview charts: total skyttere/starter across all clubs, felt vs bane, per year.
            // Always shows both programs regardless of the active program toggle.
            var overviewFeltShooters = [], overviewFeltStarts = [];
            var overviewBaneShooters = [], overviewBaneStarts = [];
            for (var oy = FIRST_YEAR; oy <= CURRENT_YEAR; oy++) {
                var ofs = getStatsForYear(oy, 'felt');
                var obs = getStatsForYear(oy, 'bane');
                var fsCount = 0, fsStarts = 0, bsCount = 0, bsStarts = 0;
                Object.keys(ofs).forEach(function (c) { fsCount += ofs[c].uniqueShooters; fsStarts += ofs[c].totalStarts; });
                Object.keys(obs).forEach(function (c) { bsCount += obs[c].uniqueShooters; bsStarts += obs[c].totalStarts; });
                if (Object.keys(ofs).length) {
                    overviewFeltShooters.push({ year: oy, value: fsCount });
                    overviewFeltStarts.push({ year: oy, value: fsStarts });
                }
                if (Object.keys(obs).length) {
                    overviewBaneShooters.push({ year: oy, value: bsCount });
                    overviewBaneStarts.push({ year: oy, value: bsStarts });
                }
            }

            var overviewHtml = (overviewFeltShooters.length >= 2 || overviewBaneShooters.length >= 2)
                ? '<section class="ranking-card club-stats-section club-stats-overview"><div class="ranking-card-header"><h2 class="ranking-card-title">Aktivitet i hele Norge</h2></div>'
                + '<h3 class="club-stats-chart-label">Skyttere</h3>'
                + renderMultiSeriesChart(
                    [{ label: 'Felt', color: 'var(--brand-accent)', points: overviewFeltShooters },
                     { label: 'Bane', color: '#4a90d9', points: overviewBaneShooters }],
                    { title: 'Totalt antall skyttere per år: felt og bane' })
                + '<h3 class="club-stats-chart-label">Starter</h3>'
                + renderMultiSeriesChart(
                    [{ label: 'Felt', color: 'var(--brand-accent)', points: overviewFeltStarts },
                     { label: 'Bane', color: '#4a90d9', points: overviewBaneStarts }],
                    { title: 'Totalt antall starter per år: felt og bane' })
                + '</section>'
                : '';

            contentEl.innerHTML = summaryHtml + overviewHtml
                + '<div class="club-stats-grid">'
                + buildToplistTable('Flest aktive skyttere', byShooters, 'uniqueShooters', 'skyttere',
                    'Flest aktive skyttere ' + activeYear)
                + buildToplistTable('Flest starter', byStarts, 'totalStarts', 'starter',
                    'Flest starter ' + activeYear)
                + buildToplistTable('Flest stevnedeltakelser', byCompetitions, 'competitionsAttended', 'stevner',
                    'Flest stevnedeltakelser ' + activeYear)
                + buildToplistTable('Flest topp-3 plasseringer', byTopThree, 'topThree', 'plasseringer',
                    'Flest topp-3 plasseringer ' + activeYear)
                + yoyHtml
                + organizerHtml
                + '</div>'
                + yearNote
                + '<p class="club-stats-note">Aktiv skytter = minst én registrert start i perioden. '
                + 'Klubbtilhørighet er fra stevne-registrering, ikke bekreftet medlemskap.</p>';

            // "Vis alle" toggles
            Array.prototype.forEach.call(contentEl.querySelectorAll('.ranking-toggle'), function (btn) {
                btn.addEventListener('click', function () {
                    var toplistSection = btn.closest('.club-stats-toplist');
                    var table = toplistSection.querySelector('table');
                    var tbody = table.querySelector('tbody');
                    var title = btn.getAttribute('data-toplist');
                    var isExpanded = btn.textContent.indexOf('Vis alle') === -1;

                    if (isExpanded) {
                        // Collapse back to page size
                        var ranked = getRankedListForTitle(title);
                        var visible = ranked.slice(0, TOPLIST_PAGE_SIZE);
                        tbody.innerHTML = visible.map(function (entry, i) {
                            return '<tr><td class="ranking-rank">' + (i + 1) + '</td>'
                                + '<td><a href="' + esc(clubHref(entry.club)) + '">' + esc(entry.club) + '</a></td>'
                                + '<td class="ranking-score">' + esc(String(entry[getValueKeyForTitle(title)])) + '</td></tr>';
                        }).join('');
                        btn.textContent = 'Vis alle (' + ranked.length + ')';
                    } else {
                        // Expand to full
                        var allRanked = getRankedListForTitle(title);
                        tbody.innerHTML = allRanked.map(function (entry, i) {
                            return '<tr><td class="ranking-rank">' + (i + 1) + '</td>'
                                + '<td><a href="' + esc(clubHref(entry.club)) + '">' + esc(entry.club) + '</a></td>'
                                + '<td class="ranking-score">' + esc(String(entry[getValueKeyForTitle(title)])) + '</td></tr>';
                        }).join('');
                        btn.textContent = 'Vis færre';
                    }
                });
            });
        }

        function getRankedListForTitle(title) {
            var stats = getStatsForYear(activeYear, activeProgram);
            var opts = { minShooters: 0, minStarts: 0 };
            if (title === 'Flest aktive skyttere') { return rankClubs(stats, 'uniqueShooters', opts); }
            if (title === 'Flest starter') { return rankClubs(stats, 'totalStarts', opts); }
            if (title === 'Flest stevnedeltakelser') { return rankClubs(stats, 'competitionsAttended', opts); }
            if (title === 'Flest topp-3 plasseringer') { return rankClubs(stats, 'topThree', opts); }
            if (title === 'Størst økning av skyttere') {
                var prevStats = getStatsForYear(activeYear - 1, activeProgram);
                if (!prevStats || !Object.keys(prevStats).length) { return []; }
                return computeYearOverYear(stats, prevStats)
                    .filter(function (c) { return c.previous >= 5 && !c.isNew; })
                    .sort(function (a, b) { return b.delta - a.delta; });
            }
            return [];
        }

        function getValueKeyForTitle(title) {
            if (title === 'Flest aktive skyttere') { return 'uniqueShooters'; }
            if (title === 'Flest starter') { return 'totalStarts'; }
            if (title === 'Flest stevnedeltakelser') { return 'competitionsAttended'; }
            if (title === 'Flest topp-3 plasseringer') { return 'topThree'; }
            if (title === 'Størst økning av skyttere') { return 'delta'; }
            if (title === 'Flest stevner arrangert') { return 'delta'; }
            return 'uniqueShooters';
        }

        // ── Drilldown rendering ────────────────────────────────────────

        function renderDrilldown(clubName) {
            // Resolve against data-derived club list
            var resolved = null;
            Object.keys(allClubNames).forEach(function (name) {
                if (StandplassStevnerPage.normalizeClub(name) === StandplassStevnerPage.normalizeClub(clubName)) {
                    resolved = name;
                }
            });
            if (!resolved) {
                // No match — fall back to toplists with info message
                klubbParam = null;
                var qs = new URLSearchParams(urlState.getSearch());
                qs.delete('klubb');
                urlState.setSearch('?' + qs.toString());
                statusEl.textContent = 'Fant ikke klubb «' + clubName + '». Viser toplister i stedet.';
                renderToplists();
                return;
            }

            document.title = 'Klubbstatistikk – ' + resolved + ' – standplass.com';
            titleEl.textContent = resolved;
            leadEl.innerHTML = '<a href="/klubbstatistikk" class="club-stats-back">← Tilbake til topplister</a>';
            id('-club-search-group').style.display = 'none';

            var stats = getStatsForYear(activeYear, activeProgram);
            var clubStat = stats[resolved];

            // Multi-year chart data — separate felt/bane per year
            var feltShooters = [], feltStarts = [], baneShooters = [], baneStarts = [];
            for (var y = FIRST_YEAR; y <= CURRENT_YEAR; y++) {
                var fStats = getStatsForYear(y, 'felt');
                var bStats = getStatsForYear(y, 'bane');
                if (fStats[resolved]) {
                    feltShooters.push({ year: y, value: fStats[resolved].uniqueShooters });
                    feltStarts.push({ year: y, value: fStats[resolved].totalStarts });
                }
                if (bStats[resolved]) {
                    baneShooters.push({ year: y, value: bStats[resolved].uniqueShooters });
                    baneStarts.push({ year: y, value: bStats[resolved].totalStarts });
                }
            }

            // Mest aktive skyttere (per club, from raw rows)
            var rows = getRowsForYear(activeYear, activeProgram);
            var shooterCounts = {};
            rows.forEach(function (r) {
                if (StandplassStevnerPage.normalizeClub(r.club) !== StandplassStevnerPage.normalizeClub(resolved)) { return; }
                if (!r.personId) { return; }
                if (!shooterCounts[r.personId]) { shooterCounts[r.personId] = { name: r.name || 'Ukjent', starts: 0 }; }
                shooterCounts[r.personId].starts++;
            });
            var topShooters = Object.keys(shooterCounts)
                .map(function (pid) { return shooterCounts[pid]; })
                .sort(function (a, b) { return b.starts - a.starts; })
                .slice(0, 10);

            // Øvelsesfordeling — track starts AND unique shooters per discipline
            var discData = {};
            rows.forEach(function (r) {
                if (StandplassStevnerPage.normalizeClub(r.club) !== StandplassStevnerPage.normalizeClub(resolved)) { return; }
                if (!r.discipline) { return; }
                if (!discData[r.discipline]) { discData[r.discipline] = { starts: 0, shooters: {} }; }
                discData[r.discipline].starts++;
                if (r.personId) { discData[r.discipline].shooters[r.personId] = true; }
            });
            var discRows = Object.keys(discData).sort(function (a, b) { return discData[b].starts - discData[a].starts; });

            // Arrangerte stevner
            var organizedComps = [];
            Object.keys(yearData).forEach(function (key) {
                if (key.indexOf('|' + activeYear) === -1) { return; }
                var base = key.split('|')[0];
                if (activeProgram === 'felt' && base !== '/data/felt') { return; }
                if (activeProgram === 'bane' && base !== '/data/bane') { return; }
                var comps = yearData[key].competitions || [];
                comps.forEach(function (comp) {
                    if (StandplassStevnerPage.normalizeClub(comp.organizationName) === StandplassStevnerPage.normalizeClub(resolved)) {
                        organizedComps.push(comp);
                    }
                });
            });
            organizedComps.sort(function (a, b) {
                return (b.startDate || '').localeCompare(a.startDate || '');
            });

            // Build HTML
            var summaryHtml = clubStat
                ? '<div class="club-stats-summary">'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + clubStat.uniqueShooters + '</span><span class="club-stats-summary-label">Unike skyttere</span></div>'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + clubStat.totalStarts + '</span><span class="club-stats-summary-label">Starter</span></div>'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + clubStat.competitionsAttended + '</span><span class="club-stats-summary-label">Stevnedeltakelser</span></div>'
                + '<div class="club-stats-summary-card"><span class="club-stats-summary-value">' + clubStat.topThree + '</span><span class="club-stats-summary-label">Topp-3 plasseringer</span></div>'
                + '</div>'
                : '<p class="ranking-status-msg">Ingen data for ' + esc(resolved) + ' i ' + activeYear + '.</p>';

            var chartHtml = (feltShooters.length >= 2 || baneShooters.length >= 2)
                ? '<section class="ranking-card club-stats-section"><div class="ranking-card-header"><h2 class="ranking-card-title">Aktivitet over tid</h2></div>'
                + '<h3 class="club-stats-chart-label">Skyttere</h3>'
                + renderMultiSeriesChart(
                    [{ label: 'Felt', color: 'var(--brand-accent)', points: feltShooters },
                     { label: 'Bane', color: '#4a90d9', points: baneShooters }],
                    { title: 'Unike skyttere per år: felt og bane' })
                + '<h3 class="club-stats-chart-label">Starter</h3>'
                + renderMultiSeriesChart(
                    [{ label: 'Felt', color: 'var(--brand-accent)', points: feltStarts },
                     { label: 'Bane', color: '#4a90d9', points: baneStarts }],
                    { title: 'Starter per år: felt og bane' })
                + '<details><summary>Vis data som tabell</summary>'
                + '<table class="ranking-table"><thead><tr><th scope="col">År</th><th scope="col" class="ranking-score">Felt skyttere</th><th scope="col" class="ranking-score">Bane skyttere</th><th scope="col" class="ranking-score">Felt starter</th><th scope="col" class="ranking-score">Bane starter</th></tr></thead><tbody>'
                + years0().map(function (yr) {
                    var fs = feltShooters.filter(function (p) { return p.year === yr; })[0];
                    var bs = baneShooters.filter(function (p) { return p.year === yr; })[0];
                    var fst = feltStarts.filter(function (p) { return p.year === yr; })[0];
                    var bst = baneStarts.filter(function (p) { return p.year === yr; })[0];
                    return '<tr><td>' + esc(String(yr)) + '</td>'
                        + '<td class="ranking-score">' + (fs ? fs.value : '–') + '</td>'
                        + '<td class="ranking-score">' + (bs ? bs.value : '–') + '</td>'
                        + '<td class="ranking-score">' + (fst ? fst.value : '–') + '</td>'
                        + '<td class="ranking-score">' + (bst ? bst.value : '–') + '</td></tr>';
                }).join('')
                + '</tbody></table></details></section>'
                : '';

            function years0() {
                var set = {};
                feltShooters.forEach(function (p) { set[p.year] = true; });
                baneShooters.forEach(function (p) { set[p.year] = true; });
                feltStarts.forEach(function (p) { set[p.year] = true; });
                baneStarts.forEach(function (p) { set[p.year] = true; });
                return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
            }

            var topShootersHtml = topShooters.length
                ? '<section class="ranking-card club-stats-section"><div class="ranking-card-header"><h2 class="ranking-card-title">Mest aktive skyttere</h2></div>'
                + '<table class="ranking-table" aria-label="Mest aktive skyttere for ' + esc(resolved) + '"><thead><tr><th scope="col" class="ranking-rank">#</th><th scope="col">Navn</th><th scope="col" class="ranking-score">Starter</th></tr></thead><tbody>'
                + topShooters.map(function (s, i) {
                    return '<tr><td class="ranking-rank">' + (i + 1) + '</td><td>' + esc(s.name) + '</td><td class="ranking-score">' + s.starts + '</td></tr>';
                }).join('')
                + '</tbody></table></section>'
                : '';

            var discHtml = discRows.length
                ? '<section class="ranking-card club-stats-section"><div class="ranking-card-header"><h2 class="ranking-card-title">Øvelsesfordeling</h2></div>'
                + '<table class="ranking-table" aria-label="Øvelsesfordeling for ' + esc(resolved) + '"><thead><tr><th scope="col">Øvelse</th><th scope="col" class="ranking-score">Skyttere</th><th scope="col" class="ranking-score">Starter</th></tr></thead><tbody>'
                + discRows.map(function (d) {
                    return '<tr><td>' + esc(d) + '</td><td class="ranking-score">' + Object.keys(discData[d].shooters).length + '</td><td class="ranking-score">' + discData[d].starts + '</td></tr>';
                }).join('')
                + '</tbody></table></section>'
                : '';

            var classHtml = renderClassDistributionHtml(computeClassDistribution(rows, resolved), resolved);

            top3Rows = rows;
            top3Club = resolved;
            top3State = { mode: 'top3', showOvelser: false, showAllShooters: false };
            var top3Ranking = computeTopThreeRanking(top3Rows, resolved, modePosition(top3State.mode));
            var bestHtml = renderTopThreeHtml(top3Ranking, resolved, activeYear, top3State);

            var orgHtml = organizedComps.length
                ? '<section class="ranking-card club-stats-section"><div class="ranking-card-header"><h2 class="ranking-card-title">Arrangerte stevner</h2></div>'
                + '<table class="ranking-table" aria-label="Arrangerte stevner for ' + esc(resolved) + '"><thead><tr><th scope="col">Stevne</th><th scope="col">Dato</th><th scope="col">Anlegg</th></tr></thead><tbody>'
                + organizedComps.slice(0, 10).map(function (c) {
                    return '<tr><td>' + esc(c.title || '–') + '</td><td>' + esc(c.startDate ? String(c.startDate).slice(0, 10) : '–') + '</td><td>' + esc(c.facilityName || '–') + '</td></tr>';
                }).join('')
                + '</tbody></table></section>'
                : '';

            var yearNote = activeYear === CURRENT_YEAR
                ? '<p class="club-stats-note">' + activeYear + ': foreløpig, oppdateres jevnlig.</p>'
                : '';

            contentEl.innerHTML = summaryHtml + chartHtml + topShootersHtml + discHtml + classHtml + bestHtml + orgHtml + yearNote;
        }

        // ── Main render ────────────────────────────────────────────────

        var lastView = null;

        function render() {
            statusEl.textContent = '';
            var view = klubbParam || null;
            var viewChanged = view !== lastView;
            lastView = view;
            if (klubbParam) {
                renderDrilldown(klubbParam);
            } else {
                document.title = 'Klubbstatistikk – standplass.com';
                renderToplists();
            }
            if (viewChanged) {
                var mainEl = id('-root') || id('-title');
                if (mainEl && mainEl.focus) { mainEl.focus(); }
            } else {
                statusEl.textContent = 'Viser statistikk for ' + activeYear + ' (' + activeProgram + ').';
            }
        }

        // ── Init ───────────────────────────────────────────────────────

        buildFilters();

        // Top-3 card toggles: one delegated listener for the drilldown's
        // top-3 card. Registered once here — the section's inner HTML is
        // replaced on toggle, so per-render bindings would be lost and
        // per-render listener adds would stack.
        contentEl.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('.top3-mode-btn, #top3-row-toggle') : null;
            if (!btn) { return; }
            if (btn.classList.contains('top3-ovelser-btn')) {
                top3State.showOvelser = !top3State.showOvelser;
            } else if (btn.getAttribute('data-mode')) {
                top3State.mode = btn.getAttribute('data-mode');
            } else {
                top3State.showAllShooters = !top3State.showAllShooters;
            }
            var top3Section = contentEl.querySelector('[data-card="top3"]');
            if (top3Section) {
                top3Section.outerHTML = renderTopThreeHtml(
                    computeTopThreeRanking(top3Rows, top3Club, modePosition(top3State.mode)),
                    top3Club, activeYear, top3State);
                var refocus = btn.classList.contains('top3-ovelser-btn')
                    ? contentEl.querySelector('#top3-ovelser-btn')
                    : (btn.id
                        ? contentEl.querySelector('#' + btn.id)
                        : contentEl.querySelector('.top3-mode [aria-pressed="true"]'));
                if (refocus) { refocus.focus(); }
            }
        });

        statusEl.textContent = 'Laster data…';

        loadAllYears().then(function () {
            dataLoaded = true;
            // Accumulate club names from all years
            Object.keys(yearData).forEach(function (key) {
                var rows = StandplassStevnerPage.flattenRows(yearData[key]);
                rows.forEach(function (r) {
                    if (r.club) { allClubNames[r.club] = true; }
                });
            });
            render();
        }, function () {
            statusEl.textContent = 'Kunne ikke laste data. Prøv igjen senere.';
            statusEl.classList.add('ranking-error');
        });
    }

    return {
        esc: esc,
        computeClubStats: computeClubStats,
        rankClubs: rankClubs,
        computeYearOverYear: computeYearOverYear,
        ALWAYS_OPEN_DISCIPLINES: ALWAYS_OPEN_DISCIPLINES,
        effectiveClass: effectiveClass,
        computeClassDistribution: computeClassDistribution,
        renderClassDistributionHtml: renderClassDistributionHtml,
        computeTopThreeRanking: computeTopThreeRanking,
        renderTopThreeHtml: renderTopThreeHtml,
        renderLineChart: renderLineChart,
        renderMultiSeriesChart: renderMultiSeriesChart,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassClubStats;
}
