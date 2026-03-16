'use strict';

/**
 * Optimized VAD Stage for Real Podcast Audio
 * 
 * Improvements:
 * 1. Pre-processing before RMS/VAD (high-pass, noise gate, normalize)
 * 2. Optimized spectral VAD with extended frequency range
 * 3. Better defaults tuned for real audio
 */

var vadGate = require('../../modules/vad/vad_gate');
var spectralVad = require('../../modules/vad/spectral_vad');
var runtimeUtils = require('../utils/runtime_utils');

function runOptimizedVadStage(ctx) {
    ctx = ctx || {};

    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var trackInfos = ctx.trackInfos || [];
    var rmsProfiles = ctx.rmsProfiles || [];
    var spectralResults = ctx.spectralResults || [];
    var fingerprintResults = ctx.fingerprintResults || [];
    var laughterResults = ctx.laughterResults || [];
    var progress = ctx.progress || function () { };

    progress(50, 'Detecting voice activity (optimized)...');

    var vadResults = [];
    var gateSnapshots = [];
    var speakerProfiles = [];
    var i;

    for (i = 0; i < trackCount; i++) {
        progress(50 + Math.round((i / trackCount) * 15), 'VAD for track ' + (i + 1) + '/' + trackCount);

        // Use RMS profile directly from RMS stage (preprocessing already done there)
        var processedRmsProfile = rmsProfiles[i];

        var trackThreshold = params.thresholdAboveFloorDb;
        if (params.perTrackThresholdDb && params.perTrackThresholdDb[i] !== undefined) {
            trackThreshold = params.perTrackThresholdDb[i];
        }
        if (params.enableTrackLoudnessBias && trackInfos[i] && trackInfos[i].gainAdjustDb !== undefined) {
            var loudnessBias = trackInfos[i].gainAdjustDb * (params.trackLoudnessBiasStrength || 0);
            trackThreshold = trackThreshold - loudnessBias;
            if (trackThreshold < -6) trackThreshold = -6;
            if (trackThreshold > 18) trackThreshold = 18;
        }

        // Use defaults from analyzer_defaults.js (respect user params)
        var optimizedDefaults = {
            thresholdAboveFloorDb: trackThreshold,
            absoluteThresholdDb: params.absoluteThresholdDb,
            attackFrames: params.attackFrames,
            releaseFrames: params.releaseFrames,
            holdFrames: params.holdFrames,
            closeConfirmMs: params.closeConfirmMs,
            closeConfirmDynamic: params.closeConfirmDynamic,
            closeConfirmMinMs: params.closeConfirmMinMs,
            closeConfirmMaxMs: params.closeConfirmMaxMs,
            closeConfirmDynamicSlopeDb: params.closeConfirmDynamicSlopeDb,
            smoothingWindow: params.rmsSmoothing,
            hysteresisDb: params.hysteresisDb,
            frameDurationMs: params.frameDurationMs,
            adaptiveNoiseFloor: params.adaptiveNoiseFloor,
            localNoiseWindowMs: params.localNoiseWindowMs,
            noiseFloorUpdateMs: params.noiseFloorUpdateMs,
            localNoisePercentile: params.localNoisePercentile,
            maxAdaptiveFloorRiseDb: params.maxAdaptiveFloorRiseDb,
            localNoiseSampleStride: params.localNoiseSampleStride,
            enableHardSilenceCut: params.enableHardSilenceCut,
            hardSilenceCutDb: params.hardSilenceCutDb,
            hardSilenceLookaroundMs: params.hardSilenceLookaroundMs,
            hardSilencePeakDeltaDb: params.hardSilencePeakDeltaDb,
            debugMode: params.debugMode
        };

        var vadResult = vadGate.detectActivity(processedRmsProfile, optimizedDefaults);

        var gateAfterVad = cloneUint8Array(vadResult.gateOpen);
        var spectralDebug = null;
        var speakerDebug = null;
        var speakerSimilarity = null;
        var laughterDebug = null;

        // Use spectral results from feature stage (no duplicate calculation)
        if (params.useSpectralVAD && spectralResults[i]) {
            // Fallback to standard spectral VAD
            var standardRefine = spectralVad.refineGateWithSpectral(
                vadResult.gateOpen,
                spectralResults[i].confidence,
                params.spectralMinConfidence,
                {
                    softMargin: params.spectralSoftMargin,
                    openScore: params.spectralScoreOpen,
                    closeScore: params.spectralScoreClose,
                    rmsWeight: params.spectralRmsWeight,
                    holdFrames: params.spectralHoldFrames,
                    returnDebug: params.debugMode
                }
            );

            if (standardRefine && standardRefine.gateOpen) {
                vadResult.gateOpen = standardRefine.gateOpen;
                spectralDebug = standardRefine;
            } else {
                vadResult.gateOpen = standardRefine;
            }
        }

        var gateAfterSpectral = cloneUint8Array(vadResult.gateOpen);

        // Speaker profile building with optimized thresholds
        if (params.primarySpeakerLock && fingerprintResults[i]) {
            var fp = fingerprintResults[i];
            var conf = spectralResults[i] ? spectralResults[i].confidence : null;
            
            if (conf) {
                var profile = spectralVad.buildSpeakerProfile(fp, vadResult.gateOpen, conf, {
                    minConfidence: params.speakerProfileMinConfidence || 0.15,  // Lower for real audio
                    minFrames: params.speakerProfileMinFrames || 5  // Fewer frames needed
                });
                
                if (profile) {
                    speakerProfiles[i] = profile;
                    speakerDebug = { frameCount: profile.frameCount };
                }
            }
        }

        // Laughter detection results already computed in feature stage
        if (params.useLaughterDetection && laughterResults[i] && laughterResults[i].confidence) {
            var confArray = laughterResults[i].confidence;
            var sum = 0;
            for (var ci = 0; ci < confArray.length; ci++) {
                sum += confArray[ci];
            }
            laughterDebug = {
                meanConfidence: confArray.length > 0 ? sum / confArray.length : 0
            };
        }

        // Continuity enforcement (handled by vad_stage.js in unified pipeline)
        // Note: This will be fully removed when vad_stage_optimized becomes a thin wrapper

        // Store gate snapshots for debugging
        if (params.debugMode) {
            gateSnapshots[i] = {
                afterVad: gateAfterVad,
                afterSpectral: gateAfterSpectral,
                afterSpeaker: cloneUint8Array(vadResult.gateOpen),
                spectralDebug: spectralDebug,
                speakerDebug: speakerDebug,
                speakerSimilarity: speakerSimilarity,
                laughterDebug: laughterDebug
            };
        }

        vadResults[i] = {
            gateOpen: vadResult.gateOpen,
            thresholdDb: vadResult.thresholdDb,
            thresholdLinear: vadResult.thresholdLinear,
            noiseFloorDb: vadResult.noiseFloorDb,
            speakerProfile: speakerProfiles[i] || null
        };
    }

    return {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        bleedEnabled: params.enableBleedHandling !== false
    };
}

function cloneUint8Array(arr) {
    var clone = new Uint8Array(arr.length);
    for (var i = 0; i < arr.length; i++) {
        clone[i] = arr[i];
    }
    return clone;
}

module.exports = {
    runOptimizedVadStage: runOptimizedVadStage
};