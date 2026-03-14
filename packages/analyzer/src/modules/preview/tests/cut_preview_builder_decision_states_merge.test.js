'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder Decision States - Merge', function () {
    it('should keep merged source snippets when each source part stays active', function () {
        var frameCount = 500;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[
                { start: 0.00, end: 0.40, trackIndex: 0, state: 'active' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            overlapSegments: [[
                { start: 0.00, end: 0.40, trackIndex: 0, state: 'active' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            finalSegments: [[
                { start: 0.00, end: 0.40, trackIndex: 0, state: 'active' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -52 }],
            totalDurationSec: 2.0,
            frameDurationMs: 10,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.55) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [{ speakerDebug: { similarity: previewUtils.makeFilledArray(frameCount, 0.70) } }],
            params: {
                previewSegmentMergeEnabled: true,
                previewSegmentMergeGapMs: 1000,
                spectralMinConfidence: 0.18
            }
        });

        var actionable = previewUtils.actionableItems(result && result.items);
        assert(actionable.length === 1, 'Expected one merged actionable preview span');
        assert(actionable[0].state === 'kept', 'Merged span should stay kept');
        assert(actionable[0].metrics && actionable[0].metrics.mergedSegmentCount === 2, 'Expected merged segment count = 2');
        assert(actionable[0].metrics && actionable[0].metrics.keptSourceRatio >= 0.99, 'Expected kept source ratio close to 1');
    });
});
