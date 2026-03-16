'use strict';

/**
 * Optimized VAD Stage for Real Podcast Audio
 * 
 * Improvements:
 * 1. Pre-processing before RMS/VAD (high-pass, noise gate, normalize)
 * 2. Optimized spectral VAD with extended frequency range
 * 3. Better defaults tuned for real audio
 */

var rmsCalc = require('../../modules/energy/rms_calculator');
var vadGate = require('../../modules/vad/vad_gate');
var spectralVad = require('../../modules/vad/spectral_vad');
var optimizedVad = require('../../modules/vad/spectral_vad_optimized');
var preprocess = require('../../modules/preprocess/audio_preprocess');
var continuityEnforcer = require('./continuity_enforcer');
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
    var audioData = ctx.audioData || [];  // Raw audio for pre-processing
    var progress = ctx.progress || function () { };

    progress(50, 'Detecting voice activity (optimized)...');

    var vadResults = [];
    var gateSnapshots = [];
    var speakerProfiles = [];
    var i;

    // Enable optimized processing by default for real audio
    var enablePreprocess = params.enablePreprocess !== false;
    var enableOptimizedVAD = params.enableOptimizedVAD !== false;

    for (i = 0; i < trackCount; i++) {
        progress(50 + Math.round((i / trackCount) * 15), 'VAD for track ' + (i + 1) + '/' + trackCount);

        // Apply pre-processing if raw audio available
        var processedRmsProfile = rmsProfiles[i];
        if (enablePreprocess && audioData[i]) {
            var preprocessed = preprocess.preprocess(audioData[i], trackInfos[i].sampleRate);
            // Re-compute RMS profile from pre-processed audio
            var rmsResult = rmsCalc.calculateRMS(preprocessed, trackInfos[i].sampleRate, params.frameDurationMs || 10);
            processedRmsProfile = rmsResult.rms;
        }

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

        // Use optimized defaults for real audio
        var optimizedDefaults = {
            thresholdAboveFloorDb: trackThreshold,
            absoluteThresholdDb: params.absoluteThresholdDb,
            attackFrames: params.attackFrames || 2,  // Faster attack
            releaseFrames: params.releaseFrames || 8,  // Slower release for speech
            holdFrames: params.holdFrames || 3,
            closeConfirmMs: params.closeConfirmMs,
            closeConfirmDynamic: params.closeConfirmDynamic,
            closeConfirmMinMs: params.closeConfirmMinMs,
            closeConfirmMaxMs: params.closeConfirmMaxMs,
            closeConfirmDynamicSlopeDb: params.closeConfirmDynamicSlopeDb,
            smoothingWindow: params.rmsSmoothing || 3,  // More smoothing
            hysteresisDb: params.hysteresisDb || 2.0,  // Slightly more hysteresis
            frameDurationMs: params.frameDurationMs || 10,
            adaptiveNoiseFloor: params.adaptiveNoiseFloor !== false,  // Enable by default
            localNoiseWindowMs: params.localNoiseWindowMs || 500,
            noiseFloorUpdateMs: params.noiseFloorUpdateMs || 100,
            localNoisePercentile: params.localNoisePercentile || 15,  // Lower percentile for noise floor
            maxAdaptiveFloorRiseDb: params.maxAdaptiveFloorRiseDb || 12,
            localNoiseSampleStride: params.localNoiseSampleStride || 1,
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

        // Use optimized spectral VAD if enabled
        if (enableOptimizedVAD && audioData[i]) {
            var preprocessed = enablePreprocess ? 
                preprocess.preprocess(audioData[i], trackInfos[i].sampleRate) : 
                audioData[i];
            
            var optResult = optimizedVad.computeOptimizedSpectralVAD(preprocessed, trackInfos[i].sampleRate, {
                frameDurationMs: 20,  // Longer window for stability
                speechLowHz: 200,     // Extended low end
                speechHighHz: 4000    // Extended high end
            });
            
            // Smooth the confidence values
            var smoothedConf = optimizedVad.smoothConfidence(optResult.confidence, 3);
            
            // Refine gate with optimized confidence
            var spectralRefine = spectralVad.refineGateWithSpectral(
                vadResult.gateOpen,
                smoothedConf,
                params.spectralMinConfidence || 0.15,  // Lower threshold for real audio
                {
                    softMargin: params.spectralSoftMargin || 0.10,
                    openScore: params.spectralScoreOpen || 0.55,
                    closeScore: params.spectralScoreClose || 0.40,
                    rmsWeight: params.spectralRmsWeight || 0.45,  // Slightly less RMS weight
                    holdFrames: params.spectralHoldFrames || 3,
                    returnDebug: params.debugMode
                }
            );

            if (spectralRefine && spectralRefine.gateOpen) {
                vadResult.gateOpen = spectralRefine.gateOpen;
                spectralDebug = spectralRefine;
            } else {
                vadResult.gateOpen = spectralRefine;
            }
        } else if (params.useSpectralVAD && spectralResults[i]) {
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
        if (params.enableSpeakerProfile && fingerprintResults[i]) {
            var fp = fingerprintResults[i];
            var conf = spectralResults[i] ? spectralResults[i].confidence : null;
            
            if (!conf && enableOptimizedVAD && audioData[i]) {
                var preprocessed = enablePreprocess ? 
                    preprocess.preprocess(audioData[i], trackInfos[i].sampleRate) : 
                    audioData[i];
                var optResult = optimizedVad.computeOptimizedSpectralVAD(preprocessed, trackInfos[i].sampleRate);
                conf = optimizedVad.smoothConfidence(optResult.confidence, 3);
            }
            
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

        // Laughter detection
        if (params.detectLaughter && laughterResults[i]) {
            var laughterConf = laughterDetector.computeLaughterConfidence(
                laughterResults[i].samples,
                trackInfos[i].sampleRate,
                params.frameDurationMs || 10
            );
            
            laughterDebug = {
                meanConfidence: laughterConf.confidence.reduce(function(a, b) { return a + b; }, 0) / 
                                laughterConf.confidence.length
            };
        }

        // Continuity enforcement
        if (params.continuityEnforcement) {
            vadResult.gateOpen = continuityEnforcer.enforceContinuity(vadResult.gateOpen, {
                minGapMs: params.continuityMinGapMs,
                minSegmentMs: params.continuityMinSegmentMs,
                frameDurationMs: params.frameDurationMs
            });
        }

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
            noiseFloorDb: vadResult.noiseFloorDb,
            speakerProfile: speakerProfiles[i] || null
        };
    }

    return {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        bleedEnabled: params.bleedDetection !== false
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