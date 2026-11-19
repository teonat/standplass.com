var StandplassDataTable = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function hiddenByWidth(col, tier) {
        return col.hideBelow != null && tier != null && tier <= col.hideBelow;
    }

    function visibleColumns(columns, state) {
        return columns.filter(function (col) {
            if ((state.runtimeHidden || []).indexOf(col.key) !== -1) { return false; }
            if (hiddenByWidth(col, state.widthTier)) { return false; }
            // nullish coalescing in ES5: absent (null/undefined) falls back to the default
            var hidden = state.hidden != null && state.hidden[col.key] != null
                ? state.hidden[col.key]
                : col.defaultHidden;
            return !hidden;
        });
    }

    function sortRowsNullsLast(rows, key, dir) {
        var withValue = [];
        var nulls = [];
        for (var i = 0; i < rows.length; i++) {
            if (rows[i][key] == null) { nulls.push(rows[i]); } else { withValue.push(rows[i]); }
        }
        return StandplassTable.sortRows(withValue, key, dir).concat(nulls);
    }

    return {
        visibleColumns: visibleColumns,
        sortRowsNullsLast: sortRowsNullsLast
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassDataTable;
}
