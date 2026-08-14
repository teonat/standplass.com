'use strict';
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

// site-chrome.js is a browser-only IIFE (no module.exports, runs immediately
// against `document`/`window`/`localStorage`). Stub just what it touches,
// load the real source with the stubs in place, then drive it like a user.
function makeEl() {
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
        fire: function (type, evt) {
            (this.listeners[type] || []).forEach(function (fn) { fn(evt); });
        }
    };
    return el;
}

var localStorageStore = {};
global.localStorage = {
    setItem: function (k, v) { localStorageStore[k] = v; },
    getItem: function (k) { return localStorageStore.hasOwnProperty(k) ? localStorageStore[k] : null; }
};

var dropdownBtn = makeEl();
dropdownBtn.setAttribute('aria-expanded', 'false');
var navDropdown = makeEl();
navDropdown.appendChild(dropdownBtn);
var dropdownMenu = makeEl();
dropdownMenu.hidden = true;
navDropdown.appendChild(dropdownMenu);

var modeBtn = makeEl();
modeBtn.setAttribute('aria-pressed', 'false');

var documentEl = makeEl();

var docListeners = {};
global.document = {
    documentElement: documentEl,
    querySelector: function (sel) { return sel === '.nav-dropdown-btn' ? dropdownBtn : null; },
    getElementById: function (id) {
        if (id === 'nav-resultater-menu') { return dropdownMenu; }
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

var src = fs.readFileSync(path.join(__dirname, '../public/js/site-chrome.js'), 'utf8');
new Function(src)();

// Dropdown starts closed.
assert.strictEqual(dropdownBtn.getAttribute('aria-expanded'), 'false');
assert.strictEqual(dropdownMenu.hidden, true);

// Click opens it.
dropdownBtn.fire('click', {});
assert.strictEqual(dropdownBtn.getAttribute('aria-expanded'), 'true');
assert.strictEqual(dropdownMenu.hidden, false);

// Click outside the dropdown closes it.
document.fire('click', { target: makeEl() });
assert.strictEqual(dropdownBtn.getAttribute('aria-expanded'), 'false');
assert.strictEqual(dropdownMenu.hidden, true);

// Click inside the dropdown (e.g. the menu itself) does not trigger the close.
dropdownBtn.fire('click', {}); // reopen
document.fire('click', { target: dropdownMenu });
assert.strictEqual(dropdownBtn.getAttribute('aria-expanded'), 'true', 'click inside should not close via outside-click handler');

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

// Defensively pushes mode to an embed on the same page, if present.
var setModeCalls = [];
window.StandplassEmbed = { setMode: function (m) { setModeCalls.push(m); } };
modeBtn.fire('click', {});
assert.deepStrictEqual(setModeCalls, ['dark']);

// ── Mode resolution (?mode= → localStorage → OS preference) ──────────────
// Re-run the IIFE against a fresh documentElement/button per scenario. The
// key regression guarded here: with the OS in dark mode and no stored choice,
// data-mode must be *written* as "dark" — themes.css's prefers-color-scheme
// fallback already paints dark, so a missing attribute made the toggle read
// "light" and the user's first click a visual no-op.
function resolveMode(search, stored) {
    if (stored == null) { delete localStorageStore.standplass_mode; } else { localStorageStore.standplass_mode = stored; }
    window.location.search = search;
    documentEl = makeEl();
    document.documentElement = documentEl;
    modeBtn = makeEl();
    dropdownBtn.listeners = {};
    dropdownMenu.listeners = {};
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

console.log('site-chrome.test.js: all assertions passed');
