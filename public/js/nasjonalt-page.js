// public/js/nasjonalt-page.js
//
// Page glue for /nasjonalt: full NSF national ranking search across all 4
// branches (Pistol, Rifle, Leirdue, Viltmål) -- unlike klubb (Pistol-only,
// fixed discipline set), nasjonalt is the general-purpose search this
// project's other views don't need to be. Ported from the source's
// resultatliste-nasjonalt.js, generalized nowhere (the source itself is
// already club-neutral) except in how shooter-name clickability is gated
// -- see docs/superpowers/specs/2026-08-30-nasjonalt-view-design.md's
// "Clickability gate" section for why this project's own
// klubb-discipline-groups.js resolution is used instead of the source's
// own STEVNERESULTATER_DISC_IDS/BANE_IDS sets (found overinclusive during
// design: it wrongly counts PPC-group disciplines as felt-covered, which
// the felt scraper never actually collects).
var StandplassNasjonaltPage = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Class names carry a "Branch\" or "Branch/" prefix (e.g. "Pistol\A")
    // -- same stripping convention as comp-modal.js's ensureReferenceData.
    function cleanClassName(name) {
        return (name || '').replace(/^[^\\/]+[\\/]/, '');
    }

    // Deliberately independent of comp-modal.js's ensureReferenceData,
    // which is Pistol-branch-scoped on purpose (klubb/felt/bane's
    // competition modal only ever needs Pistol) -- nasjonalt needs every
    // branch, so it does its own fetch/processing rather than widen an
    // existing, already-reviewed Pistol-only contract. Pure: takes already-
    // fetched raw branchlist JSON, no fetch inside -- ensureBranchlist
    // below wraps this with the actual fetch + module-level cache.
    function processBranchlist(rawData) {
        var items = (rawData && rawData.items) || [];
        var branches = [];
        var disciplines = [];
        items.forEach(function (branch) {
            var sortedClasses = (branch.classes || [])
                .filter(function (c) { return !c.deleted; })
                .map(function (c) { return { id: c.id, name: cleanClassName(c.name), code: c.classCode }; });
            var seen = {};
            var branchDiscs = [];
            (branch.disciplineGroups || []).forEach(function (g) {
                (g.disciplines || []).forEach(function (d) {
                    if (!d.deleted && d.id && !seen[d.id]) {
                        seen[d.id] = true;
                        var disc = { id: d.id, name: d.name, branchId: d.branchId, classes: sortedClasses };
                        branchDiscs.push(disc);
                        disciplines.push(disc);
                    }
                });
            });
            if (branchDiscs.length) {
                branchDiscs.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'no'); });
                branches.push({ name: branch.name, disciplines: branchDiscs });
            }
        });
        return { branches: branches, disciplines: disciplines };
    }

    var branchlistPromise = null;
    var branchlistData = { branches: [], disciplines: [] };
    function ensureBranchlist(fetchFn) {
        if (branchlistPromise) { return branchlistPromise; }
        branchlistPromise = fetchFn('https://nsfapi.azurewebsites.net/query/branchlist')
            .then(function (r) { if (!r.ok) { throw new Error(String(r.status)); } return r.json(); })
            .then(function (data) { branchlistData = processBranchlist(data); return branchlistData; });
        return branchlistPromise;
    }

    // Clickability gate (see file header comment): a discipline is
    // clickable only if it's in klubb's own dynamically-resolved
    // Feltpistol+Spesialfelt or 5-bane-group membership -- computed once
    // whenever the branchlist is (re)loaded, not per-row.
    var clickableDiscIds = null;
    function computeClickableIds(groups) {
        var ids = {};
        StandplassKlubbDisciplineGroups.resolveFelt(groups).forEach(function (d) { ids[d.id] = true; });
        StandplassKlubbDisciplineGroups.resolveBane(groups).forEach(function (d) { ids[d.id] = true; });
        return ids;
    }
    function isClickable(disciplineId) {
        return !!(clickableDiscIds && clickableDiscIds[disciplineId]);
    }

    function yearFrom(y) { return (y - 1) + '-12-31T23:00:00.000Z'; }
    function yearTo(y) { return y + '-12-31T22:59:59.999Z'; }

    var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    function isValidIsoDate(s) {
        if (!s || !ISO_DATE_RE.test(s)) { return false; }
        var d = new Date(s + 'T00:00:00Z');
        return !isNaN(d) && d.toISOString().slice(0, 10) === s;
    }

    // ponytail: orderBy kept as a literal string, not via qs.set(), same
    // reason as klubb-page.js's own buildRankingUrl -- URLSearchParams
    // would percent-encode the colon, and this keeps the query string
    // byte-identical to what the source itself sends.
    function buildRankingUrl(opts) {
        var qs = new URLSearchParams();
        qs.set('pageIndex', '0');
        qs.set('pageSize', '500');
        qs.set('disciplineId', opts.disciplineId);
        qs.set('numberOfResults', String(opts.numberOfResults));
        qs.set('periodStart', opts.periodStart);
        qs.set('periodEnd', opts.periodEnd);
        if (opts.classId) { qs.set('classId', JSON.stringify([opts.classId])); }
        if (opts.kretsId) { qs.set('personRegionOrganizationId', JSON.stringify([opts.kretsId])); }
        if (opts.orgId) { qs.set('personOrganizationId', JSON.stringify([opts.orgId])); }
        return 'https://nsfapi.azurewebsites.net/ranking?orderBy=totalScore:desc&' + qs.toString();
    }

    function filterRankingEntries(items) {
        return (items || []).filter(function (e) { return (e.totalScore || 0) > 0; });
    }

    function init(config) {
        var root = config.root || document;
        var id = function (suffix) { return root.getElementById(config.idPrefix + suffix); };
        var urlState = config.urlState;
        var CURRENT_YEAR = new Date().getUTCFullYear();

        var discInput = id('-disc-input'), discList = id('-disc-list'), discClear = id('-disc-clear');
        var classInput = id('-class-input'), classList = id('-class-list'), classClear = id('-class-clear');
        var kretsInput = id('-krets-input'), kretsList = id('-krets-list'), kretsClear = id('-krets-clear');
        var clubInput = id('-club-input'), clubList = id('-club-list'), clubClear = id('-club-clear');
        var numSelect = id('-num-select');
        var yearSelect = id('-year-select');
        var statusEl = id('-status');
        var tableWrapEl = id('-table-wrap');

        var params = new URLSearchParams(urlState.getSearch());
        var selectedDisciplineId = params.get('disc') || null;
        var selectedDisciplineName = '';
        var selectedClassId = params.get('class') || null;
        var selectedClassName = '';
        var selectedKretsId = params.get('krets') || null;
        var selectedKretsName = '';
        var selectedOrgId = params.get('org') || null;
        var selectedOrgName = '';
        var numParam = parseInt(params.get('num'), 10);
        var selectedNumResults = (numParam >= 1 && numParam <= 10) ? numParam : 1;
        var selectedMode = params.get('mode') === 'periode' ? 'periode' : 'sesong';
        var yearParam = parseInt(params.get('year'), 10);
        var selectedYear = (yearParam >= CURRENT_YEAR - 5 && yearParam <= CURRENT_YEAR) ? yearParam : CURRENT_YEAR;
        var selectedFra = params.get('fra') || '';
        var selectedTil = params.get('til') || '';
        if (selectedMode === 'periode' && (!isValidIsoDate(selectedFra) || !isValidIsoDate(selectedTil) || selectedFra > selectedTil)) {
            selectedMode = 'sesong'; selectedFra = ''; selectedTil = '';
        }

        function setUrlParam(key, value) {
            var qs = new URLSearchParams(urlState.getSearch());
            if (value) { qs.set(key, value); } else { qs.delete(key); }
            urlState.setSearch('?' + qs.toString());
        }

        function buildDiscItems(query) {
            var q = (query || '').trim().toLowerCase();
            var items = [];
            branchlistData.branches.forEach(function (branch) {
                var matching = branch.disciplines.filter(function (d) { return !q || d.name.toLowerCase().indexOf(q) !== -1; });
                if (!matching.length) { return; }
                if (branchlistData.branches.length > 1) { items.push({ isGroup: true, name: branch.name }); }
                matching.forEach(function (d) { items.push({ id: d.id, name: d.name }); });
            });
            return items;
        }

        function buildClassItems(query) {
            var disc = branchlistData.disciplines.filter(function (d) { return d.id === selectedDisciplineId; })[0];
            if (!disc || !disc.classes.length) { return []; }
            var sorted = StandplassNasjonaltClassSort.sortClasses(disc.classes);
            var q = (query || '').trim().toLowerCase();
            return sorted.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) !== -1; })
                .map(function (c) { return { id: c.id, name: c.name }; });
        }

        StandplassFilterWidgets.makeComboHandlers({
            input: discInput, list: discList, clear: discClear,
            getItems: buildDiscItems,
            restoreOnBlur: function () { return selectedDisciplineName; },
            onSelect: function (discId, discName) {
                selectedDisciplineId = discId; selectedDisciplineName = discName;
                discInput.value = discName;
                discInput.closest('.autocomplete-wrap').classList.add('autocomplete-wrap--has-value');
                selectedClassId = null; selectedClassName = ''; classInput.value = '';
                classInput.closest('.autocomplete-wrap').classList.remove('autocomplete-wrap--has-value');
                setUrlParam('disc', discId); setUrlParam('class', null);
                personModal.reset({ initialMetric: stevneProgram() === 'bane' ? 'score' : 'rankingScore', defaultYear: selectedYear });
                fetchAndRender();
            },
            onClear: function () {
                selectedDisciplineId = null; selectedDisciplineName = ''; discInput.value = '';
                discInput.closest('.autocomplete-wrap').classList.remove('autocomplete-wrap--has-value');
                selectedClassId = null; selectedClassName = ''; classInput.value = '';
                classInput.closest('.autocomplete-wrap').classList.remove('autocomplete-wrap--has-value');
                setUrlParam('disc', null); setUrlParam('class', null);
                statusEl.textContent = ''; tableWrapEl.innerHTML = '<div class="ranking-blank-state"><p>Velg en øvelse for å se rangeringslisten.</p></div>';
            }
        });

        StandplassFilterWidgets.makeComboHandlers({
            input: classInput, list: classList, clear: classClear,
            getItems: buildClassItems,
            restoreOnBlur: function () { return selectedClassName; },
            onSelect: function (classId, className) {
                selectedClassId = classId; selectedClassName = className;
                classInput.value = className;
                classInput.closest('.autocomplete-wrap').classList.add('autocomplete-wrap--has-value');
                setUrlParam('class', classId);
                fetchAndRender();
            },
            onClear: function () {
                selectedClassId = null; selectedClassName = ''; classInput.value = '';
                classInput.closest('.autocomplete-wrap').classList.remove('autocomplete-wrap--has-value');
                setUrlParam('class', null);
                fetchAndRender();
            }
        });

        var allKretser = [], allClubs = [];

        StandplassFilterWidgets.makeComboHandlers({
            input: kretsInput, list: kretsList, clear: kretsClear,
            getItems: function (query) {
                var q = (query || '').trim().toLowerCase();
                var filtered = q ? allKretser.filter(function (k) { return k.name.toLowerCase().indexOf(q) !== -1; }) : allKretser;
                return filtered.slice(0, 50);
            },
            restoreOnBlur: function () { return selectedKretsName; },
            onSelect: function (kretsId, kretsName) {
                selectedKretsId = kretsId; selectedKretsName = kretsName;
                kretsInput.value = kretsName;
                kretsInput.closest('.autocomplete-wrap').classList.add('autocomplete-wrap--has-value');
                setUrlParam('krets', kretsId);
                fetchAndRender();
            },
            onClear: function () {
                selectedKretsId = null; selectedKretsName = ''; kretsInput.value = '';
                kretsInput.closest('.autocomplete-wrap').classList.remove('autocomplete-wrap--has-value');
                setUrlParam('krets', null);
                fetchAndRender();
            }
        });

        StandplassFilterWidgets.makeComboHandlers({
            input: clubInput, list: clubList, clear: clubClear,
            getItems: function (query) {
                var q = (query || '').trim().toLowerCase();
                var filtered = q ? allClubs.filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1; }) : allClubs;
                return filtered.slice(0, 50);
            },
            restoreOnBlur: function () { return selectedOrgName; },
            onSelect: function (orgId, orgName) {
                selectedOrgId = orgId; selectedOrgName = orgName;
                clubInput.value = orgName;
                clubInput.closest('.autocomplete-wrap').classList.add('autocomplete-wrap--has-value');
                setUrlParam('org', orgId);
                fetchAndRender();
            },
            onClear: function () {
                selectedOrgId = null; selectedOrgName = ''; clubInput.value = '';
                clubInput.closest('.autocomplete-wrap').classList.remove('autocomplete-wrap--has-value');
                setUrlParam('org', null);
                fetchAndRender();
            }
        });

        numSelect.value = String(selectedNumResults);
        numSelect.addEventListener('change', function () {
            selectedNumResults = parseInt(numSelect.value, 10) || 1;
            setUrlParam('num', selectedNumResults === 1 ? null : String(selectedNumResults));
            fetchAndRender();
        });

        var modeToggle = id('-mode-toggle');
        var modeError = id('-mode-error');
        var sesongPanel = root.querySelector('[data-period-mode="sesong"]');
        var periodePanel = root.querySelector('[data-period-mode="periode"]');
        var fraInput = id('-fra-input'), tilInput = id('-til-input');

        for (var y = CURRENT_YEAR; y >= CURRENT_YEAR - 5; y--) {
            var opt = document.createElement('option');
            opt.value = String(y); opt.textContent = String(y);
            yearSelect.appendChild(opt);
        }
        yearSelect.value = String(selectedYear);
        yearSelect.addEventListener('change', function () {
            selectedYear = parseInt(yearSelect.value, 10);
            setUrlParam('year', selectedYear === CURRENT_YEAR ? null : String(selectedYear));
            fetchAndRender();
        });

        function applyModeUI(mode) {
            sesongPanel.hidden = (mode !== 'sesong');
            periodePanel.hidden = (mode !== 'periode');
            modeToggle.setAttribute('aria-pressed', mode === 'periode' ? 'true' : 'false');
            modeToggle.textContent = (mode === 'periode') ? 'Sesong' : 'Egendefinert';
        }
        applyModeUI(selectedMode);
        if (selectedMode === 'periode') { fraInput.value = selectedFra; tilInput.value = selectedTil; }

        function setPeriodError(msg) {
            modeError.textContent = msg || '';
            modeError.hidden = !msg;
        }

        modeToggle.addEventListener('click', function () {
            selectedMode = (selectedMode === 'periode') ? 'sesong' : 'periode';
            applyModeUI(selectedMode);
            if (selectedMode === 'periode' && !selectedFra && !selectedTil) {
                selectedFra = selectedYear + '-01-01'; selectedTil = selectedYear + '-12-31';
                fraInput.value = selectedFra; tilInput.value = selectedTil;
            }
            if (selectedMode === 'periode') {
                setUrlParam('mode', 'periode'); setUrlParam('fra', selectedFra); setUrlParam('til', selectedTil); setUrlParam('year', null);
            } else {
                setUrlParam('mode', null); setUrlParam('fra', null); setUrlParam('til', null);
                setUrlParam('year', selectedYear === CURRENT_YEAR ? null : String(selectedYear));
            }
            fetchAndRender();
        });

        function handleDateChange() {
            selectedFra = fraInput.value; selectedTil = tilInput.value;
            if (selectedFra && selectedTil && selectedFra > selectedTil) {
                setPeriodError('Fra-dato kan ikke være etter til-dato.');
                return;
            }
            setPeriodError('');
            setUrlParam('fra', selectedFra); setUrlParam('til', selectedTil);
            if (selectedFra && selectedTil && selectedDisciplineId) { fetchAndRender(); }
        }
        fraInput.addEventListener('change', handleDateChange);
        tilInput.addEventListener('change', handleDateChange);

        var rankingEntries = [];
        var hasFetched = false;
        var showAll = false;
        var currentAbort = null;
        var PAGE_SIZE = 50;

        function renderTable() {
            if (!hasFetched) { return; }
            if (!rankingEntries.length) {
                tableWrapEl.innerHTML = '<div class="ranking-blank-state"><p>Ingen resultater funnet.</p></div>';
                return;
            }
            var clickable = isClickable(selectedDisciplineId);
            var visible = showAll ? rankingEntries : rankingEntries.slice(0, PAGE_SIZE);
            var rows = visible.map(function (e, i) {
                var nameCell = clickable && e.fullName
                    ? '<button type="button" class="stevner-person-btn link-btn" data-person-id="' + esc(e.personId)
                        + '" data-person-name="' + esc(e.fullName) + '">' + esc(e.fullName) + '</button>'
                    : esc(e.fullName || '–');
                return '<tr><td class="ranking-rank">' + (e.position || (i + 1)) + '</td>'
                    + '<td>' + nameCell + '</td>'
                    + '<td>' + esc(e.personOrganizationName || '') + '</td>'
                    + '<td class="ranking-score">' + (e.totalScore != null ? Number(e.totalScore).toFixed(2) : '–') + '</td></tr>';
            }).join('');
            var toggleHtml = rankingEntries.length > PAGE_SIZE
                ? '<button type="button" class="ranking-toggle" id="' + config.idPrefix + '-show-toggle">'
                    + (showAll ? 'Vis færre' : 'Vis alle (' + rankingEntries.length + ')') + '</button>'
                : '';
            tableWrapEl.innerHTML = '<div class="ranking-full-table"><table class="ranking-table" aria-label="Rangeringsliste">'
                + '<thead><tr><th scope="col">#</th><th scope="col">Navn</th><th scope="col">Klubb</th><th scope="col">Poeng</th></tr></thead>'
                + '<tbody>' + rows + '</tbody></table></div>' + toggleHtml;
            var toggleBtn = id('-show-toggle');
            if (toggleBtn) { toggleBtn.addEventListener('click', function () { showAll = !showAll; renderTable(); }); }
        }

        function fetchAndRender() {
            if (!selectedDisciplineId) {
                hasFetched = false; rankingEntries = [];
                statusEl.textContent = '';
                tableWrapEl.innerHTML = '<div class="ranking-blank-state"><p>Velg en øvelse for å se rangeringslisten.</p></div>';
                return;
            }
            if (selectedMode === 'periode' && (!selectedFra || !selectedTil || selectedFra > selectedTil)) { return; }
            if (currentAbort) { currentAbort.abort(); }
            currentAbort = new AbortController();
            statusEl.textContent = 'Laster…';
            tableWrapEl.innerHTML = '';
            showAll = false; hasFetched = false;

            var period = selectedMode === 'periode'
                ? { periodStart: selectedFra + 'T00:00:00.000Z', periodEnd: selectedTil + 'T23:59:59.999Z' }
                : { periodStart: yearFrom(selectedYear), periodEnd: yearTo(selectedYear) };
            var url = buildRankingUrl({
                disciplineId: selectedDisciplineId, classId: selectedClassId, kretsId: selectedKretsId, orgId: selectedOrgId,
                numberOfResults: selectedNumResults, periodStart: period.periodStart, periodEnd: period.periodEnd
            });
            var thisAbort = currentAbort;
            window.fetch(url, { signal: thisAbort.signal }).then(function (r) {
                if (!r.ok) { throw new Error(String(r.status)); }
                return r.json();
            }).then(function (data) {
                if (thisAbort !== currentAbort) { return; }
                rankingEntries = filterRankingEntries(data && data.items);
                hasFetched = true;
                statusEl.textContent = '';
                renderTable();
            }, function (err) {
                if (err.name === 'AbortError' || thisAbort !== currentAbort) { return; }
                statusEl.textContent = 'Kunne ikke hente data.';
                statusEl.classList.add('ranking-error');
            });
        }

        var localDataFetcher = StandplassData.createFetcher(window.fetch.bind(window));
        function stevneProgram() {
            var disc = branchlistData.disciplines.filter(function (d) { return d.id === selectedDisciplineId; })[0];
            // Bane-covered disciplines resolve via klubb-discipline-groups.js's
            // own resolveBane, same source of truth as the clickability gate --
            // anything clickable but not in the Bane set is Felt.
            var isBane = disc && StandplassKlubbDisciplineGroups.resolveBane(StandplassCompModal.getDisciplineGroups())
                .some(function (d) { return d.id === disc.id; });
            return isBane ? 'bane' : 'felt';
        }
        var personModal = StandplassPersonModalController.create({
            idPrefix: config.idPrefix,
            root: root,
            urlState: urlState,
            fetchEntriesForYear: function (personId, year) {
                var dataBase = stevneProgram() === 'bane' ? '/data/bane' : '/data/felt';
                return localDataFetcher.fetchYear(dataBase, year).then(function (yearData) {
                    return StandplassStevnerPage.flattenRows(yearData).filter(function (r) { return r.personId === personId; })
                        .map(function (r) {
                            return { date: r.date, discipline: r.discipline, class: r.class, competitionType: r.competitionType,
                                competition: r.competition, position: r.position, score: r.score, rankingScore: r.rankingScore, name: r.name };
                        });
                });
            },
            defaultYear: selectedYear,
            firstYear: 2021,
            currentYear: CURRENT_YEAR,
            initialMetric: 'rankingScore'
        });

        tableWrapEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.stevner-person-btn');
            if (!btn) { return; }
            personModal.open(btn, { personId: btn.dataset.personId, personName: btn.dataset.personName, initialDisc: selectedDisciplineName || null });
        });

        Promise.all([
            ensureBranchlist(window.fetch.bind(window)),
            StandplassNsfOrgs.ensureOrgs(window.fetch.bind(window)),
            // computeClickableIds/stevneProgram both call
            // StandplassCompModal.getDisciplineGroups(), which returns []
            // until ensureReferenceData resolves at least once -- must be
            // triggered here, not assumed to already be running (this page
            // never otherwise touches comp-modal.js's own init path the way
            // klubb-page.js does at its very end).
            StandplassCompModal.ensureReferenceData(window.fetch.bind(window))
        ]).then(function (results) {
            branchlistData = results[0];
            clickableDiscIds = computeClickableIds(StandplassCompModal.getDisciplineGroups());
            var rawOrgs = results[1];
            allKretser = StandplassNsfOrgs.filterKretser(rawOrgs);
            allClubs = StandplassNsfOrgs.filterClubs(rawOrgs);
            discInput.disabled = false; discInput.placeholder = 'Søk øvelse…';
            if (selectedDisciplineId) {
                var disc = branchlistData.disciplines.filter(function (d) { return d.id === selectedDisciplineId; })[0];
                if (disc) { selectedDisciplineName = disc.name; discInput.value = disc.name; discInput.closest('.autocomplete-wrap').classList.add('autocomplete-wrap--has-value'); }
                else { selectedDisciplineId = null; }
            }
            // Discipline resolved from the URL -- restore class/krets/klubb
            // display names the same way, then trigger the initial fetch.
            personModal.reset({ initialMetric: stevneProgram() === 'bane' ? 'score' : 'rankingScore', defaultYear: selectedYear });
            personModal.openFromUrl();
            if (selectedDisciplineId) { fetchAndRender(); }
        }, function () {
            discInput.placeholder = 'Kunne ikke laste data';
            statusEl.textContent = 'Kunne ikke laste data fra NSF. Prøv å laste siden på nytt.';
            statusEl.classList.add('ranking-error');
        });
    }

    return {
        processBranchlist: processBranchlist,
        ensureBranchlist: ensureBranchlist,
        computeClickableIds: computeClickableIds,
        isClickable: isClickable,
        yearFrom: yearFrom,
        yearTo: yearTo,
        isValidIsoDate: isValidIsoDate,
        buildRankingUrl: buildRankingUrl,
        filterRankingEntries: filterRankingEntries,
        init: init
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassNasjonaltPage;
}
