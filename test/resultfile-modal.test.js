'use strict';
var assert = require('node:assert');
// nsf-orgs-style localStorage probing noise guard (see comp-modal.test.js)
process.removeAllListeners('warning');
global.StandplassFormat = require('../public/js/format.js');
global.StandplassDataTable = require('../public/js/data-table.js');
global.StandplassRankingBand = require('../public/js/ranking-band.js');
var RFM = require('../public/js/resultfile-modal.js');

// ── seriesCellHtml ──────────────────────────────────────────────────────

assert.strictEqual(RFM.seriesCellHtml([27, 16]), '27<sub>16</sub>',
    'the innertreff count is marked sub-style');
assert.strictEqual(RFM.seriesCellHtml([10, 0]), '10',
    'a zero innertreff renders no sub');
assert.strictEqual(RFM.seriesCellHtml([7, null]), '7',
    'a null innertreff (family without per-stand innertreff) renders no sub');
assert.strictEqual(RFM.seriesCellHtml([null, null]), '–',
    'a null value renders a dash');

// ── ovelseSections ─────────────────────────────────────────────────────

var detail = {
    generator: 'inrX 1.9.1.0',
    maxFeltPoints: { group1: 80, group2: 70 },
    ovelser: [
        { navn: 'Felt Fin', classes: [
            { klasse: 'Å', rows: [
                { medal: 'Gull', name: 'Eirik Djønne', club: 'Odda Pistolklubb',
                  series: [[9, 5], [10, 0], [7, null]], ix: 33, sum: 90, personId: 'p1' },
                { pos: 4, name: 'Kari Nordmann', club: 'Bodø PK',
                  series: [[8, 1], [7, 0]], ix: 12, sum: 77 }
            ] },
            { klasse: 'U', rows: [
                { name: 'Ung Ut', club: 'Klubb C', series: [[5, null]], sum: 30 }
            ] }
        ] },
        { navn: 'Felt Grov', classes: [{ klasse: 'Å', rows: [] }] },
        // NM-style lag øvelse: teams print as fused medal+name rows in
        // the øvelser list, no members (the member lines under each
        // team in the PDF are not captured by any family yet).
        { navn: 'Lag: Felt Fin', classes: [
            { klasse: 'Å', rows: [
                { name: 'Gull Greipstad PK1', series: [[27, 0], [36, 15]], ix: 76, sum: 318 },
                { name: 'Sølv Bærum PK', series: [[27, 0], [36, 12]], ix: 74, sum: 310 }
            ] }
        ] }
    ],
    km: {
        sections: [
            { navn: 'KM Fin felt', klasse: 'Å', rows: [
                { medal: 'Sølv', name: 'Eirik Djønne', club: 'Odda Pistolklubb',
                  series: [[9, 5]], ix: 5, sum: 40, personId: 'p1' }
            ] }
        ],
        lag: [
            { navn: 'KM Lag: Felt Magnum-1', klasse: 'Å', teams: [
                { medal: 'Gull', team: 'Odda Pistolklubb', series: [[27, 15], [30, 13]],
                  ix: 95, sum: 265, members: [
                    { name: 'Eirik Djønne', klasse: 'Å', ix: 33, sum: 90, personId: 'p1' },
                    { name: 'Jakob Kråkevik', klasse: 'Å', ix: 30, sum: 85 },
                    { name: 'Kari Nordmann', klasse: 'Å', ix: 32, sum: 90 },
                    // a two-team club prints all six shooters under
                    // each team line — every one of them renders
                    { name: 'Nina Nilsson', klasse: 'Å', ix: 20, sum: 60 },
                    { name: 'Ola Olsen', klasse: 'Å', ix: 21, sum: 62 },
                    { name: 'Per Persen', klasse: 'Å', ix: 22, sum: 63 }
                  ] }
            ] }
        ]
    }
};

var parts = RFM.ovelseSections(detail);
assert.strictEqual(parts.sections.length, 5,
    'øvelser (incl. Lag: øvelser) + km sections + km lag all become sections');
assert.strictEqual(parts.sections[0].navn, 'Felt Fin');
assert.ok(!parts.sections[0].isLag, 'program øvelser are person sections');
assert.strictEqual(parts.sections[0].classes.length, 2,
    'classes flatten with their klasse labels');
assert.strictEqual(parts.sections[0].classes[1].klasse, 'U');
assert.strictEqual(parts.sections[1].navn, 'Felt Grov');
assert.strictEqual(parts.sections[1].classes[0].rows.length, 0,
    'an empty øvelse keeps its empty classes (no synthetic rows)');
assert.strictEqual(parts.sections[2].navn, 'Lag: Felt Fin');
assert.ok(parts.sections[2].isLag,
    'a Lag: øvelse is a lag section even inside ovelser');
assert.strictEqual(parts.sections[2].classes[0].rows[0].team, 'Greipstad PK1',
    'the fused medal+team name splits into team and medal');
assert.strictEqual(parts.sections[2].classes[0].rows[0].medal, 'Gull');
assert.strictEqual(parts.sections[2].classes[0].rows[1].team, 'Bærum PK',
    'Sølv rows split too');
assert.strictEqual(parts.sections[3].navn, 'KM Fin felt',
    'championship sections join the list after the program øvelser');
assert.strictEqual(parts.sections[4].navn, 'KM Lag: Felt Magnum-1');
assert.ok(parts.sections[4].isLag, 'lag sections are flagged');
assert.strictEqual(parts.sections[4].classes[0].rows[0].team, 'Odda Pistolklubb',
    'a lag section carries teams as its rows');
assert.deepStrictEqual(parts.maxFeltPoints, { group1: 80, group2: 70 },
    'the comp-level max-felt facts ride along on the section list');
assert.deepStrictEqual(RFM.ovelseSections({}), { sections: [], maxFeltPoints: null },
    'an empty detail is empty sections, never a crash');
assert.deepStrictEqual(RFM.ovelseSections(null), { sections: [], maxFeltPoints: null },
    'a null detail is empty sections too');

// ── ovelseSections: v15 teams-key lag øvelser ──────────────────────────
// Parser v15 stores lag øvelser as classes with teams (the same shape
// the km/dm overlays carry) — the fused-row shape above stays as a
// pre-v15 fallback.

var v15Detail = {
    generator: 'inrX 1.9.0.0',
    ovelser: [
        { navn: 'Felt Fin', classes: [{ klasse: 'Å', rows: [
            { medal: 'Gull', name: 'Eirik Djønne', club: 'Odda Pistolklubb',
              series: [[9, 5]], ix: 33, sum: 90, personId: 'p1' }
        ] }] },
        { navn: 'Lag: Felt Fin', classes: [
            { klasse: 'Å', teams: [
                { medal: 'Gull', team: 'Greipstad PK1',
                  series: [[27, 0], [36, 15]], ix: 76, sum: 318, members: [
                    { name: 'Tore Vrålstad', klasse: 'M', ix: 26, sum: 107, personId: 'p1' },
                    { name: 'Ukjent Skytter', klasse: 'K', ix: 22, sum: 106 }
                ] }
            ] }
        ] },
        { navn: 'Mix-lag: Felt Fin', classes: [
            { klasse: 'Å', teams: [
                { medal: 'Gull', team: 'Farris SS1',
                  series: [[18, 0], [20, 5]], ix: 41, sum: 198, members: [
                    { name: 'Kjetil Skogshagen', klasse: 'V55', ix: 22, sum: 101 }
                ] }
            ] }
        ] }
    ]
};
var v15Parts = RFM.ovelseSections(v15Detail);
assert.strictEqual(v15Parts.sections.length, 3);
assert.ok(v15Parts.sections[1].isLag, 'a teams-key øvelse is a lag section');
assert.strictEqual(v15Parts.sections[1].classes[0].rows.length, 1,
    'the teams are the section\u2019s rows, already in team shape');
assert.strictEqual(v15Parts.sections[1].classes[0].rows[0].team, 'Greipstad PK1');
assert.strictEqual(v15Parts.sections[1].classes[0].rows[0].members.length, 2);
assert.ok(v15Parts.sections[2].isLag, 'Mix-lag øvelser with teams are lag sections too');
var v15Body = RFM.renderDetailBody(v15Detail);
assert.ok(v15Body.indexOf('<td>Greipstad PK1</td>') !== -1,
    'the team renders by name');
assert.ok(v15Body.indexOf('Tore Vrålstad</button> (107)') !== -1,
    'v15 members render as person buttons with their sums');
assert.ok(v15Body.indexOf('Ukjent Skytter (106)') !== -1,
    'unmatched members render with their sums');
assert.ok(v15Body.indexOf('>Medlemmer<') !== -1,
    'lag tables with members keep the Medlemmer column');

// ── maxFeltLine ────────────────────────────────────────────────────────

assert.strictEqual(RFM.maxFeltLine({ group1: 80, group2: 70 }),
    'Maks poeng felt gr. 1: 80, gr. 2: 70',
    'the max-felt facts render in the PDF\'s own wording, gr. order');
assert.strictEqual(RFM.maxFeltLine({ group3: 38 }), 'Maks poeng felt gr. 3: 38');
assert.strictEqual(RFM.maxFeltLine(null), '', 'no facts, no line');

// ── renderFallback ─────────────────────────────────────────────────────

var fb = RFM.renderFallback({ title: 'Stevne', resultFileUrl: 'https://example.test/r.pdf' });
assert.ok(fb.indexOf('https://example.test/r.pdf') !== -1,
    'the fallback offers the PDF link');
assert.ok(fb.indexOf('kunne ikke tolkes') !== -1,
    'the fallback explains itself');
var fbEscape = RFM.renderFallback({ title: 'T', resultFileUrl: 'https://x/a.pdf" onload="x' });
assert.ok(fbEscape.indexOf('" onload') === -1,
    'the PDF url is attribute-escaped');
var fbNoUrl = RFM.renderFallback({ title: 'T', resultFileUrl: null });
assert.ok(fbNoUrl.indexOf('<a ') === -1,
    'no resultFileUrl means no link, still a message');

// ── renderFor (the open() body decision, pure) ─────────────────────────

var comp = { id: 'c1', year: 2025, title: 'Vårfelt', resultFileUrl: 'https://example.test/r.pdf' };
assert.ok(RFM.renderFor({ generator: 'quarantined' }, comp).indexOf('https://example.test/r.pdf') !== -1,
    'a quarantined detail renders the fallback with the PDF link, not a crash');
assert.ok(RFM.renderFor(null, comp).indexOf('https://example.test/r.pdf') !== -1,
    'a failed fetch (null detail) renders the same fallback');
assert.ok(RFM.renderFor(detail, comp).indexOf('Felt Fin') !== -1,
    'a parsed detail renders its sections');

// ── renderDetailBody (through the real base) ───────────────────────────

var body = RFM.renderDetailBody(detail);
assert.ok(body.indexOf('Felt Fin') !== -1, 'øvelse titles render');
assert.ok(body.indexOf('KM Lag: Felt Magnum-1') !== -1, 'lag section titles render');
assert.ok(body.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="6">Å</th></tr>') !== -1,
    'klasse labels render as base group rows');
assert.ok(body.indexOf('data-person-id="p1"') !== -1,
    'matched rows link to the person modal');
assert.ok(body.indexOf('<td>Kari Nordmann</td>') !== -1,
    'unmatched rows render a plain name');
assert.ok(body.indexOf('9<sub>5</sub> 10 7') !== -1,
    'series cells join space-separated with sub innertreff, zeros/nulls bare');
assert.ok(body.indexOf('<span class="medal medal--gold">1</span>') !== -1,
    'medal rows render the medal chip');
assert.ok(body.indexOf('<span class="medal medal--silver">2</span>') !== -1,
    'championship medal rows render their chips too');
assert.ok(body.indexOf('Odda Pistolklubb</button>') === -1,
    'team names are not person buttons');
assert.ok(body.indexOf('Jakob Kråkevik (85)') !== -1,
    'members render with their sums');
assert.ok(body.indexOf('Eirik Djønne</button> (90)') !== -1,
    'person-linked members carry their sum outside the button');
assert.ok(body.indexOf('Per Persen (63)') !== -1,
    'every member of a two-team club renders (all six, not three)');
assert.ok(body.indexOf('<td>Greipstad PK1</td>') !== -1,
    'NM lag teams render by their split team name');
assert.ok(body.indexOf('<td>Gull Greipstad PK1</td>') === -1,
    'the fused name never renders whole');
assert.ok(body.indexOf('<tr class="dt-group-row"><th scope="colgroup" colspan="5">Å</th></tr>') !== -1,
    'a memberless lag table drops the Medlemmer column (colspan 5)');
assert.ok(body.indexOf('Ingen rader tolket') !== -1,
    'an øvelse whose rows never attached shows the honest empty message');

// ── status rows (DNS/DNF/DSQ) show and are marked as such ─────────────
// Owner ruling 2026-11-23: status entries render — with a muted badge
// in the Plass column carrying the Norwegian expansion on hover, not
// a silently dashed row. The status wins over a printed position: a
// row that did not finish is not placed.

var dnfDetail = { ovelser: [{ navn: 'Felt Fin', classes: [{ klasse: 'Å', rows: [
    { status: 'DNF', name: 'Gunn Gikk', club: 'X PK', series: [[3, 0]], ix: 1 }
] }] }] };
var dnfBody = RFM.renderDetailBody(dnfDetail);
assert.ok(dnfBody.indexOf(
    '<span class="resultfile-status" title="Fullførte ikke">DNF</span>') !== -1,
    'status rows show their marked badge in the plass column');
assert.ok(dnfBody.indexOf('Gunn Gikk') !== -1, 'status rows still render');

assert.strictEqual(RFM.placeCellHtml({ status: 'DNS' }),
    '<span class="resultfile-status" title="Ikke startet">DNS</span>',
    'a DNS row renders the muted status badge with its expansion');
assert.strictEqual(RFM.placeCellHtml({ status: 'DSQ', pos: 3 }),
    '<span class="resultfile-status" title="Diskvalifisert">DSQ</span>',
    'the status mark wins over a printed position');
assert.strictEqual(RFM.placeCellHtml({ pos: 4 }),
    StandplassRankingBand.positionCellHtml(4),
    'placed rows keep the ranking band');
assert.strictEqual(RFM.placeCellHtml({ medal: 'Gull' }),
    StandplassRankingBand.positionCellHtml(1),
    'medal rows keep the medal-mapped band');
assert.strictEqual(RFM.placeCellHtml({ status: 'XXX' }),
    '<span class="resultfile-status">XXX</span>',
    'unknown statuses mark too, without an invented title');
assert.strictEqual(RFM.placeCellHtml({}), '–',
    'nothing to place and no status renders a dash');

// ── detailUrl (the open() fetch target, pure) ──────────────────────────
assert.strictEqual(RFM.detailUrl('/data/detaljer/felt', { year: 2026, id: 'abc-1' }),
    '/data/detaljer/felt/2026/abc-1.json',
    'the host base + year + compId');
assert.strictEqual(
    RFM.detailUrl('/data/detaljer', { year: 2025, id: 'x', detailBase: '/data/detaljer/bane' }),
    '/data/detaljer/bane/2025/x.json',
    'a comp-level detailBase overrides the host default (branch-spanning pages)');

console.log('resultfile-modal.test.js: all assertions passed');
