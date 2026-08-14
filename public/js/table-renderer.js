var StandplassTable = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function sortRows(rows, key, direction) {
        var sign = direction === 'desc' ? -1 : 1;
        return rows.slice().sort(function (a, b) {
            var av = a[key];
            var bv = b[key];
            if (av === bv) { return 0; }
            return av > bv ? sign : -sign;
        });
    }

    function renderRows(columns, rows) {
        return rows.map(function (row) {
            var cells = columns.map(function (col) {
                // format() output is escaped like any other value; a column
                // must opt in with raw:true to emit markup.
                var value = col.format ? col.format(row[col.key]) : row[col.key];
                return '<td>' + (col.raw ? value : esc(value)) + '</td>';
            }).join('');
            return '<tr>' + cells + '</tr>';
        }).join('');
    }

    function mount(container, columns, rows) {
        container.innerHTML = renderRows(columns, rows);
    }

    return {
        sortRows: sortRows,
        renderRows: renderRows,
        mount: mount
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassTable;
}
