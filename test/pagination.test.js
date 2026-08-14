'use strict';
var assert = require('node:assert');
var StandplassPagination = require('../public/js/pagination.js');

var allItems = [1, 2, 3, 4, 5];
function fetchPage(offset, limit) {
    return Promise.resolve(allItems.slice(offset, offset + limit));
}

var controller = StandplassPagination.createController({ pageSize: 2, fetchPage: fetchPage });

controller.loadMore()
    .then(function () {
        assert.deepStrictEqual(controller.state.items, [1, 2]);
        assert.strictEqual(controller.state.done, false);
        return controller.loadMore();
    })
    .then(function () {
        assert.deepStrictEqual(controller.state.items, [1, 2, 3, 4]);
        return controller.loadMore();
    })
    .then(function () {
        assert.deepStrictEqual(controller.state.items, [1, 2, 3, 4, 5]);
        assert.strictEqual(controller.state.done, true, 'should be done after a partial page');
        return controller.loadMore();
    })
    .then(function () {
        assert.strictEqual(controller.state.items.length, 5, 'loadMore after done must be a no-op');
        controller.reset();
        assert.strictEqual(controller.state.items.length, 0);
        console.log('pagination.test.js: all assertions passed');
    })
    .catch(function (err) {
        console.error(err);
        process.exit(1);
    });
