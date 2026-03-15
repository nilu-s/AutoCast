'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder - State Model', function () {
    it('should expose the canonical stateModel fields', function () {
        var frameCount = 240;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }]],
            overlapSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }]],
            finalSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active', origin: 'always_open_fill' }]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -52 }],
            totalDurationSec: 1.2,
            frameDurationMs: 10,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.03)],
            rawRmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.01)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.62) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [{ speakerSimilarity: previewUtils.makeFilledArray(frameCount, 0.72) }],
            params: {
                previewSegmentMergeEnabled: false,
                enforceAlwaysOneTrackOpen: true
            }
        });

        var actionable = previewUtils.actionableItems(result && result.items);
        assert(actionable.length >= 1, 'Expected at least one actionable preview item');
        var item = actionable[0];

        assert(item.decisionState === 'filled_gap', 'Expected decisionState for explicit fill');
        assert(item.stateModel && typeof item.stateModel === 'object', 'Expected stateModel');
        assert(item.stateModel.decisionState === 'filled_gap', 'Expected stateModel decision state');
        assert(item.stateModel.contentState, 'Expected contentState in state model');
        assert(item.stateModel.quality && item.stateModel.quality.score0to100 !== undefined, 'Expected quality object');
        assert(item.stateModel.provenance && item.stateModel.provenance.stage, 'Expected provenance');
        assert(item.metrics && item.metrics.keepLikelihood !== undefined, 'Expected decision metrics');
    });
});
