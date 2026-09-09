var StandplassFormat = (function () {
    'use strict';

    var MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

    function formatDate(isoString) {
        var d = new Date(isoString);
        return d.getUTCDate() + '. ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    }

    function formatDateRange(startIso, endIso) {
        var start = new Date(startIso);
        var end = new Date(endIso);
        if (start.getTime() === end.getTime()) {
            return formatDate(startIso);
        }
        if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
            return start.getUTCDate() + '.–' + formatDate(endIso);
        }
        return formatDate(startIso) + '–' + formatDate(endIso);
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
        encodeIdList: encodeIdList,
        decodeIdList: decodeIdList
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassFormat;
}
