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

    // Everything stevner-page.js needs, loaded once at runtime by whichever
    // adapter mounts first (mountDirect or the custom element) -- these load
    // in parallel, since none of them reference each other at top-level
    // script-evaluation time, only later, inside function bodies (init())
    // that don't run until every one of these has already loaded.
    var DEPENDENCY_PATHS = [
        '/js/format.js', '/js/data-fetch-cache.js', '/js/table-renderer.js',
        '/js/pagination.js', '/js/person-modal.js', '/js/filter-widgets.js',
        '/js/url-state.js', '/js/mode-resolve.js', '/js/embed-builder.js', '/js/stevner-page.js'
    ];
    var dependenciesPromise = null;
    function ensureDependencies() {
        if (!dependenciesPromise) {
            // Root-relative on standplass.com itself (prod or a local mirror
            // served under that hostname) so a dev server / preview
            // deployment loads its own local JS instead of silently pulling
            // production scripts; absolute for every other hostname, since
            // that's a real 3rd-party embed with no local copy of these files.
            var prefix = location.hostname === 'standplass.com' ? '' : 'https://standplass.com';
            dependenciesPromise = Promise.all(DEPENDENCY_PATHS.map(function (path) {
                return new Promise(function (resolve, reject) {
                    var script = document.createElement('script');
                    script.src = prefix + path;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }));
        }
        return dependenciesPromise;
    }

    // Shared by both adapters and every instance of either -- see
    // stevner-page.js's own fetcher wiring (config.fetcher) for why this
    // must be a singleton rather than one per instance. Only ever called
    // after ensureDependencies() resolves, since StandplassData is one of
    // the scripts it loads.
    var sharedFetcher = null;
    function getSharedFetcher() {
        if (!sharedFetcher) { sharedFetcher = StandplassData.createFetcher(window.fetch.bind(window)); }
        return sharedFetcher;
    }

    // Used by standplass's own pages (felt.html/bane.html). No shadow DOM --
    // there is nothing to isolate from on your own site. URL sync is always
    // on here, matching normal browsing behavior.
    function mountDirect(config) {
        var view = config.view;
        var idPrefix = config.idPrefix;
        var container = document.getElementById(idPrefix + '-root');
        if (!VIEWS[view]) {
            container.innerHTML = '<p>Ukjent visning: "' + esc(view) + '". Gyldige verdier: '
                + Object.keys(VIEWS).join(', ') + '.</p>';
            return;
        }
        var params = new URLSearchParams(window.location.search);
        var club = params.get('club');
        if (club) { document.documentElement.setAttribute('data-club', club); }
        // Mode is resolved by site-chrome.js, which runs before this file
        // on every direct-mount page.

        container.innerHTML = buildMarkup(idPrefix, view);
        ensureDependencies().then(function () {
            StandplassStevnerPage.init({
                view: view,
                dataBase: VIEWS[view].dataBase,
                idPrefix: idPrefix,
                root: document,
                urlState: StandplassUrlState.createController({ namespace: null }),
                fetcher: getSharedFetcher()
            });

            document.getElementById(idPrefix + '-embed-builder').innerHTML =
                '<button type="button" id="' + idPrefix + '-create-embed">Opprett innebygging</button><pre id="' + idPrefix + '-embed-snippet"></pre>';
            document.getElementById(idPrefix + '-create-embed').addEventListener('click', function () {
                document.getElementById(idPrefix + '-embed-snippet').textContent =
                    StandplassEmbedBuilder.buildSnippet(view, window.location.search);
            });
        }).catch(function () {
            // A blocked/failed dependency script (adblocker, CDN blip,
            // corporate proxy) would otherwise leave the container in its
            // pre-init state forever with no clue why -- surface it instead.
            container.innerHTML = '<p>' + esc('Kunne ikke laste nødvendige ressurser.') + '</p>';
        });
    }

    // <link>, not adoptedStyleSheets: a fetch()-based CSSStyleSheet approach
    // needs CORS on styles.css/themes.css (this project's CORS rule only
    // covers /data/*, see Task 8) and has no error-handling path if that
    // fetch fails -- on a real 3rd-party page it would silently hang the
    // whole widget. <link> needs no CORS to render, degrades the same way
    // any normal cross-origin stylesheet load does, and is the only path
    // here, not a rare fallback for an optimization this project doesn't
    // need yet (there are no current embedders to share CSSOM-parse cost
    // across).
    function attachStyles(shadowRoot) {
        return Promise.all(['/styles.css', '/themes.css'].map(function (path) {
            return new Promise(function (resolve) {
                var link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://standplass.com' + path;
                // Resolve even on error -- a missing/broken stylesheet
                // shouldn't block the widget from ever rendering, just
                // leave it unstyled.
                link.onload = resolve;
                link.onerror = resolve;
                shadowRoot.appendChild(link);
            });
        }));
    }

    // Tracks which sync-url namespaces are already in use on this page, so a
    // second same-view instance without a unique id (which would silently
    // collide on the same URL param -- see url-state.js) gets a diagnostic
    // instead of a silent, confusing collision.
    var seenSyncedNamespaces = {};

    // Subclassing a built-in element (HTMLElement) requires real ES6 class
    // syntax -- there is no correct ES5 prototype-chain workaround for this,
    // unlike the rest of this codebase's var/function IIFE convention. Guard
    // the whole definition: a bare `class X extends HTMLElement` throws
    // immediately (HTMLElement doesn't exist) the moment this file is
    // require()'d under Node for embed.test.js, before customElements.define
    // is even reached, so this must not run outside a real browser.
    if (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {
        class StandplassResultsElement extends HTMLElement {
            connectedCallback() {
                var el = this;
                // A host framework detaching/reattaching this element fires
                // connectedCallback again -- attachShadow() throws if a
                // shadow root already exists, so bail out rather than retry.
                if (el.shadowRoot) { return; }

                var view = el.getAttribute('view');

                if (!VIEWS[view]) {
                    var shadow = el.attachShadow({ mode: 'open' });
                    shadow.innerHTML = '<p>Ukjent visning for &lt;standplass-results&gt;: "'
                        + esc(view || '(mangler)') + '". Gyldige verdier: ' + Object.keys(VIEWS).join(', ') + '.</p>';
                    return;
                }

                // A host-supplied id="" flows straight into buildMarkup's
                // HTML attribute interpolation -- reject anything unsafe
                // rather than trust it (see Task 6's safeIdPrefix).
                var idPrefix = safeIdPrefix(el.id || view, view);
                var syncUrl = el.hasAttribute('sync-url');
                if (syncUrl) {
                    if (seenSyncedNamespaces[idPrefix]) {
                        console.warn('standplass-results: another instance is already using the URL-sync '
                            + 'namespace "' + idPrefix + '" -- set a unique id="" attribute on each '
                            + '<standplass-results view="' + view + '"> to avoid them overwriting each '
                            + 'other\'s URL state.');
                    }
                    seenSyncedNamespaces[idPrefix] = true;
                }

                var shadowRoot = el.attachShadow({ mode: 'open' });
                var wrapper = document.createElement('div');
                // A landmark + label: this content is no longer isolated from
                // the host page's own heading outline the way an iframe was,
                // so the shared <h1> would otherwise surface directly in the
                // host's own heading navigation with nothing to explain it.
                wrapper.setAttribute('role', 'region');
                wrapper.setAttribute('aria-label', VIEWS[view].title);

                var club = el.getAttribute('club');
                if (club) { wrapper.setAttribute('data-club', club); }

                wrapper.innerHTML = buildMarkup(idPrefix, view);
                // Hidden until styles are attached below -- unlike today's
                // iframe (which blocks on its own document's stylesheet load
                // before painting anything), Shadow DOM content is visible
                // synchronously the instant it's appended, which would
                // otherwise guarantee a flash of unstyled content on every
                // embed load.
                wrapper.style.visibility = 'hidden';
                shadowRoot.appendChild(wrapper);

                Promise.all([attachStyles(shadowRoot), ensureDependencies()]).then(function () {
                    wrapper.style.visibility = '';

                    var mode = StandplassModeResolve.resolveMode({
                        explicitMode: el.getAttribute('mode'),
                        prefersDark: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : null
                    });
                    wrapper.setAttribute('data-mode', mode);

                    var urlState = StandplassUrlState.createController({ namespace: idPrefix, syncUrl: syncUrl });
                    var klubbAttr = el.getAttribute('klubb');
                    if (klubbAttr) {
                        // Read-modify-write, matching every other
                        // urlState.setSearch() call site in stevner-page.js --
                        // passing only `klubb` here would otherwise wipe out
                        // any person/year already on the URL (e.g. a
                        // bookmarked deep link into this embed's person
                        // modal) before init() gets a chance to read it.
                        var qs = new URLSearchParams(urlState.getSearch());
                        qs.set('klubb', klubbAttr);
                        urlState.setSearch('?' + qs.toString());
                    }
                    StandplassStevnerPage.init({
                        view: view,
                        dataBase: 'https://standplass.com' + VIEWS[view].dataBase,
                        idPrefix: idPrefix,
                        root: shadowRoot,
                        urlState: urlState,
                        fetcher: getSharedFetcher()
                    });
                }).catch(function () {
                    // Same reasoning as mountDirect's .catch: without this,
                    // a blocked/failed dependency script leaves the wrapper
                    // permanently `visibility: hidden` with only a silent
                    // unhandled rejection in the host's console.
                    wrapper.style.visibility = '';
                    wrapper.innerHTML = '<p>' + esc('Kunne ikke laste nødvendige ressurser.') + '</p>';
                });
            }
        }

        customElements.define('standplass-results', StandplassResultsElement);
    }

    return { VIEWS: VIEWS, buildMarkup: buildMarkup, esc: esc, safeIdPrefix: safeIdPrefix, mountDirect: mountDirect };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassEmbed;
}
