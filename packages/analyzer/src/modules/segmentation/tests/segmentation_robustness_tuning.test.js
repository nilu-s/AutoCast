'use strict';

var segBuilder = require('../segment_builder');
var vadGate = require('../../vad/vad_gate');

describe('Robustness tuning', function () {
    it('should keep short turn-taking segments with tuned defaults', function () {
        var gate = new Uint8Array(140);
        for (var i = 10; i < 26; i++) gate[i] = 1;
        for (var j = 39; j < 55; j++) gate[j] = 1;

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 160,
            minGapMs: 120,
            frameDurationMs: 10
        });

        assert(segments.length === 2, 'Short interjections should remain as separate segments');
        assertApprox(segments[0].start, 0.10, 0.01);
        assertApprox(segments[1].start, 0.39, 0.01);
    });

    it('should detect a quiet speaker above noise floor', function () {
        var rms = new Float64Array(260);
        for (var i = 0; i < rms.length; i++) rms[i] = 0.0008;
        for (var s = 120; s < 190; s++) rms[s] = 0.0032;

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 9,
            absoluteThresholdDb: -56,
            attackFrames: 2,
            releaseFrames: 3,
            holdFrames: 6,
            smoothingWindow: 3,
            adaptiveNoiseFloor: true,
            localNoiseWindowMs: 1200,
            noiseFloorUpdateMs: 200,
            localNoisePercentile: 0.15,
            frameDurationMs: 10
        });

        var activeSpeech = 0;
        for (var a = 125; a < 190; a++) if (result.gateOpen[a]) activeSpeech++;

        var activeNoise = 0;
        for (var n = 0; n < 100; n++) if (result.gateOpen[n]) activeNoise++;

        assert(activeSpeech >= 45, 'Quiet speech should be detected reliably');
        assert(activeNoise <= 8, 'Noise-only region should mostly stay closed');
    });

    it('should stay stable under noise-floor drift', function () {
        var rms = new Float64Array(420);
        for (var i = 0; i < 120; i++) rms[i] = 0.0007;
        for (var a = 120; a < 170; a++) rms[a] = 0.0028;

        for (var n = 170; n < 320; n++) {
            var t = (n - 170) / 150;
            rms[n] = 0.001 + t * 0.0032;
        }

        for (var s = 320; s < 370; s++) rms[s] = 0.0075;
        for (var tail = 370; tail < 420; tail++) rms[tail] = 0.0038;

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 9,
            absoluteThresholdDb: -56,
            attackFrames: 2,
            releaseFrames: 4,
            holdFrames: 8,
            smoothingWindow: 5,
            adaptiveNoiseFloor: true,
            localNoiseWindowMs: 1500,
            noiseFloorUpdateMs: 250,
            localNoisePercentile: 0.15,
            maxAdaptiveFloorRiseDb: 8,
            frameDurationMs: 10
        });

        var driftFalsePositives = 0;
        for (var d = 200; d < 300; d++) if (result.gateOpen[d]) driftFalsePositives++;

        var highNoiseSpeechActive = 0;
        for (var h = 325; h < 370; h++) if (result.gateOpen[h]) highNoiseSpeechActive++;

        assert(driftFalsePositives <= 25, 'Noise drift should not fully open the gate');
        assert(highNoiseSpeechActive >= 25, 'Speech on high noise floor should remain detectable');
    });
});
