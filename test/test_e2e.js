/**
 * AutoCast – End-to-End Test
 * 
 * Generates synthetic podcast WAVs and runs the full analyzer pipeline.
 * Verifies that the correct speakers are detected as active in each segment.
 */

'use strict';

var path = require('path');
var fs = require('fs');
var genWav = require(path.join(__dirname, 'generate_test_wav'));
var analyzer = require(path.join(__dirname, '..', 'node', 'analyzer'));

describe('End-to-End Analysis', function () {

    var testDataDir = path.join(__dirname, 'test_data');

    // Generate test data before tests
    if (!fs.existsSync(path.join(testDataDir, 'track_a_host.wav'))) {
        console.log('  (Generating test WAV files...)');
        genWav.generateTestFiles(testDataDir);
    }

    it('should analyze 3 tracks without errors', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks, {
            thresholdAboveFloorDb: 10,
            holdFrames: 10,
            minSegmentMs: 200,
            duckingLevelDb: -24,
            rampMs: 30,
            overlapPolicy: 'dominant_wins'
        });

        // Basic structure checks
        assert(result.version === '2.0.0', 'Should have version');
        assert(result.tracks.length === 3, 'Should have 3 tracks');
        assert(result.segments.length === 3, 'Should have segments for 3 tracks');
        assert(result.keyframes.length === 3, 'Should have keyframes for 3 tracks');
        assertApprox(result.totalDurationSec, 15, 0.5, 'Duration should be ~15s');
    });

    it('should detect Track A (Host) as most active', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks, {
            thresholdAboveFloorDb: 10,
            holdFrames: 10,
            minSegmentMs: 200
        });

        // Track A speaks in 2/3 of the time (0-5s and 10-15s)
        var trackA = result.tracks[0];
        assert(trackA.activePercent > 50,
            'Track A should be active >50% (got ' + trackA.activePercent + '%)');
        assert(trackA.segmentCount >= 1,
            'Track A should have at least 1 segment');
    });

    it('should detect Track B (Guest 1) with correct timing', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks, {
            thresholdAboveFloorDb: 10,
            holdFrames: 10,
            minSegmentMs: 200
        });

        // Track B speaks only 5-10s (1/3 of time)
        var trackB = result.tracks[1];
        assert(trackB.activePercent < 50,
            'Track B should be active <50% (got ' + trackB.activePercent + '%)');
        assert(trackB.segmentCount >= 1,
            'Track B should have at least 1 segment');
    });

    it('should generate valid keyframe data', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks, {
            duckingLevelDb: -24,
            rampMs: 30
        });

        // Each track should have keyframes
        for (var t = 0; t < 3; t++) {
            assert(result.keyframes[t].length > 0,
                'Track ' + t + ' should have keyframes');

            // Verify keyframe structure
            for (var k = 0; k < result.keyframes[t].length; k++) {
                var kf = result.keyframes[t][k];
                assert(typeof kf.time === 'number', 'Keyframe should have numeric time');
                assert(typeof kf.gainDb === 'number', 'Keyframe should have numeric gainDb');
                assert(kf.time >= 0, 'Keyframe time should be non-negative');
                assert(kf.gainDb <= 0, 'Keyframe gain should be <= 0 dB');
            }
        }

        // Total keyframes should be reasonable
        var totalKf = result.keyframes.reduce(function (sum, kf) { return sum + kf.length; }, 0);
        assert(totalKf > 5, 'Should have more than 5 total keyframes');
        assert(totalKf < 500, 'Should have fewer than 500 keyframes for 15s');
    });

    it('should check alignment and pass', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks);

        assert(result.alignment.aligned === true, 'Test tracks should be aligned');
        assert(result.alignment.warning === null, 'Should have no alignment warning');
    });
});
