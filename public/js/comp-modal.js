var StandplassCompModal = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // The source's sanitizer walks a scratch <div>'s DOM (needs a browser
    // `document`), which this module can't rely on -- its render functions
    // run under plain Node in tests. Escaping everything first and only ever
    // un-escaping these exact fixed strings (no attributes, ever) means no
    // attacker-controlled text can become a tag: only the six literal
    // allowed-tag strings can ever appear as real markup in the output.
    var ALLOWED_TAGS = /&lt;(\/?)(p|br|strong|em|b|i)\s*\/?&gt;/gi;
    function sanitizeDescription(html) {
        return esc(html).replace(ALLOWED_TAGS, function (m, closing, tag) {
            return '<' + closing + tag.toLowerCase() + '>';
        });
    }

    var STATUS_LABEL = { 0: 'Søknad', 1: 'Godkjent', 2: 'Avvist', 3: 'Avlyst' };
    var STATUS_BADGE_CLS = {
        0: 'comp-modal-badge--no',
        1: 'comp-modal-badge--yes',
        2: 'comp-modal-badge--warn',
        3: 'comp-modal-badge--warn'
    };
    var AWARD_LABELS = { 1: 'Premieringstabellen', 2: 'Spesialpremiering' };

    // Competition events and result rows only carry disciplineId/classId
    // (GUIDs) -- the source resolves these via a one-time fetch of NSF's
    // full branch/discipline/class reference list (nsf-ui.js fetches this
    // itself at load, independent of any page's own init), not a per-page
    // config. Mutated in place by ensureReferenceData below; read
    // synchronously here, so a lookup requested before that fetch resolves
    // falls back to the raw id for that one render, same as the source.
    var refData = { disciplines: {}, classes: {}, disciplineGroups: [] };
    var refFetchPromise = null;
    function ensureReferenceData(fetchFn) {
        if (refFetchPromise) { return refFetchPromise; }
        refFetchPromise = fetchFn('https://nsfapi.azurewebsites.net/query/branchlist')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                (data && data.items || []).forEach(function (branch) {
                    (branch.disciplineGroups || []).forEach(function (g) {
                        (g.disciplines || []).forEach(function (d) { if (!d.deleted) { refData.disciplines[d.id] = d.name; } });
                    });
                    // Class names carry a "Branch\" or "Branch/" prefix (e.g.
                    // "Pistol\A") that's redundant once shown inside that
                    // branch's own discipline group -- stripped like the source does.
                    (branch.classes || []).forEach(function (c) { if (!c.deleted) { refData.classes[c.id] = c.name.replace(/^[^\\/]+[\\/]/, ''); } });
                    // Kept nested (not flattened like refData.disciplines
                    // above) -- klubb-discipline-groups.js needs to know
                    // which group a discipline belongs to, which the flat
                    // id->name map above discards. Scoped to the Pistol
                    // branch only (case-insensitive), same as
                    // scrape_stevneresultater.py's build_mappings() --
                    // unlike refData.disciplines/classes above, this is a
                    // stated Pistol-only contract, so Leirdue's groups must
                    // not leak in here.
                    if ((branch.name || '').toLowerCase() === 'pistol') {
                        refData.disciplineGroups = refData.disciplineGroups.concat(branch.disciplineGroups || []);
                    }
                });
            })
            .catch(function () { /* best-effort; renders fall back to raw ids */ });
        return refFetchPromise;
    }
    function getDisciplineGroups() { return refData.disciplineGroups; }

    // Used for both result rows (one entry per competitor -- never dedup)
    // and, via groupCompetitionEvents below, competition event/class
    // definitions (one entry per class -- dedup real API duplicates).
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

    // Deduped by disciplineId+classId since the API can list the same class
    // twice; names resolved via refData, falling back to the raw id.
    function groupCompetitionEvents(events) {
        var seen = {};
        var deduped = [];
        events.forEach(function (e) {
            var key = (e.disciplineId || '') + '|' + (e.classId || '');
            if (seen[key]) { return; }
            seen[key] = true;
            deduped.push({
                discipline: e.disciplineName || refData.disciplines[e.disciplineId] || e.disciplineId || '–',
                class: e.className || refData.classes[e.classId] || e.classId || '–',
                entryFee: e.entryFee
            });
        });
        return groupEventsByDiscipline(deduped);
    }

    // 30-entry cap + 5-min TTL, matching the source's own resultlist cache
    // size/duration -- deliberate, ported behavior, not an arbitrary choice.
    var CACHE_TTL_MS = 5 * 60 * 1000;
    var CACHE_MAX = 30;
    var cache = {}; // { competitionId: { data, results, facility, expires } }
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
            facility: patch.facility !== undefined ? patch.facility : existing.facility,
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

    // Facility (venue address/coordinates for the map link) is a second,
    // best-effort fetch -- same as the source, which never blocks or fails
    // the modal if it 404s, since the map link is a nice-to-have, not core
    // competition data.
    function fetchFacility(facilityId, id, fetchFn) {
        return fetchFn('https://app.skyting.no/api/facility/' + encodeURIComponent(facilityId))
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (facility) { cacheSet(id, { facility: facility }); return facility; });
    }

    function fetchDetailWithFacility(id, fetchFn) {
        return fetchDetail(id, fetchFn).then(function (data) {
            var cached = cacheGet(id);
            if (cached && cached.facility !== undefined) { return { comp: data, facility: cached.facility }; }
            if (!data.facilityId) { cacheSet(id, { facility: null }); return { comp: data, facility: null }; }
            return fetchFacility(data.facilityId, id, fetchFn).then(function (facility) {
                return { comp: data, facility: facility };
            });
        });
    }

    function fetchResults(id, fetchFn) {
        var cached = cacheGet(id);
        if (cached && cached.results) { return Promise.resolve(cached.results); }
        return fetchFn('https://app.skyting.no/api/query/resultlist?competitionId=eq:' + encodeURIComponent(id))
            .then(function (r) { if (!r.ok) { throw new Error('results fetch failed: ' + r.status); } return r.json(); })
            // The endpoint returns a { paging, orderBy, items } envelope, not
            // a bare array -- passing the envelope straight to
            // renderResultsBody's .map() call used to throw, which silently
            // wedged the Resultater tab on "Laster..." forever.
            .then(function (data) { var results = (data && data.items) || []; cacheSet(id, { results: results }); return results; });
    }

    function renderDetailBody(data, facility) {
        var classificationBadge = data.applicableForClassification
            ? '<span class="comp-modal-badge comp-modal-badge--yes" title="Stevnet teller for opprykk og nedrykk i klasse">Klasseførende</span>'
            : '<span class="comp-modal-badge comp-modal-badge--no" title="Stevnet teller ikke for opprykk og nedrykk i klasse">Ikke klasseførende</span>';
        var statusLabel = STATUS_LABEL[data.status] || '';
        var statusBadge = statusLabel
            ? '<span class="comp-modal-badge ' + (STATUS_BADGE_CLS[data.status] || 'comp-modal-badge--no') + '">' + esc(statusLabel) + '</span>'
            : '';
        var badgesHtml = classificationBadge + statusBadge;

        var rows = '';
        rows += '<div class="comp-modal-infocard-row comp-modal-infocard-row--badges">'
            + '<span class="comp-modal-infocard-label">' + (data.competitionNumber ? 'Stevnenr.' : '') + '</span>'
            + '<span class="comp-modal-infocard-row-right">'
            + (data.competitionNumber ? '<span class="comp-modal-comp-number">' + esc(String(data.competitionNumber)) + '</span>' : '')
            + badgesHtml + '</span></div>';

        var awardLabel = AWARD_LABELS[data.awardType];
        if (awardLabel) {
            rows += '<div class="comp-modal-infocard-row">'
                + '<span class="comp-modal-infocard-label">Premiering</span>'
                + '<span>' + esc(awardLabel) + '</span></div>';
        }

        if (facility && (facility.address || facility.city || facility.zipCode || facility.name || (facility.latitude && facility.longitude))) {
            var facAddrParts = [facility.address,
                facility.zipCode && facility.city ? facility.zipCode + ' ' + facility.city : (facility.zipCode || facility.city)
            ].filter(Boolean);
            var facDisplayName = facility.name || facAddrParts.map(esc).join(', ');
            // The API's latitude/longitude fields are swapped for Norwegian
            // facilities (its "latitude" holds ~5-30, a longitude range; its
            // "longitude" holds ~58-71, a latitude range) -- confirmed against
            // real data, and the source's own map-link code compensates for
            // the same swap.
            var mapsQuery = (facility.latitude && facility.longitude)
                ? facility.longitude + ',' + facility.latitude
                : facAddrParts.join(', ');
            var mapsUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(mapsQuery);
            rows += '<div class="comp-modal-infocard-row">'
                + '<span class="comp-modal-infocard-label">Bane</span>'
                + '<a href="' + esc(mapsUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(facDisplayName) + '</a></div>';
        }

        if (data.registrationStartDate) {
            rows += '<div class="comp-modal-infocard-row">'
                + '<span class="comp-modal-infocard-label">Påm. åpner</span>'
                + '<span>' + esc(StandplassFormat.formatDate(data.registrationStartDate)) + '</span></div>';
        }
        if (data.registrationEndDate) {
            rows += '<div class="comp-modal-infocard-row">'
                + '<span class="comp-modal-infocard-label">Påmeldingsfrist</span>'
                + '<span>' + esc(StandplassFormat.formatDate(data.registrationEndDate)) + '</span></div>';
        }

        if (data.contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) {
            rows += '<div class="comp-modal-infocard-row">'
                + '<span class="comp-modal-infocard-label">E-post</span>'
                + '<a href="mailto:' + esc(data.contactEmail) + '">' + esc(data.contactEmail) + '</a></div>';
        }
        if (data.contactPhoneNumber) {
            rows += '<div class="comp-modal-infocard-row">'
                + '<span class="comp-modal-infocard-label">Telefon</span>'
                + '<span>' + esc(data.contactPhoneNumber) + '</span></div>';
        }
        if (data.contactWebsite) {
            var wsRaw = /^https?:\/\//.test(data.contactWebsite) ? data.contactWebsite : 'https://' + data.contactWebsite;
            var wsUrl = null;
            try { var wp = new URL(wsRaw); if (wp.protocol === 'http:' || wp.protocol === 'https:') { wsUrl = wsRaw; } } catch (e) { /* invalid URL, drop the link */ }
            if (wsUrl) {
                rows += '<div class="comp-modal-infocard-row">'
                    + '<span class="comp-modal-infocard-label">Nettside</span>'
                    + '<a href="' + esc(wsUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(wsRaw.replace(/^https?:\/\//, '')) + '</a></div>';
            }
        }
        if (data.requirePaymentOnline) {
            rows += '<div class="comp-modal-infocard-row">'
                + '<span class="comp-modal-infocard-label">Betaling</span>'
                + '<span>Online påkrevd</span></div>';
        }

        var skytingLink = '<div class="comp-modal-infocard-skyting">'
            + '<a href="https://app.skyting.no/p/c/' + esc(data.id || '') + '/details" target="_blank" rel="noopener noreferrer">Åpne på app.skyting.no →</a></div>';

        var groups = groupCompetitionEvents(data.events || []);
        var eventsHtml = groups.map(function (g) {
            var fees = g.events.map(function (e) { return e.entryFee || 0; });
            var uniformFee = fees.every(function (f) { return f === fees[0]; }) ? fees[0] : null;
            var feeStr = uniformFee ? ' <span class="comp-modal-disc-fee">kr ' + esc(String(uniformFee)) + '</span>' : '';
            var tags = g.events.map(function (e) {
                var tagFee = (uniformFee === null && e.entryFee) ? ' · kr ' + esc(String(e.entryFee)) : '';
                return '<span class="comp-modal-class-tag">' + esc(e.class) + tagFee + '</span>';
            }).join('');
            return '<div class="comp-modal-disc-group"><div class="comp-modal-disc-name">' + esc(g.discipline) + feeStr + '</div>'
                + '<div class="comp-modal-class-tags">' + tags + '</div></div>';
        }).join('');

        return '<div class="comp-modal-infocard">' + rows + skytingLink + '</div>'
            + (data.description ? '<div class="comp-modal-description">' + sanitizeDescription(data.description) + '</div>' : '')
            + (eventsHtml ? '<h3 class="comp-modal-section-title">Øvelser og klasser</h3>'
                + '<div class="comp-modal-events-wrap"><div class="comp-modal-events-scroll">' + eventsHtml + '</div></div>' : '');
    }

    function renderResultsBody(results, selectedDiscId, idPrefix) {
        var discNames = {};
        results.forEach(function (r) {
            if (r.disciplineId) { discNames[r.disciplineId] = refData.disciplines[r.disciplineId] || r.disciplineId; }
        });
        var discIds = Object.keys(discNames).sort(function (a, b) { return discNames[a].localeCompare(discNames[b], 'no'); });
        var filterId = (idPrefix || 'comp') + '-comp-filter-disc';
        var filterHtml = '<div class="ranking-filters comp-results-filters"><div class="filter-group filter-group--narrow">'
            + '<label for="' + esc(filterId) + '">Gren</label>'
            + '<select id="' + esc(filterId) + '" class="comp-results-disc-filter"><option value="">Alle grener</option>'
            + discIds.map(function (id) { return '<option value="' + esc(id) + '"' + (id === selectedDiscId ? ' selected' : '') + '>' + esc(discNames[id]) + '</option>'; }).join('')
            + '</select></div></div>';

        var filtered = selectedDiscId ? results.filter(function (r) { return r.disciplineId === selectedDiscId; }) : results;
        if (!filtered.length) {
            return filterHtml + '<p class="ranking-status-msg">' + (selectedDiscId ? 'Ingen resultater for valgt gren.' : 'Ingen resultater funnet.') + '</p>';
        }

        // Real result rows carry fullName/organizationName/disciplineId/
        // classId, not name/club/discipline/class -- resolve names via
        // refData the same way groupCompetitionEvents does.
        var groups = groupEventsByDiscipline(filtered.map(function (r) {
            return { discipline: refData.disciplines[r.disciplineId] || r.disciplineId || '–', row: r };
        }));
        var tablesHtml = groups.map(function (g) {
            // Same class-header sub-grouping the source's CompModal uses
            // (_renderResultTable) -- without it, rows across different
            // classes interleave by raw position (which resets per class),
            // reading as an unsorted list.
            var classMap = {}, classOrder = [];
            g.events.forEach(function (item) {
                var r = item.row;
                var cname = refData.classes[r.classId] || r.classId || '–';
                if (!classMap[cname]) { classMap[cname] = []; classOrder.push(cname); }
                classMap[cname].push(r);
            });
            classOrder.sort(function (a, b) { return a.localeCompare(b, 'no'); });

            var bodyHtml = classOrder.map(function (cname) {
                var rows = classMap[cname].slice()
                    .sort(function (a, b) { return (a.position == null) - (b.position == null) || (a.position || 0) - (b.position || 0); });
                return '<tr class="ranking-class-header"><th scope="colgroup" colspan="5">' + esc(cname) + '</th></tr>'
                    + rows.map(function (r) {
                        return '<tr><td>' + esc(r.position != null ? r.position : '–') + '</td><td>' + esc(r.fullName || '–') + '</td>'
                            + '<td>' + esc(r.organizationName || '–') + '</td><td>' + esc(cname) + '</td>'
                            + '<td>' + esc(r.score != null ? r.score : '–') + '</td></tr>';
                    }).join('');
            }).join('');
            return '<p class="comp-modal-section-title">' + esc(g.discipline) + '</p>'
                + '<table class="ranking-full-table ranking-table"><thead><tr><th>Plass</th><th>Navn</th><th>Klubb</th><th>Klasse</th><th>Poeng</th></tr></thead><tbody>'
                + bodyHtml + '</tbody></table>';
        }).join('');
        return filterHtml + tablesHtml;
    }

    return {
        groupEventsByDiscipline: groupEventsByDiscipline,
        sanitizeDescription: sanitizeDescription,
        ensureReferenceData: ensureReferenceData,
        getDisciplineGroups: getDisciplineGroups,
        fetchDetail: fetchDetail,
        fetchDetailWithFacility: fetchDetailWithFacility,
        fetchResults: fetchResults,
        renderDetailBody: renderDetailBody,
        renderResultsBody: renderResultsBody
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassCompModal;
}
