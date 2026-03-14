/**
 * AutoCast - Laughter Detector Tests
 */

'use strict';

var path = require('path');
var laughterDetector = require(path.join(__dirname, '..', 'src', 'modules', 'vad', 'laughter_detector'));
var rmsCalc = require(path.join(__dirname, '..', 'src', 'modules', 'energy', 'rms_calculator'));

describe('Laughter Detector', function () {
    var SAMPLE_RATE = 16000;
    var FRAME_MS = 10;

    function seededRandom(seed) {
        var x = seed >>> 0;
        return function () {
            x = (1664525 * x + 1013904223) >>> 0;
            return x / 4294967296;
        };
    }

    function pulsedNoise(durationSec, pulseHz, amplitude, seed) {
        var n = Math.round(durationSec * SAMPLE_RATE);
        var out = new Float32Array(n);
        var rnd = seededRandom(seed || 1);
        for (var i = 0; i < n; i++) {
            var t = i / SAMPLE_RATE;
            var pulse = Math.max(0, Math.sin(2 * Math.PI * pulseHz * t));
            var env = 0.22 + 0.78 * pulse;
            var noise = (rnd() * 2 - 1) * amplitude;
            out[i] = noise * env;
        }
        return out;
    }

    function steadySine(durationSec, freqHz, amplitude) {
        var n = Math.round(durationSec * SAMPLE_RATE);
        var out = new Float32Array(n);
        for (var i = 0; i < n; i++) {
            var t = i / SAMPLE_RATE;
            out[i] = Math.sin(2 * Math.PI * freqHz * t) * amplitude;
        }
        return out;
    }

    function knockTrain(durationSec, intervalMs, amplitude) {
        var n = Math.round(durationSec * SAMPLE_RATE);
        var out = new Float32Array(n);
        var step = Math.max(1, Math.round((intervalMs / 1000) * SAMPLE_RATE));

        for (var i = 0; i < n; i += step) {
            // Very short, high-crest transient with tiny decay.
            out[i] = amplitude;
            if (i + 1 < n) out[i + 1] = amplitude * 0.45;
            if (i + 2 < n) out[i + 2] = amplitude * 0.18;
        }
        return out;
    }

    function meanRange(arr, start, end) {
        var s = Math.max(0, start);
        var e = Math.min(arr.length, end);
        if (e <= s) return 0;
        var sum = 0;
        var count = 0;
        for (var i = s; i < e; i++) {
            sum += arr[i];
            count++;
        }
        return count > 0 ? (sum / count) : 0;
    }

    it('should assign higher confidence to pulsed laughter-like noise than steady voiced tone', function () {
        var laughterLike = pulsedNoise(2.0, 4.5, 0.18, 42);
        var speechLike = steadySine(2.0, 220, 0.18);

        var laughResult = laughterDetector.computeLaughterConfidence(
            laughterLike,
            SAMPLE_RATE,
            FRAME_MS
        );
        var speechResult = laughterDetector.computeLaughterConfidence(
            speechLike,
            SAMPLE_RATE,
            FRAME_MS
        );

        // Ignore a little warmup at the edges.
        var laughMean = meanRange(laughResult.confidence, 15, laughResult.confidence.length - 15);
        var speechMean = meanRange(speechResult.confidence, 15, speechResult.confidence.length - 15);

        assert(laughMean > 0.20, 'Laughter-like signal should have meaningful confidence');
        assert(
            laughMean > speechMean + 0.10,
            'Laughter-like signal should score above steady voiced tone (' + laughMean + ' vs ' + speechMean + ')'
        );
    });

    it('should keep confidence near zero on silence', function () {
        var silence = new Float32Array(Math.round(2.0 * SAMPLE_RATE));
        var result = laughterDetector.computeLaughterConfidence(
            silence,
            SAMPLE_RATE,
            FRAME_MS
        );

        var mean = meanRange(result.confidence, 0, result.confidence.length);
        assert(mean < 0.08, 'Silence should stay near zero confidence');
    });

    it('should suppress impulsive knock-like transients compared to laughter-like bursts', function () {
        var laughterLike = pulsedNoise(2.0, 4.2, 0.20, 7);
        var knocks = knockTrain(2.0, 180, 0.95);

        var laughResult = laughterDetector.computeLaughterConfidence(
            laughterLike,
            SAMPLE_RATE,
            FRAME_MS
        );
        var knockResult = laughterDetector.computeLaughterConfidence(
            knocks,
            SAMPLE_RATE,
            FRAME_MS
        );

        var laughMean = meanRange(laughResult.confidence, 15, laughResult.confidence.length - 15);
        var knockMean = meanRange(knockResult.confidence, 15, knockResult.confidence.length - 15);

        assert(laughMean > 0.22, 'Laughter-like signal should stay detectable');
        assert(knockMean < 0.18, 'Impulsive knocks should have low laughter confidence');
        assert(
            laughMean > knockMean + 0.10,
            'Laughter-like signal should score clearly above knock transients (' + laughMean + ' vs ' + knockMean + ')'
        );
    });

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
        for (i = 45; i <= 54; i++) {
            refinedGate[i] = 0;
            rms[i] = 0.03;
            conf[i] = (i >= 46 && i <= 52) ? 0.92 : 0.45;
        }
        for (i = 0; i < len; i++) {
            if (rms[i] === 0) rms[i] = 0.01;
            if (conf[i] === 0) conf[i] = 0.18;
        }

        var rescued = laughterDetector.rescueGateWithLaughter(
            baseGate,
            refinedGate,
            conf,
            rms,
            {
                minConfidence: 0.58,
                holdFrames: 3,
                absoluteFloorDb: -60,
                minRelativeToThresholdDb: -8,
                thresholdLinear: rmsCalc.dbToLinear(-42),
                returnDebug: true
            }
        );

        var rescuedActive = 0;
        for (i = 46; i <= 52; i++) {
            if (rescued.gateOpen[i]) rescuedActive++;
        }

        assert(rescuedActive >= 6, 'Most laughter dip frames should be restored');
        assert(rescued.rescuedFrames >= 6, 'Rescue counter should reflect restored frames');
    });

    it('should not rescue when the original VAD gate was closed', function () {
        var len = 40;
        var baseGate = new Uint8Array(len); // all closed
        var refinedGate = new Uint8Array(len); // all closed
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);

        for (var i = 10; i < 20; i++) {
            conf[i] = 0.95;
            rms[i] = 0.05;
        }

        var rescued = laughterDetector.rescueGateWithLaughter(
            baseGate,
            refinedGate,
            conf,
            rms,
            {
                minConfidence: 0.55,
                holdFrames: 4,
                returnDebug: true
            }
        );

        var anyActive = false;
        for (i = 0; i < rescued.gateOpen.length; i++) {
            if (rescued.gateOpen[i]) {
                anyActive = true;
                break;
            }
        }
        assert(!anyActive, 'No rescue should happen without base VAD support');
        assert(rescued.rescuedFrames === 0, 'Rescued frame count should stay zero');
    });

    it('should recover partial laughter gaps and segment edges in a continuity pass', function () {
        var len = 120;
        var baseGate = new Uint8Array(len);
        var gate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);

        // Base VAD saw a broad region, refined gate kept only partial chunks.
        for (var i = 20; i < 90; i++) baseGate[i] = 1;
        for (i = 30; i <= 38; i++) gate[i] = 1;
        for (i = 44; i <= 50; i++) gate[i] = 1;

        // Confidence supports the missing middle and both boundaries.
        for (i = 24; i <= 55; i++) conf[i] = 0.62;
        for (i = 0; i < len; i++) {
            if (conf[i] === 0) conf[i] = 0.10;
            rms[i] = (i >= 24 && i <= 55) ? 0.028 : 0.008;
        }

        var recovered = laughterDetector.recoverGateContinuityWithLaughter(
            baseGate,
            gate,
            conf,
            rms,
            {
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
            }
        );

        var activeMiddle = 0;
        for (i = 39; i <= 43; i++) {
            if (recovered.gateOpen[i]) activeMiddle++;
        }
        assert(activeMiddle >= 4, 'Continuity pass should bridge most of the interior laughter gap');
        assert(recovered.gateOpen[28] === 1, 'Continuity pass should extend left boundary');
        assert(recovered.gateOpen[53] === 1, 'Continuity pass should extend right boundary');
        assert(recovered.recoveredFrames >= 8, 'Recovered frame count should reflect the added continuity');
    });

    it('should reinforce short quiet laughter bursts to survive minimum segment duration', function () {
        var len = 160;
        var baseGate = new Uint8Array(len);
        var gate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);
        var transientPenalty = new Float64Array(len);

        // Base VAD supports the area, but refined gate only keeps a tiny laugh island.
        for (var i = 40; i < 115; i++) baseGate[i] = 1;
        for (i = 70; i <= 75; i++) gate[i] = 1; // only 60 ms survives initially

        for (i = 0; i < len; i++) {
            conf[i] = 0.08;
            rms[i] = 0.006;
            transientPenalty[i] = 0.10;
        }

        // Short, quiet laugh core + softer shoulders
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
                targetMinFrames: 26, // 260ms @ 10ms frames
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

    it('should bridge longer laughter gaps when both edges are strong and gap confidence is moderate', function () {
        var len = 220;
        var baseGate = new Uint8Array(len);
        var gate = new Uint8Array(len);
        var conf = new Float64Array(len);
        var rms = new Float64Array(len);
        var transientPenalty = new Float64Array(len);

        for (var i = 40; i < 190; i++) baseGate[i] = 1;
        for (i = 60; i <= 72; i++) gate[i] = 1;
        for (i = 124; i <= 136; i++) gate[i] = 1;

        for (i = 0; i < len; i++) {
            conf[i] = 0.10;
            rms[i] = 0.007;
            transientPenalty[i] = 0.12;
        }

        // Strong edges around both active islands.
        for (i = 56; i <= 75; i++) {
            conf[i] = 0.58;
            rms[i] = 0.018;
        }
        for (i = 120; i <= 140; i++) {
            conf[i] = 0.57;
            rms[i] = 0.018;
        }

        // Moderate confidence in the long middle gap.
        for (i = 73; i <= 123; i++) {
            if (conf[i] < 0.27) conf[i] = 0.27;
            if (rms[i] < 0.013) rms[i] = 0.013;
        }

        var recovered = laughterDetector.recoverGateContinuityWithLaughter(
            baseGate,
            gate,
            conf,
            rms,
            {
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
            }
        );

        var bridged = 0;
        for (i = 80; i <= 116; i++) {
            if (recovered.gateOpen[i]) bridged++;
        }
        assert(bridged >= 30, 'Long moderate-confidence laugh gap should be bridged');
        assert(recovered.recoveredFrames >= 40, 'Long-gap bridge should recover substantial frames');
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

        // Quiet laugh area: only moderate absolute confidence, but clearly above local baseline.
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
