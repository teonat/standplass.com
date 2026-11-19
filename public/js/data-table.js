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
            // An explicit user choice wins over BOTH the width tier and
            // defaultHidden — users can choose columns at any width
            // (re-enabling a narrow-width-hidden column, hiding an
            // all-widths one). Only when the user hasn't chosen do the
            // tier and defaultHidden act as defaults.
            var user = state.hidden != null && state.hidden[col.key] != null
                ? state.hidden[col.key]
                : null;
            if (user != null) { return !user; }
            if (hiddenByWidth(col, state.widthTier)) { return false; }
            return !col.defaultHidden;
        });
    }

    function sortRowsNullsLast(rows, key, dir, secondaryKey, secondaryDir) {
        // Secondary key (tie-break): a stable pre-pass sorts by the
        // secondary first, the primary second — equal primary values
        // then order by the secondary (e.g. Klassefordeling's Øvelse
        // sort keeps each øvelse's classes alphabetical while the
        // default starts-desc page order stays untouched). Both passes
        // are stable and nulls-last: primary nulls sink to the very
        // end, secondary nulls last within their tie group.
        var input = secondaryKey
            ? sortRowsNullsLast(rows, secondaryKey, secondaryDir || 'asc')
            : rows;
        var withValue = [];
        var nulls = [];
        for (var i = 0; i < input.length; i++) {
            if (input[i][key] == null) { nulls.push(input[i]); } else { withValue.push(input[i]); }
        }
        // All-numeric columns sort through StandplassTable.sortRows (the
        // proven primitive). Columns with any string value — club and
        // shooter names — compare with Norwegian collation (Æ < Ø < Å),
        // matching the site's own name-sort conventions; raw code-point
        // comparison would put Å before Æ and Ø.
        var sign = dir === 'desc' ? -1 : 1;
        var allNumbers = withValue.every(function (r) { return typeof r[key] === 'number'; });
        var sorted = allNumbers
            ? StandplassTable.sortRows(withValue, key, dir)
            : withValue.slice().sort(function (a, b) {
                var av = a[key];
                var bv = b[key];
                if (typeof av === 'number' && typeof bv === 'number') {
                    if (av === bv) { return 0; }
                    return av > bv ? sign : -sign;
                }
                var cmp = String(av).localeCompare(String(bv), 'no');
                return cmp !== 0 ? (cmp > 0 ? sign : -sign) : 0;
            });
        return sorted.concat(nulls);
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

    // The picker affordance for pages that host the button in their own
    // controls row (outside the table's scroll wrap): button + anchor.
    // The anchor is the dropdown's positioning context (position:
    // relative in styles.css); wireTable finds the pair via
    // root.querySelector when it is not in a .dt-toolbar.
    function renderPickerButton(picker) {
        picker = picker || {};
        return '<button type="button" class="dt-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">'
            + esc(picker.buttonLabel || 'Kolonner')
            + '</button><div class="dt-picker-anchor"></div>';
    }

    function renderTable(id, opts, state) {
        opts = opts || {};
        state = state || {};
        var columns = opts.columns || [];
        var rows = opts.rows || [];
        var vis = visibleColumns(columns, state);
        // Row identity → data index, built once per render (a linear
        // scan per row is O(n²) and norgesfelt renders thousands of
        // rows). First occurrence wins for duplicate references — the
        // same semantics the scan had — and rows absent from opts.rows
        // (groupRows-synthesized) read as -1.
        var rowIndex = new Map();
        for (var ri = 0; ri < rows.length; ri++) {
            if (!rowIndex.has(rows[ri])) { rowIndex.set(rows[ri], ri); }
        }
        var sort = state.sort || null;
        // defaultSort only marks the initial aria-sort; rows stay in page
        // order until the page's state.sort says otherwise.
        var ariaSort = sort || opts.defaultSort || null;
        // The sorted column's secondaryKey/secondaryDir (tie-break), if
        // it declares one — resolved once here, consumed by both sort
        // paths below.
        var sortSecondary = null;
        var sortSecondaryDir = null;
        if (sort) {
            for (var scc = 0; scc < columns.length; scc++) {
                if (columns[scc].key === sort.key) {
                    sortSecondary = columns[scc].secondaryKey || null;
                    sortSecondaryDir = columns[scc].secondaryDir || null;
                }
            }
        }

        // Alternating column shading: every other VISIBLE column carrying
        // the same zebraClass gets that class, computed here at render
        // time. Baked absolute positions would strand same-shaded
        // neighbors once the picker (or a width tier) hides columns;
        // counting only the visible ones re-flows the alternation. The
        // class is appended after the static cellClass, reading the same
        // CSS as a baked 'base alt' string would.
        var zebraCount = {};
        var visClass = vis.map(function (col) {
            var cls = colClass(col);
            if (col.zebraClass) {
                zebraCount[col.zebraClass] = (zebraCount[col.zebraClass] || 0) + 1;
                if (zebraCount[col.zebraClass] % 2 === 0) {
                    cls = cls ? cls + ' ' + col.zebraClass : col.zebraClass;
                }
            }
            return cls;
        });

        var headHtml = vis.map(function (col, vi) {
            var cls = visClass[vi];
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
            var cells = vis.map(function (col, vi) {
                var value = cellValue(col, row, renderedIndex);
                var cls = visClass[vi];
                if (col.asRowHeader) {
                    return '<th scope="row"' + (cls ? ' class="' + esc(cls) + '"' : '') + '>'
                        + (col.raw ? value : esc(value)) + '</th>';
                }
                return '<td' + (cls ? ' class="' + esc(cls) + '"' : '') + '>'
                    + (col.raw ? value : esc(value)) + '</td>';
            }).join('');
            var di = rowIndex.has(row) ? rowIndex.get(row) : -1;
            var extra = opts.rowAttrs ? (opts.rowAttrs(row, di) || '') : '';
            return '<tr data-dt-row="' + di + '"' + (extra ? ' ' + extra : '') + '>' + cells + '</tr>';
        }

        var bodyHtml;
        if (opts.groupRows) {
            // Sort applies within groups; group order stays fixed.
            bodyHtml = opts.groupRows(rows).map(function (group) {
                var gRows = sort ? sortRowsNullsLast(group.rows, sort.key, sort.dir, sortSecondary, sortSecondaryDir) : group.rows;
                return '<tr class="dt-group-row"><th scope="colgroup" colspan="' + vis.length + '">' + esc(group.label) + '</th></tr>'
                    + gRows.map(function (r, gi) { return rowHtml(r, gi); }).join('');
            }).join('');
        } else {
            var ordered = sort ? sortRowsNullsLast(rows, sort.key, sort.dir, sortSecondary, sortSecondaryDir) : rows;
            bodyHtml = ordered.map(function (r, i) { return rowHtml(r, i); }).join('');
        }

        var tableHtml = '<table class="' + esc(opts.tableClass || 'ranking-table') + '"'
            + ' data-dt-id="' + esc(id) + '"'
            // Only emit aria-label when there is one: an empty label is an
            // unnamed table exactly like no attribute, but byte-dirt on
            // every consumer with nothing to name.
            + (opts.ariaLabel ? ' aria-label="' + esc(opts.ariaLabel) + '"' : '')
            + '>'
            + '<thead><tr>' + headHtml + '</tr></thead>'
            + '<tbody>' + bodyHtml + '</tbody>'
            + '</table>';

        var toolbar = opts.picker
            ? (opts.picker.toolbar === false
                ? ''
                : '<div class="dt-toolbar">' + renderPickerButton(opts.picker) + '</div>')
            : '';

        return opts.wrapClass
            ? '<div class="' + esc(opts.wrapClass) + '">' + toolbar + tableHtml + '</div>'
            : toolbar + tableHtml;
    }

    // ── Column picker wiring ─────────────────────────────────────────
    // The picker-dropdown half of wireTable, callable WITHOUT a table:
    // a page can host ONE picker (renderPickerButton markup in its own
    // controls row) and wire it against a column spec + shared state.
    // scopeRoot is the element to search for the button + anchor —
    // wireTable passes the toolbar renderTable emitted (when it hosts
    // the picker) or its own root (page-hosted buttons); standalone
    // callers pass their page root. Returns { destroy } or null when no
    // button/anchor is present.
    function wirePicker(scopeRoot, opts, handlers, state) {
        opts = opts || {};
        handlers = handlers || {};
        state = state || {};
        if (typeof scopeRoot.querySelector !== 'function') {
            return null;
        }
        var columns = opts.columns || [];
        // The class is one STYLING of a picker button, the data-dt-picker
        // attribute (which renderPickerButton has always emitted) is the
        // semantic hook — discover either, so a page can style its picker
        // freely (the stevner stats-bar button wears the Fold-alle look
        // and carries no dt-picker-btn class).
        var pickerBtn = scopeRoot.querySelector('.dt-picker-btn, [data-dt-picker]');
        var anchor = scopeRoot.querySelector('.dt-picker-anchor');
        if (!pickerBtn || !anchor) { return null; }
        // Build the panel scaffold with DOM insertion, NEVER an innerHTML
        // assignment: a page may host its BUTTON inside the anchor (the
        // stevner Kolonner button wraps in it, so the dropdown aligns
        // with the button) — an innerHTML wipe would destroy the button a
        // few milliseconds after render. Re-wiring replaces the previous
        // wiring's scaffold first, leaving any other children alone.
        var oldPanel = anchor.querySelector('.checkbox-dropdown-panel');
        if (oldPanel && oldPanel.parentNode === anchor) {
            anchor.removeChild(oldPanel);
        }
        var panel = document.createElement('div');
        panel.className = 'checkbox-dropdown-panel';
        panel.setAttribute('hidden', '');
        panel.setAttribute('role', 'group');
        var clearAllBtn = document.createElement('button');
        clearAllBtn.type = 'button';
        clearAllBtn.className = 'checkbox-dropdown-clear-all';
        clearAllBtn.textContent = 'Nullstill';
        var list = document.createElement('ul');
        list.className = 'checkbox-dropdown-list';
        panel.appendChild(clearAllBtn);
        panel.appendChild(list);
        anchor.appendChild(panel);
        // A checkbox reflects EFFECTIVE visibility — the user's explicit
        // choice, else the tier/default defaults (a narrow-width-hidden
        // column shows unchecked on a phone so it can be re-enabled).
        // runtimeHidden columns are not listed at all: the page hid them
        // because they are useless under the current view, not as a
        // default the user might override.
        function effectivelyHidden(col) {
            var user = state.hidden != null && state.hidden[col.key] != null
                ? state.hidden[col.key]
                : null;
            if (user != null) { return user; }
            return !!(hiddenByWidth(col, state.widthTier) || col.defaultHidden);
        }
        var runtime = state.runtimeHidden || [];
        var listed = columns.filter(function (col) { return runtime.indexOf(col.key) === -1; });
        var dropdown = StandplassFilterWidgets.makeCheckboxDropdown({
            btn: pickerBtn,
            panel: panel,
            list: list,
            clearAllBtn: clearAllBtn,
            labelNone: 'Ingen kolonner',
            getItems: function () {
                return listed.map(function (col) {
                    return { id: col.key, name: col.label };
                });
            },
            getSelected: function () {
                return listed.filter(function (col) { return !effectivelyHidden(col); })
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
        // The picker is a settings control, not a filter readout:
        // keep the button's own label ("Kolonner") instead of the
        // dropdown's selection-count text.
        pickerBtn.textContent = (opts.picker && opts.picker.buttonLabel) || 'Kolonner';
        return { destroy: function () { dropdown.destroy(); } };
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
        // before the table owns the "Kolonner" button and the anchor
        // (scopeRoot = that toolbar, so multiple tables each find their
        // own button); page-hosted buttons are found via the root.
        // Delegates to wirePicker — behavior-neutral for existing
        // consumers.
        if (opts.picker && table) {
            var toolbar = table.previousElementSibling;
            var fromToolbar = toolbar && toolbar.classList && toolbar.classList.contains('dt-toolbar');
            var pickerWire = wirePicker(fromToolbar ? toolbar : root, opts, handlers, state);
            if (pickerWire) { cleanups.push(pickerWire.destroy); }
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
        renderPickerButton: renderPickerButton,
        wirePicker: wirePicker,
        wireTable: wireTable
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassDataTable;
}
