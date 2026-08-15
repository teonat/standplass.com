'use strict';
var assert = require('node:assert');
var StandplassEmbedBuilder = require('../public/js/embed-builder.js');

var snippet = StandplassEmbedBuilder.buildSnippet('felt', '?klubb=eksempel&club=eksempelklubb');
assert.ok(snippet.indexOf('<standplass-results') !== -1, 'should emit a <standplass-results> element');
assert.ok(snippet.indexOf('view="felt"') !== -1);
assert.ok(snippet.indexOf('klubb="eksempel"') !== -1);
assert.ok(snippet.indexOf('club="eksempelklubb"') !== -1);
assert.ok(snippet.indexOf('<script src="https://standplass.com/embed.js"></script>') !== -1);

// Transient URL state must not be baked into the snippet.
var modalSnippet = StandplassEmbedBuilder.buildSnippet('felt', '?person=42&year=2025&klubb=eksempel');
assert.ok(modalSnippet.indexOf('person') === -1, 'should not carry ?person into the snippet');
assert.ok(modalSnippet.indexOf('year') === -1, 'should not carry ?year into the snippet');
assert.ok(modalSnippet.indexOf('klubb="eksempel"') !== -1);

// A hostile param key must not become an attribute.
var injected = StandplassEmbedBuilder.buildSnippet('felt', '?" onmouseover="alert(1)=1');
assert.ok(injected.indexOf('onmouseover') === -1, 'should not emit attributes for unknown/unsafe keys');

var emptySnippet = StandplassEmbedBuilder.buildSnippet('bane', '');
assert.ok(emptySnippet.indexOf('view="bane"') !== -1);
assert.ok(emptySnippet.indexOf('sync-url') === -1, 'sync-url is opt-in, never emitted by default');

console.log('embed-builder.test.js: all assertions passed');
