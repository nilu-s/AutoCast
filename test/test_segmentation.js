/**
 * AutoCast – Segmentation Tests
 * 
 * Tests VAD gate and segment builder for edge cases:
 * - Short segments (debounce)
 * - Rapid on/off (flutter)
 * - Hold/hangover bridging
 * - Minimum segment filtering
 */

'use strict';

var path = require('path');
var vadGate = require(path.join(__dirname, '..', 'node', 'vad_gate'));
var segBuilder = require(path.join(__dirname, '..', 'node', 'segment_builder'));
var rmsCalc = require(path.join(__dirname, '..', 'node', 'rms_calculator'));

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
