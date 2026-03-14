'use strict';

var path = require('path');
var analyzer = require(path.join(__dirname, '..', '..', 'analyzer'));
var e2eUtils = require(path.join(__dirname, '..', 'helpers', 'e2e_test_utils'));

describe('End-to-End Analysis - Baseline', function () {
    it('should analyze 3 tracks without errors', function () {
        var result = analyzer.analyze(e2eUtils.getDefaultTracks(), {
            thresholdAboveFloorDb: 10,
            holdFrames: 10,
            minSegmentMs: 200,
            overlapPolicy: 'dominant_wins'
        });

        assert(result.version === '2.2.0', 'Should have version');
        assert(result.tracks.length === 3, 'Should have 3 tracks');
        assert(result.segments.length === 3, 'Should have segments for 3 tracks');
        assertApprox(result.totalDurationSec, 15, 0.5, 'Duration should be ~15s');
    });

    it('should detect Track A (Host) as most active', function () {
        var result = analyzer.analyze(e2eUtils.getDefaultTracks(), {
            thresholdAboveFloorDb: 10,
            holdFrames: 10,
            minSegmentMs: 200
        });

        var trackA = result.tracks[0];
        assert(trackA.activePercent > 50, 'Track A should be active >50% (got ' + trackA.activePercent + '%)');
        assert(trackA.segmentCount >= 1, 'Track A should have at least 1 segment');
    });

    it('should detect Track B (Guest 1) with correct timing', function () {
        var result = analyzer.analyze(e2eUtils.getDefaultTracks(), {
            thresholdAboveFloorDb: 10,
            holdFrames: 10,
            minSegmentMs: 200
        });

        var trackB = result.tracks[1];
        assert(trackB.activePercent <= 55, 'Track B should be active <=55% (got ' + trackB.activePercent + '%)');
        assert(trackB.segmentCount >= 1, 'Track B should have at least 1 segment');
    });

    it('should not expose deprecated volume automation payload in cut-only mode', function () {
        var result = analyzer.analyze(e2eUtils.getDefaultTracks());
        assert(result.keyframes === undefined, 'Deprecated keyframes payload should not be present');
    });

    it('should check alignment and pass', function () {
        var result = analyzer.analyze(e2eUtils.getDefaultTracks());
        assert(result.alignment.aligned === true, 'Test tracks should be aligned');
        assert(result.alignment.warning === null, 'Should have no alignment warning');
    });
});
