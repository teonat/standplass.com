// public/js/site-chrome.js
(function () {
    'use strict';

    var dropdownBtn = document.querySelector('.nav-dropdown-btn');
    var dropdownMenu = document.getElementById('nav-resultater-menu');
    if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', function () {
            var open = dropdownBtn.getAttribute('aria-expanded') === 'true';
            dropdownBtn.setAttribute('aria-expanded', String(!open));
            dropdownMenu.hidden = open;
        });
        document.addEventListener('click', function (e) {
            if (!dropdownBtn.parentElement.contains(e.target)) {
                dropdownBtn.setAttribute('aria-expanded', 'false');
                dropdownMenu.hidden = true;
            }
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
