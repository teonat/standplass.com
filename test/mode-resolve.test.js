'use strict';
var assert = require('node:assert');
var StandplassModeResolve = require('../public/js/mode-resolve.js');

assert.strictEqual(
    StandplassModeResolve.resolveMode({ attrMode: 'dark', explicitMode: 'light', stored: 'light', prefersDark: false }),
    'dark', 'an already-set attribute wins over everything'
);
assert.strictEqual(
    StandplassModeResolve.resolveMode({ explicitMode: 'light', stored: 'dark', prefersDark: true }),
    'light', 'explicit source (?mode=/mode attribute) wins over stored/OS'
);
assert.strictEqual(
    StandplassModeResolve.resolveMode({ stored: 'light', prefersDark: true }),
    'light', 'stored choice wins over OS preference'
);
assert.strictEqual(StandplassModeResolve.resolveMode({ prefersDark: true }), 'dark', 'OS dark preference is honoured');
assert.strictEqual(StandplassModeResolve.resolveMode({ prefersDark: false }), 'light', 'OS light preference is honoured');
assert.strictEqual(StandplassModeResolve.resolveMode({ prefersDark: null }), 'dark', 'unsupported matchMedia falls back to dark by default');
assert.strictEqual(StandplassModeResolve.resolveMode({ prefersDark: null, fallback: 'light' }), 'light', 'fallback is overridable');
assert.strictEqual(StandplassModeResolve.resolveMode({}), 'dark', 'no config at all still resolves to the default fallback');

console.log('mode-resolve.test.js: all assertions passed');
