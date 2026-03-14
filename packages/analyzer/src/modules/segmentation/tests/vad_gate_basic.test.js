'use strict';

var vadGate = require('../../vad/vad_gate');
var rmsCalc = require('../../energy/rms_calculator');

describe('VAD Gate', function () {
    it('should detect activity in loud frames', function () {
        var rms = new Float64Array(200);
        for (var i = 0; i < 100; i++) rms[i] = 0.002;
        for (var j = 100; j < 200; j++) rms[j] = 0.3;

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 12,
            absoluteThresholdDb: -50,
            attackFrames: 1,
            releaseFrames: 1,
            holdFrames: 1,
            smoothingWindow: 1
        });

        var quietActive = 0;
        for (var q = 0; q < 90; q++) if (result.gateOpen[q]) quietActive++;

        var loudActive = 0;
        for (var l = 110; l < 200; l++) if (result.gateOpen[l]) loudActive++;

        assert(quietActive === 0, 'Quiet frames should not trigger gate');
        assert(loudActive > 80, 'Most loud frames should trigger gate');
    });

    it('should suppress very short bursts with attack', function () {
        var rms = new Float64Array(100);
        for (var i = 0; i < 100; i++) rms[i] = 0.002;
        rms[50] = 0.5;

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 12,
            absoluteThresholdDb: -50,
            attackFrames: 3,
            releaseFrames: 1,
            holdFrames: 1,
            smoothingWindow: 1
        });

        var anyActive = false;
        for (var g = 0; g < 100; g++) {
            if (result.gateOpen[g]) anyActive = true;
        }
        assert(!anyActive, 'Single-frame spike should not open gate with attack=3');
    });

    it('should hard-cut frames below -51 dB when no nearby stronger peak exists', function () {
        var rms = new Float64Array(140);
        var low = rmsCalc.dbToLinear(-54);
        for (var i = 0; i < rms.length; i++) rms[i] = low;

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 0,
            absoluteThresholdDb: -80,
            attackFrames: 1,
            releaseFrames: 1,
            holdFrames: 1,
            smoothingWindow: 1,
            enableHardSilenceCut: true,
            hardSilenceCutDb: -51,
            hardSilenceLookaroundMs: 220,
            hardSilencePeakDeltaDb: 8
        });

        var active = 0;
        for (var a = 0; a < result.gateOpen.length; a++) {
            if (result.gateOpen[a]) active++;
        }
        assert(active === 0, 'Low-level region without explicit peaks should be cut');
    });

    it('should keep low-level context near explicit stronger peaks', function () {
        var rms = new Float64Array(200);
        var low = rmsCalc.dbToLinear(-54);
        var peak = rmsCalc.dbToLinear(-35);
        for (var i = 0; i < rms.length; i++) rms[i] = low;
        rms[100] = peak;

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 0,
            absoluteThresholdDb: -80,
            attackFrames: 1,
            releaseFrames: 1,
            holdFrames: 1,
            smoothingWindow: 1,
            enableHardSilenceCut: true,
            hardSilenceCutDb: -51,
            hardSilenceLookaroundMs: 220,
            hardSilencePeakDeltaDb: 8
        });

        assert(result.gateOpen[95] === 1, 'Frames close to a strong peak should stay open');
        assert(result.gateOpen[10] === 0, 'Far low-level frames should still be cut');
    });
});
