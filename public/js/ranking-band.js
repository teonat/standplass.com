// public/js/ranking-band.js
//
// Shared ranking-ladder logic: the class-relative performance bands
// behind the person modal's chart dots, its legend, and the Ranking
// cells in the felt/bane result tables and the modal's results table.
// One source so the three presentations can never drift.
//
// The model (owner-confirmed): klasseførende stevner give each result
// a rankingssum (percentage) placing the performance on the ladder
// A >= 97, B >= 85, C/D zone < 85. D is the entry class and
// auto-converts to C after a year, so C and D are ONE zone: a C
// shooter scoring low is still in-zone (never a below-band), and a D
// shooter at C level is in-class (no promotion band below B). The
// band = performance level vs the class the shooter entered:
//
//   A: >=97 in class; 85-97 under (B level); <85 2+ under
//   B: >=97 opprykk (A level); 85-97 in class; <85 under (C/D level)
//   C: >=97 2+ over (A level); 85-97 opprykk (B level); <85 in class
//   D: >=85 2+ over (B level or higher); <85 in class
//
// rankingScore null/0 = no ranking (the chart already excludes 0 via
// chartPoints). Off-ladder classes (age/gender, anything not A-D)
// carry no band; consumers decide their own neutral presentation
// (the chart paints its fallback blue, table cells show no dot).
//
// File pattern: mode-resolve.js — a tiny pure global-IIFE with a
// Node require guard, no dependencies, loaded before its consumers.
var StandplassRankingBand = (function () {
    'use strict';

    // Legend order. Labels are the chart legend's strings verbatim.
    var BANDS = [
        { id: 'twoAbove',  color: 'var(--chart-purple)', label: '2+ klasser over' },
        { id: 'promotion', color: 'var(--chart-green)',  label: 'Opprykksgrense nådd' },
        { id: 'inClass',   color: 'var(--chart-blue)',   label: 'I klassen' },
        { id: 'below',     color: 'var(--chart-red)',    label: 'Under klassen' },
        { id: 'twoBelow',  color: 'var(--chart-orange)', label: '2+ klasser under' }
    ];
    var BY_ID = {};
    BANDS.forEach(function (b) { BY_ID[b.id] = b; });

    function bandFor(cls, rankingScore) {
        if (rankingScore == null) { return null; }
        var v = Number(rankingScore);
        if (!isFinite(v) || v === 0) { return null; }
        cls = String(cls || '');
        if (cls === 'A') { return v >= 97 ? BY_ID.inClass : v >= 85 ? BY_ID.below : BY_ID.twoBelow; }
        if (cls === 'B') { return v >= 97 ? BY_ID.promotion : v >= 85 ? BY_ID.inClass : BY_ID.below; }
        if (cls === 'C') { return v >= 97 ? BY_ID.twoAbove : v >= 85 ? BY_ID.promotion : BY_ID.inClass; }
        if (cls === 'D') { return v >= 85 ? BY_ID.twoAbove : BY_ID.inClass; }
        return null;
    }

    // The shared table cell for a Ranking column (raw HTML — consumers
    // must set the column's raw flag): the value itself carries the
    // band color, with the band label as its title so the color is
    // never the only signal. No escaping needed: the text is
    // Number.toFixed output (digits, dot, minus only) and the color and
    // label are this module's own static strings.
    function cellHtml(rankingScore, cls) {
        if (rankingScore == null) { return '–'; }
        var text = Number(rankingScore).toFixed(2);
        var band = bandFor(cls, rankingScore);
        if (!band) { return text; }
        return '<span class="rank-value" style="color:' + band.color
            + '" title="' + band.label + '">' + text + '</span>';
    }

    return { bandFor: bandFor, cellHtml: cellHtml, BANDS: BANDS };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassRankingBand;
}
