/**
 * AutoCast - Laughter Postprocess Protection Tests
 */

'use strict';

var path = require('path');
var post = require('../analyzer_postprocess');

describe('Laughter postprocess protection', function () {
    it('should keep weak segments when laughter confidence is high', function () {
        var resolvedSegments = [[
            { start: 0.00, end: 0.20, trackIndex: 0, state: 'active', durationMs: 200 }
        ]];

        var rmsProfiles = [new Float64Array(60)];
        var laughterConfidence = new Float64Array(60);
        for (var i = 0; i < 60; i++) {
            rmsProfiles[0][i] = 0.00045; // very weak (~ -67 dBFS)
            laughterConfidence[i] = (i < 24) ? 0.74 : 0.05;
        }

        var vadResults = [{ thresholdDb: -46 }];

        var prunedNoProtect = post.pruneLowSignificanceSegments(
            resolvedSegments,
            rmsProfiles,
            vadResults,
            {
                frameDurationMs: 10,
                maxDurationMs: 500,
                minPeakAboveThresholdDb: 3,
                minMeanAboveThresholdDb: -1,
                protectLaughter: false
            },
            null,
            'test'
        );

        assert(prunedNoProtect[0].length === 0, 'Weak segment should be pruned without laughter protection');

        var keptWithProtect = post.pruneLowSignificanceSegments(
            resolvedSegments,
            rmsProfiles,
            vadResults,
            {
                frameDurationMs: 10,
                maxDurationMs: 500,
                minPeakAboveThresholdDb: 3,
                minMeanAboveThresholdDb: -1,
                protectLaughter: true,
                laughterResults: [{ confidence: laughterConfidence }],
                laughterProtectMinConfidence: 0.46,
                laughterProtectMinCoverage: 0.24
            },
            null,
            'test'
        );

        assert(keptWithProtect[0].length === 1, 'Weak segment should be kept when laughter support is present');
    });
});
