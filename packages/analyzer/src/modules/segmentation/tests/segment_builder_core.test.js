'use strict';

var segBuilder = require('../segment_builder');

describe('Segment Builder', function () {
    it('should build segments from gate array', function () {
        var gate = new Uint8Array(100);
        for (var i = 10; i < 50; i++) gate[i] = 1;
        for (var j = 70; j < 100; j++) gate[j] = 1;

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
        var gate = new Uint8Array(100);
        for (var i = 10; i < 40; i++) gate[i] = 1;
        for (var j = 50; j < 80; j++) gate[j] = 1;

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 0,
            minGapMs: 250,
            frameDurationMs: 10
        });

        assert(segments.length === 1, 'Close segments should be merged');
        assertApprox(segments[0].start, 0.1, 0.01);
        assertApprox(segments[0].end, 0.8, 0.01);
    });

    it('should filter out short segments', function () {
        var gate = new Uint8Array(100);
        for (var i = 10; i < 15; i++) gate[i] = 1;
        for (var j = 40; j < 90; j++) gate[j] = 1;

        var segments = segBuilder.buildSegments(gate, 0, {
            minSegmentMs: 200,
            minGapMs: 0,
            frameDurationMs: 10
        });

        assert(segments.length === 1, 'Short segment should be filtered');
        assertApprox(segments[0].start, 0.4, 0.01, 'Only long segment should remain');
    });

    it('should handle all-silent track', function () {
        var gate = new Uint8Array(100);
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
        assertApprox(stats.activePercent, 33, 1);
        assert(stats.segmentCount === 2, 'Segment count should be 2');
    });
});
