var StandplassPagination = (function () {
    'use strict';

    function createController(options) {
        var pageSize = options.pageSize;
        var fetchPage = options.fetchPage;
        var state = {
            items: [],
            offset: 0,
            done: false,
            loading: false
        };

        function loadMore() {
            if (state.loading || state.done) {
                return Promise.resolve(state);
            }
            state.loading = true;
            return fetchPage(state.offset, pageSize).then(function (pageItems) {
                state.items = state.items.concat(pageItems);
                state.offset += pageItems.length;
                state.done = pageItems.length < pageSize;
                state.loading = false;
                return state;
            });
        }

        function reset() {
            state.items = [];
            state.offset = 0;
            state.done = false;
            state.loading = false;
        }

        return {
            state: state,
            loadMore: loadMore,
            reset: reset
        };
    }

    return { createController: createController };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassPagination;
}
