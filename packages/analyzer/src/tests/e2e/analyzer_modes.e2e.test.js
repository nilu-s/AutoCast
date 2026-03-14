'use strict';

var path = require('path');
var analyzer = require(path.join(__dirname, '..', '..', 'analyzer'));
var e2eUtils = require(path.join(__dirname, '..', 'helpers', 'e2e_test_utils'));

describe('End-to-End Analysis - Modes and Params', function () {
    it('should expose frame-level diagnostics in debug mode', function () {
        var result = analyzer.analyze(e2eUtils.getDefaultTracks(), {
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
        var result = analyzer.analyze(e2eUtils.getDefaultTracks(), {
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
        assert(trackBSegs[0].start <= 4.7, 'Track B segment should start earlier due to pre-roll');
        assert(trackBSegs[0].end >= 10.3, 'Track B segment should end later due to post-roll');
    });

    it('should preserve explicit overlap/fill settings from params (no hard override)', function () {
        var result = analyzer.analyze(e2eUtils.getDefaultTracks(), {
            independentTrackAnalysis: false,
            overlapPolicy: 'always_active_with_gaps',
            fillGaps: true
        });

        assert(result.params.independentTrackAnalysis === false, 'independentTrackAnalysis should remain user-defined false');
        assert(result.params.overlapPolicy === 'always_active_with_gaps', 'overlapPolicy should remain user-defined');
        assert(result.params.fillGaps === true, 'fillGaps should remain user-defined true');
    });
});
