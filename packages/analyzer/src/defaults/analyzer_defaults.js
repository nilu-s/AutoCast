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

    // Adaptive floor
    adaptiveNoiseFloor: true,
    localNoiseWindowMs: 1800,
    noiseFloorUpdateMs: 500,
    localNoisePercentile: 0.15,
    localNoiseSampleStride: 2,
    maxAdaptiveFloorRiseDb: 8,
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
    // REDUCED: 1400ms -> 600ms to preserve more individual segments
    enableSameTrackGapMerge: true,
    sameTrackGapMergeMaxMs: 600,
    sameTrackGapMergeMaxOtherOverlapRatio: 0.20,
    sameTrackGapMergeMinPeakAboveThresholdDb: 3.0,
    // Cut preview consolidation: merge overlapping / short-gap snippets and classify merged span.
    // REDUCED: 1000ms -> 250ms to preserve individual segments in UI
    previewSegmentMergeEnabled: true,
    previewSegmentMergeGapMs: 250,
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

    // Laughter detection (heuristic rescue after spectral/speaker filtering)
    useLaughterDetection: true,
    laughterMinConfidence: 0.50,
    laughterHoldFrames: 10,
    laughterAbsoluteFloorDb: -58,
    laughterMinRelativeToThresholdDb: -10,
    laughterMinEnergyAboveFloorDb: 5.5,
    laughterZcrMin: 0.03,
    laughterZcrMax: 0.24,
    laughterModulationWindowMs: 420,
    laughterContinuityWindowMs: 220,
    laughterCrestMin: 1.8,
    laughterCrestMax: 6.8,
    laughterSpreadMin: 0.08,
    laughterSpreadMax: 0.72,
    laughterSampleSpreadPeakRatio: 0.22,
    laughterImpulseCrestMin: 7.2,
    laughterImpulseCrestMax: 14.0,
    laughterTransientRiseDb: 7.0,
    laughterTransientFallDb: 6.0,
    laughterEnergyWeight: 0.40,
    laughterZcrWeight: 0.18,
    laughterModulationWeight: 0.16,
    laughterCrestWeight: 0.13,
    laughterSpreadWeight: 0.18,
    laughterContinuityWeight: 0.05,
    laughterTransientPenaltyWeight: 0.34,
    laughterMinStreakFrames: 2,
    laughterStreakWindowFrames: 5,
    laughterBaseSupportWindowFrames: 8,
    laughterMinBaseSupportFrames: 2,
    enableLaughterContinuityRecovery: true,
    laughterRecoveryEdgeMinConfidence: 0.40,
    laughterRecoveryGapMinConfidence: 0.36,
    laughterRecoveryMaxGapMs: 180,
    laughterRecoveryLongGapMaxMs: 750,
    laughterRecoveryLongGapMinConfidence: 0.24,
    laughterRecoveryLongGapMinCoverage: 0.60,
    laughterRecoveryLongGapEdgeMinConfidence: 0.44,
    laughterRecoveryMaxEdgeExtendMs: 240,
    laughterRecoveryMinGapCoverage: 0.45,
    laughterRecoveryMinGapHits: 2,
    laughterRecoveryBaseSupportWindowMs: 900,
    laughterRecoveryMinBaseSupportFrames: 1,
    enableLaughterBurstReinforce: true,
    laughterBurstSeedMinConfidence: 0.52,
    laughterBurstExtendMinConfidence: 0.34,
    laughterBurstRelativeWindowMs: 450,
    laughterBurstRelativeSeedDelta: 0.08,
    laughterBurstRelativeSeedMinConfidence: 0.24,
    laughterBurstRelativeExtendDelta: 0.04,
    laughterBurstRelativeExtendMinConfidence: 0.18,
    laughterBurstMinKeepMs: 260,
    laughterBurstMaxGapMs: 100,
    laughterBurstMaxSideExtendMs: 220,
    laughterBurstAbsoluteFloorDb: -64,
    laughterBurstMinRelativeToThresholdDb: -12,
    laughterBurstMaxTransientPenalty: 0.62,
    laughterBurstBaseSupportWindowMs: 900,
    laughterBurstMinBaseSupportFrames: 1,
    protectLaughterInPostprocess: true,
    laughterPostprocessProtectMinConfidence: 0.46,
    laughterPostprocessProtectMinCoverage: 0.24,

    // Cross-track bleed suppression
    enableBleedHandling: false,
    bleedSuppressionDb: 18,
    bleedSuppressionSimilarityThreshold: 0.90,
    bleedSuppressionProtectConfidence: 0.34,

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
    enableLoudnessLatch: true,
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
