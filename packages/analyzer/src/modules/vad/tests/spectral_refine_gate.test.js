'use strict';

var spectralVad = require('../spectral_vad');

describe('refineGateWithSpectral soft fusion', function () {
    it('should tolerate brief spectral-confidence dips inside speech', function () {
        var rmsGate = new Uint8Array(20);
        for (var i = 0; i < rmsGate.length; i++) rmsGate[i] = 1;

        var conf = new Float64Array(20);
        for (var c = 0; c < conf.length; c++) conf[c] = 0.52;
        conf[8] = 0.28;
        conf[9] = 0.27;
        conf[10] = 0.30;

        var out = spectralVad.refineGateWithSpectral(rmsGate, conf, 0.35, {
            softMargin: 0.12,
            openScore: 0.60,
            closeScore: 0.45,
            rmsWeight: 0.5,
            holdFrames: 2
        });

        var kept = 0;
        for (var k = 7; k <= 11; k++) if (out[k]) kept++;
        assert(kept >= 3, 'Brief confidence dips should not fully break speech continuity');
    });

    it('should still reject very low-confidence frames', function () {
        var rmsGate = new Uint8Array(12);
        for (var i = 0; i < rmsGate.length; i++) rmsGate[i] = 1;

        var conf = new Float64Array(12);
        for (var c = 0; c < conf.length; c++) conf[c] = 0.5;
        conf[5] = 0.05;
        conf[6] = 0.04;
        conf[7] = 0.05;

        var out = spectralVad.refineGateWithSpectral(rmsGate, conf, 0.35, {
            softMargin: 0.12,
            openScore: 0.60,
            closeScore: 0.45,
            rmsWeight: 0.5,
            holdFrames: 1
        });

        var dropped = 0;
        for (var d = 5; d <= 7; d++) if (!out[d]) dropped++;
        assert(dropped >= 2, 'Very low-confidence region should still be suppressed');
    });
});
