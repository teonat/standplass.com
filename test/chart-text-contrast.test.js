'use strict';
// Pins the text-safety of the --chart-*-text variants: WCAG contrast
// >= 4.5:1 against the worst-case card surfaces (light: the kss
// preset's pure-white card; dark: the kss preset's #1e1e30), and the
// dark text values must equal the dark chart values (zero deviation
// in dark mode by design).
var assert = require('node:assert');
var fs = require('node:fs');

function lum(hex) {
    var c = hex.replace('#', '');
    function f(i) {
        var v = parseInt(c.substr(i * 2, 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * f(0) + 0.7152 * f(1) + 0.0722 * f(2);
}
function ratio(fg, bg) {
    var a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function extractVars(css, name) {
    var re = new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})', 'g');
    var out = [], m;
    while ((m = re.exec(css)) !== null) { out.push(m[1].toLowerCase()); }
    return out;
}

var styles = fs.readFileSync('public/styles.css', 'utf8');
var themes = fs.readFileSync('public/themes.css', 'utf8');
var HUES = ['blue', 'purple', 'green', 'red', 'orange', 'gold', 'silver', 'bronze'];

var LIGHT_SURFACES = ['#fffdf9', '#ffffff'];   // standplass + kss light cards
var DARK_SURFACES = ['#211f24', '#1e1e30'];     // standplass + kss dark cards

HUES.forEach(function (hue) {
    var light = extractVars(styles, 'chart-' + hue + '-text');
    assert.strictEqual(light.length, 1, '--chart-' + hue + '-text defined once (light) in styles.css');
    LIGHT_SURFACES.forEach(function (surface) {
        var r = ratio(light[0], surface);
        assert.ok(r >= 4.5, '--chart-' + hue + '-text ' + light[0] + ' is ' + r.toFixed(2)
            + ':1 on ' + surface + ' (need >= 4.5)');
    });
    // chart palette itself stays as it was — the text variant is an
    // addition, not a replacement (same hue family, chart untouched).
    var chartLight = extractVars(styles, 'chart-' + hue);
    assert.strictEqual(chartLight.length, 1, '--chart-' + hue + ' still defined (light)');
    assert.notStrictEqual(light[0], chartLight[0], 'text variant differs from chart in light (darkened)');

    var darkText = extractVars(themes, 'chart-' + hue + '-text');
    assert.ok(darkText.length >= 2, '--chart-' + hue + '-text present in both dark blocks');
    var darkChart = extractVars(themes, 'chart-' + hue);
    assert.ok(darkChart.length >= 2, '--chart-' + hue + ' present in both dark blocks');
    DARK_SURFACES.forEach(function (surface) {
        darkText.forEach(function (v) {
            var r = ratio(v, surface);
            assert.ok(r >= 4.5, 'dark --chart-' + hue + '-text ' + v + ' is ' + r.toFixed(2)
                + ':1 on ' + surface + ' (need >= 4.5)');
        });
    });
    // zero deviation in dark: text values == chart values, in both blocks
    assert.deepStrictEqual(darkText.slice().sort(), darkChart.slice().sort(),
        'dark --chart-' + hue + '-text equals the dark chart values');
});
