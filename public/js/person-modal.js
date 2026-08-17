var StandplassPersonModal = (function () {
    'use strict';

    function parsePersonFromUrl(search) {
        var params = new URLSearchParams(search);
        var personId = params.get('person');
        if (!personId) { return null; }
        var year = params.get('year');
        return {
            personId: personId,
            year: year ? parseInt(year, 10) : null
        };
    }

    function buildPersonUrl(search, personId, year) {
        var params = new URLSearchParams(search);
        params.set('person', personId);
        if (year) {
            params.set('year', String(year));
        }
        return '?' + params.toString();
    }

    function clearPersonFromUrl(search) {
        var params = new URLSearchParams(search);
        params.delete('person');
        params.delete('year');
        var qs = params.toString();
        return qs ? '?' + qs : '';
    }

    // --- Multi-year merge/filter helpers for the person modal's Year/
    // Stevnetype/Øvelse/Klasse dropdowns.

    function mergeYearEntries(entriesByYear, selectedYears) {
        var out = [];
        selectedYears.forEach(function (y) { (entriesByYear[y] || []).forEach(function (e) { out.push(e); }); });
        return out.sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    }

    function matchesSet(value, set) {
        if (set === null) { return true; }
        return set.indexOf(value) >= 0;
    }

    function getFilteredEntries(entries, filters) {
        return entries.filter(function (e) {
            return matchesSet(e.competitionType, filters.types)
                && matchesSet(e.discipline, filters.discs)
                && matchesSet(e.class, filters.classes);
        });
    }

    // wanted: a single value from the clicked row (e.g. a discipline name);
    // known: every distinct value actually present in the data. Falls back to
    // null (no filter) rather than [] (filter to nothing) if wanted isn't a
    // real value -- an unmatched initial filter must never look like "no
    // results".
    function resolveInitialFilter(wanted, known) {
        if (!wanted) { return null; }
        return known.indexOf(wanted) >= 0 ? [wanted] : null;
    }

    // --- Chart: pure math/data-transform helpers + SVG string rendering,
    // ported from ressurser/nsf-ui.js (_shortDate/_dotColor/_chartPoints/
    // _renderChart). Tooltip/legend/overlap-ring interactivity is wired;
    // the expand-to-dialog view is still out of scope.

    var MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

    function shortDate(isoOrDate) {
        var d = new Date(isoOrDate);
        return d.getUTCDate() + '. ' + MONTHS_SHORT[d.getUTCMonth()] + " '" + String(d.getUTCFullYear()).slice(2);
    }

    function chartPoints(entries, metric) {
        return entries.filter(function (e) {
            if (!e.date || e[metric] == null) { return false; }
            if (metric === 'rankingScore' && Number(e.rankingScore) === 0) { return false; }
            return true;
        });
    }

    // Per-point color: rank medal colors for `position`, class-relative
    // performance bands for `rankingScore`, brand accent otherwise.
    function dotColor(entry, metric) {
        if (metric === 'position') {
            switch (Number(entry.position)) {
                case 1: return '#e8b923';
                case 2: return '#c8d0d8';
                case 3: return '#b87333';
            }
            return '#4a90d9';
        }
        if (metric === 'rankingScore') {
            var v = Number(entry.rankingScore);
            var cls = entry.class || '';
            if (cls === 'A') { return v >= 97 ? '#eab308' : v >= 85 ? '#ef4444' : '#f97316'; }
            if (cls === 'B') { return v >= 97 ? '#22c55e' : v >= 85 ? '#eab308' : v >= 75 ? '#ef4444' : '#f97316'; }
            if (cls === 'C') { return v >= 97 ? '#a855f7' : v >= 85 ? '#22c55e' : '#eab308'; }
            if (cls === 'D') { return v >= 85 ? '#a855f7' : '#eab308'; }
        }
        return 'var(--brand-accent)';
    }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    function fmtMetric(v, metric) { return metric === 'rankingScore' ? Number(v).toFixed(2) : String(v); }

    function computeOverlapCounts(entries, metric) {
        var counts = {};
        entries.forEach(function (e) {
            var key = e.date + '|' + fmtMetric(e[metric], metric);
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }

    function buildTooltipContent(entry, siblings, metric) {
        var header = '<div class="chart-tip-val">' + fmtMetric(entry[metric], metric) + '</div>'
            + '<div class="chart-tip-metric">' + esc(CHART_TITLES[metric] || '') + '</div>'
            + '<div class="chart-tip-date">' + esc(shortDate(entry.date)) + '</div>';
        var rows = siblings.length > 1
            ? siblings.map(function (s) { return '<div class="chart-tip-row">' + esc(s.discipline || '') + ' – ' + esc(s.class || '') + '</div>'; }).join('')
            : '<div class="chart-tip-row">' + esc(entry.discipline || '') + ' – ' + esc(entry.class || '') + '</div>';
        return header + rows;
    }

    // Mirrors dotColor's own per-class thresholds exactly, in display order
    // best→worst. Only the classes actually present in the charted points are
    // shown, so switching between a Class A shooter's history and a Class C
    // shooter's history shows the right legend, not every class always.
    var RANKING_BANDS = {
        A: [['#eab308', '97+'], ['#ef4444', '85–96'], ['#f97316', '<85']],
        B: [['#22c55e', '97+'], ['#eab308', '85–96'], ['#ef4444', '75–84'], ['#f97316', '<75']],
        C: [['#a855f7', '97+'], ['#22c55e', '85–96'], ['#eab308', '<85']],
        D: [['#a855f7', '85+'], ['#eab308', '<85']]
    };

    function chartLegend(pts, metric) {
        if (metric === 'position') {
            return '<div class="chart-legend">'
                + '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#e8b923"></span>1. plass</span>'
                + '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#c8d0d8"></span>2. plass</span>'
                + '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:#b87333"></span>3. plass</span>'
                + '</div>';
        }
        if (metric !== 'rankingScore') { return ''; }
        var classesInView = {};
        pts.forEach(function (e) { if (e.class && RANKING_BANDS[e.class]) { classesInView[e.class] = true; } });
        var classKeys = Object.keys(classesInView).sort();
        if (!classKeys.length) { return ''; }
        return '<div class="chart-legend">' + classKeys.map(function (cls) {
            return '<span class="chart-legend-group">Klasse ' + esc(cls) + ': ' + RANKING_BANDS[cls].map(function (band) {
                return '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:' + band[0] + '"></span>' + esc(band[1]) + '</span>';
            }).join('') + '</span>';
        }).join('') + '</div>';
    }

    function wireChartTooltip(svgContainer, pts, metric) {
        var tooltip = svgContainer.querySelector('.chart-tooltip');
        var pinned = null;
        function siblingsOf(dot) {
            return pts.filter(function (e) { return e.date === dot.dataset.date && fmtMetric(e[metric], metric) === dot.dataset.val; });
        }
        function show(dot) {
            var entry = { date: dot.dataset.date, discipline: dot.dataset.disc, class: dot.dataset.class };
            entry[metric] = Number(dot.dataset.val);
            tooltip.innerHTML = buildTooltipContent(entry, siblingsOf(dot), metric);
            tooltip.hidden = false;
            var rect = dot.getBoundingClientRect(), wrapRect = svgContainer.getBoundingClientRect();
            tooltip.style.left = (rect.left - wrapRect.left) + 'px';
            tooltip.style.top = (rect.top - wrapRect.top - tooltip.offsetHeight - 6) + 'px';
        }
        function hide() { if (!pinned) { tooltip.hidden = true; } }
        svgContainer.addEventListener('mouseover', function (e) { var d = e.target.closest('.person-chart-dot'); if (d) { show(d); } });
        svgContainer.addEventListener('mouseout', hide);
        svgContainer.addEventListener('focusin', function (e) { var d = e.target.closest('.person-chart-dot'); if (d) { show(d); } });
        svgContainer.addEventListener('focusout', hide);
        svgContainer.addEventListener('click', function (e) {
            var d = e.target.closest('.person-chart-dot');
            if (d) { pinned = (pinned === d) ? null : d; if (pinned) { show(d); } else { hide(); } }
            else if (pinned) { pinned = null; hide(); }
        });
    }

    var CHART_TITLES = { rankingScore: 'Ranking', score: 'Poengsum', position: 'Plassering' };
    var CHART_EMPTY_MSG = {
        rankingScore: 'Ingen ranking tilgjengelig (kun for klasseførende stevner i klasse)',
        score: 'Ingen poengdata tilgjengelig',
        position: 'Ingen plasseringsdata tilgjengelig'
    };

    function renderChart(svgContainer, entries, metric) {
        var pts = chartPoints(entries, metric).slice().sort(function (a, b) {
            return a.date < b.date ? -1 : 1;
        });

        if (pts.length < 2) {
            svgContainer.innerHTML = '<div class="person-chart-wrap"><p style="font-size:0.8125rem;color:var(--text-muted);margin-top:0.5rem;">'
                + (CHART_EMPTY_MSG[metric] || 'Ikke nok data for graf.') + '</p></div>';
            return;
        }

        // Line goes through the best result per date; all dots are still shown.
        var byDate = {};
        pts.forEach(function (e) {
            var d = e.date;
            if (!byDate[d]) { byDate[d] = e; return; }
            var curr = Number(byDate[d][metric]);
            var cand = Number(e[metric]);
            var better = metric === 'position' ? cand < curr : cand > curr;
            if (better) { byDate[d] = e; }
        });
        var linePts = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });

        var W = 400, H = 120, PL = 40, PR = 8, PT = 8, PB = 24;
        var vals = pts.map(function (e) { return Number(e[metric]); });
        var minS = Math.min.apply(null, vals);
        var maxS = Math.max.apply(null, vals);
        var range = maxS - minS || 1;
        var n = pts.length;

        // Date-based X positioning so same-day points share the same X.
        var minDate = new Date(pts[0].date).getTime();
        var maxDate = new Date(pts[n - 1].date).getTime();
        var dateRange = maxDate - minDate || 1;

        function xPos(ts) { return PL + ((ts - minDate) / dateRange) * (W - PL - PR); }

        // Plassering: invert Y-axis (lower position number = better = higher on chart).
        var invert = (metric === 'position');

        function norm(v) { return invert ? (v - minS) / range : 1 - (v - minS) / range; }

        var polyPoints = linePts.map(function (e) {
            var x = xPos(new Date(e.date).getTime());
            var y = PT + norm(Number(e[metric])) * (H - PT - PB);
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');

        var fmt = function (v) { return metric === 'rankingScore' ? Number(v).toFixed(2) : String(v); };
        var topLabel = invert ? fmt(minS) : fmt(maxS);
        var botLabel = invert ? fmt(maxS) : fmt(minS);
        var midY = (PT + (H - PB)) / 2;

        var yLabels =
            '<text x="' + (PL - 4) + '" y="' + (PT + 4) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + topLabel + '</text>'
            + (maxS > minS ? '<text x="' + (PL - 4) + '" y="' + (midY + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + fmt((minS + maxS) / 2) + '</text>' : '')
            + '<text x="' + (PL - 4) + '" y="' + (H - PB) + '" text-anchor="end" font-size="9" fill="var(--text-muted)">' + botLabel + '</text>';

        // Ticks from linePts (one per date). Pick up to 4 evenly spaced,
        // then drop any whose label would land within 55 SVG units of the previous.
        var lp = linePts;
        var rawIdxs = [];
        var numTicks = Math.min(4, lp.length);
        if (numTicks <= 1) {
            if (numTicks === 1) { rawIdxs = [0]; }
        } else {
            for (var ti = 0; ti < numTicks; ti++) { rawIdxs.push(Math.round(ti * (lp.length - 1) / (numTicks - 1))); }
        }
        rawIdxs = rawIdxs.filter(function (v, i, a) { return i === 0 || a[i - 1] !== v; });
        var tickIdxs = [], lastTickPx = -Infinity;
        rawIdxs.forEach(function (idx) {
            var px = xPos(new Date(lp[idx].date).getTime());
            if (px - lastTickPx >= 55) { tickIdxs.push(idx); lastTickPx = px; }
        });
        var xTicks = tickIdxs.map(function (idx) {
            var px = xPos(new Date(lp[idx].date).getTime()).toFixed(1);
            return '<line x1="' + px + '" y1="' + (H - PB) + '" x2="' + px + '" y2="' + (H - PB + 3) + '" stroke="var(--border)" stroke-width="1"/>'
                + '<text x="' + px + '" y="' + (H - PB + 11) + '" text-anchor="middle" font-size="8" fill="var(--text-muted)">' + shortDate(lp[idx].date) + '</text>';
        }).join('');

        var overlapCounts = computeOverlapCounts(pts, metric);
        var dots = pts.map(function (e) {
            var x = xPos(new Date(e.date).getTime());
            var y = PT + norm(Number(e[metric])) * (H - PT - PB);
            var color = dotColor(e, metric);
            var key = e.date + '|' + fmtMetric(e[metric], metric);
            var ring = overlapCounts[key] > 1
                ? '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="none" stroke="' + color + '"/>' : '';
            return ring + '<circle class="person-chart-dot" tabindex="0" data-date="' + esc(e.date) + '" data-val="' + esc(fmtMetric(e[metric], metric))
                + '" data-disc="' + esc(e.discipline || '') + '" data-class="' + esc(e.class || '')
                + '" aria-label="' + esc(fmtMetric(e[metric], metric) + ' – ' + shortDate(e.date)) + '"'
                + ' cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2" fill="' + color + '"/>';
        }).join('');

        var svg = '<div class="person-chart-wrap">'
            + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + (CHART_TITLES[metric] || '') + '-utvikling" style="display:block;overflow:visible;">'
            + '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + '<polyline points="' + polyPoints + '" fill="none" stroke="var(--brand-accent)" stroke-width="1.5" stroke-linejoin="round"/>'
            + dots
            + yLabels
            + xTicks
            + '</svg>'
            + chartLegend(pts, metric)
            + '<div class="chart-tooltip" hidden></div>'
            + '</div>';

        svgContainer.innerHTML = svg;
        // ponytail: guarded because tests exercise renderChart against plain
        // {innerHTML} stand-ins with no real DOM behind them (see
        // test/person-modal.test.js) — real callers always pass an element.
        if (typeof svgContainer.querySelector === 'function') {
            wireChartTooltip(svgContainer, pts, metric);
        }
    }

    return {
        parsePersonFromUrl: parsePersonFromUrl,
        buildPersonUrl: buildPersonUrl,
        clearPersonFromUrl: clearPersonFromUrl,
        shortDate: shortDate,
        chartPoints: chartPoints,
        dotColor: dotColor,
        computeOverlapCounts: computeOverlapCounts,
        buildTooltipContent: buildTooltipContent,
        renderChart: renderChart,
        mergeYearEntries: mergeYearEntries,
        getFilteredEntries: getFilteredEntries,
        resolveInitialFilter: resolveInitialFilter
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassPersonModal;
}
