'use strict';
var assert = require('node:assert');
var StandplassEmbed = require('../public/embed.js');

assert.deepStrictEqual(Object.keys(StandplassEmbed.VIEWS).sort(), ['bane', 'felt', 'terminliste']);
assert.strictEqual(StandplassEmbed.VIEWS.felt.dataBase, '/data/felt');
assert.strictEqual(StandplassEmbed.VIEWS.bane.dataBase, '/data/bane');
assert.strictEqual(StandplassEmbed.VIEWS.terminliste.title, 'Terminliste');
assert.strictEqual(StandplassEmbed.VIEWS.terminliste.dataBase, undefined, 'terminliste has no static JSON, unlike felt/bane');

var markup = StandplassEmbed.buildMarkup('felt', 'felt');
assert.ok(markup.indexOf('<h1 class="section-title">Feltskyting</h1>') !== -1);
assert.ok(markup.indexOf('id="felt-year"') !== -1, 'ids must be parameterized by idPrefix');
assert.ok(markup.indexOf('id="felt-rows"') !== -1);
assert.ok(markup.indexOf('id="felt-person-modal"') !== -1);
assert.ok(markup.indexOf('id="felt-embed-builder"') !== -1);

// The shared "Kolonner" picker button is NOT buildMarkup's to emit:
// it lives in the stats bar (stevner-page.js's overallStatsBar, next to
// "Fold alle") — emitted per render, after the dependencies load, and
// discovered by wirePicker through its data-dt-picker attribute. The
// embed markup must stay picker-free.
assert.ok(markup.indexOf('dt-picker') === -1, 'buildMarkup emits no picker markup (the stats bar owns it)');

var baneMarkup = StandplassEmbed.buildMarkup('bane', 'bane');
assert.ok(baneMarkup.indexOf('<h1 class="section-title">Baneskyting</h1>') !== -1);
assert.ok(baneMarkup.indexOf('id="bane-rows"') !== -1);
assert.ok(baneMarkup.indexOf('dt-picker') === -1, 'bane markup stays picker-free too');

// A second felt instance with a different idPrefix (multiple embeds of the
// same view on one host page) must not collide on element ids.
var secondInstance = StandplassEmbed.buildMarkup('felt-widget-2', 'felt');
assert.ok(secondInstance.indexOf('id="felt-widget-2-rows"') !== -1);

assert.strictEqual(StandplassEmbed.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(StandplassEmbed.esc('"quoted"'), '&quot;quoted&quot;');

assert.strictEqual(StandplassEmbed.safeIdPrefix('felt-widget-2', 'felt'), 'felt-widget-2', 'a safe id passes through unchanged');
assert.strictEqual(StandplassEmbed.safeIdPrefix('x" onmouseover="alert(1)', 'felt'), 'felt', 'an unsafe id falls back to the view name');
assert.strictEqual(StandplassEmbed.safeIdPrefix('', 'bane'), 'bane', 'an empty id falls back to the view name');

// The embed's dynamically loaded dependencies must include the shared
// base — and since the base no longer depends on any other table
// renderer, table-renderer.js must NOT be in the list (it was retired;
// loading it would 404 inside host pages). DEPENDENCY_PATHS is
// module-internal, so this reads the source text.
var fs = require('fs');
var path = require('path');
var embedSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'embed.js'), 'utf8');
var dtIdx = embedSource.indexOf("'/js/data-table.js'");
assert.ok(dtIdx !== -1, 'embed.js loads data-table.js');
assert.ok(embedSource.indexOf("'/js/resultfile-modal.js'") !== -1,
    'embed.js loads resultfile-modal.js (the stevne cards\' Resultatfil action)');
assert.ok(embedSource.indexOf("'/js/table-renderer.js'") === -1,
    'embed.js must not load the retired table-renderer.js');

console.log('embed.test.js: all assertions passed');
