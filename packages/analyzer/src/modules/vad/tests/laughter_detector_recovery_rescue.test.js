'use strict';

var laughterDetector = require('../laughter_detector');
var rmsCalc = require('../../energy/rms_calculator');

describe('Laughter Detector Recovery - Rescue', function () {
    it('should rescue laughter frames that were removed by spectral/speaker filtering', function () {
        var len = 120;
        var baseGate = new Uint8Array(len);
        var refinedGate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);

        for (var i = 20; i < 100; i++) {
            baseGate[i] = 1;
            refinedGate[i] = 1;
        }
        for (var d = 45; d <= 54; d++) {
            refinedGate[d] = 0;
            rms[d] = 0.03;
            conf[d] = (d >= 46 && d <= 52) ? 0.92 : 0.45;
        }
        for (var k = 0; k < len; k++) {
            if (rms[k] === 0) rms[k] = 0.01;
            if (conf[k] === 0) conf[k] = 0.18;
        }

        var rescued = laughterDetector.rescueGateWithLaughter(baseGate, refinedGate, conf, rms, {
            minConfidence: 0.58,
            holdFrames: 3,
            absoluteFloorDb: -60,
            minRelativeToThresholdDb: -8,
            thresholdLinear: rmsCalc.dbToLinear(-42),
            returnDebug: true
        });

        var rescuedActive = 0;
        for (var a = 46; a <= 52; a++) {
            if (rescued.gateOpen[a]) rescuedActive++;
        }

        assert(rescuedActive >= 6, 'Most laughter dip frames should be restored');
        assert(rescued.rescuedFrames >= 6, 'Rescue counter should reflect restored frames');
    });

    it('should not rescue when the original VAD gate was closed', function () {
        var len = 40;
        var baseGate = new Uint8Array(len);
        var refinedGate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);

        for (var i = 10; i < 20; i++) {
            conf[i] = 0.95;
            rms[i] = 0.05;
        }

        var rescued = laughterDetector.rescueGateWithLaughter(baseGate, refinedGate, conf, rms, {
            minConfidence: 0.55,
            holdFrames: 4,
            returnDebug: true
        });

        var anyActive = false;
        for (var g = 0; g < rescued.gateOpen.length; g++) {
            if (rescued.gateOpen[g]) {
                anyActive = true;
                break;
            }
        }

        assert(!anyActive, 'No rescue should happen without base VAD support');
        assert(rescued.rescuedFrames === 0, 'Rescued frame count should stay zero');
    });
});
