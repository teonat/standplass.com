(function () {
    'use strict';

    var BASE_URL = 'https://standplass.com/';
    var LOAD_TIMEOUT_MS = 8000;
    var mountedIframes = [];

    function buildIframeSrc(view, dataset) {
        var params = new URLSearchParams();
        params.set('embed', '1');
        for (var key in dataset) {
            if (Object.prototype.hasOwnProperty.call(dataset, key) && key !== 'standplass') {
                params.set(key, dataset[key]);
            }
        }
        return BASE_URL + view + '?' + params.toString();
    }

    function showFallback(container) {
        container.innerHTML = '<p class="standplass-embed-error">' +
            'Resultatene er ikke tilgjengelige akkurat nå.</p>';
    }

    function mount(container) {
        var view = container.dataset.standplass;
        if (!view) { return; }

        var iframe = document.createElement('iframe');
        iframe.src = buildIframeSrc(view, container.dataset);
        iframe.title = 'Standplass – ' + view;
        iframe.style.width = '100%';
        iframe.style.border = '0';
        iframe.setAttribute('scrolling', 'no');

        var loaded = false;
        var timeoutId = setTimeout(function () {
            if (loaded) { return; }
            window.removeEventListener('message', onMessage);
            showFallback(container);
        }, LOAD_TIMEOUT_MS);

        // Several embeds can share a page, so only listen to our own iframe.
        function onMessage(event) {
            if (event.source !== iframe.contentWindow) { return; }
            if (event.origin !== 'https://standplass.com') { return; }
            if (!event.data || event.data.source !== 'standplass-embed') { return; }
            if (event.data.type === 'ready') {
                loaded = true;
                clearTimeout(timeoutId);
            }
            if (event.data.type === 'resize' && event.data.height) {
                iframe.style.height = event.data.height + 'px';
            }
        }

        window.addEventListener('message', onMessage);

        container.innerHTML = '';
        container.appendChild(iframe);
        mountedIframes.push(iframe);
    }

    function init() {
        var containers = document.querySelectorAll('[data-standplass]');
        for (var i = 0; i < containers.length; i++) {
            mount(containers[i]);
        }
    }

    function setMode(mode) {
        mountedIframes.forEach(function (iframe) {
            iframe.contentWindow.postMessage(
                { source: 'standplass-embed', type: 'set-mode', mode: mode },
                'https://standplass.com'
            );
        });
        try { localStorage.setItem('standplass_mode', mode); } catch (e) { /* ignore */ }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { buildIframeSrc: buildIframeSrc };
    } else {
        window.StandplassEmbed = { setMode: setMode };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
