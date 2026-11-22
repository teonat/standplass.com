'use strict';
var assert = require('node:assert');
var KD = require('../public/js/krets-distrikter.js');
var kretser = require('../.github/scripts/kretser.json');

// The mapping ships client-side for the DM page's krets filter (users
// know their krets, not their distrikt); kretser.json is the generated
// GUID list it must stay in sync with — every short name in kretser.json
// must resolve, or the dm krets finder silently drops that krets.

assert.ok(KD.distriktFor && typeof KD.distriktFor === 'object',
    'exports distriktFor as a plain object');
assert.strictEqual(Object.keys(KD.distriktFor).length, 19, '19 kretser mapped');

var distrikter = {};
Object.keys(KD.distriktFor).forEach(function (k) { distrikter[KD.distriktFor[k]] = true; });
assert.strictEqual(Object.keys(distrikter).length, 6, '6 distrikter');

Object.keys(kretser).forEach(function (guid) {
    assert.ok(KD.distriktFor[kretser[guid].short] != null,
        'every kretser.json short name has a distrikt (drift guard): ' + kretser[guid].short);
});

console.log('krets-distrikter.test.js: all assertions passed');
