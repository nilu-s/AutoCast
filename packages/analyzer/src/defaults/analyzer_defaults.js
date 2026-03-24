'use strict';

var ANALYSIS_DEFAULTS = {
    // RMS
    frameDurationMs: 10,
    rmsSmoothing: 5,

    // VAD / Gate (tuned for real podcast audio)
    thresholdAboveFloorDb: 9,
    absoluteThresholdDb: -50,
    attackFrames: 1,
    releaseFrames: 6,
    holdFrames: 24,
    closeConfirmMs: 1000,
    closeConfirmDynamic: true,
    closeConfirmMinMs: 450,
    closeConfirmMaxMs: 1800,
    closeConfirmDynamicSlopeDb: 10,
    hysteresisDb: 2,

    // Adaptive floor removed

    enableHardSilenceCut: false,
    hardSilenceCutDb: -51,
    hardSilenceLookaroundMs: 220,
    hardSilencePeakDeltaDb: 8,
    enableInSpeechDropoutHeal: true,
    maxInSpeechDropoutMs: 260,
    dropoutHealMinRelativeDb: -8,
    dropoutHealAbsoluteFloorDb: -62,
    dropoutHealMinEnergyCoverage: 0.35,
    enforceAlwaysOneTrackOpen: true,
    alwaysOpenDominanceWindowMs: 2500,
    alwaysOpenStickinessDb: 2.5,
    alwaysOpenFillAutoKeepBleedMaxConfidence: 0.76,
    alwaysOpenFillAutoKeepMinSpeechEvidence: 0.46,
    alwaysOpenFillAutoKeepMinKeepLikelihood: 0.60,
    alwaysOpenFillPromoteSuppressed: false,

    // Per-track sensitivity overrides (array, one per track, or null for global)
    perTrackThresholdDb: null,
    enableTrackLoudnessBias: true,
    trackLoudnessBiasStrength: 0.35,

    // Segments
    minSegmentMs: 260,
    postOverlapMinSegmentMs: 160,
    minGapMs: 180,
    independentTrackAnalysis: true,
    snippetPadBeforeMs: 1200,
    snippetPadAfterMs: 1200,
    crossTrackTailTrimInIndependentMode: true,
    overlapTailAllowanceMs: 180,
    crossTrackHeadTrimInIndependentMode: true,
    handoffHeadLeadMs: 220,
    handoffHeadWindowMs: 1400,
    enablePrimaryTrackGapFill: true,
    primaryTrackGapFillMaxMs: 1800,
    primaryTrackGapFillQuietDb: -50,
    enablePreTriggerCleanup: true,
    preTriggerMaxDurationMs: 900,
    preTriggerJoinGapMs: 1200,
    preTriggerMinPeakDeltaDb: 4.0,
    preTriggerAbsorbGapMs: 380,
    // Feature removed

    enableDominantTrackStickiness: true,
    dominantTrackHoldMs: 2000,
    dominantTrackReturnWindowMs: 5000,
    enableCrossTrackHandoverSmoothing: true,
    handoverMaxStartDelayMs: 3000,
    handoverLeadMs: 220,
    handoverWeakOnsetProbeMs: 260,
    handoverMaxWeakOverlapLeadMs: 700,
    handoverOnsetPeakMinDb: 2.0,
    handoverOnsetMeanMinDb: 0.3,
    handoverMinSegmentMs: 120,
    enableLowSignificancePrune: true,
    lowSignificanceMaxDurationMs: 3000,
    lowSignificanceMinPeakAboveThresholdDb: 3.5,
    lowSignificanceMinMeanAboveThresholdDb: 1.0,
    enablePeakAnchorKeep: true,
    peakAnchorMinDbAboveThreshold: 8.0,
    peakAnchorPrePadMs: 450,
    peakAnchorPostPadMs: 650,
    peakAnchorMinClusterMs: 60,
    peakAnchorJoinGapMs: 120,
    enableResidualSnippetPrune: true,
    residualSnippetMaxDurationMs: 220,
    residualSnippetMinPeakAboveThresholdDb: 2.5,
    residualSnippetMinMeanAboveThresholdDb: -0.5,
    residualSnippetMaxPeakDbFs: -53.0,
    residualSnippetMaxMeanDbFs: -57.0,
    residualSnippetProtectGapMs: 240,
    residualSnippetProtectOtherOverlapRatio: 0.12,
    enableFinalPeakGate: true,
    finalMinPeakDbFs: -52.0,

    // Overlap
    overlapPolicy: 'spectral_bleed_safe',
    overlapMarginDb: 8,
    bleedMarginDb: 15,
    bleedSimilarityThreshold: 0.90,
    overlapSimilarityThreshold: 0.58,
    suppressionScoreThreshold: 0.65,
    fillGaps: false,

    // Auto-gain matching
    autoGain: true,

    // Spectral VAD refinement
    useSpectralVAD: true,
    spectralMinConfidence: 0.18,
    spectralSoftMargin: 0.18,
    spectralScoreOpen: 0.50,
    spectralScoreClose: 0.35,
    spectralRmsWeight: 0.75,
    spectralHoldFrames: 4,
    primarySpeakerLock: true,
    speakerProfileMinConfidence: 0.30,
    speakerProfileMinFrames: 24,
    speakerMatchThreshold: 0.56,
    speakerMatchSoftMargin: 0.12,
    speakerMatchHoldFrames: 4,

    // Laughter detection removed


    // Cross-track bleed suppression
    enableBleedHandling: true,
    bleedSuppressionDb: 12,
    bleedSuppressionSimilarityThreshold: 0.85,
    bleedSuppressionProtectConfidence: 0.28,

    // Alignment check
    alignmentToleranceSec: 0.5,

    // Waveform preview
    waveformResolution: 500,

    // Diagnostics
    debugMode: false,
    debugMaxFrames: 5000,

    // Optimized pipeline parameters
    enablePreprocess: true,
    speechLowHz: 200,
    speechHighHz: 4000,

    // Loudness Latch (preparation for Phase 19-24)
    enableLoudnessLatch: false,
    loudnessLatchOpenThresholdDb: -48,
    loudnessLatchKeepThresholdDb: -52,
    loudnessLatchOpenMinDurationMs: 100,
    loudnessLatchWindowMs: 4000,
    loudnessLatchMinCumulativeActiveMs: 1200,
    loudnessLatchMinCoveragePercent: 35,
    loudnessLatchCloseConfirmMs: 1000,

    // Parameter aliases for vad_stage_optimized compatibility
    // enableSpeakerProfile -> primarySpeakerLock (use primarySpeakerLock)
    // detectLaughter -> useLaughterDetection (use useLaughterDetection)
    // continuityEnforcement -> enableInSpeechDropoutHeal (use enableInSpeechDropoutHeal)

    // Optional extension modules (path strings or inline extension objects)
    extensions: null
};

function mergeDefaults(userParams, defaults) {
    var result = {};
    for (var key in defaults) {
        if (defaults.hasOwnProperty(key)) {
            result[key] = (userParams && userParams[key] !== undefined) ? userParams[key] : defaults[key];
        }
    }
    return result;
}

function mergeWithDefaults(userParams) {
    return mergeDefaults(userParams, ANALYSIS_DEFAULTS);
}

module.exports = {
    ANALYSIS_DEFAULTS: ANALYSIS_DEFAULTS,
    mergeWithDefaults: mergeWithDefaults
};
