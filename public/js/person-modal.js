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

    var FILTER_PARAM_KEYS = ['p_year', 'p_type', 'p_disc', 'p_class', 'p_metric',
                             'p_tab', 'p_branch', 'p_entry'];

    function clearPersonFromUrl(search) {
        var params = new URLSearchParams(search);
        params.delete('person');
        params.delete('year');
        FILTER_PARAM_KEYS.forEach(function (k) { params.delete(k); });
        var qs = params.toString();
        return qs ? '?' + qs : '';
    }

    // p_entry: the activated entry's identity, 'date~competitionId~
    // discipline~class' — shareable, re-activated on open by the same
    // findEntryIndex the row buttons' identity goes through. Empty
    // parts are wildcards on the match; a value with no anchor at all
    // would match the first entry and parses as no entry instead.
    function parseEntryParam(v) {
        if (!v) { return null; }
        var parts = v.split('~');
        if (parts.length !== 4) { return null; }
        var spec = {
            date: parts[0] || null,
            competitionId: parts[1] || null,
            discipline: parts[2] || null,
            class: parts[3] || null
        };
        return (spec.date || spec.competitionId || spec.discipline || spec.class) ? spec : null;
    }

    function formatEntryParam(spec) {
        if (!spec) { return null; }
        var v = [spec.date, spec.competitionId, spec.discipline, spec.class].map(function (x) {
            return x == null ? '' : String(x);
        }).join('~');
        return v === '~~~' ? null : v;
    }

    // Reads the p_year/p_type/p_disc/p_class/p_metric params a deep link may
    // carry (KSS: nsf-ui.js's tryOpenFromUrl) -- a plain row click never
    // reads these, it always starts from defaults. For p_type/p_disc/
    // p_class, an absent param and an empty list are the same thing --
    // unfiltered -- so the caller normalizes both to [] at init.
    // p_tab/p_branch deep-link the Meritter and Skammekroken tabs and
    // their shared branch filter; unknown values fall back to the
    // defaults (Resultater / Alle).
    function parsePersonFilterParams(search) {
        var params = new URLSearchParams(search);
        function splitList(key) {
            var v = params.get(key);
            return v ? v.split(',').filter(Boolean) : null;
        }
        var yearsRaw = params.get('p_year');
        var years = yearsRaw
            ? yearsRaw.split(',').map(function (y) { return parseInt(y, 10); }).filter(function (y) { return !isNaN(y); })
            : null;
        var branch = params.get('p_branch');
        return {
            years: years && years.length ? years : null,
            types: splitList('p_type'),
            discs: splitList('p_disc'),
            classes: splitList('p_class'),
            metric: params.get('p_metric') || null,
            tab: params.get('p_tab') === 'meritter' ? 'meritter'
                : params.get('p_tab') === 'skammekroken' ? 'skammekroken' : null,
            branch: branch === 'felt' || branch === 'bane' ? branch : null,
            entry: parseEntryParam(params.get('p_entry'))
        };
    }

    // Builds a { p_year, p_type, p_disc, p_class, p_metric, p_tab,
    // p_branch } patch -- each value is either the param to set, or
    // null to remove it -- so the URL never carries a param that just
    // repeats the default state (a plain ?person=X&year=Y should stay
    // exactly that until something's actually changed inside the
    // modal). state: { selectedYears, activeYear, types, discs,
    // classes, metric, defaultMetric, tab?, branch? } -- tab is
    // 'meritter'/'skammekroken' or null, branch 'felt'/'bane' or null
    // (Alle).
    function buildPersonFilterParams(state) {
        var isDefaultYears = state.selectedYears.length === 1 && state.selectedYears[0] === state.activeYear;
        // Empty filter list = unfiltered, so it writes no param (same as
        // null): a bookmark never carries p_type=p_disc=p_class clutter
        // for the default view.
        function list(v) { return v && v.length ? v.join(',') : null; }
        var branch = state.branch === 'felt' || state.branch === 'bane'
            ? state.branch : null;
        return {
            p_year: isDefaultYears ? null : state.selectedYears.slice().sort(function (a, b) { return a - b; }).join(','),
            p_type: list(state.types),
            p_disc: list(state.discs),
            p_class: list(state.classes),
            p_metric: (state.metric && state.metric !== state.defaultMetric) ? state.metric : null,
            p_tab: state.tab === 'meritter' || state.tab === 'skammekroken'
                ? state.tab : null,
            p_branch: branch,
            p_entry: formatEntryParam(state.entry)
        };
    }

    // --- Multi-year merge/filter helpers for the person modal's Year/
    // Stevnetype/Øvelse/Klasse dropdowns.

    function mergeYearEntries(entriesByYear, selectedYears) {
        var out = [];
        selectedYears.forEach(function (y) { (entriesByYear[y] || []).forEach(function (e) { out.push(e); }); });
        return out.sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    }

    // Nothing picked = everything shown (the felt/terminliste filter
    // convention): an empty or null list is no restriction, a non-empty
    // list is the only values that pass.
    function matchesSet(value, set) {
        if (set === null || !set.length) { return true; }
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
    // known: every distinct value actually present in the data. An empty
    // list is the unfiltered state, so both "nothing wanted" and "wanted
    // isn't a real value" fall back to [] -- an unmatched initial filter
    // just opens unfiltered.
    function resolveInitialFilter(wanted, known) {
        if (!wanted) { return []; }
        return known.indexOf(wanted) >= 0 ? [wanted] : [];
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
            if (metric === 'rankingScore' && (Number(e.rankingScore) === 0
                || StandplassRankingBand.isGarbageRankingScore(e.rankingScore))) { return false; }
            return true;
        });
    }

    // Per-point color: rank medal colors for `position`, class-relative
    // performance bands for `rankingScore`, brand accent otherwise.
    function dotColor(entry, metric) {
        if (metric === 'position') {
            switch (Number(entry.position)) {
                case 1: return 'var(--chart-gold)';
                case 2: return 'var(--chart-silver)';
                case 3: return 'var(--chart-bronze)';
            }
            return 'var(--chart-blue)';
        }
        if (metric === 'rankingScore') {
            // Ladder logic lives in ranking-band.js, shared with the
            // Ranking cells in the result tables. The fallback is
            // chart-specific: every dot must paint, so off-ladder
            // entries get the neutral blue rather than no color.
            var band = StandplassRankingBand.bandFor(entry.class, entry.rankingScore);
            return band ? band.color : 'var(--chart-blue)';
        }
        return 'var(--chart-blue)';
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

    function legendDot(color, label) {
        return '<span class="chart-legend-item"><span class="chart-legend-dot" style="background:' + color + '"></span>' + esc(label) + '</span>';
    }

    // A fixed legend describing what each color *means*, not per-class
    // thresholds -- dotColor's thresholds already vary by class (a "97+" for
    // Class A is a different relative standing than for Class C), so the
    // legend describes the shared relative concept (2+ classes over/at
    // opprykk/in class/under/2+ under) instead of duplicating numbers per
    // class in view. Matches the source's own legend exactly.
    function chartLegend(metric) {
        if (metric === 'position') {
            return '<div class="chart-legend">'
                + legendDot('var(--chart-gold)', '1. plass') + legendDot('var(--chart-silver)', '2. plass')
                + legendDot('var(--chart-bronze)', '3. plass') + legendDot('var(--chart-blue)', 'Andre')
                + '</div>';
        }
        if (metric !== 'rankingScore') { return ''; }
        // Generated from the shared band list (ranking-band.js) so the
        // legend can never drift from the dots or the table cells.
        return '<div class="chart-legend">'
            + StandplassRankingBand.BANDS.map(function (b) {
                return legendDot(b.color, b.label);
            }).join('')
            + '</div>';
    }

    var CHART_TITLES = { rankingScore: 'Ranking', score: 'Poengsum', position: 'Plassering' };
    var CHART_EMPTY_MSG = {
        rankingScore: 'Ingen ranking tilgjengelig (kun for klasseførende stevner i klasse)',
        score: 'Ingen poengdata tilgjengelig',
        position: 'Ingen plasseringsdata tilgjengelig'
    };

    // ViewBox dimensions and the pointer-resolution radius, in viewBox units.
    // 16 units ≈ a 25px target on a 390px phone and ~48px on a typical
    // desktop — the dots themselves are r=2 (≈3px on mobile), far too small
    // to hit with a finger. Resolution is nearest-dot, not topmost-element,
    // so overlapping neighborhoods never steal a tap from a closer dot.
    var CHART_W = 400, CHART_H = 120, DOT_HIT_RADIUS = 16;

    // points: [{x, y}]; returns the index of the nearest point within
    // maxDist (exclusive), or -1. An exact tie resolves to the earlier
    // point.
    function findNearestPoint(points, x, y, maxDist) {
        var best = -1, bestD = maxDist * maxDist;
        for (var i = 0; i < points.length; i++) {
            var dx = points[i].x - x, dy = points[i].y - y;
            var d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    // Chart interactions: tooltip + one unified active-dot state. Pointer
    // events resolve nearest-dot (findNearestPoint) instead of hit-testing
    // the r=2 dot elements themselves — that is what makes dots usable
    // with a finger (see DOT_HIT_RADIUS). Activation drives the selection
    // ring, the pinned tooltip, and (via opts.onDotSelect) the caller's
    // row highlight together — they can no longer disagree, which the
    // older separate pinned-tooltip / linked-dot states allowed.
    function wireChartInteractions(svgContainer, pts, metric, opts) {
        var svgEl = svgContainer.querySelector('svg');
        var tooltip = svgContainer.querySelector('.chart-tooltip');
        var dots = Array.prototype.map.call(
            svgContainer.querySelectorAll('.person-chart-dot'),
            function (el) {
                return {
                    el: el,
                    idx: el.getAttribute('data-idx'),
                    x: parseFloat(el.getAttribute('cx')),
                    y: parseFloat(el.getAttribute('cy')),
                    ring: svgContainer.querySelector('.person-chart-dot-ring[data-idx="' + el.getAttribute('data-idx') + '"]')
                };
            }
        );
        var activeIdx = null;

        function activeDot() {
            if (activeIdx == null) { return null; }
            for (var i = 0; i < dots.length; i++) {
                if (dots[i].idx === activeIdx) { return dots[i]; }
            }
            return null;
        }
        function siblingsOf(dot) {
            return pts.filter(function (e) { return e.date === dot.dataset.date && fmtMetric(e[metric], metric) === dot.dataset.val; });
        }
        function showTip(dot) {
            var entry = { date: dot.dataset.date, discipline: dot.dataset.disc, class: dot.dataset.class };
            entry[metric] = Number(dot.dataset.val);
            tooltip.innerHTML = buildTooltipContent(entry, siblingsOf(dot), metric);
            tooltip.hidden = false;
            var rect = dot.getBoundingClientRect(), wrapRect = svgContainer.getBoundingClientRect();
            // Mirrors the source's own "measure then clamp" tooltip positioning
            // (clamped to the viewport there; clamped to this wrap here, since
            // this modal positions the tooltip wrap-relative, not viewport-fixed)
            // -- without this, a dot near the right edge left the tooltip's own
            // width pushing it past the wrap's right edge entirely.
            var left = rect.left - wrapRect.left;
            var maxLeft = wrapRect.width - tooltip.offsetWidth;
            if (left > maxLeft) { left = Math.max(0, maxLeft); }
            tooltip.style.left = left + 'px';
            tooltip.style.top = (rect.top - wrapRect.top - tooltip.offsetHeight - 6) + 'px';
        }
        function hideTip() { tooltip.hidden = true; }
        function clearActiveClasses() {
            dots.forEach(function (d) {
                if (d.ring) { d.ring.classList.remove('person-chart-dot-ring--active'); }
                d.el.classList.remove('person-chart-dot--active');
            });
        }
        function activate(d) {
            clearActiveClasses();
            activeIdx = d.idx;
            if (d.ring) { d.ring.classList.add('person-chart-dot-ring--active'); }
            d.el.classList.add('person-chart-dot--active');
            showTip(d.el);
        }
        function deactivate() {
            clearActiveClasses();
            activeIdx = null;
            hideTip();
        }
        function notify(dotEl) {
            if (opts.onDotSelect) { opts.onDotSelect(dotEl); }
        }
        function clientToViewBox(clientX, clientY) {
            var r = svgEl.getBoundingClientRect();
            if (!r.width || !r.height) { return null; }
            return { x: (clientX - r.left) / r.width * CHART_W, y: (clientY - r.top) / r.height * CHART_H };
        }
        function resolve(e) {
            var p = clientToViewBox(e.clientX, e.clientY);
            return p ? findNearestPoint(dots, p.x, p.y, DOT_HIT_RADIUS) : -1;
        }
        function findByEl(el) {
            for (var i = 0; i < dots.length; i++) {
                if (dots[i].el === el) { return dots[i]; }
            }
            return null;
        }

        // Listeners live on the svg element (recreated on every render),
        // never on the persistent container — a metric toggle or filter
        // change re-renders the chart, and container-level listeners from
        // the previous wiring would accumulate and act on detached DOM.
        svgEl.addEventListener('mousemove', function (e) {
            var i = resolve(e);
            if (i >= 0) { showTip(dots[i].el); }
        });
        svgEl.addEventListener('mouseleave', function () {
            var d = activeDot();
            if (d) { showTip(d.el); } else { hideTip(); }
        });
        svgEl.addEventListener('focusin', function (e) {
            if (e.target.classList && e.target.classList.contains('person-chart-dot')) { showTip(e.target); }
        });
        svgEl.addEventListener('focusout', function () {
            var d = activeDot();
            if (d) { showTip(d.el); } else { hideTip(); }
        });
        svgEl.addEventListener('click', function (e) {
            var i = resolve(e);
            if (i < 0 || dots[i].idx === activeIdx) {
                var wasActive = activeIdx != null;
                deactivate();
                if (wasActive) { notify(null); }
                return;
            }
            activate(dots[i]);
            notify(dots[i].el);
        });
        // Keyboard activation: dots are tabindex="0" and show the tooltip
        // on focus, but before this they had no way to *select* — the row
        // link was click-only.
        svgEl.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') { return; }
            var el = e.target.closest && e.target.closest('.person-chart-dot');
            if (!el) { return; }
            e.preventDefault();
            var d = findByEl(el);
            if (!d) { return; }
            if (activeIdx === d.idx) { deactivate(); notify(null); }
            else { activate(d); notify(d.el); }
        });

        return {
            // External entry point for table-row clicks: activates the dot
            // for an entry (ring + tooltip), scrolls the chart into view —
            // the row clicker is usually scrolled past the chart — and
            // notifies the caller exactly like a chart-side activation, so
            // the clicked row gets the same highlight and any previously
            // highlighted row is cleared. An unknown index (entry not on
            // this metric's chart) clears the active state.
            activateDot: function (dataIdx) {
                var d = null;
                for (var i = 0; i < dots.length; i++) {
                    if (dots[i].idx === String(dataIdx)) { d = dots[i]; break; }
                }
                if (!d) { deactivate(); notify(null); return; }
                activate(d);
                svgEl.scrollIntoView({ block: 'nearest' });
                notify(d.el);
            },
            clearActive: function () { deactivate(); }
        };
    }

    function renderChart(svgContainer, entries, metric, opts) {
        opts = opts || {};
        var noopHandle = { activateDot: function () {}, clearActive: function () {} };
        var pts = chartPoints(entries, metric).slice().sort(function (a, b) {
            return a.date < b.date ? -1 : 1;
        });

        if (pts.length < 2) {
            svgContainer.innerHTML = '<div class="person-chart-wrap"><p style="font-size:0.8125rem;color:var(--text-muted);margin-top:0.5rem;">'
                + (CHART_EMPTY_MSG[metric] || 'Ikke nok data for graf.') + '</p></div>';
            return noopHandle;
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

        var W = CHART_W, H = CHART_H, PL = 40, PR = 8, PT = 8, PB = 24;
        var vals = pts.map(function (e) { return Number(e[metric]); });
        var minS = Math.min.apply(null, vals);
        var maxS = Math.max.apply(null, vals);
        var range = maxS - minS || 1;
        var n = pts.length;

        // Date-based X positioning so same-day points share the same X.
        var minDate = new Date(pts[0].date).getTime();
        var maxDate = new Date(pts[n - 1].date).getTime();
        var dateRange = maxDate - minDate || 1;

        // Half-step inset: pad the date range by half the average
        // inter-point step on each side, so the first/last dots (and any
        // tooltip above them) clear the axis lines.
        var halfStep = (dateRange / (n - 1)) / 2;
        var plotMin = minDate - halfStep;
        var plotRange = dateRange + 2 * halfStep;

        function xPos(ts) { return PL + ((ts - plotMin) / plotRange) * (W - PL - PR); }

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
        // Entry → index into the entries array (the table rows carry the
        // same index) for dot↔row linking. A Map built once per render
        // instead of indexOf-per-dot.
        var entryIdx = new Map();
        entries.forEach(function (e, i) { entryIdx.set(e, i); });
        var dots = pts.map(function (e) {
            var x = xPos(new Date(e.date).getTime());
            var y = PT + norm(Number(e[metric])) * (H - PT - PB);
            var color = dotColor(e, metric);
            var key = e.date + '|' + fmtMetric(e[metric], metric);
            var idx = entryIdx.get(e);
            // Decorative same-day marker: classed so CSS can drop it out
            // of pointer events entirely (it sits over the plot and would
            // otherwise swallow taps that the resolution layer below
            // should own).
            var ring = overlapCounts[key] > 1
                ? '<circle class="person-chart-overlap-ring" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="none" stroke="' + color + '"/>' : '';
            // Selection ring: the visible active indicator, paired to its
            // dot by data-idx. Hidden (opacity 0) until activated.
            var selRing = '<circle class="person-chart-dot-ring" data-idx="' + idx + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5.5"/>';
            return ring + selRing
                + '<circle class="person-chart-dot" tabindex="0" data-date="' + esc(e.date) + '" data-val="' + esc(fmtMetric(e[metric], metric))
                + '" data-disc="' + esc(e.discipline || '') + '" data-class="' + esc(e.class || '')
                + '" data-idx="' + idx + '"'
                + ' aria-label="' + esc(fmtMetric(e[metric], metric) + ' – ' + shortDate(e.date)) + '"'
                + ' cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2" fill="' + color + '"/>';
        }).join('');

        var svg = '<div class="person-chart-wrap">'
            + '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + (CHART_TITLES[metric] || '') + '-utvikling" style="display:block;overflow:visible;">'
            + '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="var(--border)" stroke-width="1"/>'
            + '<polyline points="' + polyPoints + '" fill="none" stroke="var(--chart-blue)" stroke-width="1.5" stroke-linejoin="round"/>'
            + dots
            + yLabels
            + xTicks
            + '</svg>'
            + chartLegend(metric)
            + '<div class="chart-tooltip" hidden></div>'
            + '</div>';

        svgContainer.innerHTML = svg;
        // ponytail: guarded because tests exercise renderChart against plain
        // {innerHTML} stand-ins with no real DOM behind them (see
        // test/person-modal.test.js) — real callers always pass an element.
        if (typeof svgContainer.querySelector === 'function') {
            return wireChartInteractions(svgContainer, pts, metric, opts);
        }
        return { activateDot: function () {}, clearActive: function () {} };
    }

    // The result table's column spec for the shared data-table base —
    // a straight port of the hand-rolled markup: nulls render as –,
    // dates short-form, rankingScore two decimals, every column
    // left-aligned. Rows are the modal's filtered entries in FILTER
    // order, so the base's data-dt-row index doubles as the chart's
    // dot index (the controller passes rowAttrs that stamp it as
    // data-idx); the date-asc default sort is the order the table has
    // always shown.
    function resultsTableColumns() {
        return [
            { key: 'date', label: 'Dato', sortable: true, defaultDir: 'asc',
                format: function (v) { return v ? shortDate(v) : '–'; } },
            { key: 'competition', label: 'Stevne', sortable: true, defaultDir: 'asc',
                format: function (v) { return v || '–'; } },
            { key: 'discipline', label: 'Øvelse', sortable: true, defaultDir: 'asc',
                format: function (v) { return v || ''; } },
            { key: 'class', label: 'Klasse', sortable: true, defaultDir: 'asc',
                format: function (v) { return v || ''; } },
            { key: 'position', label: 'Plass', sortable: true, defaultDir: 'asc', raw: true,
                cell: function (row) { return StandplassRankingBand.positionCellHtml(row.position); } },
            { key: 'score', label: 'Poeng', sortable: true, defaultDir: 'desc',
                format: function (v) { return v == null ? '–' : v; } },
            { key: 'rankingScore', label: 'Ranking', sortable: true, defaultDir: 'desc',
                raw: true,
                cell: function (row) { return StandplassRankingBand.cellHtml(row.rankingScore, row.class); } }
        ];
    }

    // ── Open-from-entry activation helpers ──────────────────────────
    // Opening the modal from a clicked result row activates that entry
    // like an in-modal row click (dot ring + row highlight). The row
    // button carries the entry's identity; a ranking chart cannot show
    // an entry without a rank score, so the activation falls back to
    // the poeng graph (owner ruling 2026-11-23).

    // spec: {date?, competitionId?, discipline?, class?} — present
    // fields must all match; the first matching index wins, -1 when
    // nothing matches (or no spec was given).
    function findEntryIndex(entries, spec) {
        if (!spec) { return -1; }
        for (var i = 0; i < (entries || []).length; i++) {
            var e = entries[i];
            var match = ['date', 'competitionId', 'discipline', 'class'].every(function (k) {
                return spec[k] == null || e[k] === spec[k];
            });
            if (match) { return i; }
        }
        return -1;
    }

    // The chart metric an entry can actually be activated on: a
    // rankless entry has no dot on the ranking graph, so the poeng
    // graph takes over; every other metric stays as-is.
    function activationMetric(entry, currentMetric) {
        if (currentMetric === 'rankingScore' && !hasMetricValue(entry, 'rankingScore')) {
            return 'score';
        }
        return currentMetric;
    }

    // Whether an entry gets a dot on a metric's chart — the chart's own
    // dot predicate (chartPoints), which the activation must agree with
    // exactly: the listing encodes "no ranking" as zero, not just null,
    // and chartPoints excludes ranking-0 rows from the ranking series.
    // Score-scale garbage above the 100-point ladder is not a ranking
    // either — the activation must agree with the chart's predicate.
    // A zero poeng sum is a real dot; positions are 1-based.
    function hasMetricValue(entry, metric) {
        if (metric === 'rankingScore') {
            return entry.rankingScore != null && Number(entry.rankingScore) !== 0
                && !StandplassRankingBand.isGarbageRankingScore(entry.rankingScore);
        }
        if (metric === 'score') { return entry.score != null; }
        if (metric === 'position') { return entry.position != null; }
        return false;
    }

    // Whether an entry actually gets a dot on the rendered chart: the
    // chart draws dots only with 2+ plotted points (a single point is no
    // line — renderChart's noop path), and only for entries its series
    // includes (chartPoints' own predicate: dated, non-null on the
    // metric, ranking not the zero encoding). The open-from-entry
    // activation uses this instead of the noop-swallowing activateDot
    // when the chart has nothing to activate — the row fallback (and
    // its p_entry write) takes over.
    function hasChartDot(entries, metric, entry) {
        var pts = chartPoints(entries, metric);
        return pts.length >= 2 && pts.indexOf(entry) !== -1;
    }

    // ── Meritter tab rendering ─────────────────────────────────────────
    // Consumes meritterForPerson's rows. The chips split individual and
    // lag kinds (owner ruling 2026-11-23: separate chips, only non-zero
    // kinds); the body groups rows by year, newest first, with the lag
    // team name inline and muted. Medal badges reuse ranking-band's
    // markup (class names are the contract) so existing CSS styles
    // them without a module dependency.

    var CHIP_KINDS = [
        { key: 'nm', label: 'NM' },
        { key: 'nmLag', label: 'NM-lag' },
        { key: 'dm', label: 'DM' },
        { key: 'dmLag', label: 'DM-lag' },
        { key: 'km', label: 'KM' },
        { key: 'kmLag', label: 'KM-lag' }
    ];
    var MERITT_MEDALS = [
        { name: 'Gull', pos: 1, cls: 'medal--gold' },
        { name: 'Sølv', pos: 2, cls: 'medal--silver' },
        { name: 'Bronse', pos: 3, cls: 'medal--bronze' }
    ];

    function medalByName(name) {
        for (var i = 0; i < MERITT_MEDALS.length; i++) {
            if (MERITT_MEDALS[i].name === name) { return MERITT_MEDALS[i]; }
        }
        return null;
    }

    // A merit row's badge shows the position (1/2/3) like the results
    // table's Plass cell; a chip's span shows the count instead.
    function meritBadge(medal) {
        var m = medalByName(medal);
        return m ? '<span class="medal ' + m.cls + '">' + String(m.pos) + '</span>' : '';
    }

    function medalSpan(medal, n) {
        var m = medalByName(medal);
        if (!m) { return ''; }
        return '<span class="medal ' + m.cls + '">' + String(n) + '</span>';
    }

    // merits → [{key, label, counts}] — key 'kmLag' for a merit with a
    // team, 'km' without; counts is {Gull, Sølv, Bronse} (zeros kept —
    // the renderer omits them). Fixed kind order, only non-zero kinds.
    function meritterChips(merits) {
        var byKind = {};
        (merits || []).forEach(function (m) {
            var kind = m.team != null ? m.scope + 'Lag' : m.scope;
            if (!Object.prototype.hasOwnProperty.call(byKind, kind)) {
                byKind[kind] = { Gull: 0, Sølv: 0, Bronse: 0 };
            }
            if (byKind[kind][m.medal] != null) { byKind[kind][m.medal] += 1; }
        });
        return CHIP_KINDS.filter(function (k) {
            return Object.prototype.hasOwnProperty.call(byKind, k.key);
        }).map(function (k) {
            return { key: k.key, label: k.label, counts: byKind[k.key] };
        });
    }

    var SCOPE_LABELS = { nm: 'NM', dm: 'DM', km: 'KM' };

    function meritRowHtml(m, compLinks) {
        var parts = [meritBadge(m.medal)];
        parts.push('<span class="person-meritt-scope">'
            + esc(SCOPE_LABELS[m.scope] || String(m.scope || '').toUpperCase())
            + '</span>');
        parts.push('<span class="person-meritt-ovelse">' + esc(m.ovelse) + '</span>');
        if (m.klasse != null) {
            parts.push('<span class="person-meritt-klasse">' + esc(m.klasse) + '</span>');
        }
        if (m.team != null) {
            parts.push('<span class="person-meritt-team">' + esc(m.team) + '</span>');
        }
        if (m.region != null) {
            parts.push('<span class="person-meritt-region">' + esc(m.region) + '</span>');
        }
        var title = m.compTitle == null ? '' : esc(m.compTitle);
        if (compLinks && m.compId != null) {
            parts.push('<button type="button" class="stevner-person-btn link-btn person-meritt-comp"'
                + ' data-comp-id="' + esc(m.compId) + '"'
                + ' data-comp-title="' + title + '">' + title + '</button>');
        } else {
            parts.push('<span class="person-meritt-comp">' + title + '</span>');
        }
        return '<div class="person-meritt-row">' + parts.join('') + '</div>';
    }

    // The Meritter tab's whole body: an Alle/Felt/Bane switcher (owner
    // ruling 2026-11-23 — only when ≥2 branches are present in the
    // merits; rows stay untagged), the chips row and the year-grouped
    // list, all computed from the branch-filtered merits.
    // opts.compLinks renders comp titles as delegated link buttons
    // (hosts with a comp modal) instead of plain spans; opts.branch
    // (null/undefined = Alle) filters the merits.
    var BRANCH_ORDER = ['felt', 'bane'];

    function branchBtnHtml(branch, label, active) {
        return '<button type="button" class="program-btn person-meritt-branch-btn'
            + (active ? ' program-btn--active' : '') + '" data-branch="' + esc(branch)
            + '" aria-pressed="' + active + '">' + esc(label) + '</button>';
    }

    function renderMeritterBody(merits, opts) {
        if (!merits || !merits.length) {
            return '<p class="ranking-status-msg">Ingen mesterskapsmedaljer funnet.</p>';
        }
        opts = opts || {};
        var branches = BRANCH_ORDER.filter(function (b) {
            return merits.some(function (m) { return m.branch === b; });
        });
        // The shared branch filter (ruling 7) can point at a branch
        // this person has nothing in on this tab — carried from the
        // other tab's switcher, or a stale p_branch deep link. A
        // filter that matches nothing falls back to unfiltered rather
        // than a blank, switcher-less panel.
        var branch = opts.branch && branches.indexOf(opts.branch) !== -1
            ? opts.branch : null;
        var shown = branch
            ? merits.filter(function (m) { return m.branch === branch; })
            : merits;
        var chipsHtml = meritterChips(shown).map(function (c) {
            var counts = MERITT_MEDALS.filter(function (md) { return c.counts[md.name] > 0; })
                .map(function (md) { return medalSpan(md.name, c.counts[md.name]); })
                .join('');
            return '<span class="person-meritt-chip" data-kind="' + esc(c.key) + '">'
                + esc(c.label) + counts + '</span>';
        }).join('');
        var years = [];
        var byYear = {};
        shown.forEach(function (m) {
            if (!Object.prototype.hasOwnProperty.call(byYear, m.year)) {
                byYear[m.year] = [];
                years.push(m.year);
            }
            byYear[m.year].push(m);
        });
        years.sort(function (a, b) { return b - a; });
        var listHtml = years.map(function (y) {
            return '<h3 class="person-meritt-year">' + esc(String(y)) + '</h3>'
                + byYear[y].map(function (m) { return meritRowHtml(m, !!opts.compLinks); }).join('');
        }).join('');
        var toggle = '';
        if (branches.length > 1) {
            toggle = '<div class="program-toggle person-meritt-branch-toggle" role="group" aria-label="Gren">'
                + branchBtnHtml('', 'Alle', !branch)
                + branches.map(function (b) {
                    return branchBtnHtml(b, b.charAt(0).toUpperCase() + b.slice(1),
                        branch === b);
                }).join('')
                + '</div>';
        }
        return toggle
            + '<div class="person-meritt-chips">' + chipsHtml + '</div>' + listHtml;
    }

    // Skammekroken (DNS/DNF/DSQ history). Shooters know the
    // abbreviations; verbose Norwegian titles read as different
    // terms (owner ruling 2026-11-26). The tab shows the raw
    // abbreviations — chips and row badges, the same idiom the
    // resultfile modal's status badges use — and carries one
    // legend line expanding them: English expansion + Norwegian
    // gloss.
    var STATUS_LEGEND = {
        DNS: 'Did Not Start (startet aldri runden)',
        DNF: 'Did Not Finish (fullførte ikke runden)',
        DSQ: 'Disqualified (diskvalifisert)'
    };
    var STATUS_ORDER = ['DNS', 'DNF', 'DSQ'];

    // The controller's loaded utfall indexes ([{year, branch,
    // index}]) → the person's entries joined with their comps
    // metadata, newest year first, date desc within a year. Years
    // whose fetch failed are simply absent from the input; a person
    // with no statuses collects nothing.
    function collectStatusEntries(indexEntries, personId) {
        var out = [];
        (indexEntries || []).forEach(function (loaded) {
            var index = loaded && loaded.index;
            var entries = index && index.persons
                && index.persons[personId];
            (entries || []).forEach(function (e) {
                var comp = (index.comps || {})[e.compId] || {};
                out.push({
                    year: loaded.year,
                    branch: loaded.branch,
                    compId: e.compId,
                    date: comp.date != null ? comp.date : null,
                    title: comp.title != null ? comp.title : null,
                    resultFileUrl: comp.resultFileUrl != null
                        ? comp.resultFileUrl : null,
                    ovelse: e.ovelse,
                    klasse: e.klasse != null ? e.klasse : null,
                    status: e.status,
                    lag: e.lag === true,
                    team: e.team != null ? e.team : null
                });
            });
        });
        out.sort(function (a, b) {
            if (a.year !== b.year) { return b.year - a.year; }
            if (a.date !== b.date) { return a.date < b.date ? 1 : -1; }
            if (a.compId !== b.compId) {
                return a.compId < b.compId ? -1 : 1;
            }
            return a.ovelse < b.ovelse ? -1
                : (a.ovelse > b.ovelse ? 1 : 0);
        });
        return out;
    }

    function skammekrokenChips(statuses) {
        // One chip per status definition (owner ruling 2026-11-26):
        // "DSQ: 1 | Lag: 1" — the individual count, then the lag
        // count in the same pill, shown only when the person has lag
        // starts with that status. The two classifications of one
        // start never sum into one number; a lag-only status keeps
        // its pill with a zero individual count. Unknown statuses
        // stay uncounted.
        var counts = {};
        statuses.forEach(function (s) {
            if (STATUS_ORDER.indexOf(s.status) === -1) { return; }
            var c = counts[s.status];
            if (!c) { c = counts[s.status] = { ind: 0, lag: 0 }; }
            if (s.lag) { c.lag += 1; } else { c.ind += 1; }
        });
        return STATUS_ORDER.filter(function (k) { return counts[k]; })
            .map(function (k) {
                return { key: k, count: counts[k].ind, lagCount: counts[k].lag };
            });
    }

    function skammekrokenRowHtml(s, compLinks) {
        var parts = ['<span class="person-utfall-date">'
            + (s.date ? esc(shortDate(s.date)) : '') + '</span>'];
        var title = s.title == null ? '' : esc(s.title);
        if (compLinks && s.compId != null) {
            var attrs = ' data-comp-id="' + esc(s.compId) + '"'
                + ' data-comp-year="' + esc(String(s.year)) + '"'
                + ' data-comp-title="' + title + '"'
                + ' data-comp-branch="' + esc(s.branch) + '"';
            if (s.resultFileUrl) {
                attrs += ' data-comp-file="' + esc(s.resultFileUrl) + '"';
            }
            parts.push('<button type="button"'
                + ' class="stevner-person-btn link-btn person-utfall-comp"'
                + attrs + '>' + title + '</button>');
        } else {
            parts.push('<span class="person-utfall-comp">' + title + '</span>');
        }
        parts.push('<span class="person-meritt-ovelse">'
            + esc(s.ovelse) + '</span>');
        if (s.klasse != null) {
            parts.push('<span class="person-meritt-klasse">kl. '
                + esc(s.klasse) + '</span>');
        }
        parts.push('<span class="resultfile-status">'
            + esc(s.status) + '</span>');
        if (s.team != null) {
            parts.push('<span class="person-utfall-team">lag: '
                + esc(s.team) + '</span>');
        }
        return '<div class="person-meritt-row">' + parts.join('') + '</div>';
    }

    // The Skammekroken tab's whole body: chips per present status
    // (fixed DNS/DNF/DSQ order, raw abbreviations), a muted legend
    // line expanding them, entries grouped per year (newest first),
    // rows reading date — stevne — øvelse, kl. — status.
    // opts.compLinks renders comp titles as delegated link buttons
    // (hosts with a resultfile modal) instead of plain spans;
    // opts.branch (null = Alle) filters the entries.
    function renderSkammekrokenBody(statuses, opts) {
        if (!statuses || !statuses.length) {
            return '<p class="ranking-status-msg">Ingen registrerte utfall.</p>';
        }
        opts = opts || {};
        var branches = BRANCH_ORDER.filter(function (b) {
            return statuses.some(function (s) { return s.branch === b; });
        });
        // Same fallback as renderMeritterBody: a shared branch filter
        // that matches nothing here renders unfiltered, never a
        // blank panel.
        var branch = opts.branch && branches.indexOf(opts.branch) !== -1
            ? opts.branch : null;
        var shown = branch
            ? statuses.filter(function (s) { return s.branch === branch; })
            : statuses;
        var chipsHtml = skammekrokenChips(shown).map(function (c) {
            var text = c.key + ': ' + c.count;
            if (c.lagCount) { text += ' | Lag: ' + c.lagCount; }
            return '<span class="person-meritt-chip" data-kind="'
                + esc(c.key) + '">' + esc(text) + '</span>';
        }).join('');
        var years = [];
        var byYear = {};
        shown.forEach(function (s) {
            if (!Object.prototype.hasOwnProperty.call(byYear, s.year)) {
                byYear[s.year] = [];
                years.push(s.year);
            }
            byYear[s.year].push(s);
        });
        years.sort(function (a, b) { return b - a; });
        var listHtml = years.map(function (y) {
            return '<h3 class="person-meritt-year">' + esc(String(y)) + '</h3>'
                + byYear[y].map(function (s) {
                    return skammekrokenRowHtml(s, !!opts.compLinks);
                }).join('');
        }).join('');
        var toggle = '';
        if (branches.length > 1) {
            toggle = '<div class="program-toggle person-meritt-branch-toggle"'
                + ' role="group" aria-label="Gren">'
                + branchBtnHtml('', 'Alle', !branch)
                + branches.map(function (b) {
                    return branchBtnHtml(b,
                        b.charAt(0).toUpperCase() + b.slice(1),
                        branch === b);
                }).join('')
                + '</div>';
        }
        return toggle
            + '<div class="person-meritt-chips">' + chipsHtml + '</div>'
            + '<p class="person-utfall-legend">'
            + STATUS_ORDER.map(function (k) {
                return k + ' = ' + STATUS_LEGEND[k];
            }).join(' · ') + '</p>'
            + listHtml;
    }

    return {
        parsePersonFromUrl: parsePersonFromUrl,
        buildPersonUrl: buildPersonUrl,
        clearPersonFromUrl: clearPersonFromUrl,
        shortDate: shortDate,
        resultsTableColumns: resultsTableColumns,
        meritterChips: meritterChips,
        renderMeritterBody: renderMeritterBody,
        collectStatusEntries: collectStatusEntries,
        renderSkammekrokenBody: renderSkammekrokenBody,
        chartPoints: chartPoints,
        dotColor: dotColor,
        computeOverlapCounts: computeOverlapCounts,
        buildTooltipContent: buildTooltipContent,
        findNearestPoint: findNearestPoint,
        renderChart: renderChart,
        mergeYearEntries: mergeYearEntries,
        getFilteredEntries: getFilteredEntries,
        resolveInitialFilter: resolveInitialFilter,
        findEntryIndex: findEntryIndex,
        activationMetric: activationMetric,
        hasMetricValue: hasMetricValue,
        hasChartDot: hasChartDot,
        parsePersonFilterParams: parsePersonFilterParams,
        buildPersonFilterParams: buildPersonFilterParams
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassPersonModal;
}
