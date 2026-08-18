var StandplassFilterWidgets = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function hideList(listEl) {
        listEl.hidden = true;
        listEl.innerHTML = '';
    }

    // items: [{ id, name }] or [{ isGroup: true, name }]
    function renderList(listEl, items) {
        if (!items || !items.length) { hideList(listEl); return false; }
        listEl.innerHTML = '';
        items.forEach(function (item) {
            var li = document.createElement('li');
            if (item.isGroup) {
                li.className = 'autocomplete-group';
                li.setAttribute('aria-hidden', 'true');
                li.textContent = item.name;
            } else {
                li.setAttribute('data-id', item.id);
                li.setAttribute('data-name', item.name);
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', 'false');
                li.textContent = item.name;
            }
            listEl.appendChild(li);
        });
        listEl.hidden = false;
        listEl.style.display = '';
        return true;
    }

    // Wires up a full ARIA combobox pattern (focus, input, keyboard, blur, click, clear).
    // cfg: { input, list, clear, getItems(query), restoreOnBlur(), onSelect(id, name), onClear(manual?) }
    function makeComboHandlers(cfg) {
        var activeIndex = -1;
        var idPrefix    = cfg.input.id + '-opt-';

        function getOpts() {
            return Array.prototype.slice.call(cfg.list.querySelectorAll('li[data-id]'));
        }

        function markActive(opts, idx) {
            activeIndex = idx;
            opts.forEach(function (li, i) {
                li.setAttribute('aria-selected', i === idx ? 'true' : 'false');
                if (i === idx) li.scrollIntoView({ block: 'nearest' });
            });
            if (idx >= 0 && opts[idx]) {
                cfg.input.setAttribute('aria-activedescendant', opts[idx].id);
            } else {
                cfg.input.removeAttribute('aria-activedescendant');
            }
        }

        function openList(query) {
            var shown = renderList(cfg.list, cfg.getItems(query));
            cfg.input.setAttribute('aria-expanded', shown ? 'true' : 'false');
            activeIndex = -1;
            cfg.input.removeAttribute('aria-activedescendant');
            // Assign stable IDs so aria-activedescendant can reference them
            getOpts().forEach(function (li, i) { li.id = idPrefix + i; });
        }

        function closeList() {
            hideList(cfg.list);
            cfg.input.setAttribute('aria-expanded', 'false');
            cfg.input.removeAttribute('aria-activedescendant');
            activeIndex = -1;
        }

        cfg.input.addEventListener('focus', function () {
            var q = cfg.input.value === cfg.restoreOnBlur() ? '' : cfg.input.value;
            openList(q);
        });

        cfg.input.addEventListener('input', function () {
            openList(cfg.input.value);
            if (!cfg.input.value.trim()) cfg.onClear();
        });

        cfg.input.addEventListener('keydown', function (e) {
            var opts, idx;
            if (e.key === 'Escape') {
                closeList();
                cfg.input.value = cfg.restoreOnBlur();
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (cfg.list.hidden) { openList(cfg.input.value); return; }
                opts = getOpts();
                if (!opts.length) return;
                if (e.key === 'ArrowDown') {
                    idx = activeIndex < opts.length - 1 ? activeIndex + 1 : opts.length - 1;
                } else {
                    idx = activeIndex > 0 ? activeIndex - 1 : (activeIndex === -1 ? opts.length - 1 : -1);
                }
                markActive(opts, idx);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                opts = getOpts();
                if (activeIndex >= 0 && opts[activeIndex]) {
                    var li = opts[activeIndex];
                    cfg.onSelect(li.getAttribute('data-id'), li.getAttribute('data-name'));
                    closeList();
                }
                return;
            }
        });

        cfg.input.addEventListener('blur', function () {
            setTimeout(function () {
                closeList();
                cfg.input.value = cfg.restoreOnBlur();
            }, 200);
        });

        cfg.list.addEventListener('mousedown', function (e) {
            if (e.target.closest('li[data-id]')) e.preventDefault();
        });

        cfg.list.addEventListener('click', function (e) {
            var li = e.target.closest('li[data-id]');
            if (!li) return;
            cfg.onSelect(li.getAttribute('data-id'), li.getAttribute('data-name'));
            closeList();
        });

        cfg.clear.addEventListener('mousedown', function (e) {
            e.preventDefault();
        });

        cfg.clear.addEventListener('click', function () {
            cfg.input.value = '';
            cfg.onClear(true);
            var input = cfg.input;
            setTimeout(function () {
                input.focus();
                openList('');
            }, 0);
        });
    }

    // Wires up a checkbox dropdown (click-outside, Escape, rebuild).
    // cfg: { btn, panel, list, clearAllBtn, getItems(), getSelected(), labelNone,
    //        onToggle(id, name, checked), onClearAll(), searchable? }
    // Returns: { rebuild() }
    function makeCheckboxDropdown(cfg) {
        var searchQuery   = '';
        var searchInputEl = null;

        function updateLabel() {
            var selected = cfg.getSelected();
            if (!selected.length) {
                cfg.btn.textContent = cfg.labelNone;
                return;
            }
            if (selected.length <= 2) {
                var names = [];
                var items = cfg.getItems();
                for (var i = 0; i < items.length; i++) {
                    if (selected.indexOf(items[i].id) >= 0) names.push(items[i].name);
                }
                cfg.btn.textContent = names.join(', ');
            } else {
                cfg.btn.textContent = selected.length + ' valgt';
            }
        }

        function buildList(query) {
            cfg.list.innerHTML = '';
            var q = (query || '').trim().toLowerCase();
            var items = cfg.getItems();
            var filtered = q ? items.filter(function (item) {
                return item.name.toLowerCase().indexOf(q) >= 0;
            }) : items;
            var selected = cfg.getSelected();

            if (!filtered.length) {
                var empty = document.createElement('li');
                empty.className = 'checkbox-dropdown-no-results';
                empty.textContent = q ? 'Ingen treff' : cfg.labelNone;
                cfg.list.appendChild(empty);
                return;
            }

            filtered.forEach(function (item) {
                var li = document.createElement('li');
                var label = document.createElement('label');
                var input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = selected.indexOf(item.id) >= 0;
                input.addEventListener('change', function () {
                    cfg.onToggle(item.id, item.name, input.checked);
                });
                var span = document.createElement('span');
                span.textContent = item.name;
                label.appendChild(input);
                label.appendChild(span);
                li.appendChild(label);
                cfg.list.appendChild(li);
            });
        }

        function openPanel() {
            searchQuery = '';
            if (searchInputEl) searchInputEl.value = '';
            buildList('');
            cfg.panel.removeAttribute('hidden');
            cfg.btn.setAttribute('aria-expanded', 'true');
            if (searchInputEl) setTimeout(function () { searchInputEl.focus(); }, 0);
        }

        function closePanel() {
            cfg.panel.setAttribute('hidden', '');
            cfg.btn.setAttribute('aria-expanded', 'false');
            searchQuery = '';
            if (searchInputEl) searchInputEl.value = '';
        }

        function rebuild() {
            var items = cfg.getItems();
            if (!items.length) {
                cfg.btn.disabled = true;
                cfg.btn.textContent = cfg.labelNone;
            } else {
                cfg.btn.disabled = false;
                updateLabel();
            }
            if (!cfg.panel.hasAttribute('hidden')) buildList(searchQuery);
        }

        // Optional search input at top of panel
        if (cfg.searchable) {
            searchInputEl = document.createElement('input');
            searchInputEl.type = 'text';
            searchInputEl.className = 'checkbox-dropdown-search';
            searchInputEl.setAttribute('placeholder', 'Filtrer…');
            searchInputEl.setAttribute('aria-label', 'Filtrer valg');
            searchInputEl.setAttribute('autocomplete', 'off');
            cfg.panel.insertBefore(searchInputEl, cfg.clearAllBtn);

            searchInputEl.addEventListener('input', function () {
                searchQuery = searchInputEl.value;
                buildList(searchQuery);
            });

            // Escape clears search if non-empty; otherwise falls through to panel handler (closes)
            searchInputEl.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && searchQuery) {
                    e.stopPropagation();
                    searchQuery = '';
                    searchInputEl.value = '';
                    buildList('');
                }
            });
        }

        cfg.btn.addEventListener('click', function () {
            if (cfg.btn.disabled) return;
            if (cfg.panel.hasAttribute('hidden')) {
                openPanel();
            } else {
                closePanel();
                cfg.btn.focus();
            }
        });

        cfg.clearAllBtn.addEventListener('click', function () {
            cfg.onClearAll();
        });

        cfg.panel.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closePanel();
                cfg.btn.focus();
            }
        });

        var wrapper = cfg.btn.parentElement;
        // getRootNode(), not document: click is composed, so a document-level
        // listener sees e.target retargeted to the shadow host and
        // wrapper.contains() is then always false -- closing the panel on
        // every click, including the one that opened it. Inside a shadow tree
        // events aren't retargeted, and outside one this is document.
        cfg.btn.getRootNode().addEventListener('click', function (e) {
            if (!wrapper.contains(e.target)) {
                closePanel();
            }
        });

        return { rebuild: rebuild };
    }

    // Wires up a multi-select tag combobox (search → add chip, × to remove).
    // cfg: { input, list, tagsEl, clear, getItems(q), getSelected(), labelPlaceholder,
    //        onSelect(id, name), onRemove(id), onClearAll() }
    // Returns: { rebuild(), clearAll() }
    function makeTagComboHandlers(cfg) {
        var activeIndex = -1;
        var idPrefix    = cfg.input.id + '-opt-';

        function getOpts() {
            return Array.prototype.slice.call(cfg.list.querySelectorAll('li[data-id]'));
        }

        function markActive(opts, idx) {
            activeIndex = idx;
            opts.forEach(function (li, i) {
                li.setAttribute('aria-selected', i === idx ? 'true' : 'false');
                if (i === idx) li.scrollIntoView({ block: 'nearest' });
            });
            if (idx >= 0 && opts[idx]) {
                cfg.input.setAttribute('aria-activedescendant', opts[idx].id);
            } else {
                cfg.input.removeAttribute('aria-activedescendant');
            }
        }

        function openList(query) {
            var shown = renderList(cfg.list, cfg.getItems(query));
            cfg.input.setAttribute('aria-expanded', shown ? 'true' : 'false');
            activeIndex = -1;
            cfg.input.removeAttribute('aria-activedescendant');
            getOpts().forEach(function (li, i) { li.id = idPrefix + i; });
        }

        function closeList() {
            hideList(cfg.list);
            cfg.input.setAttribute('aria-expanded', 'false');
            cfg.input.removeAttribute('aria-activedescendant');
            activeIndex = -1;
        }

        function syncClearBtn() {
            var wrap = cfg.input.closest('.autocomplete-wrap');
            if (wrap) {
                var hasValue = cfg.getSelected().length > 0;
                wrap.classList.toggle('autocomplete-wrap--has-value', hasValue);
            }
        }

        function buildTags() {
            cfg.tagsEl.innerHTML = '';
            cfg.getSelected().forEach(function (item) {
                var li = document.createElement('li');
                li.className = 'tag-item';
                li.dataset.id = item.id;
                var span = document.createElement('span');
                span.textContent = item.name;
                li.appendChild(span);
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tag-item-remove';
                btn.setAttribute('aria-label', 'Fjern ' + esc(item.name));
                btn.innerHTML = '&times;';
                li.appendChild(btn);
                cfg.tagsEl.appendChild(li);
            });
        }

        // After onRemove is called and rebuild() runs, we need to re-focus.
        // We do this by storing intent before removal.
        cfg.tagsEl.addEventListener('click', function (e) {
            var removeBtn = e.target.closest('.tag-item-remove');
            if (!removeBtn) return;
            var li = removeBtn.closest('.tag-item');
            var nextLi = li ? li.nextElementSibling : null;
            var prevLi = li ? li.previousElementSibling : null;
            cfg.onRemove(li.dataset.id);
            // Focus target after rebuild; use requestAnimationFrame so DOM updates first
            var focusTarget = (nextLi && nextLi.querySelector('.tag-item-remove')) ||
                              (prevLi && prevLi.querySelector('.tag-item-remove')) ||
                              cfg.input;
            // The actual element refs become stale after rebuild(), so query fresh
            var itemId = nextLi ? nextLi.dataset.id : (prevLi ? prevLi.dataset.id : null);
            setTimeout(function () {
                if (itemId) {
                    var freshLi = cfg.tagsEl.querySelector('[data-id="' + itemId + '"]');
                    if (freshLi) { freshLi.querySelector('.tag-item-remove').focus(); return; }
                }
                cfg.input.focus();
            }, 0);
        });

        function rebuild() {
            buildTags();
            syncClearBtn();
        }

        function clearAll() {
            cfg.onClearAll();
        }

        cfg.input.addEventListener('focus', function () {
            openList(cfg.input.value);
        });

        cfg.input.addEventListener('input', function () {
            openList(cfg.input.value);
        });

        cfg.input.addEventListener('keydown', function (e) {
            var opts, idx;
            if (e.key === 'Escape') {
                closeList();
                cfg.input.value = '';
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (cfg.list.hidden) { openList(cfg.input.value); return; }
                opts = getOpts();
                if (!opts.length) return;
                if (e.key === 'ArrowDown') {
                    idx = activeIndex < opts.length - 1 ? activeIndex + 1 : opts.length - 1;
                } else {
                    idx = activeIndex > 0 ? activeIndex - 1 : (activeIndex === -1 ? opts.length - 1 : -1);
                }
                markActive(opts, idx);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                opts = getOpts();
                if (activeIndex >= 0 && opts[activeIndex]) {
                    var li = opts[activeIndex];
                    cfg.onSelect(li.getAttribute('data-id'), li.getAttribute('data-name'));
                    cfg.input.value = '';
                    openList('');
                }
                return;
            }
        });

        cfg.input.addEventListener('blur', function () {
            setTimeout(function () {
                closeList();
                cfg.input.value = '';
            }, 200);
        });

        cfg.list.addEventListener('mousedown', function (e) {
            if (e.target.closest('li[data-id]')) e.preventDefault();
        });

        cfg.list.addEventListener('click', function (e) {
            var li = e.target.closest('li[data-id]');
            if (!li) return;
            cfg.onSelect(li.getAttribute('data-id'), li.getAttribute('data-name'));
            cfg.input.value = '';
            openList('');
        });

        if (cfg.clear) {
            cfg.clear.addEventListener('mousedown', function (e) { e.preventDefault(); });
            cfg.clear.addEventListener('click', function () {
                cfg.onClearAll();
                cfg.input.value = '';
                setTimeout(function () { cfg.input.focus(); openList(''); }, 0);
            });
        }

        return { rebuild: rebuild, clearAll: clearAll };
    }

    // A single "clear all" button for a page's whole filter bar. Each
    // individual filter widget above already has its own clear path (a
    // checkbox dropdown's "Fjern alle", a tag combo's clear ×) that resets
    // its own state *and* re-renders on its own -- calling all of those
    // independently would re-render once per filter. This instead resets
    // every filter's state via a page-supplied array of plain callbacks,
    // rebuilds every affected widget once, then re-renders exactly once via
    // onDone. Kept generic (plain callback/handle arrays, no felt/bane- or
    // filter-shape-specific knowledge) so any future view's filter bar --
    // not just this one -- can wire the same button instead of hand-writing
    // a bespoke per-page reset function.
    function wireClearAllFilters(btn, resets, widgets, onDone) {
        btn.addEventListener('click', function () {
            resets.forEach(function (fn) { fn(); });
            widgets.forEach(function (w) { w.rebuild(); });
            onDone();
        });
    }

    return {
        esc: esc,
        renderList: renderList,
        hideList: hideList,
        makeComboHandlers: makeComboHandlers,
        makeCheckboxDropdown: makeCheckboxDropdown,
        makeTagComboHandlers: makeTagComboHandlers,
        wireClearAllFilters: wireClearAllFilters
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassFilterWidgets;
}
