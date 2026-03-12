/**
 * AutoCast Ã¢â‚¬â€œ End-to-End Test
 * 
 * Generates synthetic podcast WAVs and runs the full analyzer pipeline.
 * Verifies that the correct speakers are detected as active in each segment.
 */

'use strict';

var path = require('path');
var fs = require('fs');
var genWav = require(path.join(__dirname, 'generate_test_wav'));
var analyzer = require(path.join(__dirname, '..', 'src', 'analyzer'));

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
            overlapPolicy: 'dominant_wins'
        });

        // Basic structure checks
        assert(result.version === '2.2.0', 'Should have version');
        assert(result.tracks.length === 3, 'Should have 3 tracks');
        assert(result.segments.length === 3, 'Should have segments for 3 tracks');
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
        assert(trackB.activePercent <= 55,
            'Track B should be active <=55% (got ' + trackB.activePercent + '%)');
        assert(trackB.segmentCount >= 1,
            'Track B should have at least 1 segment');
    });

    it('should not expose deprecated volume automation payload in cut-only mode', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks);

        assert(result.keyframes === undefined, 'Deprecated keyframes payload should not be present');
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
    it('should expose frame-level diagnostics in debug mode', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks, {
            debugMode: true,
            debugMaxFrames: 200
        });

        assert(result.debug && result.debug.tracks && result.debug.tracks.length === 3,
            'Debug payload should include all tracks');

        var firstTrack = result.debug.tracks[0];
        assert(firstTrack.frames && firstTrack.frames.length > 0, 'Debug payload should include sampled frames');

        var frame = firstTrack.frames[0];
        assert(typeof frame.speechScore === 'number', 'Frame should include speechScore');
        assert(typeof frame.gateState === 'number', 'Frame should include gate state');
        assert(typeof frame.reason === 'string', 'Frame should include suppression reason');
    });

    it('should analyze tracks independently and add long pre/post padding', function () {
        var tracks = [
            path.join(testDataDir, 'track_a_host.wav'),
            path.join(testDataDir, 'track_b_guest1.wav'),
            path.join(testDataDir, 'track_c_guest2.wav')
        ];

        var result = analyzer.analyze(tracks, {
            independentTrackAnalysis: true,
            snippetPadBeforeMs: 700,
            snippetPadAfterMs: 700,
            crossTrackTailTrimInIndependentMode: false,
            enableBleedHandling: false,
            minSegmentMs: 180,
            postOverlapMinSegmentMs: 120
        });

        var trackBSegs = result.segments[1];
        assert(trackBSegs.length >= 1, 'Track B should still have active segments');
        assert(trackBSegs[0].state === 'active', 'Independent mode should keep track segments active');

        // Guest 1 speaks around 5-10s in synthetic test data; with 700ms pad
        // we expect earlier start and later end than the raw region.
        assert(trackBSegs[0].start <= 4.7, 'Track B segment should start earlier due to pre-roll');
        assert(trackBSegs[0].end >= 10.3, 'Track B segment should end later due to post-roll');
    });
});


