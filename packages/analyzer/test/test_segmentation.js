/**
 * AutoCast  Segmentation Tests
 * 
 * Tests VAD gate and segment builder for edge cases:
 * - Short segments (debounce)
 * - Rapid on/off (flutter)
 * - Hold/hangover bridging
 * - Minimum segment filtering
 */

'use strict';

var path = require('path');
var vadGate = require(path.join(__dirname, '..', 'src', 'modules', 'vad', 'vad_gate'));
var segBuilder = require(path.join(__dirname, '..', 'src', 'modules', 'segmentation', 'segment_builder'));
var rmsCalc = require(path.join(__dirname, '..', 'src', 'modules', 'energy', 'rms_calculator'));

describe('VAD Gate', function () {

    it('should detect activity in loud frames', function () {
        // Create RMS with clear loud and quiet sections
        var rms = new Float64Array(200); // 2 seconds at 10ms frames
        // First 100 frames (1s): quiet (noise floor)
        for (var i = 0; i < 100; i++) rms[i] = 0.002;
        // Next 100 frames (1s): loud (speech)
        for (var i = 100; i < 200; i++) rms[i] = 0.3;

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 12,
            absoluteThresholdDb: -50,
            attackFrames: 1,
            releaseFrames: 1,
            holdFrames: 1,
            smoothingWindow: 1
        });

        // Quiet frames should be mostly 0
        var quietActive = 0;
        for (var i = 0; i < 90; i++) { // Skip transition zone
            if (result.gateOpen[i]) quietActive++;
        }
        assert(quietActive === 0, 'Quiet frames should not trigger gate');

        // Loud frames should be mostly 1
        var loudActive = 0;
        for (var i = 110; i < 200; i++) { // Skip transition zone
            if (result.gateOpen[i]) loudActive++;
        }
        assert(loudActive > 80, 'Most loud frames should trigger gate');
    });

    it('should suppress very short bursts with attack', function () {
        // Single loud frame among quiet
        var rms = new Float64Array(100);
        for (var i = 0; i < 100; i++) rms[i] = 0.002;
        rms[50] = 0.5; // One spike

        var result = vadGate.detectActivity(rms, {
            thresholdAboveFloorDb: 12,
            absoluteThresholdDb: -50,
            attackFrames: 3, // Need 3 consecutive frames
            releaseFrames: 1,
            holdFrames: 1,
            smoothingWindow: 1
        });

        // Single spike should not open gate with attack=3
        var anyActive = false;
        for (var i = 0; i < 100; i++) {
            if (result.gateOpen[i]) anyActive = true;
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
        for (i = 0; i < result.gateOpen.length; i++) {
            if (result.gateOpen[i]) active++;
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

describe('Segment Builder', function () {

    it('should build segments from gate array', function () {
        // Gate: 0-10 off, 10-50 on, 50-70 off, 70-100 on
        var gate = new Uint8Array(100);
        for (var i = 10; i < 50; i++) gate[i] = 1;
        for (var i = 70; i < 100; i++) gate[i] = 1;

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 0,
            minGapMs: 0,
            frameDurationMs: 10
        });

        assert(segments.length === 2, 'Should have 2 segments');
        assertApprox(segments[0].start, 0.1, 0.01, 'First segment start');
        assertApprox(segments[0].end, 0.5, 0.01, 'First segment end');
        assertApprox(segments[1].start, 0.7, 0.01, 'Second segment start');
        assertApprox(segments[1].end, 1.0, 0.01, 'Second segment end');
    });

    it('should merge close segments (debounce)', function () {
        // Two segments separated by 100ms gap (< 250ms minGap)
        var gate = new Uint8Array(100);
        for (var i = 10; i < 40; i++) gate[i] = 1; // 100-400ms
        for (var i = 50; i < 80; i++) gate[i] = 1; // 500-800ms (100ms gap)

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 0,
            minGapMs: 250, // Merge gaps < 250ms
            frameDurationMs: 10
        });

        assert(segments.length === 1, 'Close segments should be merged');
        assertApprox(segments[0].start, 0.1, 0.01);
        assertApprox(segments[0].end, 0.8, 0.01);
    });

    it('should filter out short segments', function () {
        // One short (50ms) and one long (500ms) segment
        var gate = new Uint8Array(100);
        for (var i = 10; i < 15; i++) gate[i] = 1; // 50ms
        for (var i = 40; i < 90; i++) gate[i] = 1; // 500ms

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 200, // Filter segments < 200ms
            minGapMs: 0,
            frameDurationMs: 10
        });

        assert(segments.length === 1, 'Short segment should be filtered');
        assertApprox(segments[0].start, 0.4, 0.01, 'Only long segment should remain');
    });

    it('should handle all-silent track', function () {
        var gate = new Uint8Array(100); // All zeros

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 0,
            minGapMs: 0,
            frameDurationMs: 10
        });

        assert(segments.length === 0, 'Silent track should produce no segments');
    });

    it('should handle all-active track', function () {
        var gate = new Uint8Array(100);
        for (var i = 0; i < 100; i++) gate[i] = 1;

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 0,
            minGapMs: 0,
            frameDurationMs: 10
        });

        assert(segments.length === 1, 'Fully active track should produce 1 segment');
        assertApprox(segments[0].start, 0, 0.01);
        assertApprox(segments[0].end, 1.0, 0.01);
    });

    it('should compute stats correctly', function () {
        var segments = [
            { start: 0, end: 10 },
            { start: 20, end: 30 }
        ];

        var stats = segBuilder.computeStats(segments, 60);
        assert(stats.totalActiveSec === 20, 'Total active should be 20s');
        assertApprox(stats.activePercent, 33, 1); // 20/60
        assert(stats.segmentCount === 2, 'Segment count should be 2');
    });
});

describe('Robustness tuning', function () {

    it('should keep short turn-taking segments with tuned defaults', function () {
        var gate = new Uint8Array(140);

        // Two short turns of ~160ms each, separated by 130ms.
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
        for (var i = 0; i < rms.length; i++) rms[i] = 0.0008; // ~ -62 dBFS noise
        for (var s = 120; s < 190; s++) rms[s] = 0.0032; // quiet speech burst

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
        for (var a = 125; a < 190; a++) {
            if (result.gateOpen[a]) activeSpeech++;
        }

        var activeNoise = 0;
        for (var n = 0; n < 100; n++) {
            if (result.gateOpen[n]) activeNoise++;
        }

        assert(activeSpeech >= 45, 'Quiet speech should be detected reliably');
        assert(activeNoise <= 8, 'Noise-only region should mostly stay closed');
    });

    it('should stay stable under noise-floor drift', function () {
        var rms = new Float64Array(420);

        // Low-noise intro
        for (var i = 0; i < 120; i++) rms[i] = 0.0007;
        // Quiet speech in low-noise region
        for (var a = 120; a < 170; a++) rms[a] = 0.0028;

        // Rising room noise without speech
        for (var n = 170; n < 320; n++) {
            var t = (n - 170) / 150;
            rms[n] = 0.001 + t * 0.0032;
        }

        // Speech on high-noise floor
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
        for (var d = 200; d < 300; d++) {
            if (result.gateOpen[d]) driftFalsePositives++;
        }

        var highNoiseSpeechActive = 0;
        for (var h = 325; h < 370; h++) {
            if (result.gateOpen[h]) highNoiseSpeechActive++;
        }

        assert(driftFalsePositives <= 25, 'Noise drift should not fully open the gate');
        assert(highNoiseSpeechActive >= 25, 'Speech on high noise floor should remain detectable');
    });
});


