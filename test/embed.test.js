'use strict';
var assert = require('node:assert');
var StandplassEmbed = require('../public/embed.js');

var src = StandplassEmbed.buildIframeSrc('felt', { standplass: 'felt', klubb: 'eksempel', theme: 'eksempelklubb' });
assert.strictEqual(src, 'https://standplass.com/felt?embed=1&klubb=eksempel&theme=eksempelklubb');

var srcNoParams = StandplassEmbed.buildIframeSrc('bane', { standplass: 'bane' });
assert.strictEqual(srcNoParams, 'https://standplass.com/bane?embed=1');

console.log('embed.test.js: all assertions passed');
