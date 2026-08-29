var assert = require('assert');
var CS = require('../public/js/nasjonalt-class-sort.js');

function cls(code, name) { return { id: code, name: name || code, code: code }; }

// Ported verbatim from the source's classSortKey/sortClasses
// (resultatliste-nasjonalt.js) -- there is no live API field this order
// comes from (checked disciplineCode, classCode, sortOrder -- none of
// them encode it), same class of gotcha as klubb's discipline-card order.
// Fed in reverse/scrambled order on purpose so the test actually exercises
// sorting, not just "already sorted, stays sorted".
var scrambled = [
    cls('K'), cls('M'), cls('D'), cls('C'), cls('B'), cls('A'),
    cls('PPC'), cls('P3'), cls('P10'), cls('SH'),
    cls('X-NM', 'Alpha'), cls('X-N', 'Zulu'),
    cls('W55'), cls('M42'), cls('V73'), cls('V'), cls('V55'),
    cls('U'), cls('U12'), cls('U14'), cls('U16'), cls('U-annet', 'U-noe'),
    cls('Jr-annet', 'Jr-noe'), cls('Jr'), cls('JK'), cls('JM'),
    cls('ÅR'), cls('Å-2'), cls('Sr'), cls('Å')
];
var sorted = CS.sortClasses(scrambled).map(function (c) { return c.code; });

assert.deepStrictEqual(sorted, [
    'A', 'B', 'C', 'D',
    'Å', 'Sr', 'Å-2', 'ÅR',
    'JM', 'JK', 'Jr', 'Jr-annet',
    'U16', 'U14', 'U12', 'U', 'U-annet',
    'V55', 'V73', 'V',
    'M42',
    'W55',
    'M', 'K',
    'SH',
    'P3', 'P10', 'PPC',
    'X-N',
    'X-NM'
], 'full bucket order: A/B/C/D, senior, junior, youth, V/M/W age brackets, M/K, SH, P-classes, -N suffix, -NM suffix, unknown');

// A code the algorithm has no rule for falls into the last bucket, sorted
// alphabetically among any other unknowns -- not thrown, not silently
// dropped.
var withUnknown = CS.sortClasses([cls('A'), cls('ZZZ-unknown'), cls('B')]).map(function (c) { return c.code; });
assert.deepStrictEqual(withUnknown, ['A', 'B', 'ZZZ-unknown'], 'unrecognized codes sort last, not first or thrown');

// Within the same bucket+sub-bucket, falls back to Norwegian-locale name
// comparison -- exercised here since two V\d entries share bucket 4 but
// different ages already covers numeric ordering; this checks the [2]
// (name) tiebreaker specifically with two entries that'd otherwise tie.
var namesTie = CS.sortClasses([
    { id: '1', name: 'Øvre', code: 'M' },
    { id: '2', name: 'Andre', code: 'K' }
]);
// M and K are different sub-buckets (0 vs 1) so this doesn't actually
// tie -- included to document that [0],[1] are checked before [2], not
// to assert a same-bucket name tiebreak (no two source-defined codes
// share both bucket and sub-bucket in this algorithm).
assert.deepStrictEqual(namesTie.map(function (c) { return c.code; }), ['M', 'K']);

console.log('nasjonalt-class-sort.test.js: all assertions passed');
