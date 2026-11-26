'use strict';
// SEO drift guard. Two shipped bugs motivated it: mesterskap was
// sitemap-listed but robots-disallowed (listing drift), and the old
// robots allowlist blocked /data/ entirely - every page's content is
// JS-fetched from there, so compliant crawlers' renderers saw empty
// shells and the site had zero search visibility (render-resource
// drift). Policy now: robots.txt allows everything (fully static,
// fully public site), and raw JSON under /data/ is kept out of search
// results via X-Robots-Tag: noindex in _headers - which excludes from
// indexing without blocking the fetches page rendering needs. This
// test locks those pieces together.
var assert = require('node:assert');
var fs = require('node:fs');

var robots = fs.readFileSync(__dirname + '/../public/robots.txt', 'utf8');
var sitemap = fs.readFileSync(__dirname + '/../public/sitemap.xml', 'utf8');
var llms = fs.readFileSync(__dirname + '/../public/llms.txt', 'utf8');
var headersFile = fs.readFileSync(__dirname + '/../public/_headers', 'utf8');

// --- robots.txt, parsed into per-crawler groups ----------------------
function parseGroups(text) {
    var groups = {};
    var current = null;
    text.split(/\r?\n/).forEach(function (raw) {
        var line = raw.replace(/#.*$/, '').trim();
        if (!line) { return; }
        var m = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line);
        if (!m) { return; }
        var field = m[1].toLowerCase();
        var value = m[2].trim();
        if (field === 'user-agent') {
            if (!groups[value]) { groups[value] = { allow: [], disallow: [] }; }
            current = groups[value];
        } else if (field === 'allow' && current) {
            if (value) { current.allow.push(value); }
        } else if (field === 'disallow' && current) {
            if (value) { current.disallow.push(value); }
        }
    });
    return groups;
}

var star = parseGroups(robots)['*'];
assert.ok(star, 'robots.txt has a User-agent: * group');

// Longest-match wins between allow and disallow; a tie favors allow.
function ruleMatch(rule, pathname) {
    if (/\$$/.test(rule)) {
        return rule.slice(0, -1) === pathname ? rule.length : -1;
    }
    return pathname.indexOf(rule) === 0 ? rule.length : -1;
}

function robotsAllows(pathname) {
    var best = -1;
    var allowed = true;
    star.allow.forEach(function (r) {
        var len = ruleMatch(r, pathname);
        if (len > best) { best = len; allowed = true; }
    });
    star.disallow.forEach(function (r) {
        var len = ruleMatch(r, pathname);
        if (len > best) { best = len; allowed = false; }
    });
    return allowed;
}

// --- sitemap pages must stay crawlable by every compliant bot ---------
var locs = [];
var re = /<loc>(.*?)<\/loc>/g;
var m;
while ((m = re.exec(sitemap))) { locs.push(m[1]); }

assert.ok(locs.length >= 8,
    'found the sitemap URLs (' + locs.length + ') - update this test when a page stops being listed');

locs.forEach(function (loc) {
    var pathname = new URL(loc).pathname || '/';
    assert.ok(robotsAllows(pathname),
        loc + ' is sitemap-listed but not allowed by robots.txt - crawlers drop what they may not crawl');
    var page = pathname.replace(/\/$/, '') || '/';
    assert.ok(llms.indexOf(page) !== -1,
        page + " is sitemap-listed but missing from llms.txt's Pages list");
});

// --- render-critical resources must stay crawlable -------------------
// Pages fetch these while rendering; blocking them is what starved
// crawlers of all content before the policy flip.
['/data/felt/2026.json', '/data/detaljer/felt/2026/x.json', '/js/stevner-page.js', '/styles.css'].forEach(function (path) {
    assert.ok(robotsAllows(path),
        path + ' must stay robots-allowed - pages fetch it while rendering');
});

// --- raw data must stay out of search results (not out of crawlers) --
// The noindex lives in _headers, not robots.txt: it excludes /data/*
// from indexing without blocking the fetches page rendering needs.
var dataDirectives = null;
var currentPath = null;
headersFile.split(/\r?\n/).forEach(function (raw) {
    var line = raw.replace(/\s+$/, '');
    if (!line || line.trim().indexOf('#') === 0) { return; }
    if (line[0] !== ' ' && line[0] !== '\t') {
        currentPath = line.trim();
        if (currentPath === '/data/*') { dataDirectives = []; }
    } else if (currentPath === '/data/*') {
        dataDirectives.push(line.trim());
    }
});
assert.ok(dataDirectives && dataDirectives.some(function (d) {
    return /^X-Robots-Tag\s*:\s*.*noindex/i.test(d);
}), '/data/* must carry X-Robots-Tag: noindex in _headers - it keeps raw JSON out of search results now that robots.txt is permissive');

// --- robots.txt points at the sitemap --------------------------------
assert.ok(/^Sitemap:\s*https:\/\/standplass\.com\/sitemap\.xml/m.test(robots),
    'robots.txt points at the sitemap');

console.log('seo-consistency.test.js: all assertions passed');
