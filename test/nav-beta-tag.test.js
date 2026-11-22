'use strict';
// The Mesterskap pages ship as beta (partial result-file coverage —
// the datotid/plain-NO families still drop rows; see STATUS.md). Every
// page carrying the Mesterskap nav menu must carry the beta tag on
// its menu button, so the expectation is consistent sitewide. Delete
// this test together with the tag when the beta comes off.
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
    if (html.indexOf('nav-mesterskap-menu') === -1) { return; }
    assert.ok(/nav-mesterskap-menu">Mesterskap <span class="nav-beta-tag">/.test(html),
        p + ' carries the Mesterskap menu but not the beta tag on its button');
});

console.log('nav-beta-tag.test.js: all assertions passed');
