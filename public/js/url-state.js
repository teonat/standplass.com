// public/js/url-state.js
//
// Centralizes the URL-sync on/off + namespacing decision described in
// docs/superpowers/specs/2026-08-14-webcomponent-embed-core-design.md: a
// direct-mount page (namespace: null) always reads/writes the real,
// unnamespaced query string, exactly like before this file existed; an
// embed instance (namespace: <id-or-view>) only touches the real URL when
// syncUrl is true, and does so under a namespaced sp_<namespace>_<param>
// key so it can never collide with the host page's own query params or
// with a second embed instance's state.
var StandplassUrlState = (function () {
    'use strict';

    // The only params any call site currently reads/writes via the URL.
    var TRACKED_PARAMS = ['year', 'klubb', 'person'];

    function createController(config) {
        config = config || {};
        var namespace = config.namespace || null;
        var syncUrl = namespace === null ? true : !!config.syncUrl;
        var memory = {};

        function storageKey(key) {
            return namespace ? ('sp_' + namespace + '_' + key) : key;
        }

        // A plain (unnamespaced) "?key=value" string reflecting the current
        // state of every tracked param -- the shape StandplassPersonModal's
        // parsePersonFromUrl/buildPersonUrl/clearPersonFromUrl already read
        // and return, so those helpers need no changes of their own.
        function getSearch() {
            var out = new URLSearchParams();
            var real = syncUrl ? new URLSearchParams(window.location.search) : null;
            TRACKED_PARAMS.forEach(function (key) {
                var value = syncUrl ? real.get(storageKey(key)) : memory[key];
                if (value != null) { out.set(key, value); }
            });
            var qs = out.toString();
            return qs ? '?' + qs : '';
        }

        // Takes a plain (unnamespaced) query string -- the full desired
        // state of every tracked param, as returned by getSearch() or by
        // StandplassPersonModal's helpers -- and applies it. Any non-tracked
        // param already on the real URL (a host page's own query params) is
        // left alone.
        function setSearch(plainSearch) {
            var plain = new URLSearchParams(plainSearch || '');
            if (syncUrl) {
                var real = new URLSearchParams(window.location.search);
                TRACKED_PARAMS.forEach(function (key) { real.delete(storageKey(key)); });
                TRACKED_PARAMS.forEach(function (key) {
                    var value = plain.get(key);
                    if (value != null) { real.set(storageKey(key), value); }
                });
                var qs = real.toString();
                history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
            } else {
                memory = {};
                TRACKED_PARAMS.forEach(function (key) {
                    var value = plain.get(key);
                    if (value != null) { memory[key] = value; }
                });
            }
        }

        return { getSearch: getSearch, setSearch: setSearch };
    }

    return { createController: createController };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassUrlState;
}
