// embed-check/rig.js — shared loader for the embed-check case pages.
// Kept tiny: this rig is QA tooling, not product code — no build step,
// no dependencies. embed.js reads document.currentScript during its own
// synchronous top-level execution, which is also set for dynamically
// inserted tags, so its SELF_ORIGIN still resolves to the origin this
// tag was fetched from.
(function () {
    var origin = new URLSearchParams(location.search).get('origin') || 'http://localhost:8800';
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
