// public/js/krets-distrikter.js
//
// The krets → distrikt grouping (19 kretser, 6 distrikter) for the DM
// page's krets filter: users know their krets, not their distrikt, so
// the filter offers krets names and maps each to its distrikt's results.
// skyting.no's org page is the authority for this hierarchy — no API
// carries it. Copied verbatim from DISTRIKTER in
// .github/scripts/org_regions.py (keys are the krets short names that
// kretser.json generates and that comp.region carries); refresh both
// together when skyting.no reorganizes. The drift is guarded by
// test/krets-distrikter.test.js against .github/scripts/kretser.json.
var StandplassKretsDistrikter = (function () {
    'use strict';

    var distriktFor = {
        'Nordland': 'Nord-Norge',
        'Troms': 'Nord-Norge',
        'Finnmark': 'Nord-Norge',
        'Nord-Trøndelag': 'Midt-Norge',
        'Sør-Trøndelag': 'Midt-Norge',
        'Møre og Romsdal': 'Midt-Norge',
        'Hordaland': 'Vest-Norge',
        'Sogn og Fjordane': 'Vest-Norge',
        'Rogaland': 'Syd-Norge',
        'Vest-Agder': 'Syd-Norge',
        'Østre Agder': 'Syd-Norge',
        'Telemark': 'Østlandet Sør',
        'Vestfold': 'Østlandet Sør',
        'Buskerud': 'Østlandet Sør',
        'Akershus': 'Østlandet Nord',
        'Oslo': 'Østlandet Nord',
        'Østfold': 'Østlandet Nord',
        'Hedmark': 'Østlandet Nord',
        'Oppland': 'Østlandet Nord'
    };

    return { distriktFor: distriktFor };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StandplassKretsDistrikter;
}
