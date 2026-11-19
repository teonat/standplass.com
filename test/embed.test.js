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

// The shared "Kolonner" picker for the card tables: buildMarkup emits it
// as STATIC markup right after the group toggle. It must byte-mirror the
// base's renderPickerButton() output — buildMarkup runs before the
// dependency scripts load, so it cannot call into data-table.js; the
// page wires this button via wirePicker once everything is up.
var pickerGolden = '<div class="stevner-table-controls">'
    + '<button type="button" class="dt-picker-btn" data-dt-picker aria-haspopup="true" aria-expanded="false">Kolonner</button>'
    + '<div class="dt-picker-anchor"></div>'
    + '</div>';
assert.ok(markup.indexOf(pickerGolden) !== -1,
    'buildMarkup emits the static shared-picker markup (byte-mirror of renderPickerButton)');

var baneMarkup = StandplassEmbed.buildMarkup('bane', 'bane');
assert.ok(baneMarkup.indexOf('<h1 class="section-title">Baneskyting</h1>') !== -1);
assert.ok(baneMarkup.indexOf('id="bane-rows"') !== -1);
assert.ok(baneMarkup.indexOf(pickerGolden) !== -1, 'bane gets the same shared picker');

// A second felt instance with a different idPrefix (multiple embeds of the
// same view on one host page) must not collide on element ids.
var secondInstance = StandplassEmbed.buildMarkup('felt-widget-2', 'felt');
assert.ok(secondInstance.indexOf('id="felt-widget-2-rows"') !== -1);

assert.strictEqual(StandplassEmbed.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(StandplassEmbed.esc('"quoted"'), '&quot;quoted&quot;');

assert.strictEqual(StandplassEmbed.safeIdPrefix('felt-widget-2', 'felt'), 'felt-widget-2', 'a safe id passes through unchanged');
assert.strictEqual(StandplassEmbed.safeIdPrefix('x" onmouseover="alert(1)', 'felt'), 'felt', 'an unsafe id falls back to the view name');
assert.strictEqual(StandplassEmbed.safeIdPrefix('', 'bane'), 'bane', 'an empty id falls back to the view name');

// The embed's dynamically loaded dependencies follow the same ordering
// rule as every page's script tags: table-renderer.js BEFORE data-table.js
// (the base calls the StandplassTable global for numeric sorts — loading
// only the base makes every numeric sort throw, the /klubb lesson).
// DEPENDENCY_PATHS is module-internal, so this reads the source text —
// the html-script-order test's precedent.
var fs = require('fs');
var path = require('path');
var embedSource = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'embed.js'), 'utf8');
var trIdx = embedSource.indexOf("'/js/table-renderer.js'");
var dtIdx = embedSource.indexOf("'/js/data-table.js'");
assert.ok(trIdx !== -1, 'embed.js loads table-renderer.js');
assert.ok(dtIdx !== -1, 'embed.js loads data-table.js');
assert.ok(trIdx < dtIdx, 'embed dependencies: table-renderer.js must load BEFORE data-table.js');

console.log('embed.test.js: all assertions passed');
