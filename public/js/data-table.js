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

    // ── Markup builder ────────────────────────────────────────────────
    // Pure string rendering: (columns, rows, state) -> html. No wiring,
    // no DOM. cell(row, i) receives the row's RENDERED position (what a
    // positional "#" column needs under sorting); data-dt-row and
    // rowAttrs(row, i) carry the row's index in opts.rows (what wiring
    // needs to map a click back to the data).

    function alignClass(col) {
        if (col.align === 'right') { return 'ranking-score'; }
        if (col.align === 'center') { return 'ranking-rank'; }
        return '';
    }

    function colClass(col) {
        var a = alignClass(col);
        var c = col.cellClass || '';
        return a ? (c ? a + ' ' + c : a) : c;
    }

    function cellValue(col, row, renderedIndex) {
        if (col.cell) { return col.cell(row, renderedIndex); }
        if (col.format) { return col.format(row[col.key]); }
        return row[col.key];
    }

    function dataIndexOf(rows, row) {
        for (var k = 0; k < rows.length; k++) { if (rows[k] === row) { return k; } }
        return -1;
    }

    function renderTable(id, opts, state) {
        opts = opts || {};
        state = state || {};
        var columns = opts.columns || [];
        var rows = opts.rows || [];
        var vis = visibleColumns(columns, state);
        var sort = state.sort || null;
        // defaultSort only marks the initial aria-sort; rows stay in page
        // order until the page's state.sort says otherwise.
        var ariaSort = sort || opts.defaultSort || null;

        var headHtml = vis.map(function (col) {
            var cls = colClass(col);
            var attrs = ' scope="col"' + (cls ? ' class="' + esc(cls) + '"' : '');
            if (ariaSort && ariaSort.key === col.key) {
                attrs += ' aria-sort="' + (ariaSort.dir === 'desc' ? 'descending' : 'ascending') + '"';
            }
            var inner = col.sortable
                ? '<button type="button" class="dt-sort-btn" data-dt-sort="' + esc(col.key) + '">'
                    + esc(col.label) + '<span class="dt-sort-arrow" aria-hidden="true"></span></button>'
                : esc(col.label);
            return '<th' + attrs + '>' + inner + '</th>';
        }).join('');

        function rowHtml(row, renderedIndex) {
            var cells = vis.map(function (col) {
                var value = cellValue(col, row, renderedIndex);
                var cls = colClass(col);
                if (col.asRowHeader) {
                    return '<th scope="row"' + (cls ? ' class="' + esc(cls) + '"' : '') + '>'
                        + (col.raw ? value : esc(value)) + '</th>';
                }
                return '<td' + (cls ? ' class="' + esc(cls) + '"' : '') + '>'
                    + (col.raw ? value : esc(value)) + '</td>';
            }).join('');
            var extra = opts.rowAttrs ? (opts.rowAttrs(row, dataIndexOf(rows, row)) || '') : '';
            return '<tr data-dt-row="' + dataIndexOf(rows, row) + '"' + (extra ? ' ' + extra : '') + '>' + cells + '</tr>';
        }

        var bodyHtml;
        if (opts.groupRows) {
            // Sort applies within groups; group order stays fixed.
            bodyHtml = opts.groupRows(rows).map(function (group) {
                var gRows = sort ? sortRowsNullsLast(group.rows, sort.key, sort.dir) : group.rows;
                return '<tr class="dt-group-row"><th scope="colgroup" colspan="' + vis.length + '">' + esc(group.label) + '</th></tr>'
                    + gRows.map(function (r, gi) { return rowHtml(r, gi); }).join('');
            }).join('');
        } else {
            var ordered = sort ? sortRowsNullsLast(rows, sort.key, sort.dir) : rows;
            bodyHtml = ordered.map(function (r, i) { return rowHtml(r, i); }).join('');
        }

        var tableHtml = '<table class="' + esc(opts.tableClass || 'ranking-table') + '"'
            + ' data-dt-id="' + esc(id) + '" aria-label="' + esc(opts.ariaLabel || '') + '">'
            + '<thead><tr>' + headHtml + '</tr></thead>'
            + '<tbody>' + bodyHtml + '</tbody>'
            + '</table>';

        var toolbar = opts.picker
            ? '<div class="dt-toolbar"><button type="button" class="dt-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">'
                + esc((opts.picker && opts.picker.buttonLabel) || 'Kolonner')
                + '</button><div class="dt-picker-anchor"></div></div>'
            : '';

        return opts.wrapClass
            ? '<div class="' + esc(opts.wrapClass) + '">' + toolbar + tableHtml + '</div>'
            : toolbar + tableHtml;
    }

    // ── Wiring ────────────────────────────────────────────────────────
    // Attaches to elements the base rendered inside the caller-supplied
    // root: one delegated click listener on the table (sort buttons +
    // row clicks), the column-picker dropdown inside .dt-picker-anchor,
    // and one matchMedia listener per distinct hideBelow breakpoint on
    // the root's own view. No document-level listeners (Shadow-DOM
    // retargeting). `state` is the same state object the page rendered
    // with — the picker reflects it, and sort flips are computed against
    // it (state.sort, falling back to opts.defaultSort).

    function wireTable(root, id, opts, handlers, state) {
        opts = opts || {};
        handlers = handlers || {};
        state = state || {};
        if (typeof root.querySelector !== 'function') {
            return { destroy: function () {} };
        }

        var columns = opts.columns || [];
        var rows = opts.rows || [];
        var cleanups = [];

        var table = root.querySelector('table[data-dt-id="' + id + '"]');

        if (table && (handlers.onSortChange || handlers.onRowClick)) {
            var onTableClick = function (ev) {
                var target = ev.target;
                if (!target || typeof target.closest !== 'function') { return; }
                if (handlers.onSortChange) {
                    var sortBtn = target.closest('.dt-sort-btn');
                    if (sortBtn && table.contains(sortBtn)) {
                        var key = sortBtn.getAttribute('data-dt-sort');
                        var active = state.sort || opts.defaultSort || null;
                        var dir;
                        if (active && active.key === key) {
                            dir = active.dir === 'desc' ? 'asc' : 'desc';
                        } else {
                            var col = null;
                            for (var c = 0; c < columns.length; c++) {
                                if (columns[c].key === key) { col = columns[c]; }
                            }
                            dir = (col && col.defaultDir) || 'asc';
                        }
                        handlers.onSortChange({ key: key, dir: dir });
                        return;
                    }
                }
                if (handlers.onRowClick) {
                    var tr = target.closest('tr[data-dt-row]');
                    if (tr && table.contains(tr)) {
                        var idx = parseInt(tr.getAttribute('data-dt-row'), 10);
                        handlers.onRowClick(rows[idx], idx, tr);
                    }
                }
            };
            table.addEventListener('click', onTableClick);
            cleanups.push(function () { table.removeEventListener('click', onTableClick); });
        }

        // Column picker: the toolbar renderTable emitted immediately
        // before the table owns the scaffold; build it there, mirroring
        // the established mountFilterDropdown pattern (the dropdown's
        // checkbox-dropdown-* classes reuse the existing styles).
        if (opts.picker && table) {
            var toolbar = table.previousElementSibling;
            var anchor = toolbar && toolbar.classList && toolbar.classList.contains('dt-toolbar')
                ? toolbar.querySelector('.dt-picker-anchor')
                : root.querySelector('.dt-picker-anchor');
            if (anchor) {
                anchor.innerHTML = '<button type="button" class="checkbox-dropdown-btn" aria-expanded="false"></button>'
                    + '<div class="checkbox-dropdown-panel" hidden role="group"><button type="button" class="checkbox-dropdown-clear-all">Nullstill</button>'
                    + '<ul class="checkbox-dropdown-list"></ul></div>';
                function userHidden(col) {
                    return state.hidden != null && state.hidden[col.key] != null
                        ? state.hidden[col.key]
                        : col.defaultHidden;
                }
                var dropdown = StandplassFilterWidgets.makeCheckboxDropdown({
                    btn: anchor.querySelector('.checkbox-dropdown-btn'),
                    panel: anchor.querySelector('.checkbox-dropdown-panel'),
                    list: anchor.querySelector('.checkbox-dropdown-list'),
                    clearAllBtn: anchor.querySelector('.checkbox-dropdown-clear-all'),
                    labelNone: 'Ingen kolonner',
                    getItems: function () {
                        return columns.map(function (col) {
                            return { id: col.key, name: col.label };
                        });
                    },
                    getSelected: function () {
                        return columns.filter(function (col) { return !userHidden(col); })
                            .map(function (col) { return col.key; });
                    },
                    onToggle: function (colKey, name, checked) {
                        if (!handlers.onColumnsChange) { return; }
                        var next = {};
                        var src = state.hidden || {};
                        Object.keys(src).forEach(function (k) { next[k] = src[k]; });
                        next[colKey] = !checked;
                        handlers.onColumnsChange(next);
                    },
                    onClearAll: function () {
                        if (handlers.onColumnsChange) { handlers.onColumnsChange({}); }
                    }
                });
                dropdown.rebuild();
                cleanups.push(function () { dropdown.destroy(); });
            }
        }

        // Width tiers: one matchMedia per distinct hideBelow breakpoint,
        // on the root's own view (Shadow-DOM safe). The reported tier is
        // the SMALLEST crossed breakpoint — tier T hides every column
        // with hideBelow >= T, which is what max-width CSS does today.
        // Listeners fire on change only; the initial tier is the page's
        // to compute if it needs one at load.
        if (handlers.onWidthTierChange) {
            var view = root.ownerDocument && root.ownerDocument.defaultView
                ? root.ownerDocument.defaultView
                : null;
            var tierValues = [];
            columns.forEach(function (col) {
                if (col.hideBelow != null && tierValues.indexOf(col.hideBelow) === -1) {
                    tierValues.push(col.hideBelow);
                }
            });
            if (view && typeof view.matchMedia === 'function' && tierValues.length) {
                var mqls = [];
                function currentTier() {
                    var tier = null;
                    for (var t = 0; t < mqls.length; t++) {
                        if (mqls[t].mql.matches && (tier == null || mqls[t].value < tier)) {
                            tier = mqls[t].value;
                        }
                    }
                    return tier;
                }
                tierValues.forEach(function (n) {
                    var mql = view.matchMedia('(max-width: ' + n + 'px)');
                    var listener = function () { handlers.onWidthTierChange(currentTier()); };
                    if (typeof mql.addEventListener === 'function') {
                        mql.addEventListener('change', listener);
                    } else if (typeof mql.addListener === 'function') {
                        mql.addListener(listener);
                    }
                    mqls.push({ mql: mql, value: n, listener: listener });
                });
                cleanups.push(function () {
                    mqls.forEach(function (m) {
                        if (typeof m.mql.removeEventListener === 'function') {
                            m.mql.removeEventListener('change', m.listener);
                        } else if (typeof m.mql.removeListener === 'function') {
                            m.mql.removeListener(m.listener);
                        }
                    });
                });
            }
        }

        return {
            destroy: function () {
                cleanups.forEach(function (fn) { fn(); });
                cleanups = [];
            }
        };
    }

    return {
        visibleColumns: visibleColumns,
        sortRowsNullsLast: sortRowsNullsLast,
        renderTable: renderTable,
        wireTable: wireTable
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassDataTable;
}
