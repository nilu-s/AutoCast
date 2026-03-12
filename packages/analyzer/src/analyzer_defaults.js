'use strict';

var ANALYSIS_DEFAULTS = {
    // RMS
    frameDurationMs: 10,
    rmsSmoothing: 5,

    // VAD / Gate
    thresholdAboveFloorDb: 0,
    absoluteThresholdDb: -64,
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
    enableHardSilenceCut: true,
    hardSilenceCutDb: -51,
    hardSilenceLookaroundMs: 220,
    hardSilencePeakDeltaDb: 8,

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
    enablePrimaryTrackGapFill: true,
    primaryTrackGapFillMaxMs: 1800,
    primaryTrackGapFillQuietDb: -50,
    enablePreTriggerCleanup: true,
    preTriggerMaxDurationMs: 900,
    preTriggerJoinGapMs: 1200,
    preTriggerMinPeakDeltaDb: 4.0,
    preTriggerAbsorbGapMs: 380,
    enableSameTrackGapMerge: true,
    sameTrackGapMergeMaxMs: 1400,
    sameTrackGapMergeMaxOtherOverlapRatio: 0.20,
    sameTrackGapMergeMinPeakAboveThresholdDb: 3.0,
    enableDominantTrackStickiness: true,
    dominantTrackHoldMs: 2000,
    dominantTrackReturnWindowMs: 5000,
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
