/**
 * AutoCast â€“ Main Analyzer v2.2
 *
 * Orchestrates the full analysis pipeline:
 *   WAV â†’ RMS â†’ Auto-Gain â†’ VAD (RMS + Spectral) â†’ Segments â†’ Overlap â†’ Cut Map
 *
 * v2.2 changes:
 *   - Softer spectral gating and adaptive floor tuning
 *   - Debug diagnostics with per-frame suppression reasons
 *   - Less aggressive overlap and segment defaults
 */

'use strict';

var path = require('path');
var fs = require('fs');
var wavReader = require('./wav_reader');
var rmsCalc = require('./rms_calculator');
var vadGate = require('./vad_gate');
var segmentBuilder = require('./segment_builder');
var overlapResolver = require('./overlap_resolver');
var gainNormalizer = require('./gain_normalizer');
var spectralVad = require('./spectral_vad');
var laughterDetector = require('./laughter_detector');
var analyzerDefaults = require('./analyzer_defaults');
var analyzerParams = require('./analyzer_params');
var analyzerPostprocess = require('./analyzer_postprocess');
var analyzerExtensions = require('./analyzer_extensions');
var cutPreviewBuilder = require('./cut_preview_builder');
var ANALYSIS_DEFAULTS = analyzerDefaults.ANALYSIS_DEFAULTS;

/**
 * Run the full analysis pipeline.
 *
 * @param {Array<string>} trackPaths - Absolute paths to WAV files (one per speaker)
 * @param {object} [userParams] - Override any defaults
 * @param {function} [progressCallback] - function(percent, message)
 * @returns {object}
 */
function analyze(trackPaths, userParams, progressCallback) {
    var params = analyzerDefaults.mergeWithDefaults(userParams);
    params = analyzerParams.enforceSingleModeParams(params);
    var extensions = analyzerExtensions.loadExtensions(params.extensions);
    var progress = progressCallback || function () { };

    var trackCount = trackPaths.length;
    if (trackCount === 0) {
        throw new Error('No tracks provided for analysis.');
    }

    progress(5, 'Reading audio files...');

    var trackInfos = [];
    var audioData = [];

    for (var i = 0; i < trackCount; i++) {
        var p = trackPaths[i];
        if (!p) {
            // Track is deselected or invalid
            trackInfos.push({
                path: null,
                name: 'Unused Track ' + (i + 1),
                durationSec: 0,
                sampleRate: 48000,
                channels: 1,
                bitDepth: 16
            });
            audioData.push({
                sampleRate: 48000,
                channels: 1,
                bitDepth: 16,
                samples: new Float32Array(0),
                durationSec: 0
            });
            continue;
        }

        var absPath = path.resolve(p);
        progress(5 + Math.round((i / trackCount) * 10), 'Reading: ' + path.basename(absPath));

        var wav = wavReader.readWav(absPath);
        trackInfos.push({
            path: absPath,
            name: path.basename(absPath, path.extname(absPath)),
            durationSec: wav.durationSec,
            sampleRate: wav.sampleRate,
            channels: wav.channels,
            bitDepth: wav.bitDepth
        });
        audioData.push(wav);
    }

    progress(15, 'Checking track alignment...');
    var alignment = wavReader.checkAlignment(trackInfos, params.alignmentToleranceSec);

    var totalDurationSec = Infinity;
    var validTrackCount = 0;
    var effectiveOffsetsSec = [];

    for (i = 0; i < trackInfos.length; i++) {
        var offsetSec = getTrackOffsetSec(params.trackOffsets, i);
        effectiveOffsetsSec.push(offsetSec);

        if (!isNaN(offsetSec) && offsetSec !== 0) {
            trackInfos[i].durationSec += offsetSec;
            if (trackInfos[i].durationSec < 0) trackInfos[i].durationSec = 0;
        }

        if (trackInfos[i].path && trackInfos[i].durationSec < totalDurationSec) {
            totalDurationSec = trackInfos[i].durationSec;
            validTrackCount++;
        }
    }
    if (validTrackCount === 0) {
        totalDurationSec = 0;
    }

    alignment.appliedOffsetsSec = effectiveOffsetsSec.slice();
    analyzerExtensions.invokeHook(extensions, 'onAfterReadTracks', {
        trackPaths: trackPaths,
        trackInfos: trackInfos,
        audioData: audioData,
        alignment: alignment,
        params: params
    });

    progress(20, 'Calculating audio energy...');

    var rmsProfiles = [];
    var rawRmsProfiles = [];

    for (i = 0; i < trackCount; i++) {
        progress(20 + Math.round((i / trackCount) * 10), 'RMS for track ' + (i + 1) + '/' + trackCount);

        var rmsResult = rmsCalc.calculateRMS(
            audioData[i].samples,
            audioData[i].sampleRate,
            params.frameDurationMs
        );

        var rmsArr = applyOffsetToArray(rmsResult.rms, effectiveOffsetsSec[i], params.frameDurationMs);
        rmsProfiles.push(rmsArr);
        rawRmsProfiles.push(rmsArr);
    }
    analyzerExtensions.invokeHook(extensions, 'onAfterRms', {
        rmsProfiles: rmsProfiles,
        rawRmsProfiles: rawRmsProfiles,
        trackInfos: trackInfos,
        params: params
    });

    var gainInfo = null;
    if (params.autoGain) {
        progress(32, 'Matching track volumes...');
        gainInfo = gainNormalizer.computeGainMatching(rmsProfiles);
        rmsProfiles = gainNormalizer.applyGainToRMS(rmsProfiles, gainInfo.gains);

        for (i = 0; i < trackCount; i++) {
            trackInfos[i].gainAdjustDb = gainInfo.gainsDb[i];
        }
    }

    var spectralResults = [];
    var fingerprintResults = [];
    var laughterResults = [];
    if (params.useSpectralVAD || params.useLaughterDetection) {
        if (params.useSpectralVAD && params.useLaughterDetection) {
            progress(35, 'Running spectral + laughter analysis...');
        } else if (params.useSpectralVAD) {
            progress(35, 'Running spectral analysis...');
        } else {
            progress(35, 'Running laughter analysis...');
        }

        for (i = 0; i < trackCount; i++) {
            progress(35 + Math.round((i / trackCount) * 10), 'Feature pass for track ' + (i + 1) + '/' + trackCount);

            if (params.useSpectralVAD) {
                var spectral = spectralVad.computeSpectralVAD(
                    audioData[i].samples,
                    audioData[i].sampleRate,
                    params.frameDurationMs
                );

                // Compute spectral fingerprint while we still have the audio data
                var fingerprint = spectralVad.computeSpectralFingerprint(
                    audioData[i].samples,
                    audioData[i].sampleRate,
                    params.frameDurationMs
                );

                spectral.confidence = applyOffsetToArray(
                    spectral.confidence,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );
                fingerprint = applyOffsetToFingerprint(
                    fingerprint,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );

                fingerprintResults.push(fingerprint);
                spectralResults.push(spectral);
            } else {
                spectralResults.push(null);
                fingerprintResults.push(null);
            }

            if (params.useLaughterDetection) {
                var laughter = laughterDetector.computeLaughterConfidence(
                    audioData[i].samples,
                    audioData[i].sampleRate,
                    params.frameDurationMs,
                    {
                        minEnergyAboveFloorDb: params.laughterMinEnergyAboveFloorDb,
                        absoluteFloorDb: params.laughterAbsoluteFloorDb,
                        zcrMin: params.laughterZcrMin,
                        zcrMax: params.laughterZcrMax,
                        modulationWindowMs: params.laughterModulationWindowMs,
                        continuityWindowMs: params.laughterContinuityWindowMs,
                        crestMin: params.laughterCrestMin,
                        crestMax: params.laughterCrestMax,
                        spreadMin: params.laughterSpreadMin,
                        spreadMax: params.laughterSpreadMax,
                        sampleSpreadPeakRatio: params.laughterSampleSpreadPeakRatio,
                        impulseCrestMin: params.laughterImpulseCrestMin,
                        impulseCrestMax: params.laughterImpulseCrestMax,
                        transientRiseDb: params.laughterTransientRiseDb,
                        transientFallDb: params.laughterTransientFallDb,
                        energyWeight: params.laughterEnergyWeight,
                        zcrWeight: params.laughterZcrWeight,
                        modulationWeight: params.laughterModulationWeight,
                        crestWeight: params.laughterCrestWeight,
                        spreadWeight: params.laughterSpreadWeight,
                        continuityWeight: params.laughterContinuityWeight,
                        transientPenaltyWeight: params.laughterTransientPenaltyWeight
                    }
                );

                laughter.confidence = applyOffsetToArray(
                    laughter.confidence,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );
                if (laughter.transientPenalty) {
                    laughter.transientPenalty = applyOffsetToArray(
                        laughter.transientPenalty,
                        effectiveOffsetsSec[i],
                        params.frameDurationMs
                    );
                }
                laughterResults.push(laughter);
            } else {
                laughterResults.push(null);
            }
        }
    }

    audioData = null;

    progress(50, 'Detecting voice activity...');

    var vadResults = [];
    var allSegments = [];
    var gateSnapshots = [];
    var speakerProfiles = [];

    for (i = 0; i < trackCount; i++) {
        progress(50 + Math.round((i / trackCount) * 15), 'VAD for track ' + (i + 1) + '/' + trackCount);

        var trackThreshold = params.thresholdAboveFloorDb;
        if (params.perTrackThresholdDb && params.perTrackThresholdDb[i] !== undefined) {
            trackThreshold = params.perTrackThresholdDb[i];
        }
        if (params.enableTrackLoudnessBias && trackInfos[i] && trackInfos[i].gainAdjustDb !== undefined) {
            // Positive gainAdjustDb means the source track is quieter.
            // Lower threshold for quiet tracks, raise slightly for loud tracks.
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
            laughterDebug: laughterDebug,
            laughterContinuityDebug: null,
            laughterBurstDebug: null
        });
    }
    analyzerExtensions.invokeHook(extensions, 'onAfterVad', {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        spectralResults: spectralResults,
        laughterResults: laughterResults,
        rmsProfiles: rmsProfiles,
        trackInfos: trackInfos,
        params: params
    });

    // --- Cross-track bleed suppression pass ---
    // Suppress only when another active track is clearly louder.
    // If spectral evidence suggests different speakers, keep both tracks.
    var bleedEnabled = (params.enableBleedHandling !== undefined) ? !!params.enableBleedHandling : true;
    var bleedDb = (params.bleedSuppressionDb !== undefined) ? params.bleedSuppressionDb : 0;
    if (bleedEnabled && bleedDb > 0 && trackCount > 1) {
        progress(53, 'Suppressing mic bleed...');
        var bleedLinearRatio = Math.pow(10, bleedDb / 20);

        // Common frame count across all tracks.
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
        var alwaysOpenStats = enforceAtLeastOneOpenTrack(vadResults, rmsProfiles, {
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

    // Build segments from refined gates
    for (i = 0; i < trackCount; i++) {
        var segments = segmentBuilder.buildSegments(vadResults[i].gateOpen, i, {
            minSegmentMs: params.minSegmentMs,
            minGapMs: params.minGapMs,
            frameDurationMs: params.frameDurationMs
        });
        allSegments.push(segments);

        trackInfos[i].noiseFloorDb = Math.round(vadResults[i].noiseFloorDb * 10) / 10;
        trackInfos[i].thresholdDb = Math.round(vadResults[i].thresholdDb * 10) / 10;
    }

    var rawSegments = allSegments;
    allSegments = applySegmentPadding(
        rawSegments,
        totalDurationSec,
        params.snippetPadBeforeMs,
        params.snippetPadAfterMs,
        {
            independentTrackAnalysis: params.independentTrackAnalysis,
            crossTrackTailTrimInIndependentMode: params.crossTrackTailTrimInIndependentMode,
            overlapTailAllowanceMs: params.overlapTailAllowanceMs,
            crossTrackHeadTrimInIndependentMode: params.crossTrackHeadTrimInIndependentMode,
            handoffHeadLeadMs: params.handoffHeadLeadMs,
            handoffHeadWindowMs: params.handoffHeadWindowMs,
            referenceSegments: rawSegments
        }
    );

    analyzerExtensions.invokeHook(extensions, 'onAfterSegments', {
        segments: allSegments,
        trackInfos: trackInfos,
        params: params
    });

    progress(70, 'Resolving overlaps...');

    var resolvedSegments;
    if (params.independentTrackAnalysis) {
        resolvedSegments = markAllSegmentsActive(allSegments);
    } else {
        var overlapPolicy = params.overlapPolicy;
        if (!bleedEnabled && (overlapPolicy === 'bleed_safe' || overlapPolicy === 'spectral_bleed_safe')) {
            overlapPolicy = 'dominant_wins';
        }

        resolvedSegments = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
            policy: overlapPolicy,
            frameDurationMs: params.frameDurationMs,
            overlapMarginDb: params.overlapMarginDb,
            bleedMarginDb: params.bleedMarginDb,
            fingerprints: fingerprintResults.length > 0 ? fingerprintResults : null,
            bleedSimilarityThreshold: params.bleedSimilarityThreshold,
            overlapSimilarityThreshold: params.overlapSimilarityThreshold,
            suppressionScoreThreshold: params.suppressionScoreThreshold,
            fillGaps: params.fillGaps
        });
    }
    analyzerExtensions.invokeHook(extensions, 'onAfterResolveOverlaps', {
        resolvedSegments: resolvedSegments,
        sourceSegments: allSegments,
        rmsProfiles: rmsProfiles,
        trackInfos: trackInfos,
        params: params
    });
    var overlapResolvedSegments = cloneSegmentsArray(resolvedSegments);

    // --- NEW: Strict post-processing to eliminate tiny segments generated by overlap resolver
    progress(75, 'Enforcing minimum segment duration...');

    var postMinMs = (params.postOverlapMinSegmentMs !== undefined)
        ? params.postOverlapMinSegmentMs
        : Math.max(80, Math.round(params.minSegmentMs * 0.6));
    resolvedSegments = analyzerPostprocess.enforceMinimumSegmentDuration(resolvedSegments, postMinMs / 1000);
    // --- END NEW

    if (params.enableLowSignificancePrune) {
        // Pass 1 (conservative): prune obvious weak artifacts before gap filling.
        resolvedSegments = analyzerPostprocess.pruneLowSignificanceSegments(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxDurationMs: Math.max(400, Math.round(params.lowSignificanceMaxDurationMs * 0.7)),
            minPeakAboveThresholdDb: Math.max(0.5, params.lowSignificanceMinPeakAboveThresholdDb - 1.0),
            minMeanAboveThresholdDb: params.lowSignificanceMinMeanAboveThresholdDb - 0.5,
            protectLaughter: params.protectLaughterInPostprocess,
            laughterResults: laughterResults,
            laughterProtectMinConfidence: params.laughterPostprocessProtectMinConfidence,
            laughterProtectMinCoverage: params.laughterPostprocessProtectMinCoverage
        }, trackInfos, 'pre');
    }

    if (params.enablePreTriggerCleanup) {
        resolvedSegments = analyzerPostprocess.cleanupWeakPreTriggers(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxDurationMs: params.preTriggerMaxDurationMs,
            joinGapMs: params.preTriggerJoinGapMs,
            minPeakDeltaDb: params.preTriggerMinPeakDeltaDb,
            absorbGapMs: params.preTriggerAbsorbGapMs,
            protectLaughter: params.protectLaughterInPostprocess,
            laughterResults: laughterResults,
            laughterProtectMinConfidence: params.laughterPostprocessProtectMinConfidence,
            laughterProtectMinCoverage: params.laughterPostprocessProtectMinCoverage
        }, trackInfos);
    }

    if (params.independentTrackAnalysis && params.enablePrimaryTrackGapFill) {
        resolvedSegments = analyzerPostprocess.applyPrimaryTrackGapFill(resolvedSegments, rmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            maxGapMs: params.primaryTrackGapFillMaxMs,
            quietDb: params.primaryTrackGapFillQuietDb
        });
    }

    if (params.enableSameTrackGapMerge) {
        resolvedSegments = analyzerPostprocess.mergeSameTrackNearbySegments(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxGapMs: params.sameTrackGapMergeMaxMs,
            maxOtherOverlapRatio: params.sameTrackGapMergeMaxOtherOverlapRatio,
            minPeakAboveThresholdDb: params.sameTrackGapMergeMinPeakAboveThresholdDb
        }, trackInfos);
    }

    if (params.enableDominantTrackStickiness) {
        resolvedSegments = analyzerPostprocess.applyDominantTrackStickiness(resolvedSegments, rmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            holdMs: params.dominantTrackHoldMs,
            returnWindowMs: params.dominantTrackReturnWindowMs
        }, trackInfos);
    }

    if (params.independentTrackAnalysis && params.enableCrossTrackHandoverSmoothing) {
        resolvedSegments = analyzerPostprocess.smoothCrossTrackHandovers(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxStartDelayMs: params.handoverMaxStartDelayMs,
            leadMs: params.handoverLeadMs,
            weakOnsetProbeMs: params.handoverWeakOnsetProbeMs,
            maxWeakOverlapLeadMs: params.handoverMaxWeakOverlapLeadMs,
            onsetPeakMinDb: params.handoverOnsetPeakMinDb,
            onsetMeanMinDb: params.handoverOnsetMeanMinDb,
            minSegmentMs: params.handoverMinSegmentMs
        }, trackInfos);
    } else {
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) trackInfos[i].handoverStartDelayedMs = 0;
        }
    }

    if (params.enableLowSignificancePrune) {
        // Pass 2 (strict): clean up weak snippets that still survive after continuity fill.
        resolvedSegments = analyzerPostprocess.pruneLowSignificanceSegments(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxDurationMs: params.lowSignificanceMaxDurationMs,
            minPeakAboveThresholdDb: params.lowSignificanceMinPeakAboveThresholdDb,
            minMeanAboveThresholdDb: params.lowSignificanceMinMeanAboveThresholdDb,
            protectLaughter: params.protectLaughterInPostprocess,
            laughterResults: laughterResults,
            laughterProtectMinConfidence: params.laughterPostprocessProtectMinConfidence,
            laughterProtectMinCoverage: params.laughterPostprocessProtectMinCoverage
        }, trackInfos, 'post');
    }

    if (params.enablePeakAnchorKeep) {
        resolvedSegments = analyzerPostprocess.reinforceHighPeakAnchors(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            minDbAboveThreshold: params.peakAnchorMinDbAboveThreshold,
            prePadMs: params.peakAnchorPrePadMs,
            postPadMs: params.peakAnchorPostPadMs,
            minClusterMs: params.peakAnchorMinClusterMs,
            joinGapMs: params.peakAnchorJoinGapMs
        }, trackInfos, totalDurationSec);
    }

    // Final conservative cleanup: remove only clearly weak, isolated residual snippets.
    // Guardrails:
    // - no global threshold shifts
    // - no dominance/fillGaps side effects (disabled when fillGaps=true)
    // - protect short turn-taking and boundary continuity
    if (params.enableResidualSnippetPrune && !params.fillGaps) {
        resolvedSegments = analyzerPostprocess.pruneResidualSnippets(resolvedSegments, rmsProfiles, rawRmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxDurationMs: params.residualSnippetMaxDurationMs,
            minPeakAboveThresholdDb: params.residualSnippetMinPeakAboveThresholdDb,
            minMeanAboveThresholdDb: params.residualSnippetMinMeanAboveThresholdDb,
            maxPeakDbFs: params.residualSnippetMaxPeakDbFs,
            maxMeanDbFs: params.residualSnippetMaxMeanDbFs,
            protectGapMs: params.residualSnippetProtectGapMs,
            protectOtherOverlapRatio: params.residualSnippetProtectOtherOverlapRatio,
            protectLaughter: params.protectLaughterInPostprocess,
            laughterResults: laughterResults,
            laughterProtectMinConfidence: params.laughterPostprocessProtectMinConfidence,
            laughterProtectMinCoverage: params.laughterPostprocessProtectMinCoverage
        }, trackInfos);
    }

    // Final hard floor in absolute dBFS for active segments.
    // This is intentionally last so earlier context-aware passes can run first.
    if (params.enableFinalPeakGate && !params.fillGaps) {
        resolvedSegments = analyzerPostprocess.filterByAbsolutePeakFloor(resolvedSegments, rawRmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            minPeakDbFs: params.finalMinPeakDbFs,
            protectLaughter: params.protectLaughterInPostprocess,
            laughterResults: laughterResults,
            laughterProtectMinConfidence: params.laughterPostprocessProtectMinConfidence,
            laughterProtectMinCoverage: params.laughterPostprocessProtectMinCoverage
        }, trackInfos);
    }

    // Re-apply handover smoothing after anchor/final cleanup passes because
    // those passes can re-introduce overly early cross-track starts.
    if (params.independentTrackAnalysis && params.enableCrossTrackHandoverSmoothing) {
        resolvedSegments = analyzerPostprocess.smoothCrossTrackHandovers(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxStartDelayMs: params.handoverMaxStartDelayMs,
            leadMs: params.handoverLeadMs,
            weakOnsetProbeMs: params.handoverWeakOnsetProbeMs,
            maxWeakOverlapLeadMs: params.handoverMaxWeakOverlapLeadMs,
            onsetPeakMinDb: params.handoverOnsetPeakMinDb,
            onsetMeanMinDb: params.handoverOnsetMeanMinDb,
            minSegmentMs: params.handoverMinSegmentMs
        }, trackInfos);
    }

    // Final safety net: ensure at least one dominant speaker track remains active
    // even after late postprocess passes potentially created global silent gaps.
    if (params.enforceAlwaysOneTrackOpen) {
        var finalAlwaysOpen = enforceAlwaysOneTrackOnResolvedSegments(resolvedSegments, rmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            dominanceWindowMs: params.alwaysOpenDominanceWindowMs,
            stickinessDb: params.alwaysOpenStickinessDb
        });
        resolvedSegments = finalAlwaysOpen.resolvedSegments;

        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) {
                trackInfos[i].alwaysOpenFilledFramesPost = finalAlwaysOpen.perTrackFilledFrames[i] || 0;
            }
        }
    } else {
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) trackInfos[i].alwaysOpenFilledFramesPost = 0;
        }
    }

    for (i = 0; i < trackCount; i++) {
        var finalStats = computeStatsFromResolvedSegments(resolvedSegments[i], totalDurationSec);
        trackInfos[i].segmentCount = finalStats.segmentCount;
        trackInfos[i].activePercent = finalStats.activePercent;
        trackInfos[i].totalActiveSec = finalStats.totalActiveSec;
    }


    progress(80, 'Building cut output...');

    progress(90, 'Building waveform preview...');
    var waveform = generateWaveformPreview(rawRmsProfiles, totalDurationSec, params);

    progress(95, 'Finalizing...');

    var cutPreview = cutPreviewBuilder.buildCutPreview({
        sourceSegments: allSegments,
        overlapSegments: overlapResolvedSegments,
        finalSegments: resolvedSegments,
        trackInfos: trackInfos,
        totalDurationSec: totalDurationSec,
        frameDurationMs: params.frameDurationMs,
        rmsProfiles: rmsProfiles,
        spectralResults: spectralResults,
        laughterResults: laughterResults,
        gateSnapshots: gateSnapshots,
        params: params
    });

    var result = {
        version: '2.2.0',
        timestamp: new Date().toISOString(),
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        tracks: trackInfos,
        segments: resolvedSegments,
        cutPreview: cutPreview,
        trackStateTimeline: cutPreview && cutPreview.stateTimelineByTrack ? cutPreview.stateTimelineByTrack : [],
        waveform: waveform,
        alignment: alignment,
        gainMatching: gainInfo,
        params: params
    };
    if (params.debugMode) {
        result.debug = buildAnalysisDebug({
            frameDurationMs: params.frameDurationMs,
            debugMaxFrames: params.debugMaxFrames,
            rmsProfiles: rmsProfiles,
            spectralResults: spectralResults,
            laughterResults: laughterResults,
            gateSnapshots: gateSnapshots,
            resolvedSegments: resolvedSegments
        });
    }
    analyzerExtensions.invokeHook(extensions, 'onFinalizeResult', {
        result: result,
        trackInfos: trackInfos,
        params: params
    });
    progress(100, 'Analysis complete.');

    return result;
}

/**
 * Generate downsampled waveform data for visual preview in the Panel UI.
 */
function generateWaveformPreview(rmsProfiles, totalDurationSec, params) {
    var resolution = params.waveformResolution || 500;
    var trackCount = rmsProfiles.length;
    var waveform = [];
    var maxPointCount = 0;

    for (var t = 0; t < trackCount; t++) {
        var rms = rmsProfiles[t];
        var frameCount = rms.length;
        var step = Math.max(1, Math.floor(frameCount / resolution));
        var points = [];

        for (var i = 0; i < frameCount; i += step) {
            var maxRms = 0;
            for (var j = i; j < Math.min(i + step, frameCount); j++) {
                if (rms[j] > maxRms) maxRms = rms[j];
            }
            points.push(Math.round(maxRms * 10000) / 10000);
        }

        waveform.push(points);
        if (points.length > maxPointCount) maxPointCount = points.length;
    }

    return {
        pointsPerTrack: waveform,
        timeStep: maxPointCount > 0 ? (totalDurationSec / maxPointCount) : 0,
        totalDurationSec: totalDurationSec
    };
}

/**
 * Save analysis results to JSON file.
 */
function saveAnalysis(result, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
}

/**
 * Load previously saved analysis results.
 */
function loadAnalysis(filePath) {
    var json = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(json);
}

function applySegmentPadding(allSegments, totalDurationSec, beforeMs, afterMs, options) {
    var pre = Math.max(0, (beforeMs || 0) / 1000);
    var post = Math.max(0, (afterMs || 0) / 1000);
    if (pre === 0 && post === 0) return allSegments;

    options = options || {};
    var referenceSegments = options.referenceSegments || allSegments;
    var crossTrackTailTrim = !!options.independentTrackAnalysis && !!options.crossTrackTailTrimInIndependentMode;
    var crossTrackHeadTrim = !!options.independentTrackAnalysis && !!options.crossTrackHeadTrimInIndependentMode;
    var tailAllowanceSec = Math.max(0, (options.overlapTailAllowanceMs || 0) / 1000);
    var handoffHeadLeadSec = Math.max(0, (options.handoffHeadLeadMs || 0) / 1000);
    var handoffHeadWindowSec = Math.max(0, (options.handoffHeadWindowMs || 0) / 1000);

    var out = [];
    for (var t = 0; t < allSegments.length; t++) {
        var segs = allSegments[t] || [];
        if (segs.length === 0) {
            out.push([]);
            continue;
        }

        var expanded = [];
        for (var i = 0; i < segs.length; i++) {
            var s = segs[i];
            var paddedStart = Math.max(0, s.start - pre);
            var paddedEnd = Math.min(totalDurationSec, s.end + post);

            if (crossTrackHeadTrim && pre > 0) {
                var nearbyOtherEnd = findOtherTrackEndNearStart(
                    referenceSegments,
                    t,
                    s.start,
                    pre,
                    handoffHeadWindowSec
                );

                if (isFinite(nearbyOtherEnd)) {
                    var earliestStart = nearbyOtherEnd - handoffHeadLeadSec;
                    if (earliestStart > paddedStart) {
                        paddedStart = Math.min(s.start, earliestStart);
                    }
                }
            }

            if (crossTrackTailTrim && post > 0) {
                var nextOtherStart = findNextOtherTrackStart(referenceSegments, t, s.end);
                if (isFinite(nextOtherStart) && nextOtherStart <= s.end + post + 0.0001) {
                    var capEnd = Math.max(s.end, nextOtherStart + tailAllowanceSec);
                    if (capEnd < paddedEnd) paddedEnd = capEnd;
                }
            }

            expanded.push({
                start: paddedStart,
                end: paddedEnd,
                trackIndex: s.trackIndex
            });
        }

        expanded.sort(function (a, b) { return a.start - b.start; });
        var merged = [expanded[0]];
        for (i = 1; i < expanded.length; i++) {
            var curr = expanded[i];
            var last = merged[merged.length - 1];
            if (curr.start <= last.end + 0.001) {
                if (curr.end > last.end) last.end = curr.end;
            } else {
                merged.push(curr);
            }
        }

        for (i = 0; i < merged.length; i++) {
            merged[i].durationMs = Math.round((merged[i].end - merged[i].start) * 1000);
        }
        out.push(merged);
    }
    return out;
}

function findNextOtherTrackStart(referenceSegments, trackIndex, afterTimeSec) {
    var next = Infinity;
    for (var t = 0; t < referenceSegments.length; t++) {
        if (t === trackIndex) continue;
        var segs = referenceSegments[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var st = segs[i].start;
            if (st > afterTimeSec + 0.0001 && st < next) {
                next = st;
            }
        }
    }
    return next;
}

function findOtherTrackEndNearStart(referenceSegments, trackIndex, startTimeSec, lookbackSec, lookaheadSec) {
    var best = -Infinity;
    var minTime = startTimeSec - Math.max(0, lookbackSec || 0);
    var maxTime = startTimeSec + Math.max(0, lookaheadSec || 0);

    for (var t = 0; t < referenceSegments.length; t++) {
        if (t === trackIndex) continue;
        var segs = referenceSegments[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg) continue;
            if (seg.end < minTime) continue;
            if (seg.start > maxTime) continue;
            if (seg.end > best) best = seg.end;
        }
    }

    return best;
}

function markAllSegmentsActive(allSegments) {
    var out = [];
    for (var t = 0; t < allSegments.length; t++) {
        var segs = allSegments[t] || [];
        var trackOut = [];
        for (var i = 0; i < segs.length; i++) {
            trackOut.push({
                start: segs[i].start,
                end: segs[i].end,
                trackIndex: segs[i].trackIndex,
                state: 'active'
            });
        }
        out.push(trackOut);
    }
    return out;
}

function cloneSegmentsArray(segmentsByTrack) {
    var out = [];
    if (!segmentsByTrack) return out;

    for (var t = 0; t < segmentsByTrack.length; t++) {
        var segs = segmentsByTrack[t] || [];
        var trackOut = [];

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg) continue;
            trackOut.push({
                start: seg.start,
                end: seg.end,
                trackIndex: seg.trackIndex,
                state: seg.state,
                origin: seg.origin,
                durationMs: seg.durationMs
            });
        }

        out.push(trackOut);
    }
    return out;
}

function computeStatsFromResolvedSegments(trackSegments, totalDurationSec) {
    var active = [];
    for (var i = 0; i < (trackSegments || []).length; i++) {
        if (trackSegments[i].state !== 'suppressed') active.push(trackSegments[i]);
    }
    return segmentBuilder.computeStats(active, totalDurationSec);
}


function clampNumber(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function getTrackOffsetSec(trackOffsets, trackIndex) {
    if (!trackOffsets || trackOffsets[trackIndex] === undefined) return 0;
    var offset = parseFloat(trackOffsets[trackIndex]);
    return isNaN(offset) ? 0 : offset;
}

function applyOffsetToArray(arr, offsetSec, frameDurationMs) {
    if (!arr || arr.length === 0) return arr;
    if (!offsetSec) return arr;

    var frameDurSec = frameDurationMs / 1000;
    var padFrames = Math.round(offsetSec / frameDurSec);
    if (padFrames === 0) return arr;

    var Ctor = arr.constructor || Float64Array;

    if (padFrames > 0) {
        var padded = new Ctor(arr.length + padFrames);
        padded.set(arr, padFrames);
        return padded;
    }

    var trimFrames = Math.abs(padFrames);
    if (trimFrames >= arr.length) {
        return new Ctor(0);
    }

    return arr.slice(trimFrames);
}

function applyOffsetToFingerprint(fp, offsetSec, frameDurationMs) {
    if (!fp || !fp.bands || !fp.numBands) return fp;
    if (!offsetSec) return fp;

    var frameDurSec = frameDurationMs / 1000;
    var padFrames = Math.round(offsetSec / frameDurSec);
    if (padFrames === 0) return fp;

    var numBands = fp.numBands;

    if (padFrames > 0) {
        var outBands = new Float32Array((fp.frameCount + padFrames) * numBands);
        outBands.set(fp.bands, padFrames * numBands);
        return {
            bands: outBands,
            frameCount: fp.frameCount + padFrames,
            numBands: numBands
        };
    }

    var trim = Math.abs(padFrames);
    if (trim >= fp.frameCount) {
        return {
            bands: new Float32Array(0),
            frameCount: 0,
            numBands: numBands
        };
    }

    return {
        bands: fp.bands.slice(trim * numBands),
        frameCount: fp.frameCount - trim,
        numBands: numBands
    };
}

function enforceAtLeastOneOpenTrack(vadResults, rmsProfiles, options) {
    options = options || {};

    var trackCount = vadResults ? vadResults.length : 0;
    if (trackCount === 0) {
        return {
            filledFrames: 0,
            perTrackFilledFrames: []
        };
    }

    var maxFrames = 0;
    for (var t = 0; t < trackCount; t++) {
        var gate = vadResults[t] && vadResults[t].gateOpen ? vadResults[t].gateOpen : null;
        if (gate && gate.length > maxFrames) maxFrames = gate.length;
    }

    var perTrackFilledFrames = new Array(trackCount);
    for (t = 0; t < trackCount; t++) perTrackFilledFrames[t] = 0;
    if (maxFrames === 0) {
        return {
            filledFrames: 0,
            perTrackFilledFrames: perTrackFilledFrames
        };
    }

    var frameDurationMs = options.frameDurationMs || 10;
    var dominanceWindowMs = Math.max(frameDurationMs, options.dominanceWindowMs || 2500);
    var windowFrames = Math.max(1, Math.round(dominanceWindowMs / frameDurationMs));
    var decay = Math.exp(-1 / windowFrames);
    var stickinessLinear = rmsCalc.dbToLinear(options.stickinessDb !== undefined ? options.stickinessDb : 2.5);

    var dominanceScore = new Float64Array(trackCount);
    var lastChosenTrack = -1;
    var filledFrames = 0;

    for (var f = 0; f < maxFrames; f++) {
        var activeCount = 0;
        for (t = 0; t < trackCount; t++) {
            dominanceScore[t] *= decay;
            gate = vadResults[t].gateOpen;
            if (f < gate.length && gate[f]) {
                activeCount++;
                dominanceScore[t] += 1;
            }
        }

        if (activeCount > 0) continue;

        var bestTrack = -1;
        var bestScore = -1;
        var bestRms = -1;
        var lastTrackRms = -1;

        for (t = 0; t < trackCount; t++) {
            gate = vadResults[t].gateOpen;
            if (f >= gate.length) continue;

            var frameRms = getFrameValue(rmsProfiles[t], f, 0);
            var score = dominanceScore[t];
            if (score > bestScore || (score === bestScore && frameRms > bestRms)) {
                bestScore = score;
                bestRms = frameRms;
                bestTrack = t;
            }

            if (t === lastChosenTrack) {
                lastTrackRms = frameRms;
            }
        }

        if (bestTrack === -1) continue;

        var chosenTrack = bestTrack;
        if (lastChosenTrack !== -1 &&
            f < vadResults[lastChosenTrack].gateOpen.length &&
            lastTrackRms > 0 &&
            bestRms > 0 &&
            lastTrackRms * stickinessLinear >= bestRms) {
            chosenTrack = lastChosenTrack;
        }

        vadResults[chosenTrack].gateOpen[f] = 1;
        dominanceScore[chosenTrack] += 1;
        perTrackFilledFrames[chosenTrack]++;
        filledFrames++;
        lastChosenTrack = chosenTrack;
    }

    return {
        filledFrames: filledFrames,
        perTrackFilledFrames: perTrackFilledFrames
    };
}

function enforceAlwaysOneTrackOnResolvedSegments(resolvedSegments, rmsProfiles, options) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var trackCount = resolvedSegments ? resolvedSegments.length : 0;
    var maxFrames = 0;

    for (var t = 0; t < rmsProfiles.length; t++) {
        if (rmsProfiles[t] && rmsProfiles[t].length > maxFrames) maxFrames = rmsProfiles[t].length;
    }

    if (trackCount === 0 || maxFrames === 0) {
        return {
            resolvedSegments: resolvedSegments || [],
            filledFrames: 0,
            perTrackFilledFrames: []
        };
    }

    var originalGates = [];
    var filledWrappers = [];
    for (t = 0; t < trackCount; t++) {
        var gate = new Uint8Array(maxFrames);
        var segs = resolvedSegments[t] || [];

        for (var s = 0; s < segs.length; s++) {
            var seg = segs[s];
            if (!seg || seg.state === 'suppressed') continue;
            var stFrame = Math.max(0, Math.floor(seg.start / frameDurSec));
            var enFrame = Math.min(maxFrames, Math.ceil(seg.end / frameDurSec));
            for (var f = stFrame; f < enFrame; f++) gate[f] = 1;
        }

        originalGates.push(gate);

        var filledGate = new Uint8Array(maxFrames);
        filledGate.set(gate);
        filledWrappers.push({ gateOpen: filledGate });
    }

    var fillStats = enforceAtLeastOneOpenTrack(filledWrappers, rmsProfiles, {
        frameDurationMs: frameDurationMs,
        dominanceWindowMs: options.dominanceWindowMs,
        stickinessDb: options.stickinessDb
    });

    var out = [];
    for (t = 0; t < trackCount; t++) {
        out.push(buildSegmentsFromGateDiff(
            filledWrappers[t].gateOpen,
            originalGates[t],
            t,
            frameDurationMs
        ));
    }

    return {
        resolvedSegments: out,
        filledFrames: fillStats.filledFrames,
        perTrackFilledFrames: fillStats.perTrackFilledFrames
    };
}

function buildSegmentsFromGateDiff(filledGate, originalGate, trackIndex, frameDurationMs) {
    var out = [];
    if (!filledGate || filledGate.length === 0) return out;

    var frameDurSec = (frameDurationMs || 10) / 1000;
    var inSeg = false;
    var segStart = 0;
    var segOrigin = 'analysis_active';

    function pushSeg(endFrame) {
        if (!inSeg) return;
        var startSec = segStart * frameDurSec;
        var endSec = endFrame * frameDurSec;
        if (endSec <= startSec + 1e-6) {
            inSeg = false;
            return;
        }
        out.push({
            start: startSec,
            end: endSec,
            trackIndex: trackIndex,
            state: 'active',
            origin: segOrigin,
            durationMs: Math.round((endSec - startSec) * 1000)
        });
        inSeg = false;
    }

    for (var f = 0; f <= filledGate.length; f++) {
        var active = (f < filledGate.length) ? (filledGate[f] > 0) : false;
        var origin = 'analysis_active';
        if (active) {
            var wasOriginal = originalGate && f < originalGate.length && originalGate[f] > 0;
            origin = wasOriginal ? 'analysis_active' : 'always_open_fill';
        }

        if (!inSeg) {
            if (active) {
                inSeg = true;
                segStart = f;
                segOrigin = origin;
            }
            continue;
        }

        if (!active) {
            pushSeg(f);
            continue;
        }

        if (origin !== segOrigin) {
            pushSeg(f);
            inSeg = true;
            segStart = f;
            segOrigin = origin;
        }
    }

    return out;
}

function cloneUint8Array(arr) {
    var out = new Uint8Array(arr.length);
    out.set(arr);
    return out;
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
    if (!arr || frameIndex < 0 || frameIndex >= arr.length) return fallback;
    return arr[frameIndex];
}

function buildAnalysisDebug(ctx) {
    var frameDurationMs = ctx.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxFrames = ctx.debugMaxFrames || 5000;

    var tracks = [];

    for (var t = 0; t < ctx.rmsProfiles.length; t++) {
        var snapshot = ctx.gateSnapshots[t] || {};
        var gateAfterVad = snapshot.afterVad || new Uint8Array(0);
        var gateAfterSpectral = snapshot.afterSpectral || new Uint8Array(0);
        var gateAfterSpeakerLock = snapshot.afterSpeakerLock || new Uint8Array(0);
        var gateAfterLaughter = snapshot.afterLaughter || gateAfterSpeakerLock;
        var gateAfterBleed = snapshot.afterBleed || new Uint8Array(0);
        var vadDebug = snapshot.vadDebug || null;
        var spectralDebug = snapshot.spectralDebug || null;

        var frameCount = Math.max(
            ctx.rmsProfiles[t] ? ctx.rmsProfiles[t].length : 0,
            gateAfterBleed.length,
            gateAfterLaughter.length,
            gateAfterSpeakerLock.length,
            gateAfterSpectral.length,
            gateAfterVad.length
        );

        var step = Math.max(1, Math.ceil(frameCount / maxFrames));
        var overlapMap = buildOverlapFrameMap(ctx.resolvedSegments[t] || [], frameCount, frameDurSec);

        var suppressionCounts = {
            active: 0,
            below_threshold: 0,
            spectral_reject: 0,
            speaker_mismatch: 0,
            bleed_suppressed: 0,
            overlap_rejected: 0
        };

        var frames = [];

        for (var f = 0; f < frameCount; f += step) {
            var rmsLin = getFrameValue(ctx.rmsProfiles[t], f, 0);
            var thresholdLin = vadDebug && vadDebug.openThresholdLinearByFrame
                ? getFrameValue(vadDebug.openThresholdLinearByFrame, f, 0)
                : 0;
            var floorLin = vadDebug && vadDebug.noiseFloorLinearByFrame
                ? getFrameValue(vadDebug.noiseFloorLinearByFrame, f, 0)
                : 0;
            var spectralConfidence = ctx.spectralResults[t]
                ? getFrameValue(ctx.spectralResults[t].confidence, f, 0)
                : null;
            var laughterConfidence = ctx.laughterResults && ctx.laughterResults[t]
                ? getFrameValue(ctx.laughterResults[t].confidence, f, 0)
                : null;
            var speechScore = spectralDebug && spectralDebug.score
                ? getFrameValue(spectralDebug.score, f, 0)
                : (getFrameValue(gateAfterBleed, f, 0) ? 1 : 0);

            var gateState = getFrameValue(gateAfterBleed, f, 0) ? 1 : 0;
            var reason = 'active';

            if (getFrameValue(overlapMap, f, 0) === 2) {
                reason = 'overlap_rejected';
            } else if (!gateState) {
                var wasVadActive = getFrameValue(gateAfterVad, f, 0) ? 1 : 0;
                var wasSpectralActive = getFrameValue(gateAfterSpectral, f, 0) ? 1 : 0;
                var wasSpeakerActive = getFrameValue(gateAfterSpeakerLock, f, 0) ? 1 : 0;
                var wasLaughterActive = getFrameValue(gateAfterLaughter, f, 0) ? 1 : 0;

                if (wasLaughterActive) {
                    reason = 'bleed_suppressed';
                } else {
                    if (wasSpectralActive) {
                        if (!wasSpeakerActive) {
                            reason = 'speaker_mismatch';
                        } else {
                            reason = 'bleed_suppressed';
                        }
                    } else if (wasVadActive && !wasSpectralActive) {
                        reason = 'spectral_reject';
                    } else {
                        reason = 'below_threshold';
                    }
                }
            }

            suppressionCounts[reason] = (suppressionCounts[reason] || 0) + 1;

            frames.push({
                frame: f,
                timeSec: roundNumber(f * frameDurSec, 3),
                rmsDb: roundNumber(toDbSafe(rmsLin), 2),
                noiseFloorDb: roundNumber(toDbSafe(floorLin), 2),
                thresholdDb: roundNumber(toDbSafe(thresholdLin), 2),
                spectralConfidence: spectralConfidence === null ? null : roundNumber(spectralConfidence, 3),
                laughterConfidence: laughterConfidence === null ? null : roundNumber(laughterConfidence, 3),
                speechScore: roundNumber(speechScore, 3),
                gateState: gateState,
                reason: reason
            });
        }

        tracks.push({
            trackIndex: t,
            frameCount: frameCount,
            sampledEveryFrames: step,
            suppressionCounts: suppressionCounts,
            frames: frames
        });
    }

    return {
        frameDurationMs: frameDurationMs,
        trackCount: tracks.length,
        tracks: tracks
    };
}

function buildOverlapFrameMap(trackSegments, frameCount, frameDurSec) {
    var map = new Uint8Array(frameCount);

    for (var i = 0; i < trackSegments.length; i++) {
        var seg = trackSegments[i];
        var val = seg.state === 'suppressed' ? 2 : 1;

        var startFrame = Math.max(0, Math.floor(seg.start / frameDurSec));
        var endFrame = Math.min(frameCount, Math.ceil(seg.end / frameDurSec));

        for (var f = startFrame; f < endFrame; f++) {
            map[f] = val;
        }
    }

    return map;
}

function toDbSafe(linear) {
    if (!linear || linear <= 0) return -Infinity;
    return rmsCalc.linearToDb(linear);
}

function roundNumber(v, digits) {
    if (!isFinite(v)) return v;
    var factor = Math.pow(10, digits || 0);
    return Math.round(v * factor) / factor;
}

// =====================
// CLI Mode
// =====================
if (require.main === module) {
    var args = process.argv.slice(2);

    if (args.length === 0 || args.indexOf('--help') !== -1) {
        console.log('AutoCast Analyzer v2.2 CLI');
        console.log('Usage: node analyzer.js --tracks file1.wav file2.wav [--output result.json] [--params params.json]');
        console.log('');
        console.log('Options:');
        console.log('  --tracks    WAV files to analyze (one per speaker)');
        console.log('  --output    Output JSON file (default: stdout)');
        console.log('  --params    JSON file with parameter overrides');
        console.log('  --no-fft    Disable spectral VAD (faster, less accurate)');
        console.log('  --no-gain   Disable auto-gain matching');
        console.log('  --debug     Include diagnostic payload in output');
        console.log('  --help      Show this help');
        process.exit(0);
    }

    var tracks = [];
    var outputPath = null;
    var paramsPath = null;
    var mode = null;
    var cliOverrides = {};

    for (var i = 0; i < args.length; i++) {
        if (args[i] === '--tracks') {
            mode = 'tracks';
        } else if (args[i] === '--output') {
            mode = 'output';
        } else if (args[i] === '--params') {
            mode = 'params';
        } else if (args[i] === '--no-fft') {
            cliOverrides.useSpectralVAD = false;
            mode = null;
        } else if (args[i] === '--no-gain') {
            cliOverrides.autoGain = false;
            mode = null;
        } else if (args[i] === '--debug') {
            cliOverrides.debugMode = true;
            mode = null;
        } else if (mode === 'tracks') {
            tracks.push(args[i]);
        } else if (mode === 'output') {
            outputPath = args[i];
            mode = null;
        } else if (mode === 'params') {
            paramsPath = args[i];
            mode = null;
        }
    }

    if (tracks.length === 0) {
        console.error('Error: No track files specified. Use --tracks file1.wav file2.wav');
        process.exit(1);
    }

    var cliParams = {};
    if (paramsPath) {
        try {
            cliParams = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
        } catch (e) {
            console.error('Error reading params file:', e.message);
            process.exit(1);
        }
    }

    for (var key in cliOverrides) {
        cliParams[key] = cliOverrides[key];
    }

    console.error('AutoCast Analyzer v2.2 - analyzing ' + tracks.length + ' track(s)...');

    try {
        var result = analyze(tracks, cliParams, function (pct, msg) {
            process.stderr.write('\r[' + pct + '%] ' + msg + '                    ');
        });

        process.stderr.write('\n');

        var jsonOutput = JSON.stringify(result, null, 2);

        if (outputPath) {
            fs.writeFileSync(outputPath, jsonOutput, 'utf8');
            console.error('Result written to: ' + outputPath);
        } else {
            console.log(jsonOutput);
        }

        console.error('\n=== Summary ===');
        for (var t = 0; t < result.tracks.length; t++) {
            var ti = result.tracks[t];
            var gainStr = ti.gainAdjustDb ? ' (gain: ' + (ti.gainAdjustDb > 0 ? '+' : '') + ti.gainAdjustDb + 'dB)' : '';
            console.error(
                'Track ' + (t + 1) + ' (' + ti.name + '): ' +
                ti.segmentCount + ' segments, ' +
                ti.activePercent + '% active, ' +
                'floor: ' + ti.noiseFloorDb + ' dBFS' + gainStr
            );
        }
        if (result.alignment.warning) {
            console.error('Warning: ' + result.alignment.warning);
        }
    } catch (e) {
        console.error('Analysis failed:', e.message);
        if (e.stack) console.error(e.stack);
        process.exit(1);
    }
}

module.exports = {
    analyze: analyze,
    saveAnalysis: saveAnalysis,
    loadAnalysis: loadAnalysis,
    ANALYSIS_DEFAULTS: ANALYSIS_DEFAULTS
};











