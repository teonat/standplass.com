// public/js/mode-resolve.js
//
// Shared dark/light resolution algorithm, used by both the direct-mount
// pages (via site-chrome.js) and the embed custom element (public/embed.js)
// -- extracted so both apply the exact same precedence and default instead
// of keeping two copies in sync. Has no dependencies, so it loads first.
var StandplassModeResolve = (function () {
    'use strict';

    // Precedence: an already-set attribute (a defensive re-entry guard --
    // nothing currently sets data-mode before this runs, since this phase
    // deletes the old postMessage set-mode handshake, but re-resolving
    // should never clobber a value something set on purpose) > an explicit
    // mode source (?mode= for direct-mount, the mode="" attribute for an
    // embed) > a previously stored choice > OS preference > fallback.
    //
    // prefersDark is true/false when matchMedia resolved a preference, or
    // null when matchMedia itself isn't supported -- only that last case
    // reaches `fallback`, which defaults to 'dark' (never light-by-accident).
    function resolveMode(config) {
        config = config || {};
        if (config.attrMode) { return config.attrMode; }
        if (config.explicitMode) { return config.explicitMode; }
        if (config.stored) { return config.stored; }
        if (config.prefersDark === true) { return 'dark'; }
        if (config.prefersDark === false) { return 'light'; }
        return config.fallback || 'dark';
    }

    return { resolveMode: resolveMode };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassModeResolve;
}
