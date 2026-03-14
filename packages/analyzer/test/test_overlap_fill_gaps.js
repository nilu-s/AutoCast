'use strict';

var overlapResolver = require('../src/modules/overlap/overlap_resolver');

describe('Overlap fillGaps routing', function () {
    it('should fill leading silence with the first active track, not hardcoded track 0', function () {
        var segments = [
            [],
            [
                { start: 1.0, end: 2.0, trackIndex: 1 }
            ]
        ];

        var resolved = overlapResolver.resolveOverlaps(
            segments,
            [new Float64Array(0), new Float64Array(0)],
            {
                policy: overlapResolver.OVERLAP_POLICIES.ALWAYS_ACTIVE_WITH_GAPS,
                frameDurationMs: 10
            }
        );

        assert(resolved[0].length === 0, 'Track 1 should not receive a fabricated leading fill.');
        assert(resolved[1].length === 1, 'Track 2 should contain one merged segment.');
        assertApprox(resolved[1][0].start, 0, 0.0001, 'Leading gap should start at 0s.');
        assertApprox(resolved[1][0].end, 2.0, 0.0001, 'Leading gap should merge with the first active span.');
    });
});
