'use strict';

function makeValidMetricPatch() {
    return {
        meanOverThreshold: 0,
        peakOverThreshold: 0,
        rawMeanDbFs: -60,
        rawPeakDbFs: -55,
        spectralConfidence: 0.5,
        laughterConfidence: 0.1,
        overlapPenalty: 0.1,
        overlapTrust: 0.2,
        speakerLockScore: 0.6,
        speakerMatchP10: 0.4,
        speakerMatchMedian: 0.6,
        voiceFrameRatio: 0.7,
        inSnippetDropoutRatio: 0.1,
        mergeHeterogeneity: 0.2,
        speechEvidence: 0.7,
        laughterEvidence: 0.1,
        bleedEvidence: 0.2,
        bleedConfidence: 0.2,
        noiseEvidence: 0.1,
        classMargin: 0.4,
        keptSourceRatio: 0.8,
        keepLikelihood: 0.7,
        suppressLikelihood: 0.2,
        reviewLikelihood: 0.1,
        decisionMargin: 0.5,
        corridorDecisionMargin: 0.5,
        corridorClassMargin: 0.4,
        corridorCombinedMargin: 0.45,
        uncertaintyScore: 0.2,
        hardReviewCorridor: 0,
        uncertaintyBleedGate: 0,
        bleedHighConfidence: 0,
        alwaysOpenFill: 0,
        decisionPenalty: 0.2,
        mergedSegmentCount: 1,
        maxMergedGapMs: 0
    };
}

function makeValidAnalyzeResult() {
    return {
        tracks: [],
        segments: [],
        alignment: {},
        waveform: {},
        cutPreview: {
            policyVersion: 'preview-policy.v2',
            metricsVersion: 'preview-metrics.v2',
            items: [{ metrics: makeValidMetricPatch() }],
            lanes: []
        },
        previewModel: {
            policyVersion: 'preview-policy.v2',
            metricsVersion: 'preview-metrics.v2'
        }
    };
}

module.exports = {
    makeValidMetricPatch: makeValidMetricPatch,
    makeValidAnalyzeResult: makeValidAnalyzeResult
};
