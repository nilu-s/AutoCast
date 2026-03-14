/**
 * AutoCast  Overlap Resolver Tests
 */

'use strict';

var path = require('path');
var overlapResolver = require('../overlap_resolver');

describe('Overlap Resolver', function () {

    it('should let dominant track win in overlapping segments', function () {
        // Track 0: active 0-10s (loud)
        // Track 1: active 5-15s (quieter)
        var allSegments = [
            [{ start: 0, end: 10, trackIndex: 0 }],
            [{ start: 5, end: 15, trackIndex: 1 }]
        ];

        // RMS profiles: Track 0 is louder at 0.5, Track 1 at 0.2
        var rmsProfiles = [
            createUniformRMS(0.5, 1500), // 15s at 10ms
            createUniformRMS(0.2, 1500)
        ];

        var result = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
            policy: 'dominant_wins',
            frameDurationMs: 10,
            overlapMarginDb: 6
        });

        assert(result.length === 2, 'Should have 2 tracks in result');
        // Track 0 should be active (it's louder)
        assert(result[0][0].state === 'active', 'Louder track should be active');
        // Track 1 should be suppressed (it's quieter by more than 6dB)
        assert(result[1][0].state === 'suppressed', 'Quieter track should be suppressed');
    });

    it('should keep both active when within margin', function () {
        var allSegments = [
            [{ start: 0, end: 10, trackIndex: 0 }],
            [{ start: 0, end: 10, trackIndex: 1 }]
        ];

        // Both tracks similar volume (within 6dB margin)
        var rmsProfiles = [
            createUniformRMS(0.4, 1000),
            createUniformRMS(0.35, 1000) // Only ~1dB quieter
        ];

        var result = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
            policy: 'bleed_safe',
            frameDurationMs: 10,
            overlapMarginDb: 6
        });

        assert(result[0][0].state === 'active', 'Track 0 should be active');
        assert(result[1][0].state === 'active', 'Track 1 should also be active (within margin)');
    });

    it('should keep all active in all_active policy', function () {
        var allSegments = [
            [{ start: 0, end: 10, trackIndex: 0 }],
            [{ start: 0, end: 10, trackIndex: 1 }]
        ];

        var rmsProfiles = [
            createUniformRMS(0.5, 1000),
            createUniformRMS(0.1, 1000) // Much quieter
        ];

        var result = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
            policy: 'all_active',
            frameDurationMs: 10
        });

        assert(result[0][0].state === 'active', 'Track 0 should be active');
        assert(result[1][0].state === 'active', 'Track 1 should also be active');
    });

    it('should handle non-overlapping segments', function () {
        var allSegments = [
            [{ start: 0, end: 5, trackIndex: 0 }],
            [{ start: 6, end: 10, trackIndex: 1 }]
        ];

        var rmsProfiles = [
            createUniformRMS(0.5, 1000),
            createUniformRMS(0.5, 1000)
        ];

        var result = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
            policy: 'dominant_wins',
            frameDurationMs: 10,
            overlapMarginDb: 6
        });

        assert(result[0][0].state === 'active', 'Non-overlapping Track 0 should be active');
        assert(result[1][0].state === 'active', 'Non-overlapping Track 1 should be active');
    });
});

// Helper: create uniform RMS array
function createUniformRMS(value, length) {
    var rms = new Float64Array(length);
    for (var i = 0; i < length; i++) rms[i] = value;
    return rms;
}


