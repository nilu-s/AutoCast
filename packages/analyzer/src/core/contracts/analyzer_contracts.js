'use strict';

var ANALYZER_CONTRACT_VERSION = 'autocast.analyzer.v1';

function ensureObject(value, fallback) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return fallback || {};
}

function normalizeTrackPaths(trackPaths) {
    var input = Array.isArray(trackPaths) ? trackPaths : [];
    var out = [];
    for (var i = 0; i < input.length; i++) {
        var p = input[i];
        if (p === null || p === undefined || p === '') {
            out.push(null);
            continue;
        }
        if (typeof p !== 'string') {
            throw new Error('Invalid trackPaths[' + i + ']: expected string or null.');
        }
        out.push(p);
    }
    return out;
}

function validateAnalyzeRequest(msg) {
    var payload = ensureObject(msg, {});
    var trackPaths = normalizeTrackPaths(payload.trackPaths);
    if (trackPaths.length === 0) {
        throw new Error('Invalid analyze request: trackPaths must contain at least one entry.');
    }
    return {
        trackPaths: trackPaths,
        params: ensureObject(payload.params, {})
    };
}

function validateQuickGainScanRequest(msg) {
    var payload = ensureObject(msg, {});
    var trackPaths = normalizeTrackPaths(payload.trackPaths);
    var nonNullCount = 0;
    for (var i = 0; i < trackPaths.length; i++) {
        if (trackPaths[i]) nonNullCount++;
    }
    if (nonNullCount === 0) {
        throw new Error('Invalid quickGainScan request: at least one valid path is required.');
    }
    return {
        trackPaths: trackPaths
    };
}

function assertAnalyzeResult(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('Invalid analyze result: expected object.');
    }
    if (!Array.isArray(result.tracks)) {
        throw new Error('Invalid analyze result: tracks must be an array.');
    }
    if (!Array.isArray(result.segments)) {
        throw new Error('Invalid analyze result: segments must be an array.');
    }
    if (!result.alignment || typeof result.alignment !== 'object') {
        throw new Error('Invalid analyze result: alignment object missing.');
    }
    if (!result.waveform || typeof result.waveform !== 'object') {
        throw new Error('Invalid analyze result: waveform object missing.');
    }
    if (!result.cutPreview || typeof result.cutPreview !== 'object') {
        throw new Error('Invalid analyze result: cutPreview object missing.');
    }
    assertCutPreview(result.cutPreview);
    assertPreviewModel(result.previewModel, result.cutPreview);
}

function assertQuickGainScanResult(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('Invalid quickGainScan result: expected object.');
    }
    if (!Array.isArray(result.tracks)) {
        throw new Error('Invalid quickGainScan result: tracks must be an array.');
    }
}

function withContract(result, kind) {
    var out = ensureObject(result, {});
    out.contract = {
        name: kind,
        version: ANALYZER_CONTRACT_VERSION
    };
    return out;
}

function assertCutPreview(cutPreview) {
    if (!Array.isArray(cutPreview.items)) {
        throw new Error('Invalid analyze result: cutPreview.items must be an array.');
    }
    if (!Array.isArray(cutPreview.lanes)) {
        throw new Error('Invalid analyze result: cutPreview.lanes must be an array.');
    }
    if (typeof cutPreview.policyVersion !== 'string' || !cutPreview.policyVersion) {
        throw new Error('Invalid analyze result: cutPreview.policyVersion must be a non-empty string.');
    }
    if (typeof cutPreview.metricsVersion !== 'string' || !cutPreview.metricsVersion) {
        throw new Error('Invalid analyze result: cutPreview.metricsVersion must be a non-empty string.');
    }

    for (var i = 0; i < cutPreview.items.length; i++) {
        var item = cutPreview.items[i];
        if (!item || typeof item !== 'object') {
            throw new Error('Invalid analyze result: cutPreview.items[' + i + '] must be an object.');
        }
        if (!item.metrics || typeof item.metrics !== 'object') {
            throw new Error('Invalid analyze result: cutPreview.items[' + i + '].metrics missing.');
        }
        assertPreviewMetrics(item.metrics, 'cutPreview.items[' + i + '].metrics');
    }
}

function assertPreviewModel(previewModel, cutPreview) {
    if (!previewModel || typeof previewModel !== 'object') {
        throw new Error('Invalid analyze result: previewModel object missing.');
    }
    if (typeof previewModel.policyVersion !== 'string' || !previewModel.policyVersion) {
        throw new Error('Invalid analyze result: previewModel.policyVersion must be a non-empty string.');
    }
    if (typeof previewModel.metricsVersion !== 'string' || !previewModel.metricsVersion) {
        throw new Error('Invalid analyze result: previewModel.metricsVersion must be a non-empty string.');
    }
    if (previewModel.policyVersion !== cutPreview.policyVersion) {
        throw new Error('Invalid analyze result: previewModel.policyVersion must match cutPreview.policyVersion.');
    }
    if (previewModel.metricsVersion !== cutPreview.metricsVersion) {
        throw new Error('Invalid analyze result: previewModel.metricsVersion must match cutPreview.metricsVersion.');
    }
}

function assertPreviewMetrics(metrics, labelPrefix) {
    var bounded = [
        'spectralConfidence',
        'laughterConfidence',
        'overlapPenalty',
        'overlapTrust',
        'speakerLockScore',
        'speakerMatchP10',
        'speakerMatchMedian',
        'voiceFrameRatio',
        'inSnippetDropoutRatio',
        'mergeHeterogeneity',
        'speechEvidence',
        'laughterEvidence',
        'bleedEvidence',
        'bleedConfidence',
        'noiseEvidence',
        'classMargin',
        'keptSourceRatio',
        'keepLikelihood',
        'suppressLikelihood',
        'reviewLikelihood',
        'decisionMargin',
        'corridorDecisionMargin',
        'corridorClassMargin',
        'corridorCombinedMargin',
        'uncertaintyScore',
        'hardReviewCorridor',
        'uncertaintyBleedGate',
        'bleedHighConfidence',
        'alwaysOpenFill',
        'decisionPenalty'
    ];

    for (var i = 0; i < bounded.length; i++) {
        assertNumberInRange(metrics[bounded[i]], 0, 1, labelPrefix + '.' + bounded[i]);
    }

    assertNumber(metrics.meanOverThreshold, labelPrefix + '.meanOverThreshold');
    assertNumber(metrics.peakOverThreshold, labelPrefix + '.peakOverThreshold');
    assertNumber(metrics.rawMeanDbFs, labelPrefix + '.rawMeanDbFs');
    assertNumber(metrics.rawPeakDbFs, labelPrefix + '.rawPeakDbFs');
    assertNumber(metrics.maxMergedGapMs, labelPrefix + '.maxMergedGapMs');

    if (!isFinite(metrics.mergedSegmentCount) || metrics.mergedSegmentCount < 1) {
        throw new Error('Invalid analyze result: ' + labelPrefix + '.mergedSegmentCount must be >= 1.');
    }
    if (!isFinite(metrics.maxMergedGapMs) || metrics.maxMergedGapMs < 0) {
        throw new Error('Invalid analyze result: ' + labelPrefix + '.maxMergedGapMs must be >= 0.');
    }
}

function assertNumber(value, label) {
    if (typeof value !== 'number' || !isFinite(value)) {
        throw new Error('Invalid analyze result: ' + label + ' must be a finite number.');
    }
}

function assertNumberInRange(value, min, max, label) {
    assertNumber(value, label);
    if (value < min || value > max) {
        throw new Error('Invalid analyze result: ' + label + ' must be in range [' + min + ', ' + max + '].');
    }
}

module.exports = {
    ANALYZER_CONTRACT_VERSION: ANALYZER_CONTRACT_VERSION,
    normalizeTrackPaths: normalizeTrackPaths,
    validateAnalyzeRequest: validateAnalyzeRequest,
    validateQuickGainScanRequest: validateQuickGainScanRequest,
    assertAnalyzeResult: assertAnalyzeResult,
    assertQuickGainScanResult: assertQuickGainScanResult,
    withContract: withContract
};
