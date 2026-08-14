var StandplassEmbedBuilder = (function () {
    'use strict';

    // Only real embed config is carried over — transient URL state such as
    // ?person=/?year= must not get baked into a permanent snippet. The regex
    // is a second line of defence: an attribute key is interpolated raw, so
    // anything but [a-z0-9-] could inject a live attribute (e.g. onmouseover).
    var ALLOWED_PARAMS = ['klubb', 'club', 'mode'];
    var SAFE_KEY = /^[a-z][a-z0-9-]*$/;

    function buildSnippet(view, search) {
        var params = new URLSearchParams(search);
        var attrs = ['data-standplass="' + view + '"'];
        ALLOWED_PARAMS.forEach(function (key) {
            var value = params.get(key);
            if (value == null || !SAFE_KEY.test(key)) { return; }
            attrs.push('data-' + key + '="' + value.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"');
        });
        return '<div ' + attrs.join(' ') + '></div>\n' +
            '<script src="https://standplass.com/embed.js"></script>';
    }

    return { buildSnippet: buildSnippet };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassEmbedBuilder;
}
