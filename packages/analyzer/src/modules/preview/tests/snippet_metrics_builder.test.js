'use strict';

var metricsBuilder = require('../snippet_metrics_builder');
var previewUtils = require('../../../tests/helpers/cut_preview_test_utils');

describe('Snippet Metrics Builder', function () {
    it('should build evidence metrics without base-state leakage', function () {
        var frameCount = 120;
        var baseCtx = {
            trackIndex: 0,
            start: 0,
            end: 1.0,
            frameDurSec: 0.01,
            thresholdDb: -52,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02)],
            rawRmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.62) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.10) }],
            gateSnapshots: [{ speakerSimilarity: previewUtils.makeFilledArray(frameCount, 0.71) }],
            overlapActiveMaps: [new Uint8Array(frameCount)],
            mergedSegmentCount: 2,
            maxMergedGapSec: 0.24
        };
        for (var f = 0; f < frameCount; f++) baseCtx.overlapActiveMaps[0][f] = 1;

        var keepSeed = metricsBuilder.buildEvidenceMetrics(Object.assign({ decisionState: 'keep' }, baseCtx));
        var suppressSeed = metricsBuilder.buildEvidenceMetrics(Object.assign({ decisionState: 'suppress' }, baseCtx));

        assertApprox(keepSeed.values.speechEvidence, suppressSeed.values.speechEvidence, 0.0001, 'Evidence should be state-independent');
        assertApprox(keepSeed.values.bleedEvidence, suppressSeed.values.bleedEvidence, 0.0001, 'Bleed evidence should be state-independent');
        assert(keepSeed.values.postprocessPenalty === undefined, 'Evidence-only builder should not inject postprocess penalty');
        assertApprox(keepSeed.values.speakerLockScore, 0.71, 0.02, 'Should consume speakerSimilarity without debug payload');
        assert(keepSeed.values.voiceFrameRatio >= 0 && keepSeed.values.voiceFrameRatio <= 1, 'Expected normalized voice frame ratio');
        assert(keepSeed.values.inSnippetDropoutRatio >= 0 && keepSeed.values.inSnippetDropoutRatio <= 1, 'Expected normalized dropout ratio');
        assert(keepSeed.values.speakerMatchP10 <= keepSeed.values.speakerMatchMedian, 'Expected P10 <= median');
        assert(keepSeed.values.mergeHeterogeneity >= 0 && keepSeed.values.mergeHeterogeneity <= 1, 'Expected normalized merge heterogeneity');
    });

    it('should keep absolute RMS evidence from raw profiles', function () {
        var frameCount = 100;
        var result = metricsBuilder.buildEvidenceMetrics({
            trackIndex: 0,
            start: 0,
            end: 1.0,
            frameDurSec: 0.01,
            thresholdDb: -50,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02)],
            rawRmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.001)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.50) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.10) }],
            gateSnapshots: [{}],
            overlapActiveMaps: [new Uint8Array(frameCount)],
            mergedSegmentCount: 1,
            maxMergedGapSec: 0
        });

        assert(result.values.peakOverThreshold > 10, 'Relative peak should use normalized profile');
        assert(result.values.rawPeakDbFs < -55, 'Absolute peak should use raw RMS profile');
        assert(result.values.rawPeakDbFs < result.values.peakOverThreshold, 'Raw absolute dBFS should not be replaced by relative delta');
    });

    it('should reduce overlap trust when overlap evidence is less reliable', function () {
        var frameCount = 100;
        var activeMap = new Uint8Array(frameCount);
        var activeMapOther = new Uint8Array(frameCount);
        for (var i = 0; i < frameCount; i++) {
            activeMap[i] = 1;
            activeMapOther[i] = 1;
        }

        var trusted = metricsBuilder.buildEvidenceMetrics({
            trackIndex: 0,
            start: 0,
            end: 1.0,
            frameDurSec: 0.01,
            thresholdDb: -52,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02), previewUtils.makeFilledArray(frameCount, 0.12)],
            rawRmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02), previewUtils.makeFilledArray(frameCount, 0.12)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.15) }, { confidence: previewUtils.makeFilledArray(frameCount, 0.75) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.1) }, { confidence: previewUtils.makeFilledArray(frameCount, 0.1) }],
            gateSnapshots: [{ speakerSimilarity: previewUtils.makeFilledArray(frameCount, 0.15) }, { speakerSimilarity: previewUtils.makeFilledArray(frameCount, 0.75) }],
            overlapActiveMaps: [activeMap, activeMapOther],
            params: { independentTrackAnalysis: false, enableBleedHandling: true }
        });

        var untrusted = metricsBuilder.buildEvidenceMetrics({
            trackIndex: 0,
            start: 0,
            end: 1.0,
            frameDurSec: 0.01,
            thresholdDb: -52,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02), previewUtils.makeFilledArray(frameCount, 0.12)],
            rawRmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02), previewUtils.makeFilledArray(frameCount, 0.12)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.15) }, { confidence: previewUtils.makeFilledArray(frameCount, 0.75) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.1) }, { confidence: previewUtils.makeFilledArray(frameCount, 0.1) }],
            gateSnapshots: [{ speakerSimilarity: previewUtils.makeFilledArray(frameCount, 0.15) }, { speakerSimilarity: previewUtils.makeFilledArray(frameCount, 0.75) }],
            overlapActiveMaps: [activeMap, activeMapOther],
            params: { independentTrackAnalysis: true, enableBleedHandling: false }
        });

        assert(untrusted.values.overlapTrust < trusted.values.overlapTrust, 'Expected lower overlap trust in independent/no-bleed mode');
    });
});
