var assert = require('assert');
var fs = require('fs');
var path = require('path');

// data-table.js calls the StandplassTable global (defined by
// table-renderer.js) for numeric-column sorting -- at call time, so a
// page that loads data-table.js without table-renderer.js loads fine
// but dies on the first numeric sort click. Batch-1 review defect D1:
// /klubb shipped exactly that (its Poeng sort threw ReferenceError,
// poisoning the card's sort slot). Pinned per page: every HTML page
// that loads data-table.js must load table-renderer.js first.
var publicDir = path.resolve(__dirname, '..', 'public');
var pages = fs.readdirSync(publicDir).filter(function (f) { return /\.html$/.test(f); });
assert.ok(pages.length > 0, 'found the public pages');
var checked = 0;
pages.forEach(function (page) {
    var html = fs.readFileSync(path.join(publicDir, page), 'utf8');
    var dtIdx = html.indexOf('/js/data-table.js');
    if (dtIdx === -1) { return; }
    checked++;
    var trIdx = html.indexOf('/js/table-renderer.js');
    assert.ok(trIdx !== -1,
        page + ' loads data-table.js but never table-renderer.js (numeric sorts would throw)');
    assert.ok(trIdx < dtIdx,
        page + ' must load table-renderer.js BEFORE data-table.js');
});
assert.ok(checked >= 4, 'expected the data-table consumers among the pages (klubbstatistikk, klubb, nasjonalt, norgesfelt)');
console.log('html-script-order.test.js: all assertions passed (' + checked + ' pages)');
