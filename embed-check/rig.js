// embed-check/rig.js — shared loader for the embed-check case pages.
// Kept tiny: this rig is QA tooling, not product code — no build step,
// no dependencies. embed.js reads document.currentScript during its own
// synchronous top-level execution, which is also set for dynamically
// inserted tags, so its SELF_ORIGIN still resolves to the origin this
// tag was fetched from.
(function () {
    var raw = new URLSearchParams(location.search).get('origin') || 'http://localhost:8800';
    // The rig loads embed.js from a developer-chosen origin (default:
    // the local dev server on :8800; ?origin=https://standplass.com
    // runs the genuine third-party check against production). That
    // query param is attacker-controllable input on any page, so it
    // is validated before it becomes a script src: parse it as a URL
    // and allow https: anywhere, http: only for localhost (the local
    // dev server is plain http by nature). Anything else falls back
    // to the local default.
    var u;
    try { u = new URL(raw); } catch (e) { u = new URL('http://localhost:8800'); }
    if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) {
        u = new URL('http://localhost:8800');
    }
    var origin = u.origin;
    var originEl = document.getElementById('embed-origin');
    if (originEl) { originEl.textContent = origin; }
    var status = document.getElementById('embed-status');
    var s = document.createElement('script');
    s.src = origin + '/embed.js';
    s.onload = function () {
        if (status) { status.textContent = 'embed.js lastet fra ' + origin; }
    };
    s.onerror = function () {
        if (status) {
            status.textContent = 'Kunne ikke laste ' + origin + '/embed.js — er riktig server oppe? (standard: "just start" på :8800)';
            status.className = 'embed-error';
        }
    };
    document.head.appendChild(s);
})();
