var StandplassCompModal = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function groupEventsByDiscipline(events) {
        var byDisc = {};
        var order = [];
        events.forEach(function (e) {
            if (!byDisc[e.discipline]) { byDisc[e.discipline] = []; order.push(e.discipline); }
            byDisc[e.discipline].push(e);
        });
        return order.sort(function (a, b) { return a.localeCompare(b, 'no'); })
            .map(function (d) { return { discipline: d, events: byDisc[d] }; });
    }

    // 30-entry cap + 5-min TTL, matching the source's own resultlist cache
    // size/duration -- deliberate, ported behavior, not an arbitrary choice.
    var CACHE_TTL_MS = 5 * 60 * 1000;
    var CACHE_MAX = 30;
    var cache = {}; // { competitionId: { data, results, expires } }
    var cacheOrder = [];

    function cacheGet(id) {
        var entry = cache[id];
        if (entry && entry.expires > Date.now()) { return entry; }
        return null;
    }
    function cacheSet(id, patch) {
        var existing = cache[id] || {};
        cache[id] = { data: patch.data !== undefined ? patch.data : existing.data,
            results: patch.results !== undefined ? patch.results : existing.results,
            expires: Date.now() + CACHE_TTL_MS };
        if (cacheOrder.indexOf(id) < 0) {
            cacheOrder.push(id);
            if (cacheOrder.length > CACHE_MAX) { delete cache[cacheOrder.shift()]; }
        }
    }

    function fetchDetail(id, fetchFn) {
        var cached = cacheGet(id);
        if (cached && cached.data) { return Promise.resolve(cached.data); }
        return fetchFn('https://app.skyting.no/api/competition/' + encodeURIComponent(id))
            .then(function (r) { if (!r.ok) { throw new Error('competition fetch failed: ' + r.status); } return r.json(); })
            .then(function (data) { cacheSet(id, { data: data }); return data; });
    }

    function fetchResults(id, fetchFn) {
        var cached = cacheGet(id);
        if (cached && cached.results) { return Promise.resolve(cached.results); }
        return fetchFn('https://app.skyting.no/api/query/resultlist?competitionId=eq:' + encodeURIComponent(id))
            .then(function (r) { if (!r.ok) { throw new Error('results fetch failed: ' + r.status); } return r.json(); })
            .then(function (results) { cacheSet(id, { results: results }); return results; });
    }

    function renderDetailBody(data) {
        var badge = data.applicableForClassification
            ? '<span class="comp-modal-badge comp-modal-badge--yes">Klasseførende</span>'
            : '<span class="comp-modal-badge comp-modal-badge--no">Ikke klasseførende</span>';
        var groups = groupEventsByDiscipline(data.events || []);
        var eventsHtml = groups.map(function (g) {
            return '<div class="comp-modal-disc"><p class="comp-modal-section-title">' + esc(g.discipline) + '</p>'
                + g.events.map(function (e) {
                    return '<span class="comp-modal-class-tag">' + esc(e.class) + (e.entryFee != null ? ' – ' + esc(e.entryFee) + ' kr' : '') + '</span>';
                }).join('') + '</div>';
        }).join('');
        return '<div class="comp-modal-infocard">'
            + '<p class="comp-modal-comp-number">Stevnenr. ' + esc(data.competitionNumber || '–') + '</p> ' + badge
            // ponytail: data.description is trusted, pre-sanitized HTML from
            // the source API (matches the source site's own behavior) -- not
            // re-escaped here by design. See task-9 report for the flag on this.
            + (data.description ? '<div class="comp-modal-description">' + data.description + '</div>' : '')
            + '</div>' + '<div class="comp-modal-events">' + eventsHtml + '</div>';
    }

    function renderResultsBody(results) {
        var groups = groupEventsByDiscipline(results.map(function (r) { return { discipline: r.discipline, class: r.class, row: r }; }));
        return groups.map(function (g) {
            return '<p class="comp-modal-section-title">' + esc(g.discipline) + '</p>'
                + '<table class="ranking-full-table ranking-table"><thead><tr><th>Plass</th><th>Navn</th><th>Klubb</th><th>Klasse</th><th>Poeng</th></tr></thead><tbody>'
                + g.events.map(function (item) {
                    var r = item.row;
                    return '<tr><td>' + esc(r.position) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.club) + '</td><td>' + esc(r.class) + '</td><td>' + esc(r.score) + '</td></tr>';
                }).join('') + '</tbody></table>';
        }).join('');
    }

    return {
        groupEventsByDiscipline: groupEventsByDiscipline,
        fetchDetail: fetchDetail,
        fetchResults: fetchResults,
        renderDetailBody: renderDetailBody,
        renderResultsBody: renderResultsBody
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassCompModal;
}
