'use strict';
// The Mesterskap view ships as beta (partial result-file coverage —
// the datotid/plain-NO families still drop rows; see STATUS.md). Every
// page carrying the Resultater menu must carry the Mesterskap link
// with the beta tag, and no page may still carry the old per-type
// Mesterskap dropdown. Delete this test together with the tag when the
// beta comes off.
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

function pages(dir) {
    return fs.readdirSync(dir)
        .filter(function (f) { return f.slice(-5) === '.html'; })
        .map(function (f) { return path.join(dir, f); });
}

pages('public').concat(pages('public/mesterskap')).forEach(function (p) {
    var html = fs.readFileSync(p, 'utf8');
    assert.ok(html.indexOf('nav-mesterskap-menu') === -1,
        p + ' still carries the old Mesterskap nav dropdown');
    if (html.indexOf('nav-resultater-menu') === -1) { return; }
    assert.ok(/href="\/mesterskap\/"[^>]*>Mesterskap <span class="nav-beta-tag">/.test(html),
        p + ' carries the Resultater menu but not the beta-tagged Mesterskap link');
});

console.log('nav-beta-tag.test.js: all assertions passed');
