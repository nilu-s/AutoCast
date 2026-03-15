'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder Decision States - Metrics', function () {
    it('should expose keep/review states with enriched metrics', function () {
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
            rawRmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.03)],
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
        assert(result.policyVersion, 'Expected preview policy version');
        assert(result.metricsVersion, 'Expected preview metrics version');

        var keep = 0;
        var review = 0;
        for (var i = 0; i < actionable.length; i++) {
            var item = actionable[i];
            if (item.decisionState === 'keep') keep++;
            if (item.decisionState === 'review') review++;
            assert(item.metrics && item.metrics.bleedConfidence !== undefined, 'Expected bleed metric');
            assert(item.metrics && item.metrics.laughterConfidence !== undefined, 'Expected laughter metric');
            assert(item.metrics && item.metrics.classMargin !== undefined, 'Expected class margin metric');
            assert(item.metrics && item.metrics.overlapTrust !== undefined, 'Expected overlap trust metric');
            assert(item.metrics && item.metrics.voiceFrameRatio !== undefined, 'Expected voice frame ratio metric');
            assert(item.metrics && item.metrics.inSnippetDropoutRatio !== undefined, 'Expected in-snippet dropout ratio metric');
            assert(item.metrics && item.metrics.speakerMatchP10 !== undefined, 'Expected speaker match p10 metric');
            assert(item.metrics && item.metrics.speakerMatchMedian !== undefined, 'Expected speaker match median metric');
            assert(item.metrics && item.metrics.mergeHeterogeneity !== undefined, 'Expected merge heterogeneity metric');
            assert(item.metrics && item.metrics.reviewLikelihood !== undefined, 'Expected review likelihood metric');
            assert(item.metrics && item.metrics.decisionPenalty !== undefined, 'Expected decision penalty metric');
            assert(item.metrics && item.metrics.postprocessPenalty === undefined, 'Legacy postprocess penalty should be removed');
            assert(item.decisionState, 'Expected normalized decision state');
            assert(item.contentState, 'Expected normalized content state');
            assert(item.quality && item.quality.score0to100 !== undefined, 'Expected quality object');
            assert(item.hasOwnProperty('suppressionReason'), 'Expected suppression reason key');
            assert(item.origin, 'Expected normalized origin');
            assert(item.evidenceMetrics && item.evidenceMetrics.speechEvidence !== undefined, 'Expected evidence metrics');
            assert(item.decision && item.decision.decisionState, 'Expected decision structure');
            assert(item.classification && item.classification.contentState, 'Expected classification structure');
            assert(item.explainability && item.explainability.reasons, 'Expected explainability structure');
            assert(item.stateModel && item.stateModel.decisionState === item.decisionState, 'Expected native state model alignment');
            assert(item.decisionStage.indexOf('metrics_') !== 0, 'Legacy metrics_* decision path should not be used');
        }

        assert(keep === 1, 'Expected one keep item');
        assert(review >= 1, 'Expected at least one review item');
    });

    it('should carry raw RMS profiles into per-item preview metrics', function () {
        var frameCount = 220;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }]],
            overlapSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }]],
            finalSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -50 }],
            totalDurationSec: 1.2,
            frameDurationMs: 10,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.03)],
            rawRmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.0012)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.62) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [{ speakerSimilarity: previewUtils.makeFilledArray(frameCount, 0.70) }],
            params: {
                previewSegmentMergeEnabled: false
            }
        });

        var actionable = previewUtils.actionableItems(result && result.items);
        assert(actionable.length === 1, 'Expected one actionable preview item');
        assert(actionable[0].metrics.peakOverThreshold > 8, 'Expected relative RMS signal from normalized profile');
        assert(actionable[0].metrics.rawPeakDbFs < -55, 'Expected absolute raw peak from raw RMS profile');
    });
});
