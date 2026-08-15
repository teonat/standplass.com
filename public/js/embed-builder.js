var StandplassEmbedBuilder = (function () {
    'use strict';

    // Only real embed config is carried over -- transient URL state such as
    // ?person=/?year= must not get baked into a permanent snippet. The regex
    // is a second line of defence: an attribute key is interpolated raw, so
    // anything but [a-z0-9-] could inject a live attribute (e.g. onmouseover).
    var ALLOWED_PARAMS = ['klubb', 'club', 'mode'];
    var SAFE_KEY = /^[a-z][a-z0-9-]*$/;

    function escapeAttr(value) {
        return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    function buildSnippet(view, search) {
        var params = new URLSearchParams(search);
        var attrs = ['view="' + view + '"'];
        ALLOWED_PARAMS.forEach(function (key) {
            var value = params.get(key);
            if (value == null || !SAFE_KEY.test(key)) { return; }
            attrs.push(key + '="' + escapeAttr(value) + '"');
        });
        return '<standplass-results ' + attrs.join(' ') + '>\n'
            + '  <p>Laster resultater… <a href="https://standplass.com/' + view + '">Se på standplass.com</a></p>\n'
            + '</standplass-results>\n'
            + '<script src="https://standplass.com/embed.js"></script>';
    }

    return { buildSnippet: buildSnippet };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassEmbedBuilder;
}
