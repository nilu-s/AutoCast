'use strict';

var rmsCalc = require('../../modules/energy/rms_calculator');
var vadGate = require('../../modules/vad/vad_gate');
var spectralVad = require('../../modules/vad/spectral_vad');
var laughterDetector = require('../../modules/vad/laughter_detector');
var continuityEnforcer = require('./continuity_enforcer');
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

    var bleedEnabled = (params.enableBleedHandling !== undefined) ? !!params.enableBleedHandling : true;
    var bleedDb = (params.bleedSuppressionDb !== undefined) ? params.bleedSuppressionDb : 0;
    if (bleedEnabled && bleedDb > 0 && trackCount > 1) {
        progress(53, 'Suppressing mic bleed...');
        var bleedLinearRatio = Math.pow(10, bleedDb / 20);

        var minFrames = Infinity;
        for (var ti = 0; ti < trackCount; ti++) {
            if (rmsProfiles[ti].length < minFrames) minFrames = rmsProfiles[ti].length;
        }

        var suppressSimilarityThreshold = (params.bleedSuppressionSimilarityThreshold !== undefined)
            ? params.bleedSuppressionSimilarityThreshold
            : 0.90;
        var protectConfidence = (params.bleedSuppressionProtectConfidence !== undefined)
            ? params.bleedSuppressionProtectConfidence
            : 0.34;

        for (ti = 0; ti < trackCount; ti++) {
            var gate = vadResults[ti].gateOpen;
            var rmsA = rmsProfiles[ti];

            if (params.debugMode) {
                gateSnapshots[ti].bleedSuppressor = new Int16Array(Math.min(gate.length, minFrames));
            }

            for (var f = 0; f < Math.min(gate.length, minFrames); f++) {
                if (!gate[f]) continue;

                var baseRms = getFrameValue(rmsA, f, 0);
                if (baseRms <= 0) baseRms = 1e-12;

                var suppressBy = -1;

                for (var tj = 0; tj < trackCount; tj++) {
                    if (tj === ti) continue;
                    if (f >= vadResults[tj].gateOpen.length || !vadResults[tj].gateOpen[f]) continue;

                    var otherRms = getFrameValue(rmsProfiles[tj], f, 0);
                    if (!(otherRms > baseRms * bleedLinearRatio)) continue;

                    var keepAsOverlap = false;
                    if (params.useSpectralVAD &&
                        spectralResults[ti] &&
                        fingerprintResults[ti] &&
                        fingerprintResults[tj]) {
                        var similarity = spectralVad.computeFrameFingerprintSimilarity(
                            fingerprintResults[tj],
                            fingerprintResults[ti],
                            f
                        );
                        var victimConf = getFrameValue(spectralResults[ti].confidence, f, 0);

                        if (similarity < suppressSimilarityThreshold && victimConf >= protectConfidence) {
                            keepAsOverlap = true;
                        }
                    }

                    if (!keepAsOverlap) {
                        suppressBy = tj;
                        break;
                    }
                }

                if (suppressBy !== -1) {
                    gate[f] = 0;
                    if (params.debugMode && gateSnapshots[ti].bleedSuppressor && f < gateSnapshots[ti].bleedSuppressor.length) {
                        gateSnapshots[ti].bleedSuppressor[f] = suppressBy + 1;
                    }
                }
            }
        }
    }

    for (i = 0; i < trackCount; i++) {
        var healed = null;
        if (params.enableInSpeechDropoutHeal) {
            healed = healInSpeechDropouts(vadResults[i].gateOpen, rmsProfiles[i], vadResults[i].debug, {
                frameDurationMs: params.frameDurationMs,
                maxDropoutMs: params.maxInSpeechDropoutMs,
                minRelativeDb: params.dropoutHealMinRelativeDb,
                absoluteFloorDb: params.dropoutHealAbsoluteFloorDb,
                minEnergyCoverage: params.dropoutHealMinEnergyCoverage,
                fallbackThresholdLinear: vadResults[i].thresholdLinear
            });

            vadResults[i].gateOpen = healed.gateOpen;
            if (trackInfos[i]) {
                trackInfos[i].dropoutHealedFrames = healed.healedFrames;
                trackInfos[i].dropoutHealedGaps = healed.healedGaps;
            }
        } else if (trackInfos[i]) {
            trackInfos[i].dropoutHealedFrames = 0;
            trackInfos[i].dropoutHealedGaps = 0;
        }
    }

    if (params.useLaughterDetection && params.enableLaughterContinuityRecovery) {
        for (i = 0; i < trackCount; i++) {
            if (!laughterResults[i] || !laughterResults[i].confidence) {
                if (trackInfos[i]) trackInfos[i].laughterContinuityRecoveredFrames = 0;
                continue;
            }

            var laughterContinuity = laughterDetector.recoverGateContinuityWithLaughter(
                gateSnapshots[i] ? gateSnapshots[i].afterVad : null,
                vadResults[i].gateOpen,
                laughterResults[i].confidence,
                rmsProfiles[i],
                {
                    edgeMinConfidence: params.laughterRecoveryEdgeMinConfidence,
                    gapMinConfidence: params.laughterRecoveryGapMinConfidence,
                    maxGapFrames: Math.max(1, Math.round(params.laughterRecoveryMaxGapMs / params.frameDurationMs)),
                    longGapMaxFrames: Math.max(1, Math.round(params.laughterRecoveryLongGapMaxMs / params.frameDurationMs)),
                    longGapMinConfidence: params.laughterRecoveryLongGapMinConfidence,
                    longGapMinCoverage: params.laughterRecoveryLongGapMinCoverage,
                    longGapEdgeMinConfidence: params.laughterRecoveryLongGapEdgeMinConfidence,
                    maxEdgeExtendFrames: Math.max(0, Math.round(params.laughterRecoveryMaxEdgeExtendMs / params.frameDurationMs)),
                    minGapCoverage: params.laughterRecoveryMinGapCoverage,
                    minGapHits: params.laughterRecoveryMinGapHits,
                    absoluteFloorDb: params.laughterAbsoluteFloorDb,
                    minRelativeToThresholdDb: params.laughterMinRelativeToThresholdDb,
                    thresholdLinear: vadResults[i].thresholdLinear,
                    baseSupportWindowFrames: Math.max(1, Math.round(params.laughterRecoveryBaseSupportWindowMs / params.frameDurationMs)),
                    minBaseSupportFrames: params.laughterRecoveryMinBaseSupportFrames,
                    transientPenalty: laughterResults[i].transientPenalty || null,
                    maxTransientPenalty: params.laughterBurstMaxTransientPenalty,
                    returnDebug: params.debugMode
                }
            );

            if (laughterContinuity && laughterContinuity.gateOpen) {
                vadResults[i].gateOpen = laughterContinuity.gateOpen;
                if (trackInfos[i]) {
                    trackInfos[i].laughterContinuityRecoveredFrames = laughterContinuity.recoveredFrames || 0;
                }
                if (params.debugMode && gateSnapshots[i]) {
                    gateSnapshots[i].laughterContinuityDebug = laughterContinuity;
                }
            } else {
                vadResults[i].gateOpen = laughterContinuity;
                if (trackInfos[i]) trackInfos[i].laughterContinuityRecoveredFrames = 0;
            }
        }
    } else {
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) trackInfos[i].laughterContinuityRecoveredFrames = 0;
        }
    }

    if (params.useLaughterDetection && params.enableLaughterBurstReinforce) {
        for (i = 0; i < trackCount; i++) {
            if (!laughterResults[i] || !laughterResults[i].confidence) {
                if (trackInfos[i]) trackInfos[i].laughterBurstRecoveredFrames = 0;
                continue;
            }

            var laughterBurst = laughterDetector.reinforceLaughterBursts(
                gateSnapshots[i] ? gateSnapshots[i].afterVad : null,
                vadResults[i].gateOpen,
                laughterResults[i].confidence,
                rmsProfiles[i],
                {
                    seedMinConfidence: params.laughterBurstSeedMinConfidence,
                    extendMinConfidence: params.laughterBurstExtendMinConfidence,
                    relativeWindowFrames: Math.max(1, Math.round(params.laughterBurstRelativeWindowMs / params.frameDurationMs)),
                    relativeSeedDelta: params.laughterBurstRelativeSeedDelta,
                    relativeSeedMinConfidence: params.laughterBurstRelativeSeedMinConfidence,
                    relativeExtendDelta: params.laughterBurstRelativeExtendDelta,
                    relativeExtendMinConfidence: params.laughterBurstRelativeExtendMinConfidence,
                    targetMinFrames: Math.max(1, Math.round(params.laughterBurstMinKeepMs / params.frameDurationMs)),
                    maxSeedGapFrames: Math.max(0, Math.round(params.laughterBurstMaxGapMs / params.frameDurationMs)),
                    maxSideExtendFrames: Math.max(0, Math.round(params.laughterBurstMaxSideExtendMs / params.frameDurationMs)),
                    absoluteFloorDb: params.laughterBurstAbsoluteFloorDb,
                    minRelativeToThresholdDb: params.laughterBurstMinRelativeToThresholdDb,
                    thresholdLinear: vadResults[i].thresholdLinear,
                    baseSupportWindowFrames: Math.max(1, Math.round(params.laughterBurstBaseSupportWindowMs / params.frameDurationMs)),
                    minBaseSupportFrames: params.laughterBurstMinBaseSupportFrames,
                    maxTransientPenalty: params.laughterBurstMaxTransientPenalty,
                    transientPenalty: laughterResults[i].transientPenalty || null,
                    returnDebug: params.debugMode
                }
            );

            if (laughterBurst && laughterBurst.gateOpen) {
                vadResults[i].gateOpen = laughterBurst.gateOpen;
                if (trackInfos[i]) {
                    trackInfos[i].laughterBurstRecoveredFrames = laughterBurst.recoveredFrames || 0;
                }
                if (params.debugMode && gateSnapshots[i]) {
                    gateSnapshots[i].laughterBurstDebug = laughterBurst;
                }
            } else {
                vadResults[i].gateOpen = laughterBurst;
                if (trackInfos[i]) trackInfos[i].laughterBurstRecoveredFrames = 0;
            }
        }
    } else {
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) trackInfos[i].laughterBurstRecoveredFrames = 0;
        }
    }

    if (params.enforceAlwaysOneTrackOpen) {
        var alwaysOpenStats = continuityEnforcer.enforceAtLeastOneOpenTrack(vadResults, rmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            dominanceWindowMs: params.alwaysOpenDominanceWindowMs,
            stickinessDb: params.alwaysOpenStickinessDb
        });
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) {
                trackInfos[i].alwaysOpenFilledFrames = alwaysOpenStats.perTrackFilledFrames[i] || 0;
            }
        }
    } else {
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) trackInfos[i].alwaysOpenFilledFrames = 0;
        }
    }

    for (i = 0; i < trackCount; i++) {
        gateSnapshots[i].afterBleed = cloneUint8Array(vadResults[i].gateOpen);
    }

    return {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        bleedEnabled: bleedEnabled,
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
