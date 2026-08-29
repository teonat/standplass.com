// public/js/nasjonalt-class-sort.js
//
// Class display order for the nasjonalt ranking search. Ported verbatim
// from the source's classSortKey/sortClasses -- there is no live NSF API
// field this order comes from (checked disciplineCode, classCode itself,
// no numeric sortOrder anywhere on a class object), the same "not
// derivable from the API" situation klubb's discipline-card order had
// (see docs/superpowers/STATUS.md's klubb gotchas section). Bucket order:
// A/B/C/D, then Å/Sr/Å-2/ÅR, then junior variants, then youth variants,
// then veteran/military/women age brackets (parsed numerically), then
// M/K, then SH, then PPC's own P-numbered classes, then -N/-NM suffixed
// codes, then anything unrecognized last.
var StandplassNasjonaltClassSort = (function () {
    'use strict';

    function classSortKey(c) {
        var code = c.code || '';
        var age = parseInt((code.match(/\d+/) || [99])[0], 10);

        if (code === 'A') { return [0, 0, c.name]; }
        if (code === 'B') { return [0, 1, c.name]; }
        if (code === 'C') { return [0, 2, c.name]; }
        if (code === 'D') { return [0, 3, c.name]; }

        if (code === 'Å') { return [1, 0, c.name]; }
        if (code === 'Sr') { return [1, 1, c.name]; }
        if (code === 'Å-2') { return [1, 2, c.name]; }
        if (code === 'ÅR') { return [1, 3, c.name]; }

        if (code === 'JM') { return [2, 0, c.name]; }
        if (code === 'JK') { return [2, 1, c.name]; }
        if (code === 'Jr') { return [2, 2, c.name]; }
        if (/^Jr/.test(code)) { return [2, 3, c.name]; }

        if (code === 'U16') { return [3, 0, c.name]; }
        if (code === 'U14') { return [3, 1, c.name]; }
        if (code === 'U12') { return [3, 2, c.name]; }
        if (code === 'U' || code === 'U-NM') { return [3, 3, c.name]; }
        if (/^U/.test(code)) { return [3, 4, c.name]; }

        if (/^V\d/.test(code)) { return [4, age, c.name]; }
        if (code === 'V') { return [4, 99, c.name]; }
        if (/^M\d/.test(code)) { return [5, age, c.name]; }
        if (/^W\d/.test(code)) { return [6, age, c.name]; }

        if (code === 'M') { return [7, 0, c.name]; }
        if (code === 'K') { return [7, 1, c.name]; }

        if (/SH/.test(code)) { return [8, 0, c.name]; }
        if (/^P\d/.test(code)) { return [9, parseInt(code.slice(1), 10) || 0, c.name]; }
        if (/PPC/.test(code)) { return [9, 999, c.name]; }
        if (/-N$/.test(code)) { return [10, age, c.name]; }
        if (/-NM$/.test(code)) { return [11, 0, c.name]; }
        return [12, 0, c.name];
    }

    function sortClasses(classes) {
        return classes.slice().sort(function (a, b) {
            var ka = classSortKey(a), kb = classSortKey(b);
            if (ka[0] !== kb[0]) { return ka[0] - kb[0]; }
            if (ka[1] !== kb[1]) { return ka[1] - kb[1]; }
            return (ka[2] || '').localeCompare(kb[2] || '', 'no');
        });
    }

    return { classSortKey: classSortKey, sortClasses: sortClasses };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassNasjonaltClassSort;
}
