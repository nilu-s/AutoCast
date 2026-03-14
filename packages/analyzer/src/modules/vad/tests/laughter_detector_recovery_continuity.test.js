'use strict';

var laughterDetector = require('../laughter_detector');
var rmsCalc = require('../../energy/rms_calculator');

describe('Laughter Detector Recovery - Continuity', function () {
    it('should recover partial laughter gaps and segment edges in a continuity pass', function () {
        var len = 120;
        var baseGate = new Uint8Array(len);
        var gate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);

        for (var i = 20; i < 90; i++) baseGate[i] = 1;
        for (var a = 30; a <= 38; a++) gate[a] = 1;
        for (var b = 44; b <= 50; b++) gate[b] = 1;

        for (var c = 24; c <= 55; c++) conf[c] = 0.62;
        for (var k = 0; k < len; k++) {
            if (conf[k] === 0) conf[k] = 0.10;
            rms[k] = (k >= 24 && k <= 55) ? 0.028 : 0.008;
        }

        var recovered = laughterDetector.recoverGateContinuityWithLaughter(baseGate, gate, conf, rms, {
            edgeMinConfidence: 0.40,
            gapMinConfidence: 0.36,
            maxGapFrames: 8,
            maxEdgeExtendFrames: 8,
            minGapCoverage: 0.4,
            minGapHits: 2,
            absoluteFloorDb: -60,
            minRelativeToThresholdDb: -10,
            thresholdLinear: rmsCalc.dbToLinear(-45),
            returnDebug: true
        });

        var activeMiddle = 0;
        for (var m = 39; m <= 43; m++) if (recovered.gateOpen[m]) activeMiddle++;

        assert(activeMiddle >= 4, 'Continuity pass should bridge most of the interior laughter gap');
        assert(recovered.gateOpen[28] === 1, 'Continuity pass should extend left boundary');
        assert(recovered.gateOpen[53] === 1, 'Continuity pass should extend right boundary');
        assert(recovered.recoveredFrames >= 8, 'Recovered frame count should reflect added continuity');
    });

    it('should bridge longer laughter gaps when both edges are strong and gap confidence is moderate', function () {
        var len = 220;
        var baseGate = new Uint8Array(len);
        var gate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);
        var transientPenalty = new Float64Array(len);

        for (var i = 40; i < 190; i++) baseGate[i] = 1;
        for (var left = 60; left <= 72; left++) gate[left] = 1;
        for (var right = 124; right <= 136; right++) gate[right] = 1;

        for (var j = 0; j < len; j++) {
            conf[j] = 0.10;
            rms[j] = 0.007;
            transientPenalty[j] = 0.12;
        }

        for (var edgeL = 56; edgeL <= 75; edgeL++) {
            conf[edgeL] = 0.58;
            rms[edgeL] = 0.018;
        }
        for (var edgeR = 120; edgeR <= 140; edgeR++) {
            conf[edgeR] = 0.57;
            rms[edgeR] = 0.018;
        }

        for (var mid = 73; mid <= 123; mid++) {
            if (conf[mid] < 0.27) conf[mid] = 0.27;
            if (rms[mid] < 0.013) rms[mid] = 0.013;
        }

        var recovered = laughterDetector.recoverGateContinuityWithLaughter(baseGate, gate, conf, rms, {
            edgeMinConfidence: 0.40,
            gapMinConfidence: 0.36,
            maxGapFrames: 18,
            longGapMaxFrames: 80,
            longGapMinConfidence: 0.24,
            longGapMinCoverage: 0.60,
            longGapEdgeMinConfidence: 0.44,
            maxEdgeExtendFrames: 8,
            minGapCoverage: 0.45,
            minGapHits: 2,
            absoluteFloorDb: -60,
            minRelativeToThresholdDb: -10,
            thresholdLinear: rmsCalc.dbToLinear(-45),
            transientPenalty: transientPenalty,
            maxTransientPenalty: 0.62,
            returnDebug: true
        });

        var bridged = 0;
        for (var z = 80; z <= 116; z++) if (recovered.gateOpen[z]) bridged++;

        assert(bridged >= 30, 'Long moderate-confidence laugh gap should be bridged');
        assert(recovered.recoveredFrames >= 40, 'Long-gap bridge should recover substantial frames');
    });
});
