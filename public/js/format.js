var StandplassFormat = (function () {
    'use strict';

    var MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

    // The competition APIs (nsfapi competitionlist, app.skyting.no
    // competition detail) emit datetimes WITHOUT a timezone suffix, e.g.
    // "2026-11-18T15:00:00" -- and that value is a UTC instant, not
    // Norwegian wall-clock. The registration form has no timezone input
    // (pure digit fields), the backend stores the entered time's UTC
    // equivalent, and skyting.no renders it back as Europe/Oslo local
    // time -- confirmed live: an event stored as 15:00 displays "kl
    // 16:00" in November (CET, +1), and list rows titled "NAIS 09:00 -
    // 22.05.2021" carry 07:00 strings (CEST, +2). So parsing must do the
    // same conversion: read the fields as a UTC instant, then format as
    // Europe/Oslo. Intl's timeZone support does the CET/CEST DST
    // arithmetic and makes the result identical for every viewer
    // regardless of their own timezone (a plain new Date() on a
    // suffix-less string would instead reinterpret it in the *viewer's*
    // zone). Date-only strings (no time part) carry no instant to
    // convert and pass through as-is.
    var osloFmt = null;
    function osloParts(utc) {
        if (osloFmt === null) {
            try {
                osloFmt = new Intl.DateTimeFormat('en', {
                    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit',
                    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
                });
            } catch (e) { osloFmt = false; }
        }
        var byType = {};
        if (osloFmt && osloFmt.formatToParts) {
            osloFmt.formatToParts(utc).forEach(function (p) { byType[p.type] = p.value; });
        }
        if (byType.year) {
            return {
                y: +byType.year, mo: +byType.month, d: +byType.day,
                // some engines render midnight as hour "24" under hour12:false
                hh: byType.hour === '24' ? '00' : byType.hour, mm: byType.minute
            };
        }
        // No Intl timezone support (ancient environment): fall back to the
        // raw UTC fields rather than crash -- times then show the stored
        // UTC hour, one off in winter, two in summer.
        return {
            y: utc.getUTCFullYear(), mo: utc.getUTCMonth() + 1, d: utc.getUTCDate(),
            hh: ('0' + utc.getUTCHours()).slice(-2), mm: ('0' + utc.getUTCMinutes()).slice(-2)
        };
    }

    function parseDateParts(isoString) {
        var s = String(isoString == null ? '' : isoString);
        var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?/.exec(s);
        if (!m) { return null; }
        if (m[4] == null) {
            return { dateOnly: true, y: +m[1], mo: +m[2], d: +m[3], hh: null, mm: null };
        }
        // Explicit offset (incl. Z): let Date apply it; suffix-less (the
        // APIs' convention): interpret the fields as UTC.
        var utc = m[7]
            ? new Date(s)
            : new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
        if (isNaN(utc.getTime())) { return null; }
        var p = osloParts(utc);
        return { dateOnly: false, y: p.y, mo: p.mo, d: p.d, hh: p.hh, mm: p.mm };
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
        // Same year across months: the year once, at the end — a
        // duplicated year made this the widest nowrap string the
        // terminliste table renders and pushed it into horizontal
        // scroll. Cross-year keeps both years (they differ).
        if (s.y === e.y) { return +s.d + '. ' + MONTHS[+s.mo - 1] + '–' + formatDate(endIso); }
        return formatDate(startIso) + '–' + formatDate(endIso);
    }

    function formatTime(isoString) {
        var p = parseDateParts(isoString);
        return (p && p.hh != null) ? p.hh + ':' + p.mm : null;
    }

    // Meta-line composition: the competition's date range plus its start
    // time (Oslo time, per the conversion above) when the API carries one.
    // Single day: "18. nov 2026, kl 16:00". Range: "21.–22. nov 2026 ·
    // starter kl 10:00" (the first day's time).
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
