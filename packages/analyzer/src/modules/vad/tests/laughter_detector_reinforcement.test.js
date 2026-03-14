'use strict';

var path = require('path');
var laughterDetector = require('../laughter_detector');
var rmsCalc = require('../../energy/rms_calculator');

describe('Laughter Detector Reinforcement', function () {
    it('should reinforce short quiet laughter bursts to survive minimum segment duration', function () {
        var len = 160;
        var baseGate = new Uint8Array(len);
        var gate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);
        var transientPenalty = new Float64Array(len);

        for (var i = 40; i < 115; i++) baseGate[i] = 1;
        for (i = 70; i <= 75; i++) gate[i] = 1;

        for (i = 0; i < len; i++) {
            conf[i] = 0.08;
            rms[i] = 0.006;
            transientPenalty[i] = 0.10;
        }

        for (i = 66; i <= 78; i++) {
            conf[i] = 0.60;
            rms[i] = 0.018;
        }
        for (i = 62; i <= 82; i++) {
            if (conf[i] < 0.60) conf[i] = 0.39;
            if (rms[i] < 0.018) rms[i] = 0.014;
        }

        var reinforced = laughterDetector.reinforceLaughterBursts(
            baseGate,
            gate,
            conf,
            rms,
            {
                seedMinConfidence: 0.52,
                extendMinConfidence: 0.34,
                targetMinFrames: 26,
                maxSeedGapFrames: 8,
                maxSideExtendFrames: 22,
                absoluteFloorDb: -60,
                minRelativeToThresholdDb: -12,
                thresholdLinear: rmsCalc.dbToLinear(-45),
                maxTransientPenalty: 0.62,
                transientPenalty: transientPenalty,
                returnDebug: true
            }
        );

        var runStart = -1;
        var runEnd = -1;
        for (i = 0; i < reinforced.gateOpen.length; i++) {
            if (reinforced.gateOpen[i]) {
                if (runStart === -1) runStart = i;
                runEnd = i;
            }
        }

        var keptFrames = (runStart >= 0 && runEnd >= runStart) ? (runEnd - runStart + 1) : 0;
        assert(keptFrames >= 22, 'Short laugh burst should be expanded to a practical keep length');
        assert(reinforced.recoveredFrames >= 12, 'Burst reinforcement should add substantial continuity');
    });

    it('should reinforce quiet bursts via relative confidence when absolute confidence is modest', function () {
        var len = 180;
        var baseGate = new Uint8Array(len);
        var gate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);
        var transientPenalty = new Float64Array(len);

        for (var i = 40; i < 150; i++) baseGate[i] = 1;
        for (i = 84; i <= 88; i++) gate[i] = 1;

        for (i = 0; i < len; i++) {
            conf[i] = 0.15;
            rms[i] = 0.006;
            transientPenalty[i] = 0.10;
        }

        for (i = 78; i <= 96; i++) {
            conf[i] = 0.29;
            rms[i] = 0.012;
        }

        var reinforced = laughterDetector.reinforceLaughterBursts(
            baseGate,
            gate,
            conf,
            rms,
            {
                seedMinConfidence: 0.52,
                extendMinConfidence: 0.34,
                relativeWindowFrames: 45,
                relativeSeedDelta: 0.08,
                relativeSeedMinConfidence: 0.24,
                relativeExtendDelta: 0.04,
                relativeExtendMinConfidence: 0.18,
                targetMinFrames: 22,
                maxSeedGapFrames: 8,
                maxSideExtendFrames: 18,
                absoluteFloorDb: -64,
                minRelativeToThresholdDb: -12,
                thresholdLinear: rmsCalc.dbToLinear(-45),
                maxTransientPenalty: 0.62,
                transientPenalty: transientPenalty,
                returnDebug: true
            }
        );

        var active = 0;
        for (i = 78; i <= 96; i++) {
            if (reinforced.gateOpen[i]) active++;
        }
        assert(active >= 12, 'Relative-confidence seeding should recover quiet laugh region');
        assert(reinforced.recoveredFrames >= 10, 'Recovered frames should show burst reinforcement activity');
    });
});
