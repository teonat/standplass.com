// public/embed.js
//
// Loaded by both standplass's own pages (felt.html/bane.html, the
// direct-mount adapter) and any 3rd-party page embedding a
// <standplass-results> custom element (the custom-element adapter). Both
// adapters render from the one buildMarkup() function below so there is
// exactly one place that defines what the UI looks like.
var StandplassEmbed = (function () {
    'use strict';

    var VIEWS = {
        felt: { title: 'Feltskyting', dataBase: '/data/felt' },
        bane: { title: 'Baneskyting', dataBase: '/data/bane' }
    };

    // Everything felt.html/bane.html used to hand-author between <h1> and
    // </main>, parameterized by idPrefix (matching the existing felt/bane
    // convention -- see stevner-page.js's own header comment) so two
    // instances of the same view on one host page never collide on element
    // ids, as long as each is given a distinct idPrefix.
    function buildMarkup(idPrefix, view) {
        var title = VIEWS[view].title;
        return ''
            + '<h1>' + title + '</h1>'
            + '<div class="ranking-filters" id="' + idPrefix + '-filters">'
            + '  <div class="filter-group">'
            + '    <label for="' + idPrefix + '-year">År</label>'
            + '    <select id="' + idPrefix + '-year"></select>'
            + '  </div>'
            + '  <div class="filter-group">'
            + '    <label>Klubb</label>'
            + '    <ul class="tag-list" id="' + idPrefix + '-club-tags" aria-label="Valgte klubber" aria-live="polite"></ul>'
            + '    <div class="autocomplete-wrap" id="' + idPrefix + '-club-wrap">'
            + '      <input type="text" id="' + idPrefix + '-club-input" class="filter-input" autocomplete="off"'
            + '             aria-autocomplete="list" aria-controls="' + idPrefix + '-club-list" aria-expanded="false"'
            + '             placeholder="Søk klubb…">'
            + '      <button type="button" class="combo-clear" id="' + idPrefix + '-club-clear" aria-label="Fjern alle klubber">×</button>'
            + '      <ul class="autocomplete-list" id="' + idPrefix + '-club-list" role="listbox" aria-label="Klubber" hidden></ul>'
            + '    </div>'
            + '  </div>'
            + '  <div class="filter-group">'
            + '    <label>Øvelse</label>'
            + '    <div class="checkbox-dropdown">'
            + '      <button type="button" id="' + idPrefix + '-disc-btn" class="checkbox-dropdown-btn" aria-expanded="false" aria-controls="' + idPrefix + '-disc-panel">Alle øvelser</button>'
            + '      <div class="checkbox-dropdown-panel" id="' + idPrefix + '-disc-panel" hidden role="group">'
            + '        <button type="button" id="' + idPrefix + '-disc-clear" class="checkbox-dropdown-clear-all">Fjern alle</button>'
            + '        <ul id="' + idPrefix + '-disc-list" class="checkbox-dropdown-list" aria-label="Velg øvelser"></ul>'
            + '      </div>'
            + '    </div>'
            + '  </div>'
            + '  <div class="filter-group">'
            + '    <label for="' + idPrefix + '-name">Skytter</label>'
            + '    <div class="autocomplete-wrap" id="' + idPrefix + '-name-wrap">'
            + '      <input type="text" id="' + idPrefix + '-name" class="filter-input" autocomplete="off"'
            + '             aria-autocomplete="list" aria-controls="' + idPrefix + '-name-list" aria-expanded="false"'
            + '             placeholder="Søk navn…">'
            + '      <button type="button" class="combo-clear" id="' + idPrefix + '-name-clear" aria-label="Fjern navnefilter">×</button>'
            + '      <ul class="autocomplete-list" id="' + idPrefix + '-name-list" role="listbox" aria-label="Navn" hidden></ul>'
            + '    </div>'
            + '  </div>'
            + '</div>'
            + '<div class="program-toggle" id="' + idPrefix + '-tab-toggle" role="group" aria-label="Velg visning">'
            + '  <button type="button" class="program-btn program-btn--active" data-tab="alle" aria-pressed="true">Alle</button>'
            + '  <button type="button" class="program-btn" data-tab="klasse" aria-pressed="false"'
            + '          title="Stevner der resultater teller for klasseopprykk og -nedrykk">Klasseførende</button>'
            + '  <button type="button" class="program-btn" data-tab="ikke" aria-pressed="false">Ikke klasseførende</button>'
            + '</div>'
            + '<div class="program-toggle" id="' + idPrefix + '-group-toggle" role="group" aria-label="Gruppering">'
            + '  <button type="button" class="program-btn program-btn--active" data-group="klasse" aria-pressed="true">Per klasse</button>'
            + '  <button type="button" class="program-btn" data-group="ovelse" aria-pressed="false">Per øvelse</button>'
            + '  <button type="button" class="program-btn" data-group="poeng" aria-pressed="false">Poengsum</button>'
            + '</div>'
            + '<table class="ranking-table">'
            + '  <thead>'
            + '    <tr>'
            + '      <th scope="col">#</th>'
            + '      <th scope="col">Navn</th>'
            + '      <th scope="col">Klubb</th>'
            + '      <th scope="col">Øvelse</th>'
            + '      <th scope="col">Klasse</th>'
            + '      <th scope="col">Poeng</th>'
            + '      <th scope="col">Ranking</th>'
            + '    </tr>'
            + '  </thead>'
            + '  <tbody id="' + idPrefix + '-rows"></tbody>'
            + '</table>'
            + '<button id="' + idPrefix + '-load-more" type="button">Last flere</button>'
            // role/aria-labelledby instead of a native <dialog> -- no
            // aria-modal, since there is no focus trap and claiming one
            // would lie to screen readers.
            + '<div id="' + idPrefix + '-person-modal" role="dialog" aria-labelledby="' + idPrefix + '-person-modal-title" hidden></div>'
            + '<div id="' + idPrefix + '-embed-builder"></div>';
    }

    // stevner-page.js's own local copy of this exact helper (table-renderer.js's
    // esc() isn't exported) -- kept as its own small copy here too rather than
    // shared, matching that file's existing precedent for this one function.
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // A host-supplied id="" attribute flows straight into buildMarkup's HTML
    // attribute interpolation (id="' + idPrefix + '-filters"' etc.) -- reject
    // anything that isn't a safe identifier rather than trust it, the same way
    // embed-builder.js's SAFE_KEY already guards its own attribute keys.
    var SAFE_ID_PREFIX = /^[a-z][a-z0-9-]*$/i;
    function safeIdPrefix(rawIdPrefix, view) {
        return SAFE_ID_PREFIX.test(rawIdPrefix) ? rawIdPrefix : view;
    }

    return { VIEWS: VIEWS, buildMarkup: buildMarkup, esc: esc, safeIdPrefix: safeIdPrefix };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassEmbed;
}
