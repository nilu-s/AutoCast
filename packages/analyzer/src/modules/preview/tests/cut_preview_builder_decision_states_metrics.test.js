'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder Decision States - Metrics', function () {
    it('should expose kept, near_miss and suppressed states with metrics', function () {
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

        var kept = 0;
        var nearMiss = 0;
        var suppressed = 0;
        for (var i = 0; i < actionable.length; i++) {
            var item = actionable[i];
            if (item.state === 'kept') kept++;
            if (item.state === 'near_miss') nearMiss++;
            if (item.state === 'suppressed') suppressed++;
            assert(item.metrics && item.metrics.bleedConfidence !== undefined, 'Expected bleed metric');
            assert(item.metrics && item.metrics.laughterConfidence !== undefined, 'Expected laughter metric');
            assert(item.metrics && item.metrics.classMargin !== undefined, 'Expected class margin metric');
            assert(item.typeLabel && item.typeConfidence !== undefined, 'Expected type metadata');
            assert(item.decisionState, 'Expected normalized decision state');
            assert(item.contentClass, 'Expected normalized content class');
            assert(item.qualityBand, 'Expected normalized quality band');
            assert(item.hasOwnProperty('suppressionReason'), 'Expected suppression reason key');
            assert(item.modelOrigin, 'Expected normalized model origin');
            assert(item.evidenceMetrics && item.evidenceMetrics.speechEvidence !== undefined, 'Expected evidence metrics');
            assert(item.decision && item.decision.decisionState, 'Expected decision structure');
            assert(item.classification && item.classification.contentClass, 'Expected classification structure');
            assert(item.explainability && item.explainability.reasons, 'Expected explainability structure');
        }

        assert(kept === 1, 'Expected one kept item');
        assert(nearMiss === 1, 'Expected one near_miss item');
        assert(suppressed === 1, 'Expected one suppressed item');
    });
});
