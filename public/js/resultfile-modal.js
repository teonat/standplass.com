var StandplassResultfileModal = (function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Gull/Sølv/Bronse rows (inrX person-øvelser and championship
    // sections) carry the medal string, not a place — map onto the
    // position the medal chip styles expect.
    var MEDAL_POS = { Gull: 1, 'Sølv': 2, Bronse: 3 };

    // ── pure helpers ───────────────────────────────────────────────────

    // A series cell is [value, innertreff-or-null]. The innertreff
    // count renders sub-style when present and non-zero; families
    // without per-stand innertreff (null) and clean stands (0) render
    // the bare value.
    function seriesCellHtml(cell) {
        var c = cell || [];
        if (c[0] == null) { return '–'; }
        var out = esc(c[0]);
        if (typeof c[1] === 'number' && c[1] > 0) {
            out += '<sub>' + esc(c[1]) + '</sub>';
        }
        return out;
    }

    function seriesCellHtmlForRow(r) {
        return (r.series || []).map(seriesCellHtml).join(' ');
    }

    // Detail files carry three section sources: the program øvelser
    // (per øvelse, per class), and the inrX championship overlays
    // (km/dm sections for individuals, km/dm lag for teams — each
    // entry one (navn, klasse) pair, regrouped here by navn). Øvelser
    // whose navn marks a team result ('Lag: X', 'Mix-lag: X', 'KM
    // Mix-lag: X' — the NM-family shape, where teams print as fused
    // medal+name rows inside the ordinary øvelser list) become lag
    // sections with the rows split into teams. maxFeltPoints is a
    // comp-level fact from the PDF header (e.g. 'Maks poeng felt
    // gr. 1: 80') with no per-øvelse mapping in the data — it rides
    // along on the list and renders once in the modal's meta line.
    var LAG_OVELSE = /^(?:[A-ZÆØÅ]{2} )?(?:Mix-)?[Ll]ag: /;
    var MEDALS = ['Gull', 'Sølv', 'Bronse'];
    var POS_TO_MEDAL = { 1: 'Gull', 2: 'Sølv', 3: 'Bronse' };
    var FUSED_TEAM = /^(Gull|Sølv|Bronse)(?:\s+(.*))?$/;

    // Fused team rows ('Gull Greipstad PK1', a pos-ranked 'Orkla3',
    // or a bare 'Gull' with the team in club) split into the team
    // shape the km/dm lag teams already carry. Rows that match no
    // medal shape still render — as an unranked team with the whole
    // name — so no team silently vanishes.
    function teamFromRow(r) {
        var name = r.name || '';
        var medal = r.medal || null;
        var team = r.team != null ? r.team : null;
        if (team == null && MEDALS.indexOf(name) !== -1) {
            medal = medal || name;
            team = r.club || '';
        }
        if (team == null) {
            var m = FUSED_TEAM.exec(name);
            if (m) { medal = medal || m[1]; team = m[2] || ''; }
        }
        if (team == null) { team = name; }
        if (!medal && r.pos != null && POS_TO_MEDAL[r.pos]) {
            medal = POS_TO_MEDAL[r.pos];
        }
        return {
            medal: medal, team: team,
            series: r.series || [], ix: r.ix, sum: r.sum,
            members: r.members || []
        };
    }

    function ovelseSections(detail) {
        var d = detail || {};
        var sections = [];
        (d.ovelser || []).forEach(function (o) {
            var classes = o.classes || [];
            // v15 lag øvelser carry teams directly (already in team
            // shape, members included); the navn check + fused-row
            // splitting stays as the pre-v15 fallback.
            var isLag = LAG_OVELSE.test(o.navn || '')
                || classes.some(function (c) { return c.teams != null; });
            sections.push({
                navn: o.navn || '',
                isLag: isLag,
                classes: classes.map(function (c) {
                    var rows = c.teams != null ? c.teams
                        : (c.rows || []).map(isLag ? teamFromRow : identity);
                    return { klasse: c.klasse || '', rows: rows };
                })
            });
        });
        ['km', 'dm'].forEach(function (scope) {
            var block = d[scope];
            if (!block) { return; }
            var person = groupByNavn(block.sections || [], function (s) {
                return { klasse: s.klasse || '', rows: s.rows || [] };
            });
            person.list.forEach(function (classes) {
                sections.push({ navn: classes.navn, isLag: false, classes: classes.classes });
            });
            var lag = groupByNavn(block.lag || [], function (l) {
                return { klasse: l.klasse || '', rows: l.teams || [] };
            });
            lag.list.forEach(function (entry) {
                sections.push({ navn: entry.navn, isLag: true, classes: entry.classes });
            });
        });
        return { sections: sections, maxFeltPoints: d.maxFeltPoints || null };
    }

    function groupByNavn(entries, toClass) {
        var byNavn = {}, order = [];
        (entries || []).forEach(function (e) {
            if (!byNavn[e.navn]) { byNavn[e.navn] = []; order.push(e.navn); }
            byNavn[e.navn].push(toClass(e));
        });
        return {
            list: order.map(function (navn) { return { navn: navn, classes: byNavn[navn] }; })
        };
    }

    function maxFeltLine(max) {
        if (!max) { return ''; }
        var keys = Object.keys(max).sort();
        if (!keys.length) { return ''; }
        return 'Maks poeng felt ' + keys.map(function (k) {
            var m = /^group(\d+)$/.exec(k);
            return (m ? 'gr. ' + m[1] : k) + ': ' + max[k];
        }).join(', ');
    }

    // Rows with a matched personId link to the person modal (byte
    // pattern of the stevne tables' buttons; the detail rows carry no
    // discipline, so the modal opens without an initialDisc).
    function personCellHtml(r) {
        if (r.personId) {
            return '<button type="button" class="stevner-person-btn link-btn" data-person-id="'
                + esc(r.personId) + '" data-person-name="' + esc(r.name) + '">'
                + esc(r.name || '–') + '</button>';
        }
        return esc(r.name || '–');
    }

    function placeCellHtml(r) {
        var n = r.pos != null ? r.pos : (MEDAL_POS[r.medal] || null);
        if (n != null) { return StandplassRankingBand.positionCellHtml(n); }
        return esc(r.status || '–');
    }

    function identity(x) { return x; }

    function memberCellHtml(t) {
        var names = (t.members || []).map(function (m) {
            var label = m.personId
                ? '<button type="button" class="stevner-person-btn link-btn" data-person-id="'
                    + esc(m.personId) + '" data-person-name="' + esc(m.name) + '">'
                    + esc(m.name) + '</button>'
                : esc(m.name);
            // The member's own sum rides along when printed — for a
            // km/dm team the members' sums add up to the team sum,
            // which is the check the display invites.
            return m.sum != null ? label + ' (' + esc(m.sum) + ')' : label;
        });
        return names.length ? names.join(' · ') : '–';
    }

    // No sorting, no picker, no tiers — the modal mirrors the official
    // result file as printed (the comp modal's Resultater tables made
    // the same call). groupRows carries the klasse labels.
    var PERSON_COLUMNS = [
        { key: 'place', label: 'Plass', raw: true, cell: placeCellHtml },
        { key: 'name', label: 'Navn', raw: true, cell: personCellHtml },
        { key: 'club', label: 'Klubb', cell: function (r) { return r.club || '–'; } },
        { key: 'series', label: 'Serie', raw: true, cell: seriesCellHtmlForRow },
        { key: 'sum', label: 'Sum', cell: function (r) { return r.sum != null ? r.sum : '–'; } },
        { key: 'ix', label: 'Innertreff', cell: function (r) { return r.ix != null ? r.ix : '–'; } }
    ];

    var LAG_COLUMNS = [
        { key: 'place', label: 'Plass', raw: true, cell: placeCellHtml },
        { key: 'team', label: 'Lag', cell: function (t) { return t.team || '–'; } },
        { key: 'members', label: 'Medlemmer', raw: true, cell: memberCellHtml },
        { key: 'series', label: 'Serie', raw: true, cell: seriesCellHtmlForRow },
        { key: 'sum', label: 'Sum', cell: function (t) { return t.sum != null ? t.sum : '–'; } },
        { key: 'ix', label: 'Innertreff', cell: function (t) { return t.ix != null ? t.ix : '–'; } }
    ];

    function sectionTableSpec(section, columns) {
        var classes = (section.classes || []).filter(function (c) {
            return (c.rows || []).length;
        });
        if (!classes.length) { return null; }
        var flat = [];
        var groups = classes.map(function (c) {
            c.rows.forEach(function (r) { flat.push(r); });
            return { label: c.klasse || '–', rows: c.rows };
        });
        return { columns: columns, rows: flat, groupRows: function () { return groups; },
            tableClass: 'ranking-full-table ranking-table' };
    }

    // A memberless lag table (the NM-family shape — the member lines
    // under each team are not captured by any parser family yet)
    // drops the Medlemmer column instead of rendering a column of
    // dashes.
    function lagColumnsFor(section) {
        var anyMembers = (section.classes || []).some(function (c) {
            return (c.rows || []).some(function (t) { return (t.members || []).length; });
        });
        return anyMembers ? LAG_COLUMNS : LAG_COLUMNS.filter(function (col) {
            return col.key !== 'members';
        });
    }

    function renderDetailBody(detail) {
        var parts = ovelseSections(detail);
        if (!parts.sections.length) {
            return '<p class="ranking-status-msg">Ingen øvelser funnet i resultatfilen.</p>';
        }
        var out = [];
        parts.sections.forEach(function (s, i) {
            out.push('<p class="comp-modal-section-title">' + esc(s.navn) + '</p>');
            var spec = sectionTableSpec(s, s.isLag ? lagColumnsFor(s) : PERSON_COLUMNS);
            if (!spec) {
                // The known empty-øvelse families (datotid, plain-NO)
                // parse class headers but attach no rows — say so
                // instead of silently showing nothing.
                out.push('<p class="ranking-status-msg">Ingen rader tolket i denne øvelsen.</p>');
                return;
            }
            out.push('<div class="resultfile-table-wrap">'
                + StandplassDataTable.renderTable('resultfile-' + i, spec,
                    { hidden: {}, runtimeHidden: [], widthTier: null })
                + '</div>');
        });
        return out.join('');
    }

    function renderFallback(comp) {
        var url = comp && comp.resultFileUrl;
        return '<p class="ranking-status-msg">Resultatfilen for dette stevnet kunne ikke tolkes automatisk.</p>'
            + (url
                ? '<p class="resultfile-fallback"><a href="' + esc(url)
                    + '" target="_blank" rel="noopener">Åpne resultat-PDF-en</a></p>'
                : '');
    }

    // The open() body decision, pure: a quarantined or missing detail
    // (including a failed fetch, which arrives here as null) renders
    // the PDF-link fallback; a parsed detail renders its sections.
    function renderFor(detail, comp) {
        if (!detail || detail.generator === 'quarantined') {
            return renderFallback(comp);
        }
        return renderDetailBody(detail);
    }

    // ── the dialog host (wiring — manual QA per house rule) ───────────

    // comp-modal.js's createDialogHost pattern: a native <dialog>
    // (Escape/focus handling for free), top-anchored chrome, an
    // open-sequence guard against stale fetches painting over a newer
    // open, and the person-button delegation routed through cfg so this
    // module never imports the person modal itself.
    function ensureDialog(cfg) {
        cfg = cfg || {};
        var root = cfg.root || document;
        var idPrefix = cfg.idPrefix || '';
        var detailBase = cfg.detailBase || '/data/detaljer';
        var fetchImpl = cfg.fetchImpl
            || (typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null);
        var onPerson = cfg.onPerson || null;

        var dlg = (root.getElementById ? root.getElementById(idPrefix + '-resultfile-dialog') : null);
        if (!dlg) {
            dlg = document.createElement('dialog');
            dlg.id = idPrefix + '-resultfile-dialog';
            dlg.className = 'comp-modal-dialog resultfile-modal-dialog';
            dlg.innerHTML = '<div class="comp-modal-header"><h2 class="comp-modal-title"></h2>'
                + '<button type="button" class="comp-modal-close" aria-label="Lukk">×</button></div>'
                + '<p class="comp-modal-meta"></p>'
                + '<div class="comp-modal-body"></div>';
            (root === document ? document.body : root).appendChild(dlg);
        }
        dlg.querySelector('.comp-modal-close').addEventListener('click', function () { dlg.close(); });
        // A native <dialog>'s ::backdrop delivers its click with the
        // dialog itself as e.target (no separate backdrop node).
        dlg.addEventListener('click', function (e) {
            if (e.target === dlg) { dlg.close(); }
        });
        if (onPerson) {
            dlg.addEventListener('click', function (e) {
                var btn = e.target.closest('.stevner-person-btn');
                if (btn) { onPerson(btn); }
            });
        }

        var openSeq = 0;
        function open(comp) {
            var mySeq = ++openSeq;
            var c = comp || {};
            dlg.querySelector('.comp-modal-title').textContent = c.title || 'Resultatfil';
            var metaEl = dlg.querySelector('.comp-modal-meta');
            var bodyEl = dlg.querySelector('.comp-modal-body');
            metaEl.textContent = '';
            bodyEl.innerHTML = '<p class="ranking-status-msg">Laster…</p>';
            dlg.showModal();
            if (!fetchImpl) {
                bodyEl.innerHTML = renderFallback(c);
                return;
            }
            fetchImpl(detailBase + '/' + c.year + '/' + c.id + '.json')
                .then(function (res) {
                    if (!res.ok) { throw new Error('HTTP ' + res.status); }
                    return res.json();
                })
                .then(function (detail) {
                    if (mySeq !== openSeq) { return; }
                    metaEl.textContent = maxFeltLine(detail && detail.maxFeltPoints);
                    bodyEl.innerHTML = renderFor(detail, c);
                }, function () {
                    if (mySeq !== openSeq) { return; }
                    bodyEl.innerHTML = renderFallback(c);
                });
        }
        return { open: open };
    }

    return {
        ensureDialog: ensureDialog,
        seriesCellHtml: seriesCellHtml,
        ovelseSections: ovelseSections,
        maxFeltLine: maxFeltLine,
        renderFallback: renderFallback,
        renderFor: renderFor,
        renderDetailBody: renderDetailBody
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassResultfileModal;
}
