// public/js/nsf-orgs.js
//
// Resolves an arbitrary ?klubb= club name to its NSF org GUID at runtime,
// via nsfapi.azurewebsites.net/organization -- the source repo's
// resultatliste-klubb.js never needed this (it hardcodes its own club's
// GUID), but standplass.com is club-neutral. See
// docs/superpowers/nsf-skyting-api-reference.md's "GET /organization"
// section for the response shape (a flat array, unlike branchlist) and
// docs/superpowers/specs/2026-08-29-klubb-view-design.md's "Org GUID
// resolution" section for the caching design.
var StandplassNsfOrgs = (function () {
    'use strict';

    var ORG_URL = 'https://nsfapi.azurewebsites.net/organization?pageSize=600';
    var CACHE_KEY = 'standplass_nsf_orgs';
    var TTL_MS = 24 * 60 * 60 * 1000;

    function normalize(s) {
        return String(s == null ? '' : s).toLowerCase()
            .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
            .replace(/[^a-z0-9]/g, '');
    }

    // organizationFederationType: 1 = Forbund (NSF itself), 2 = Krets
    // (region), 3+ = Clubs -- see the API reference doc.
    function filterClubs(rawOrgs) {
        return (rawOrgs || [])
            .filter(function (o) { return o.organizationFederationType !== 1 && o.organizationFederationType !== 2 && o.id && o.organizationName; })
            .map(function (o) { return { id: o.id, name: o.organizationName }; });
    }

    // ponytail: substring match, same known ceiling as stevner-page.js's
    // own matchesClub -- a short slug could theoretically collide with two
    // clubs. Upgrade path: an explicit slug->id map, if that ever happens.
    function matchClub(clubs, slug) {
        var q = normalize(slug);
        if (!q) { return null; }
        for (var i = 0; i < clubs.length; i++) {
            if (normalize(clubs[i].name).indexOf(q) !== -1) { return clubs[i]; }
        }
        return null;
    }

    function readCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) { return null; }
            var parsed = JSON.parse(raw);
            if (!parsed || (Date.now() - parsed.time) >= TTL_MS) { return null; }
            return parsed.clubs;
        } catch (e) { return null; }
    }

    function writeCache(clubs) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), clubs: clubs })); }
        catch (e) { /* Safari private mode etc. -- in-memory-only for this page load */ }
    }

    var orgsPromise = null;
    function ensureOrgs(fetchFn) {
        if (orgsPromise) { return orgsPromise; }
        var cached = readCache();
        if (cached) { orgsPromise = Promise.resolve(cached); return orgsPromise; }
        orgsPromise = fetchFn(ORG_URL)
            .then(function (r) {
                if (!r.ok) {
                    orgsPromise = null;  // Reset so next call retries instead of using failed promise
                    return [];  // Graceful fallback for this call, matching comp-modal.js convention
                }
                return r.json();
            })
            .then(function (rawOrgs) {
                if (!rawOrgs) { return []; }  // Handle null response from failed path
                var clubs = filterClubs(rawOrgs);
                writeCache(clubs);
                return clubs;
            })
            .catch(function () {
                orgsPromise = null;  // Reset on rejection so next call retries instead of returning rejected promise
                return [];  // Graceful fallback, matching comp-modal.js convention
            });
        return orgsPromise;
    }

    return {
        filterClubs: filterClubs,
        matchClub: matchClub,
        ensureOrgs: ensureOrgs,
        _resetForTesting: function () { orgsPromise = null; }  // Test helper to reset module state
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassNsfOrgs;
}
