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

    return {
        formatDate: formatDate,
        formatDateRange: formatDateRange
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassFormat;
}
