'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder Decision States - Metrics', function () {
    it('should expose keep, review and suppress states with metrics', function () {
        var frameCount = 240;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[
                { start: 0.00, end: 0.50, trackIndex: 0, state: 'active' },
                { start: 0.70, end: 1.00, trackIndex: 0, state: 'suppressed' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            overlapSegments: [[
                { start: 0.00, end: 0.50, trackIndex: 0, state: 'active' },
                { start: 0.70, end: 1.00, trackIndex: 0, state: 'suppressed' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            finalSegments: [[
                { start: 0.00, end: 0.50, trackIndex: 0, state: 'active' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -50 }],
            totalDurationSec: 2.0,
            frameDurationMs: 10,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.03)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.62) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.10) }],
            gateSnapshots: [{ speakerDebug: { similarity: previewUtils.makeFilledArray(frameCount, 0.74) } }],
            params: {
                previewSegmentMergeEnabled: false,
                spectralMinConfidence: 0.18
            }
        });

        var actionable = previewUtils.actionableItems(result && result.items);
        assert(actionable.length === 3, 'Expected 3 actionable preview items');

        var keep = 0;
        var review = 0;
        var suppress = 0;
        for (var i = 0; i < actionable.length; i++) {
            var item = actionable[i];
            if (item.decisionState === 'keep') keep++;
            if (item.decisionState === 'review') review++;
            if (item.decisionState === 'suppress') suppress++;
            assert(item.metrics && item.metrics.bleedConfidence !== undefined, 'Expected bleed metric');
            assert(item.metrics && item.metrics.laughterConfidence !== undefined, 'Expected laughter metric');
            assert(item.metrics && item.metrics.classMargin !== undefined, 'Expected class margin metric');
            assert(item.decisionState, 'Expected normalized decision state');
            assert(item.contentState, 'Expected normalized content state');
            assert(item.quality && item.quality.score0to100 !== undefined, 'Expected quality object');
            assert(item.hasOwnProperty('suppressionReason'), 'Expected suppression reason key');
            assert(item.origin, 'Expected normalized origin');
            assert(item.evidenceMetrics && item.evidenceMetrics.speechEvidence !== undefined, 'Expected evidence metrics');
            assert(item.decision && item.decision.decisionState, 'Expected decision structure');
            assert(item.classification && item.classification.contentState, 'Expected classification structure');
            assert(item.explainability && item.explainability.reasons, 'Expected explainability structure');
        }

        assert(keep === 1, 'Expected one keep item');
        assert(review === 1, 'Expected one review item');
        assert(suppress === 1, 'Expected one suppress item');
    });
});
