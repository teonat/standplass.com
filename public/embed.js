// public/embed.js
//
// Loaded by both standplass's own pages (felt.html/bane.html, the
// direct-mount adapter) and any 3rd-party page embedding a
// <standplass-results> custom element (the custom-element adapter). Both
// adapters render from the one buildMarkup() function below so there is
// exactly one place that defines what the UI looks like.
var StandplassEmbed = (function () {
    'use strict';

    // document.currentScript is only valid during this script's own
    // synchronous top-level execution (a plain <script src>, no async/defer,
    // exactly what buildSnippet()'s generated tag is) -- captured once, here,
    // rather than read lazily later (e.g. inside a custom element's
    // connectedCallback, which can fire on a later tick, by which point it's
    // reverted to null). Gives the *origin this exact file was loaded from*
    // unambiguously, unlike location.hostname (see the comment on
    // ensureDependencies below for why that's not usable here) -- correct
    // whether that's production, a staging domain, or a local dev server.
    var SELF_ORIGIN = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src)
        ? new URL(document.currentScript.src).origin
        : 'https://standplass.com';

    var VIEWS = {
        felt: { title: 'Feltskyting', dataBase: '/data/felt' },
        bane: { title: 'Baneskyting', dataBase: '/data/bane' },
        terminliste: { title: 'Terminliste' }
    };

    // Everything felt.html/bane.html used to hand-author between <h1> and
    // </main>, parameterized by idPrefix (matching the existing felt/bane
    // convention -- see stevner-page.js's own header comment) so two
    // instances of the same view on one host page never collide on element
    // ids, as long as each is given a distinct idPrefix.
    function buildMarkup(idPrefix, view) {
        var title = VIEWS[view].title;
        return '<div class="container">'
            + '<p class="section-label">Resultater</p>'
            + '<h1 class="section-title">' + title + '</h1>'
            + '<p class="section-lead">Resultater hentet fra skyting.no.</p>'
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
            + '    <label>Arrangør</label>'
            + '    <ul class="tag-list" id="' + idPrefix + '-organizer-tags" aria-label="Valgte arrangører" aria-live="polite"></ul>'
            + '    <div class="autocomplete-wrap" id="' + idPrefix + '-organizer-wrap">'
            + '      <input type="text" id="' + idPrefix + '-organizer-input" class="filter-input" autocomplete="off"'
            + '             aria-autocomplete="list" aria-controls="' + idPrefix + '-organizer-list" aria-expanded="false"'
            + '             placeholder="Søk arrangør…">'
            + '      <button type="button" class="combo-clear" id="' + idPrefix + '-organizer-clear" aria-label="Fjern alle arrangører">×</button>'
            + '      <ul class="autocomplete-list" id="' + idPrefix + '-organizer-list" role="listbox" aria-label="Arrangører" hidden></ul>'
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
            + '  <div class="filter-group">'
            + '    <label for="' + idPrefix + '-comp">Stevne</label>'
            + '    <div class="autocomplete-wrap" id="' + idPrefix + '-comp-wrap">'
            + '      <input type="text" id="' + idPrefix + '-comp" class="filter-input" autocomplete="off" placeholder="Søk stevnenavn…">'
            + '      <button type="button" class="combo-clear" id="' + idPrefix + '-comp-clear" aria-label="Fjern stevnefilter">×</button>'
            + '    </div>'
            + '  </div>'
            + '  <button type="button" class="clear-all-filters-btn" id="' + idPrefix + '-clear-filters">Nullstill filtre</button>'
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
            + '<p class="ranking-status-msg" id="' + idPrefix + '-status" aria-live="polite"></p>'
            + '<div id="' + idPrefix + '-rows"></div>'
            + '<button class="ranking-more-btn" id="' + idPrefix + '-load-more" type="button">Last flere</button>'
            // role/aria-labelledby instead of a native <dialog> -- no
            // aria-modal, since there is no focus trap and claiming one
            // would lie to screen readers.
            + '<div id="' + idPrefix + '-person-modal" role="dialog" aria-labelledby="' + idPrefix + '-person-modal-title" hidden></div>'
            + '<div id="' + idPrefix + '-embed-builder"></div>'
            + '</div>'; // closes .container
    }

    // Terminliste is a genuinely different page engine (different filter
    // bar, no year/program/group toggles) -- felt/bane keep using the one
    // buildMarkup/StandplassStevnerPage.init above unchanged; terminliste
    // provides its own markup/init, resolved here rather than baked into
    // the VIEWS literal (StandplassTerminlistePage doesn't exist yet at
    // embed.js's own parse time -- it's one of ensureDependencies()'s
    // scripts, loaded and evaluated later, in the same global scope).
    function buildMarkupFor(idPrefix, view, compact) {
        return view === 'terminliste' ? StandplassTerminlistePage.buildMarkup(idPrefix, compact) : buildMarkup(idPrefix, view);
    }
    function initFor(view, config) {
        if (view === 'terminliste') { StandplassTerminlistePage.init(config); } else { StandplassStevnerPage.init(config); }
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
        '/js/pagination.js', '/js/person-modal.js', '/js/person-modal-controller.js',
        '/js/filter-widgets.js', '/js/url-state.js', '/js/mode-resolve.js',
        '/js/embed-builder.js', '/js/stevner-page.js', '/js/comp-modal.js',
        '/js/nsf-orgs.js', '/js/klubb-discipline-groups.js', '/js/terminliste-page.js'
    ];
    var dependenciesPromise = null;
    // `absolute` is set by the caller, not sniffed from location.hostname --
    // hostname can't tell "a dev server serving this same public/ directory"
    // (any hostname, including localhost) apart from "a genuine 3rd-party
    // page with no local copy of these files" (also any hostname). The two
    // call sites below already know unambiguously which situation they're
    // in, so they say so directly: mountDirect always passes nothing
    // (root-relative -- it only ever runs shipped alongside these files),
    // the custom element always passes true (absolute -- SELF_ORIGIN above
    // is exactly where *this* embed.js was loaded from, whether that's
    // production, a staging domain, or a local dev server serving the same
    // public/ directory for testing).
    function ensureDependencies(absolute) {
        if (!dependenciesPromise) {
            var prefix = absolute ? SELF_ORIGIN : '';
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

        container.innerHTML = buildMarkupFor(idPrefix, view, false);
        ensureDependencies().then(function () {
            initFor(view, {
                view: view,
                dataBase: VIEWS[view].dataBase,
                idPrefix: idPrefix,
                root: document,
                urlState: StandplassUrlState.createController({ namespace: null }),
                fetcher: getSharedFetcher()
            });

            document.getElementById(idPrefix + '-embed-builder').innerHTML =
                '<button type="button" class="btn" id="' + idPrefix + '-create-embed" aria-expanded="false">Opprett innebygging</button>'
                + '<pre class="embed-snippet" id="' + idPrefix + '-embed-snippet" hidden></pre>';
            var createBtn = document.getElementById(idPrefix + '-create-embed');
            var snippetEl = document.getElementById(idPrefix + '-embed-snippet');
            createBtn.addEventListener('click', function () {
                // Toggle: a second click while already open closes it instead
                // of just re-writing the same (or, if klubb/club/mode hasn't
                // changed, identical-looking) content. Reopening always
                // rebuilds from the current URL, so it's never stale.
                var opening = snippetEl.hidden;
                snippetEl.hidden = !opening;
                createBtn.setAttribute('aria-expanded', String(opening));
                if (opening) {
                    snippetEl.textContent = StandplassEmbedBuilder.buildSnippet(view, window.location.search);
                }
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
    // `absolute` works exactly like ensureDependencies()'s parameter above and
    // for the same reason -- the two must agree about where this page's assets
    // live, so neither sniffs it.
    function attachStyles(shadowRoot, absolute) {
        var prefix = absolute ? SELF_ORIGIN : '';
        return Promise.all(['/styles.css', '/themes.css'].map(function (path) {
            return new Promise(function (resolve) {
                var link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = prefix + path;
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
                var compact = el.hasAttribute('compact');
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

                wrapper.innerHTML = buildMarkupFor(idPrefix, view, compact);
                // Hidden until styles are attached below -- unlike today's
                // iframe (which blocks on its own document's stylesheet load
                // before painting anything), Shadow DOM content is visible
                // synchronously the instant it's appended, which would
                // otherwise guarantee a flash of unstyled content on every
                // embed load.
                wrapper.style.visibility = 'hidden';
                shadowRoot.appendChild(wrapper);

                Promise.all([attachStyles(shadowRoot, true), ensureDependencies(true)]).then(function () {
                    wrapper.style.visibility = '';

                    var mode = StandplassModeResolve.resolveMode({
                        explicitMode: el.getAttribute('mode'),
                        prefersDark: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : null
                    });
                    wrapper.setAttribute('data-mode', mode);
                    // Also on the host: themes.css's dark media query selects
                    // :host:not([data-mode="light"]), which only ever sees the
                    // host element -- without this, mode="light" is silently
                    // ignored whenever the visitor's OS prefers dark.
                    el.setAttribute('data-mode', mode);

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
                    initFor(view, {
                        view: view,
                        dataBase: view === 'terminliste' ? null : SELF_ORIGIN + VIEWS[view].dataBase,
                        idPrefix: idPrefix,
                        root: shadowRoot,
                        urlState: urlState,
                        fetcher: getSharedFetcher(),
                        compact: compact,
                        klubb: el.getAttribute('klubb') || null
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
