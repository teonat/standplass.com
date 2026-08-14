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
    // explicit ?mode= wins (the embed contract — see embed.js setMode()),
    // then this browser's stored choice, then the OS preference. The result
    // is *always* written to data-mode, including the OS-preference branch:
    // themes.css's prefers-color-scheme fallback would otherwise paint the
    // page dark with no attribute set, and the toggle's own read of
    // data-mode would then think it was light and waste the first click.
    // An attribute already on <html> can only come from an embed host's
    // set-mode message (felt.html/bane.html's inline handler), which is a
    // fresher choice than anything below it — don't clobber it.
    var mode = document.documentElement.getAttribute('data-mode');
    if (!mode) { mode = new URLSearchParams(window.location.search).get('mode'); }
    if (!mode) {
        try { mode = localStorage.getItem('standplass_mode'); } catch (e) { mode = null; }
    }
    if (!mode) {
        mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
            ? 'dark' : 'light';
    }
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
            if (window.StandplassEmbed) { window.StandplassEmbed.setMode(current); }
        });
    }
})();
