'use strict';
// The person modal pair references globals from sibling scripts:
// StandplassRankingBand (rankingScore dot colors — the felt default
// metric), StandplassFilterWidgets (the modal's filter row),
// StandplassDataTable (the contests table). A host page that includes
// the controller but misses one of those dies mid-open: the
// rankingScore chart throws in dotColor, killing the chart AND the
// contests table rendered after it in the same open path, while the
// other metrics still draw (mesterskap Task-6 miss, owner QA
// 2026-11-22). This guards every host page against that class of
// miss. Embed-mounted pages (felt/bane) load their scripts through
// embed.js and carry no host tags — out of scope here.
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

var REQUIRED = [
    '/js/person-modal.js',
    '/js/person-modal-controller.js',
    '/js/ranking-band.js',
    '/js/data-table.js',
    '/js/filter-widgets.js',
    '/js/url-state.js'
];

function hostPages(dir) {
    return fs.readdirSync(dir)
        .filter(function (f) { return f.slice(-5) === '.html'; })
        .map(function (f) { return path.join(dir, f); });
}

var pages = hostPages('public').concat(hostPages('public/mesterskap'));
var hosts = pages.filter(function (p) {
    return fs.readFileSync(p, 'utf8').indexOf('/js/person-modal-controller.js') !== -1;
});
assert.ok(hosts.length >= 6,
    'found the person-modal host pages (' + hosts.length + ') — update this test when a page stops hosting the modal');

hosts.forEach(function (p) {
    var html = fs.readFileSync(p, 'utf8');
    REQUIRED.forEach(function (script) {
        assert.ok(html.indexOf('src="' + script + '"') !== -1,
            p + ' hosts the person modal but does not load ' + script);
    });
});

console.log('modal-host-scripts.test.js: all assertions passed');
