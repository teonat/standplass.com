var StandplassData = (function () {
    'use strict';

    function createFetcher(fetchImpl, ttlMs) {
        var cache = {};
        ttlMs = ttlMs || 5 * 60 * 1000;

        function fetchYear(dataBase, year) {
            var key = dataBase + '/' + year;
            var entry = cache[key];
            var now = Date.now();
            if (entry && (now - entry.time) < ttlMs) {
                return entry.promise;
            }
            var promise = fetchImpl(dataBase + '/' + year + '.json').then(function (res) {
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

        return { fetchYear: fetchYear, clearCache: clearCache };
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
