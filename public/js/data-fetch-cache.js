var StandplassData = (function () {
    'use strict';

    function createFetcher(fetchImpl, ttlMs) {
        var cache = {};
        ttlMs = ttlMs || 5 * 60 * 1000;

        function fetchYear(dataBase, year) {
            return fetchJson(dataBase + '/' + year, dataBase + '/' + year + '.json');
        }

        // Birthyear maps (public/data/<family>/birthyears.json) — same
        // cache discipline as year files: one request per URL per TTL.
        function fetchBirthyears(dataBase) {
            return fetchJson(dataBase + '/birthyears', dataBase + '/birthyears.json');
        }

        function fetchJson(key, url) {
            var entry = cache[key];
            var now = Date.now();
            if (entry && (now - entry.time) < ttlMs) {
                return entry.promise;
            }
            var promise = fetchImpl(url).then(function (res) {
                if (!res.ok) {
                    var err = new Error('Failed to fetch ' + key + ': ' + res.status);
                    err.status = res.status;
                    throw err;
                }
                return res.json();
            });
            cache[key] = { time: now, promise: promise };
            return promise;
        }

        function clearCache() {
            cache = {};
        }

        return { fetchYear: fetchYear, fetchBirthyears: fetchBirthyears, clearCache: clearCache };
    }

    function applyFilter(rows, filter) {
        if (!filter) { return rows; }
        return rows.filter(function (row) {
            for (var key in filter) {
                if (Object.prototype.hasOwnProperty.call(filter, key)) {
                    if (filter[key] != null && row[key] !== filter[key]) {
                        return false;
                    }
                }
            }
            return true;
        });
    }

    return {
        createFetcher: createFetcher,
        applyFilter: applyFilter
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassData;
}
