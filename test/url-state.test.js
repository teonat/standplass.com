'use strict';
var assert = require('node:assert');
var StandplassUrlState = require('../public/js/url-state.js');

global.window = { location: { search: '', pathname: '/felt' } };
global.history = {
    replaceState: function (state, title, url) {
        var qIdx = url.indexOf('?');
        window.location.search = qIdx === -1 ? '' : url.slice(qIdx);
        window.location.pathname = qIdx === -1 ? url : window.location.pathname;
    }
};

function get(search, key) { return new URLSearchParams(search).get(key); }

// Direct-mount: namespace null, always synced, unnamespaced keys -- matches
// today's plain window.location.search / history.replaceState behavior.
window.location.search = '';
var direct = StandplassUrlState.createController({ namespace: null });
assert.strictEqual(direct.getSearch(), '');
direct.setSearch('?year=2024');
assert.strictEqual(get(window.location.search, 'year'), '2024');
assert.strictEqual(get(direct.getSearch(), 'year'), '2024');
direct.setSearch('?year=2024&klubb=eksempel');
assert.strictEqual(get(window.location.search, 'klubb'), 'eksempel');
assert.strictEqual(get(window.location.search, 'year'), '2024');

// A non-tracked param already on the real URL (a host's own query string,
// or standplass's own ?club=/?mode=) must survive setSearch() untouched.
window.location.search = '?utm_source=nyhetsbrev';
var withForeignParam = StandplassUrlState.createController({ namespace: null });
withForeignParam.setSearch('?year=2025');
assert.strictEqual(get(window.location.search, 'utm_source'), 'nyhetsbrev', 'a foreign query param must not be dropped');
assert.strictEqual(get(window.location.search, 'year'), '2025');

// Embed, sync-url off: state lives in memory only, the real URL never touched.
window.location.search = '';
var embedOff = StandplassUrlState.createController({ namespace: 'felt', syncUrl: false });
embedOff.setSearch('?person=42&year=2025');
assert.strictEqual(window.location.search, '', 'sync-url off must never touch the real URL');
assert.strictEqual(get(embedOff.getSearch(), 'person'), '42');
assert.strictEqual(get(embedOff.getSearch(), 'year'), '2025');

// Embed, sync-url on: state is namespaced, so two instances never collide.
window.location.search = '';
var embedA = StandplassUrlState.createController({ namespace: 'felt-a', syncUrl: true });
var embedB = StandplassUrlState.createController({ namespace: 'felt-b', syncUrl: true });
embedA.setSearch('?person=1');
embedB.setSearch('?person=2');
assert.strictEqual(get(window.location.search, 'sp_felt-a_person'), '1');
assert.strictEqual(get(window.location.search, 'sp_felt-b_person'), '2');
assert.strictEqual(get(embedA.getSearch(), 'person'), '1');
assert.strictEqual(get(embedB.getSearch(), 'person'), '2');

// Clearing: setSearch('') removes every tracked param for that controller
// (matches StandplassPersonModal.clearPersonFromUrl's return shape) without
// touching the other controller's namespaced params.
embedA.setSearch('');
assert.strictEqual(get(window.location.search, 'sp_felt-a_person'), null);
assert.strictEqual(get(window.location.search, 'sp_felt-b_person'), '2', 'clearing one instance must not affect another');

// tab/group/disc/name filters are also tracked, same as year/klubb/person.
window.location.search = '';
var filters = StandplassUrlState.createController({ namespace: null });
filters.setSearch('?year=2025&tab=klasse&group=poeng&disc=Grovfelt&name=Ola');
var qs = new URLSearchParams(filters.getSearch());
assert.strictEqual(qs.get('tab'), 'klasse');
assert.strictEqual(qs.get('group'), 'poeng');
assert.strictEqual(qs.get('disc'), 'Grovfelt');
assert.strictEqual(qs.get('name'), 'Ola');

// organizer/comp filters are also tracked, same as the others above.
filters.setSearch('?organizer=Klubb%20A&comp=h%C3%B8st');
var qs2 = new URLSearchParams(filters.getSearch());
assert.strictEqual(qs2.get('organizer'), 'Klubb A');
assert.strictEqual(qs2.get('comp'), 'høst');

// norgesfelt's own new params -- tab/disc are already shared with other
// pages, type/q/clubs are new to this file.
var c5 = StandplassUrlState.createController({ namespace: null });
assert.ok(c5); // controller creation must not throw once these are tracked
var qsBefore = new URLSearchParams();
qsBefore.set('type', 'total');
qsBefore.set('q', 'ola');
qsBefore.set('clubs', 'Oslo%20Pistolklubb,Bergen%20Pistolklubb');
c5.setSearch('?' + qsBefore.toString());
var qsAfter = new URLSearchParams(c5.getSearch());
assert.strictEqual(qsAfter.get('type'), 'total', 'type must round-trip');
assert.strictEqual(qsAfter.get('q'), 'ola', 'q must round-trip');
assert.strictEqual(qsAfter.get('clubs'), 'Oslo%20Pistolklubb,Bergen%20Pistolklubb', 'clubs must round-trip untouched -- url-state.js treats it as an opaque string');

console.log('url-state.test.js: all assertions passed');
