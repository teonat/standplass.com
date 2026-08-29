'use strict';
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

// site-chrome.js is a browser-only IIFE (no module.exports, runs immediately
// against `document`/`window`/`localStorage`). Stub just what it touches,
// load the real source with the stubs in place, then drive it like a user.
function makeEl(className) {
    var el = {
        attrs: {},
        hidden: false,
        listeners: {},
        parentElement: null,
        children: [],
        setAttribute: function (k, v) { this.attrs[k] = String(v); },
        getAttribute: function (k) { return this.attrs.hasOwnProperty(k) ? this.attrs[k] : null; },
        addEventListener: function (type, fn) {
            (this.listeners[type] = this.listeners[type] || []).push(fn);
        },
        contains: function (other) {
            if (other === this) { return true; }
            for (var i = 0; i < this.children.length; i++) {
                if (this.children[i] === other || this.children[i].contains(other)) { return true; }
            }
            return false;
        },
        appendChild: function (c) { c.parentElement = this; this.children.push(c); },
        // Minimal single-class-selector match over descendants -- enough for
        // this file's own '.nav-dropdown-btn'/'.nav-dropdown-menu' lookups,
        // not a real CSS selector engine.
        querySelector: function (sel) {
            var cls = sel.replace(/^\./, '');
            for (var i = 0; i < this.children.length; i++) {
                var c = this.children[i];
                if ((c.attrs['class'] || '').split(/\s+/).indexOf(cls) !== -1) { return c; }
                var found = c.querySelector(sel);
                if (found) { return found; }
            }
            return null;
        },
        fire: function (type, evt) {
            (this.listeners[type] || []).forEach(function (fn) { fn(evt); });
        }
    };
    if (className) { el.attrs['class'] = className; }
    return el;
}

var localStorageStore = {};
global.localStorage = {
    setItem: function (k, v) { localStorageStore[k] = v; },
    getItem: function (k) { return localStorageStore.hasOwnProperty(k) ? localStorageStore[k] : null; }
};

// Two independent dropdowns (Resultater / Topplister), matching the real
// header markup -- site-chrome.js finds each one's own button/menu via
// querySelector on the .nav-dropdown container, not a page-wide singleton.
function makeDropdown() {
    var dd = makeEl('nav-dropdown');
    var btn = makeEl('nav-dropdown-btn');
    btn.setAttribute('aria-expanded', 'false');
    dd.appendChild(btn);
    var menu = makeEl('nav-dropdown-menu');
    menu.hidden = true;
    dd.appendChild(menu);
    return { dd: dd, btn: btn, menu: menu };
}

var d1 = makeDropdown();
var d2 = makeDropdown();

var modeBtn = makeEl();
modeBtn.setAttribute('aria-pressed', 'false');

var documentEl = makeEl();

var docListeners = {};
global.document = {
    documentElement: documentEl,
    querySelectorAll: function (sel) { return sel === '.nav-dropdown' ? [d1.dd, d2.dd] : []; },
    getElementById: function (id) {
        if (id === 'site-mode-toggle') { return modeBtn; }
        return null;
    },
    addEventListener: function (type, fn) {
        (docListeners[type] = docListeners[type] || []).push(fn);
    },
    fire: function (type, evt) {
        (docListeners[type] || []).forEach(function (fn) { fn(evt); });
    }
};
var prefersDark = false;
global.window = {
    location: { search: '', pathname: '/' },
    matchMedia: function (q) {
        return { matches: prefersDark && q === '(prefers-color-scheme: dark)' };
    }
};

global.StandplassModeResolve = require('../public/js/mode-resolve.js');

var src = fs.readFileSync(path.join(__dirname, '../public/js/site-chrome.js'), 'utf8');
new Function(src)();

// Both dropdowns start closed.
assert.strictEqual(d1.btn.getAttribute('aria-expanded'), 'false');
assert.strictEqual(d1.menu.hidden, true);
assert.strictEqual(d2.btn.getAttribute('aria-expanded'), 'false');
assert.strictEqual(d2.menu.hidden, true);

// Click opens its own dropdown; the other stays closed.
d1.btn.fire('click', {});
assert.strictEqual(d1.btn.getAttribute('aria-expanded'), 'true');
assert.strictEqual(d1.menu.hidden, false);
assert.strictEqual(d2.btn.getAttribute('aria-expanded'), 'false');
assert.strictEqual(d2.menu.hidden, true);

// Opening the second dropdown closes the first.
d2.btn.fire('click', {});
assert.strictEqual(d2.btn.getAttribute('aria-expanded'), 'true');
assert.strictEqual(d2.menu.hidden, false);
assert.strictEqual(d1.btn.getAttribute('aria-expanded'), 'false', 'opening one dropdown closes the other');
assert.strictEqual(d1.menu.hidden, true);

// Click outside every dropdown closes them all.
document.fire('click', { target: makeEl() });
assert.strictEqual(d2.btn.getAttribute('aria-expanded'), 'false');
assert.strictEqual(d2.menu.hidden, true);

// Click inside an open dropdown's own menu does not close it.
d1.btn.fire('click', {}); // reopen d1
document.fire('click', { target: d1.menu });
assert.strictEqual(d1.btn.getAttribute('aria-expanded'), 'true', 'click inside should not close via outside-click handler');
d1.btn.fire('click', {}); // close it again for a clean state below

// Mode toggle: light -> dark, persisted, aria-pressed flips; then back.
assert.strictEqual(modeBtn.getAttribute('aria-pressed'), 'false');
modeBtn.fire('click', {});
assert.strictEqual(documentEl.getAttribute('data-mode'), 'dark');
assert.strictEqual(modeBtn.getAttribute('aria-pressed'), 'true');
assert.strictEqual(localStorage.getItem('standplass_mode'), 'dark');
modeBtn.fire('click', {});
assert.strictEqual(documentEl.getAttribute('data-mode'), 'light');
assert.strictEqual(modeBtn.getAttribute('aria-pressed'), 'false');
assert.strictEqual(localStorage.getItem('standplass_mode'), 'light');

// ── Mode resolution (?mode= → localStorage → OS preference) ──────────────
// Re-run the IIFE against a fresh documentElement/button per scenario. The
// key regression guarded here: with the OS in dark mode and no stored choice,
// data-mode must be *written* as "dark" — themes.css's prefers-color-scheme
// fallback already paints dark, so a missing attribute made the toggle read
// "light" and the user's first click a visual no-op.
function resetDropdowns() {
    [d1, d2].forEach(function (d) {
        d.btn.listeners = {};
        d.menu.listeners = {};
        d.btn.setAttribute('aria-expanded', 'false');
        d.menu.hidden = true;
    });
}

function resolveMode(search, stored) {
    if (stored == null) { delete localStorageStore.standplass_mode; } else { localStorageStore.standplass_mode = stored; }
    window.location.search = search;
    documentEl = makeEl();
    document.documentElement = documentEl;
    modeBtn = makeEl();
    resetDropdowns();
    docListeners.click = [];
    new Function(src)();
    return { mode: documentEl.getAttribute('data-mode'), pressed: modeBtn.getAttribute('aria-pressed') };
}

prefersDark = true;
assert.deepStrictEqual(resolveMode('', null), { mode: 'dark', pressed: 'true' }, 'OS dark preference must be written to data-mode');
assert.deepStrictEqual(resolveMode('?mode=light', 'dark'), { mode: 'light', pressed: 'false' }, '?mode= wins over stored');
assert.deepStrictEqual(resolveMode('', 'light'), { mode: 'light', pressed: 'false' }, 'stored wins over OS preference');
prefersDark = false;
assert.deepStrictEqual(resolveMode('', null), { mode: 'light', pressed: 'false' }, 'OS light falls through to light');
assert.deepStrictEqual(resolveMode('?mode=dark', null), { mode: 'dark', pressed: 'true' }, '?mode=dark honoured');

// First click flips visibly when starting from an OS-dark load.
prefersDark = true;
resolveMode('', null);
modeBtn.fire('click', {});
assert.strictEqual(documentEl.getAttribute('data-mode'), 'light', 'first click must flip, not no-op');

// ── Analytics (GoatCounter) hostname guard ────────────────────────────────
// Only ever injected on the real production domain -- a local dev server or
// any other host serving this same public/ directory must not count hits.
function runOnHost(hostname) {
    var created = [];
    documentEl = makeEl();
    var head = { appendChild: function (el) { created.push(el); } };
    document.documentElement = documentEl;
    document.head = head;
    document.createElement = function () { return makeEl(); };
    modeBtn = makeEl();
    resetDropdowns();
    docListeners.click = [];
    window.location.hostname = hostname;
    new Function(src)();
    return created;
}

assert.strictEqual(runOnHost('localhost').length, 0, 'no analytics script on a local dev server');
assert.strictEqual(runOnHost('example.com').length, 0, 'no analytics script on an unrelated host');
var prodScripts = runOnHost('standplass.com');
assert.strictEqual(prodScripts.length, 1, 'analytics script injected on the real production domain');
assert.strictEqual(prodScripts[0].getAttribute('data-goatcounter'), 'https://standplass.goatcounter.com/count');
assert.strictEqual(prodScripts[0].src, '//gc.zgo.at/count.js');
assert.strictEqual(prodScripts[0].async, true);

console.log('site-chrome.test.js: all assertions passed');
