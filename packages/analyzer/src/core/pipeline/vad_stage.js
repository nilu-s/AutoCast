'use strict';

var rmsCalc = require('../../modules/energy/rms_calculator');
var vadGate = require('../../modules/vad/vad_gate');
var spectralVad = require('../../modules/vad/spectral_vad');
var laughterDetector = require('../../modules/vad/laughter_detector');
var runtimeUtils = require('../utils/runtime_utils');

function runVadStage(ctx) {
    ctx = ctx || {};

    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var trackInfos = ctx.trackInfos || [];
    var rmsProfiles = ctx.rmsProfiles || [];
    var spectralResults = ctx.spectralResults || [];
    var fingerprintResults = ctx.fingerprintResults || [];
    var laughterResults = ctx.laughterResults || [];
    var progress = ctx.progress || function () { };

    progress(50, 'Detecting voice activity...');

    var vadResults = [];
    var gateSnapshots = [];
    var speakerProfiles = [];
    var i;

    for (i = 0; i < trackCount; i++) {
        progress(50 + Math.round((i / trackCount) * 15), 'VAD for track ' + (i + 1) + '/' + trackCount);

        var trackThreshold = ctx.trackThresholds ? ctx.trackThresholds[i] : params.thresholdAboveFloorDb;

        var vadResult = vadGate.detectActivity(rmsProfiles[i], {
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
        });

        var gateAfterVad = cloneUint8Array(vadResult.gateOpen);
        var spectralDebug = null;
        var speakerDebug = null;
        var speakerSimilarity = null;
        var laughterDebug = null;

        if (params.useSpectralVAD && spectralResults[i]) {
            var spectralRefine = spectralVad.refineGateWithSpectral(
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

            if (spectralRefine && spectralRefine.gateOpen) {
                vadResult.gateOpen = spectralRefine.gateOpen;
                spectralDebug = spectralRefine;
            } else {
                vadResult.gateOpen = spectralRefine;
            }
        }

        var gateAfterSpectral = cloneUint8Array(vadResult.gateOpen);

        if (params.primarySpeakerLock && params.useSpectralVAD && spectralResults[i] && fingerprintResults[i]) {
            var profile = spectralVad.buildSpeakerProfile(
                fingerprintResults[i],
                vadResult.gateOpen,
                spectralResults[i].confidence,
                {
                    minConfidence: params.speakerProfileMinConfidence,
                    minFrames: params.speakerProfileMinFrames
                }
            );

            speakerProfiles.push(profile);
            if (profile) {
                var speakerLockResult = spectralVad.applySpeakerProfileGate(
                    vadResult.gateOpen,
                    fingerprintResults[i],
                    profile,
                    {
                        threshold: params.speakerMatchThreshold,
                        softMargin: params.speakerMatchSoftMargin,
                        holdFrames: params.speakerMatchHoldFrames,
                        returnDebug: params.debugMode
                    }
                );

                if (speakerLockResult && speakerLockResult.gateOpen) {
                    vadResult.gateOpen = speakerLockResult.gateOpen;
                    speakerDebug = speakerLockResult;
                } else {
                    vadResult.gateOpen = speakerLockResult;
                }
                speakerSimilarity = normalizeSpeakerSimilaritySeries(
                    speakerLockResult && speakerLockResult.similarity,
                    fingerprintResults[i],
                    profile,
                    vadResult.gateOpen ? vadResult.gateOpen.length : 0
                );

                trackInfos[i].speakerProfileFrames = profile.frameCount;
            } else {
                trackInfos[i].speakerProfileFrames = 0;
            }
        } else {
            speakerProfiles.push(null);
        }

        var gateAfterSpeakerLock = cloneUint8Array(vadResult.gateOpen);
        var gateAfterLaughter = gateAfterSpeakerLock;

        if (params.useLaughterDetection && laughterResults[i] && laughterResults[i].confidence) {
            var laughterRescue = laughterDetector.rescueGateWithLaughter(
                gateAfterVad,
                vadResult.gateOpen,
                laughterResults[i].confidence,
                rmsProfiles[i],
                {
                    minConfidence: params.laughterMinConfidence,
                    holdFrames: params.laughterHoldFrames,
                    absoluteFloorDb: params.laughterBurstAbsoluteFloorDb,
                    minRelativeToThresholdDb: params.laughterMinRelativeToThresholdDb,
                    thresholdLinear: vadResult.thresholdLinear,
                    minStreakFrames: params.laughterMinStreakFrames,
                    streakWindowFrames: params.laughterStreakWindowFrames,
                    baseSupportWindowFrames: params.laughterBaseSupportWindowFrames,
                    minBaseSupportFrames: params.laughterMinBaseSupportFrames,
                    returnDebug: params.debugMode
                }
            );

            if (laughterRescue && laughterRescue.gateOpen) {
                vadResult.gateOpen = laughterRescue.gateOpen;
                laughterDebug = laughterRescue;
                gateAfterLaughter = cloneUint8Array(vadResult.gateOpen);
                trackInfos[i].laughterRescuedFrames = laughterRescue.rescuedFrames || 0;
            } else {
                vadResult.gateOpen = laughterRescue;
                gateAfterLaughter = cloneUint8Array(vadResult.gateOpen);
                trackInfos[i].laughterRescuedFrames = 0;
            }
        } else {
            trackInfos[i].laughterRescuedFrames = 0;
        }

        vadResults.push(vadResult);
        gateSnapshots.push({
            afterVad: gateAfterVad,
            afterSpectral: gateAfterSpectral,
            afterSpeakerLock: gateAfterSpeakerLock,
            afterLaughter: gateAfterLaughter,
            afterBleed: null,
            bleedSuppressor: null,
            vadDebug: vadResult.debug || null,
            spectralDebug: spectralDebug,
            speakerDebug: speakerDebug,
            speakerSimilarity: speakerSimilarity,
            laughterDebug: laughterDebug,
            laughterContinuityDebug: null,
            laughterBurstDebug: null
        });
    }

    return {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        // bleedEnabled will be provided by bleed suppressor now; default true for continuity here
        bleedEnabled: true,
        speakerProfiles: speakerProfiles
    };
}

function healInSpeechDropouts(gateArray, rmsArray, vadDebug, options) {
    options = options || {};
    if (!gateArray || gateArray.length === 0) {
        return {
            gateOpen: gateArray || new Uint8Array(0),
            healedFrames: 0,
            healedGaps: 0
        };
    }

    var out = cloneUint8Array(gateArray);
    var frameDurationMs = options.frameDurationMs || 10;
    var maxDropoutFrames = Math.max(1, Math.round((options.maxDropoutMs || 260) / frameDurationMs));
    var minCoverage = clampNumber(
        (options.minEnergyCoverage !== undefined) ? options.minEnergyCoverage : 0.35,
        0.05,
        1
    );
    var relativeFactor = rmsCalc.dbToLinear(
        (options.minRelativeDb !== undefined) ? options.minRelativeDb : -8
    );
    var absFloorLinear = rmsCalc.dbToLinear(
        (options.absoluteFloorDb !== undefined) ? options.absoluteFloorDb : -62
    );

    var thresholdByFrame = vadDebug && vadDebug.openThresholdLinearByFrame
        ? vadDebug.openThresholdLinearByFrame
        : null;
    var fallbackThreshold = vadDebug && vadDebug.openThresholdLinearByFrame && vadDebug.openThresholdLinearByFrame.length > 0
        ? getFrameValue(vadDebug.openThresholdLinearByFrame, 0, 0)
        : (options.fallbackThresholdLinear || 0);

    var healedFrames = 0;
    var healedGaps = 0;

    var i = 0;
    while (i < out.length) {
        if (out[i]) {
            i++;
            continue;
        }

        var gapStart = i;
        while (i < out.length && !out[i]) i++;
        var gapEnd = i - 1;
        var gapFrames = gapEnd - gapStart + 1;

        if (gapFrames > maxDropoutFrames) continue;
        if (gapStart <= 0 || gapEnd >= out.length - 1) continue;
        if (!out[gapStart - 1] || !out[gapEnd + 1]) continue;

        var energeticFrames = 0;
        for (var f = gapStart; f <= gapEnd; f++) {
            var frameRms = getFrameValue(rmsArray, f, 0);
            var frameThreshold = thresholdByFrame
                ? getFrameValue(thresholdByFrame, f, fallbackThreshold)
                : fallbackThreshold;
            var minKeep = Math.max(absFloorLinear, frameThreshold * relativeFactor);
            if (frameRms >= minKeep) energeticFrames++;
        }

        var requiredFrames = Math.max(1, Math.ceil(gapFrames * minCoverage));
        if (energeticFrames >= requiredFrames) {
            for (f = gapStart; f <= gapEnd; f++) {
                out[f] = 1;
            }
            healedFrames += gapFrames;
            healedGaps++;
        }
    }

    return {
        gateOpen: out,
        healedFrames: healedFrames,
        healedGaps: healedGaps
    };
}

function getFrameValue(arr, frameIndex, fallback) {
    return runtimeUtils.getFrameValue(arr, frameIndex, fallback);
}

function cloneUint8Array(arr) {
    return runtimeUtils.cloneUint8Array(arr);
}

function clampNumber(v, min, max) {
    return runtimeUtils.clampNumber(v, min, max);
}

function buildSpeakerSimilaritySeries(fingerprint, profile, targetLength) {
    if (!fingerprint || !profile || !fingerprint.frameCount) return null;
    var len = Math.min(fingerprint.frameCount, Math.max(0, targetLength || 0));
    if (len <= 0) return null;

    var similarity = new Float32Array(len);
    for (var i = 0; i < len; i++) {
        similarity[i] = spectralVad.computeFrameToProfileSimilarity(fingerprint, profile, i);
    }
    return similarity;
}

function normalizeSpeakerSimilaritySeries(series, fingerprint, profile, targetLength) {
    if (series && typeof series.length === 'number' && series.length > 0) return series;
    return buildSpeakerSimilaritySeries(fingerprint, profile, targetLength);
}

module.exports = {
    runVadStage: runVadStage
};
