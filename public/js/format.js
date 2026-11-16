var StandplassFormat = (function () {
    'use strict';

    var MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

    // The competition APIs emit datetimes WITHOUT a timezone suffix
    // ("2026-11-16T16:00:00"): the value is Norwegian wall-clock time for
    // that date, DST already baked in by whoever registered the event.
    // Read it literally — new Date() would reinterpret a suffix-less
    // string in the *viewer's* timezone (shifting the date for
    // non-Norwegian visitors at edge hours), and any conversion would
    // have to guess CET vs CEST. Suffix-less and "Z"-suffixed strings
    // alike yield their leading date verbatim here. (This restores the
    // source's own substring-parsing approach, which the port lost.)
    function parseDateParts(isoString) {
        var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(isoString || ''));
        return m ? { y: m[1], mo: m[2], d: m[3], hh: m[4] || null, mm: m[5] || '00' } : null;
    }

    function sameDay(a, b) {
        return !!a && !!b && a.y === b.y && a.mo === b.mo && a.d === b.d;
    }

    function formatDate(isoString) {
        var p = parseDateParts(isoString);
        return p ? +p.d + '. ' + MONTHS[+p.mo - 1] + ' ' + p.y : '';
    }

    function formatDateRange(startIso, endIso) {
        var s = parseDateParts(startIso);
        var e = parseDateParts(endIso);
        if (!s) { return ''; }
        if (!e || sameDay(s, e)) { return formatDate(startIso); }
        if (s.y === e.y && s.mo === e.mo) { return +s.d + '.–' + formatDate(endIso); }
        return formatDate(startIso) + '–' + formatDate(endIso);
    }

    function formatTime(isoString) {
        var p = parseDateParts(isoString);
        return (p && p.hh != null) ? p.hh + ':' + p.mm : null;
    }

    // Meta-line composition: the competition's date range plus its start
    // time when the API carries one. Single day: "16. nov 2026, kl 16:00".
    // Range: "21.–22. nov 2026 · starter kl 09:00" (the first day's time).
    function formatDateRangeTime(startIso, endIso) {
        var range = formatDateRange(startIso, endIso);
        if (!range) { return range; }
        var t = formatTime(startIso);
        if (!t) { return range; }
        var same = sameDay(parseDateParts(startIso), parseDateParts(endIso));
        return range + (same ? ', kl ' + t : ' · starter kl ' + t);
    }

    // Multi-value URL params: per-element encode -> join on ","; split on raw
    // "," -> per-element decode. The order is load-bearing: splitting before
    // decoding keeps a legacy single value whose %2C-encoded commas are part of
    // the value intact as ONE element. decodeURIComponent can throw on crafted
    // input ("%E0%A4%A", "100%"), so each element decodes under try/catch and
    // falls back to the raw part — a malformed URL must never dead-end init().
    function encodeIdList(values) {
        return (values || []).map(function (v) { return encodeURIComponent(String(v)); }).join(',');
    }

    function decodeIdList(raw) {
        if (!raw) { return []; }
        return String(raw).split(',').map(function (part) {
            try { return decodeURIComponent(part); } catch (err) { return part; }
        }).filter(function (v) { return v !== ''; });
    }

    return {
        formatDate: formatDate,
        formatDateRange: formatDateRange,
        formatTime: formatTime,
        formatDateRangeTime: formatDateRangeTime,
        encodeIdList: encodeIdList,
        decodeIdList: decodeIdList
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassFormat;
}
