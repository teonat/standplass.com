// public/js/site-chrome.js
(function () {
    'use strict';

    // The header nav can hold more than one dropdown (Resultater,
    // Topplister) alongside a plain link (Terminliste) -- each dropdown
    // opens/closes independently, opening one closes any other that's open,
    // and a click fully outside every dropdown closes them all.
    var navDropdowns = document.querySelectorAll('.nav-dropdown');
    if (navDropdowns.length) {
        var closeDropdown = function (dd) {
            var btn = dd.querySelector('.nav-dropdown-btn');
            var menu = dd.querySelector('.nav-dropdown-menu');
            if (btn) { btn.setAttribute('aria-expanded', 'false'); }
            if (menu) { menu.hidden = true; }
        };
        Array.prototype.forEach.call(navDropdowns, function (dd) {
            var btn = dd.querySelector('.nav-dropdown-btn');
            var menu = dd.querySelector('.nav-dropdown-menu');
            if (!btn || !menu) { return; }
            btn.addEventListener('click', function () {
                var open = btn.getAttribute('aria-expanded') === 'true';
                Array.prototype.forEach.call(navDropdowns, function (other) {
                    if (other !== dd) { closeDropdown(other); }
                });
                btn.setAttribute('aria-expanded', String(!open));
                menu.hidden = open;
            });
        });
        document.addEventListener('click', function (e) {
            Array.prototype.forEach.call(navDropdowns, function (dd) {
                if (!dd.contains(e.target)) { closeDropdown(dd); }
            });
        });
    }

    // Mode resolution runs on every page, before the toggle is wired: an
    // explicit ?mode= wins, then this browser's stored choice, then the
    // OS preference. The result
    // is *always* written to data-mode, including the OS-preference branch:
    // themes.css's prefers-color-scheme fallback would otherwise paint the
    // page dark with no attribute set, and the toggle's own read of
    // data-mode would then think it was light and waste the first click.
    // An already-set attribute is a defensive re-entry guard -- nothing
    // currently sets data-mode before this runs, since this phase deletes
    // the old postMessage set-mode handshake, but re-resolving should never
    // clobber a value something set on purpose.
    var storedMode;
    try { storedMode = localStorage.getItem('standplass_mode'); } catch (e) { storedMode = null; }
    var mode = StandplassModeResolve.resolveMode({
        attrMode: document.documentElement.getAttribute('data-mode'),
        explicitMode: new URLSearchParams(window.location.search).get('mode'),
        stored: storedMode,
        prefersDark: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : null
    });
    document.documentElement.setAttribute('data-mode', mode);

    var modeBtn = document.getElementById('site-mode-toggle');
    if (modeBtn) {
        var current = mode;
        modeBtn.setAttribute('aria-pressed', String(current === 'dark'));
        modeBtn.addEventListener('click', function () {
            current = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-mode', current);
            modeBtn.setAttribute('aria-pressed', String(current === 'dark'));
            try { localStorage.setItem('standplass_mode', current); } catch (e) { /* ignore */ }
        });
    }

    // Analytics (GoatCounter) -- only on the real production domain, same
    // hostname guard the source uses for its own tag, so a local dev server
    // or any other host serving this same public/ directory never counts.
    // One shared check here rather than duplicating the inline guard into
    // every page's own <head> like the source does, since this file (unlike
    // that one) already loads on every page.
    if (/^standplass\.com$/.test(window.location.hostname)) {
        var gc = document.createElement('script');
        gc.async = true;
        gc.src = '//gc.zgo.at/count.js';
        gc.setAttribute('data-goatcounter', 'https://standplass.goatcounter.com/count');
        document.head.appendChild(gc);
    }
})();
