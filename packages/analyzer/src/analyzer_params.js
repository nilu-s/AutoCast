'use strict';

function enforceSingleModeParams(params) {
    if (!params) params = {};
    // Keep UI/user intent intact. This function only normalizes unsafe values
    // and must not hard-override explicit settings.
    params.snippetPadBeforeMs = clampNumber(parseOrFallback(params.snippetPadBeforeMs, 0), 0, 10000);
    params.snippetPadAfterMs = clampNumber(parseOrFallback(params.snippetPadAfterMs, 0), 0, 10000);
    params.minSegmentMs = clampNumber(parseOrFallback(params.minSegmentMs, 0), 0, 10000);
    params.postOverlapMinSegmentMs = clampNumber(parseOrFallback(params.postOverlapMinSegmentMs, 0), 0, 10000);
    params.minGapMs = clampNumber(parseOrFallback(params.minGapMs, 0), 0, 10000);
    params.primaryTrackGapFillMaxMs = clampNumber(parseOrFallback(params.primaryTrackGapFillMaxMs, 0), 0, 10000);
    params.sameTrackGapMergeMaxMs = clampNumber(parseOrFallback(params.sameTrackGapMergeMaxMs, 0), 0, 15000);
    params.previewSegmentMergeGapMs = clampNumber(parseOrFallback(params.previewSegmentMergeGapMs, 1000), 0, 20000);
    params.preTriggerJoinGapMs = clampNumber(parseOrFallback(params.preTriggerJoinGapMs, 0), 0, 15000);
    params.preTriggerAbsorbGapMs = clampNumber(parseOrFallback(params.preTriggerAbsorbGapMs, 0), 0, 5000);
    params.dominantTrackHoldMs = clampNumber(parseOrFallback(params.dominantTrackHoldMs, 0), 0, 15000);
    params.dominantTrackReturnWindowMs = clampNumber(parseOrFallback(params.dominantTrackReturnWindowMs, 0), 0, 30000);
    params.handoverMaxStartDelayMs = clampNumber(parseOrFallback(params.handoverMaxStartDelayMs, 3000), 0, 10000);
    params.handoverLeadMs = clampNumber(parseOrFallback(params.handoverLeadMs, 220), 0, 3000);
    params.handoverWeakOnsetProbeMs = clampNumber(parseOrFallback(params.handoverWeakOnsetProbeMs, 260), 40, 3000);
    params.handoverMaxWeakOverlapLeadMs = clampNumber(parseOrFallback(params.handoverMaxWeakOverlapLeadMs, 700), 80, 6000);
    params.handoverOnsetPeakMinDb = clampNumber(parseOrFallback(params.handoverOnsetPeakMinDb, 2.0), -12, 20);
    params.handoverOnsetMeanMinDb = clampNumber(parseOrFallback(params.handoverOnsetMeanMinDb, 0.3), -12, 20);
    params.handoverMinSegmentMs = clampNumber(parseOrFallback(params.handoverMinSegmentMs, 120), 40, 5000);
    params.alwaysOpenFillAutoKeepBleedMaxConfidence = clampNumber(
        parseOrFallback(params.alwaysOpenFillAutoKeepBleedMaxConfidence, 0.76),
        0,
        1
    );
    params.alwaysOpenFillAutoKeepMinSpeechEvidence = clampNumber(
        parseOrFallback(params.alwaysOpenFillAutoKeepMinSpeechEvidence, 0.46),
        0,
        1
    );
    params.alwaysOpenFillAutoKeepMinKeepLikelihood = clampNumber(
        parseOrFallback(params.alwaysOpenFillAutoKeepMinKeepLikelihood, 0.60),
        0,
        1
    );
    params.alwaysOpenFillPromoteSuppressed = !!params.alwaysOpenFillPromoteSuppressed;
    params.handoffHeadLeadMs = clampNumber(parseOrFallback(params.handoffHeadLeadMs, 220), 0, 3000);
    params.handoffHeadWindowMs = clampNumber(parseOrFallback(params.handoffHeadWindowMs, 1400), 0, 6000);
    params.residualSnippetMaxDurationMs = clampNumber(parseOrFallback(params.residualSnippetMaxDurationMs, 220), 60, 1000);
    params.residualSnippetMaxPeakDbFs = clampNumber(parseOrFallback(params.residualSnippetMaxPeakDbFs, -53.0), -90, -20);
    params.residualSnippetMaxMeanDbFs = clampNumber(parseOrFallback(params.residualSnippetMaxMeanDbFs, -57.0), -90, -20);
    params.residualSnippetProtectGapMs = clampNumber(parseOrFallback(params.residualSnippetProtectGapMs, 240), 60, 1200);
    params.residualSnippetProtectOtherOverlapRatio = clampNumber(
        parseOrFallback(params.residualSnippetProtectOtherOverlapRatio, 0.12),
        0,
        1
    );
    params.laughterRecoveryMaxGapMs = clampNumber(parseOrFallback(params.laughterRecoveryMaxGapMs, 180), 0, 2000);
    params.laughterRecoveryLongGapMaxMs = clampNumber(parseOrFallback(params.laughterRecoveryLongGapMaxMs, 750), 0, 4000);
    params.laughterRecoveryLongGapMinCoverage = clampNumber(parseOrFallback(params.laughterRecoveryLongGapMinCoverage, 0.60), 0, 1);
    params.laughterRecoveryLongGapMinConfidence = clampNumber(parseOrFallback(params.laughterRecoveryLongGapMinConfidence, 0.24), 0, 1);
    params.laughterRecoveryLongGapEdgeMinConfidence = clampNumber(parseOrFallback(params.laughterRecoveryLongGapEdgeMinConfidence, 0.44), 0, 1);
    params.laughterRecoveryMaxEdgeExtendMs = clampNumber(parseOrFallback(params.laughterRecoveryMaxEdgeExtendMs, 240), 0, 3000);
    params.laughterRecoveryBaseSupportWindowMs = clampNumber(parseOrFallback(params.laughterRecoveryBaseSupportWindowMs, 900), 20, 5000);
    params.laughterRecoveryMinBaseSupportFrames = clampNumber(parseOrFallback(params.laughterRecoveryMinBaseSupportFrames, 1), 1, 200);
    params.laughterBurstMinKeepMs = clampNumber(parseOrFallback(params.laughterBurstMinKeepMs, 260), 20, 3000);
    params.laughterBurstMaxGapMs = clampNumber(parseOrFallback(params.laughterBurstMaxGapMs, 100), 0, 1000);
    params.laughterBurstMaxSideExtendMs = clampNumber(parseOrFallback(params.laughterBurstMaxSideExtendMs, 220), 0, 3000);
    params.laughterBurstRelativeWindowMs = clampNumber(parseOrFallback(params.laughterBurstRelativeWindowMs, 450), 20, 5000);
    params.laughterBurstRelativeSeedDelta = clampNumber(parseOrFallback(params.laughterBurstRelativeSeedDelta, 0.08), 0, 1);
    params.laughterBurstRelativeSeedMinConfidence = clampNumber(parseOrFallback(params.laughterBurstRelativeSeedMinConfidence, 0.24), 0, 1);
    params.laughterBurstRelativeExtendDelta = clampNumber(parseOrFallback(params.laughterBurstRelativeExtendDelta, 0.04), 0, 1);
    params.laughterBurstRelativeExtendMinConfidence = clampNumber(parseOrFallback(params.laughterBurstRelativeExtendMinConfidence, 0.18), 0, 1);
    params.laughterBurstAbsoluteFloorDb = clampNumber(parseOrFallback(params.laughterBurstAbsoluteFloorDb, -64), -90, -20);
    params.laughterBurstBaseSupportWindowMs = clampNumber(parseOrFallback(params.laughterBurstBaseSupportWindowMs, 900), 20, 5000);
    params.laughterBurstMinBaseSupportFrames = clampNumber(parseOrFallback(params.laughterBurstMinBaseSupportFrames, 1), 1, 200);
    params.finalMinPeakDbFs = clampNumber(parseOrFallback(params.finalMinPeakDbFs, -52.0), -90, -20);
    return params;
}

function clampNumber(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function parseOrFallback(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
}

module.exports = {
    enforceSingleModeParams: enforceSingleModeParams
};
