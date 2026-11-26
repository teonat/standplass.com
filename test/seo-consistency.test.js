'use strict';
// SEO drift guard: sitemap.xml, robots.txt and llms.txt drift apart
// silently — mesterskap shipped sitemap-listed but robots-disallowed
// (every other page got the sitemap/robots/llms triple update when it
// shipped; this test would have caught the miss). A crawler honoring
// robots.txt drops a sitemap URL it may not crawl, so the three files
// must stay locked together.
var assert = require('node:assert');
var fs = require('node:fs');

var robots = fs.readFileSync(__dirname + '/../public/robots.txt', 'utf8');
var sitemap = fs.readFileSync(__dirname + '/../public/sitemap.xml', 'utf8');
var llms = fs.readFileSync(__dirname + '/../public/llms.txt', 'utf8');

// The Allow rules, $ (end-of-URL) markers kept per rule.
var allows = robots.split('\n')
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return /^Allow:\s*/i.test(l); })
    .map(function (l) { return l.replace(/^Allow:\s*/i, ''); });

function robotsAllows(pathname) {
    return allows.some(function (rule) {
        if (/\$$/.test(rule)) { return rule.replace(/\$$/, '') === pathname; }
        return pathname.indexOf(rule) === 0;
    });
}

var locs = [];
var re = /<loc>(.*?)<\/loc>/g;
var m;
while ((m = re.exec(sitemap))) { locs.push(m[1]); }

assert.ok(locs.length >= 8,
    'found the sitemap URLs (' + locs.length + ') — update this test when a page stops being listed');

locs.forEach(function (loc) {
    var pathname = new URL(loc).pathname || '/';
    assert.ok(robotsAllows(pathname),
        loc + ' is sitemap-listed but not allowed by robots.txt — crawlers drop what they may not crawl');
    var page = pathname.replace(/\/$/, '') || '/';
    assert.ok(llms.indexOf(page) !== -1,
        page + ' is sitemap-listed but missing from llms.txt\'s Pages list');
});

assert.ok(/^Sitemap:\s*https:\/\/standplass\.com\/sitemap\.xml/m.test(robots),
    'robots.txt points at the sitemap');

console.log('seo-consistency.test.js: all assertions passed');
