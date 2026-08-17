'use strict';
var assert = require('node:assert');
var StandplassEmbed = require('../public/embed.js');

assert.deepStrictEqual(Object.keys(StandplassEmbed.VIEWS).sort(), ['bane', 'felt']);
assert.strictEqual(StandplassEmbed.VIEWS.felt.dataBase, '/data/felt');
assert.strictEqual(StandplassEmbed.VIEWS.bane.dataBase, '/data/bane');

var markup = StandplassEmbed.buildMarkup('felt', 'felt');
assert.ok(markup.indexOf('<h1 class="section-title">Feltskyting</h1>') !== -1);
assert.ok(markup.indexOf('id="felt-year"') !== -1, 'ids must be parameterized by idPrefix');
assert.ok(markup.indexOf('id="felt-rows"') !== -1);
assert.ok(markup.indexOf('id="felt-person-modal"') !== -1);
assert.ok(markup.indexOf('id="felt-embed-builder"') !== -1);

var baneMarkup = StandplassEmbed.buildMarkup('bane', 'bane');
assert.ok(baneMarkup.indexOf('<h1 class="section-title">Baneskyting</h1>') !== -1);
assert.ok(baneMarkup.indexOf('id="bane-rows"') !== -1);

// A second felt instance with a different idPrefix (multiple embeds of the
// same view on one host page) must not collide on element ids.
var secondInstance = StandplassEmbed.buildMarkup('felt-widget-2', 'felt');
assert.ok(secondInstance.indexOf('id="felt-widget-2-rows"') !== -1);

assert.strictEqual(StandplassEmbed.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(StandplassEmbed.esc('"quoted"'), '&quot;quoted&quot;');

assert.strictEqual(StandplassEmbed.safeIdPrefix('felt-widget-2', 'felt'), 'felt-widget-2', 'a safe id passes through unchanged');
assert.strictEqual(StandplassEmbed.safeIdPrefix('x" onmouseover="alert(1)', 'felt'), 'felt', 'an unsafe id falls back to the view name');
assert.strictEqual(StandplassEmbed.safeIdPrefix('', 'bane'), 'bane', 'an empty id falls back to the view name');

console.log('embed.test.js: all assertions passed');
