'use strict';

var postprocessStage = require('../../src/core/pipeline/postprocess_stage');

describe('Postprocess Stage', function () {
    it('should run baseline postprocess and update per-track stats', function () {
        var trackInfos = [{}, {}];
        var resolvedSegments = [
            [
                {
                    start: 0,
                    end: 1,
                    trackIndex: 0,
                    state: 'active'
                }
            ],
            [
                {
                    start: 0,
                    end: 0.25,
                    trackIndex: 1,
                    state: 'suppressed'
                }
            ]
        ];

        var result = postprocessStage.runPostprocessStage({
            resolvedSegments: resolvedSegments,
            rmsProfiles: [new Float32Array(0), new Float32Array(0)],
            rawRmsProfiles: [new Float32Array(0), new Float32Array(0)],
            vadResults: [{}, {}],
            laughterResults: [null, null],
            trackInfos: trackInfos,
            totalDurationSec: 2,
            params: {
                frameDurationMs: 10,
                postOverlapMinSegmentMs: 80,
                enableLowSignificancePrune: false,
                enablePreTriggerCleanup: false,
                independentTrackAnalysis: false,
                enablePrimaryTrackGapFill: false,
                enableSameTrackGapMerge: false,
                enableDominantTrackStickiness: false,
                enableCrossTrackHandoverSmoothing: false,
                enablePeakAnchorKeep: false,
                enableResidualSnippetPrune: false,
                fillGaps: false,
                enableFinalPeakGate: false,
                enforceAlwaysOneTrackOpen: false
            },
            progress: function () { }
        });

        assert(Array.isArray(result.resolvedSegments), 'Expected resolved segments array');
        assert(result.resolvedSegments.length === 2, 'Expected resolved segments for both tracks');

        assert(trackInfos[0].segmentCount === 1, 'Expected one active segment on track 0');
        assert(trackInfos[0].totalActiveSec === 1, 'Expected 1.00 active seconds on track 0');
        assert(trackInfos[0].activePercent === 50, 'Expected 50% activity for track 0');
        assert(trackInfos[0].handoverStartDelayedMs === 0, 'Expected handover delay reset for track 0');
        assert(trackInfos[0].alwaysOpenFilledFramesPost === 0, 'Expected always-open fill reset for track 0');

        assert(trackInfos[1].segmentCount === 0, 'Expected suppressed-only track to stay at zero active segments');
        assert(trackInfos[1].totalActiveSec === 0, 'Expected zero active seconds on track 1');
        assert(trackInfos[1].activePercent === 0, 'Expected 0% activity for track 1');
        assert(trackInfos[1].handoverStartDelayedMs === 0, 'Expected handover delay reset for track 1');
        assert(trackInfos[1].alwaysOpenFilledFramesPost === 0, 'Expected always-open fill reset for track 1');
    });
});
