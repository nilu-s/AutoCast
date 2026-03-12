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
var analyzerDefaults = require('./analyzer_defaults');
var analyzerExtensions = require('./analyzer_extensions');
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
    params = enforceSingleModeParams(params);
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
    if (params.useSpectralVAD) {
        progress(35, 'Running spectral analysis...');
        for (i = 0; i < trackCount; i++) {
            progress(35 + Math.round((i / trackCount) * 10), 'FFT for track ' + (i + 1) + '/' + trackCount);
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

        vadResults.push(vadResult);
        gateSnapshots.push({
            afterVad: gateAfterVad,
            afterSpectral: gateAfterSpectral,
            afterSpeakerLock: gateAfterSpeakerLock,
            afterBleed: null,
            bleedSuppressor: null,
            vadDebug: vadResult.debug || null,
            spectralDebug: spectralDebug,
            speakerDebug: speakerDebug
        });
    }
    analyzerExtensions.invokeHook(extensions, 'onAfterVad', {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        spectralResults: spectralResults,
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

    // --- NEW: Strict post-processing to eliminate tiny segments generated by overlap resolver
    progress(75, 'Enforcing minimum segment duration...');
    function enforceMinimumSegmentDuration(segmentsArray, minSec) {
        var out = [];
        for (var i = 0; i < segmentsArray.length; i++) {
            var trackSegs = JSON.parse(JSON.stringify(segmentsArray[i]));
            if (!trackSegs || trackSegs.length === 0) {
                out.push([]);
                continue;
            }

            var changed = true;
            // Prevent infinite loop by capping passes. Usually resolves in 1-2 passes.
            var maxPasses = 10; 
            while(changed && trackSegs.length > 1 && maxPasses > 0) {
                changed = false;
                maxPasses--;
                for (var j = 0; j < trackSegs.length; j++) {
                    var dur = trackSegs[j].end - trackSegs[j].start;
                    if (dur < minSec) {
                        var prev = j > 0 ? trackSegs[j-1] : null;
                        var next = j < trackSegs.length - 1 ? trackSegs[j+1] : null;

                        if (!prev && !next) continue;

                        var target = prev;
                        if (prev && next) {
                             var prevDur = prev.end - prev.start;
                             var nextDur = next.end - next.start;
                             target = prevDur > nextDur ? prev : next;
                        } else if (next) {
                             target = next;
                        }

                        if (trackSegs[j].state !== target.state) {
                            trackSegs[j].state = target.state; 
                            changed = true;
                        }
                    }
                }
                
                var merged = [];
                if (trackSegs.length > 0) {
                    merged.push(trackSegs[0]);
                    for (var k = 1; k < trackSegs.length; k++) {
                        var last = merged[merged.length - 1];
                        var curr = trackSegs[k];
                        if (last.state === curr.state && Math.abs(last.end - curr.start) < 0.005) {
                            last.end = curr.end;
                            if (last.durationMs !== undefined) last.durationMs = Math.round((last.end - last.start) * 1000);
                        } else {
                            merged.push(curr);
                        }
                    }
                }
                trackSegs = merged;
            }
            out.push(trackSegs);
        }
        return out;
    }

    var postMinMs = (params.postOverlapMinSegmentMs !== undefined)
        ? params.postOverlapMinSegmentMs
        : Math.max(80, Math.round(params.minSegmentMs * 0.6));
    resolvedSegments = enforceMinimumSegmentDuration(resolvedSegments, postMinMs / 1000);
    // --- END NEW

    if (params.enableLowSignificancePrune) {
        // Pass 1 (conservative): prune obvious weak artifacts before gap filling.
        resolvedSegments = pruneLowSignificanceSegments(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxDurationMs: Math.max(400, Math.round(params.lowSignificanceMaxDurationMs * 0.7)),
            minPeakAboveThresholdDb: Math.max(0.5, params.lowSignificanceMinPeakAboveThresholdDb - 1.0),
            minMeanAboveThresholdDb: params.lowSignificanceMinMeanAboveThresholdDb - 0.5
        }, trackInfos, 'pre');
    }

    if (params.enablePreTriggerCleanup) {
        resolvedSegments = cleanupWeakPreTriggers(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxDurationMs: params.preTriggerMaxDurationMs,
            joinGapMs: params.preTriggerJoinGapMs,
            minPeakDeltaDb: params.preTriggerMinPeakDeltaDb,
            absorbGapMs: params.preTriggerAbsorbGapMs
        }, trackInfos);
    }

    if (params.independentTrackAnalysis && params.enablePrimaryTrackGapFill) {
        resolvedSegments = applyPrimaryTrackGapFill(resolvedSegments, rmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            maxGapMs: params.primaryTrackGapFillMaxMs,
            quietDb: params.primaryTrackGapFillQuietDb
        });
    }

    if (params.enableSameTrackGapMerge) {
        resolvedSegments = mergeSameTrackNearbySegments(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxGapMs: params.sameTrackGapMergeMaxMs,
            maxOtherOverlapRatio: params.sameTrackGapMergeMaxOtherOverlapRatio,
            minPeakAboveThresholdDb: params.sameTrackGapMergeMinPeakAboveThresholdDb
        }, trackInfos);
    }

    if (params.enableDominantTrackStickiness) {
        resolvedSegments = applyDominantTrackStickiness(resolvedSegments, rmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            holdMs: params.dominantTrackHoldMs,
            returnWindowMs: params.dominantTrackReturnWindowMs
        }, trackInfos);
    }

    if (params.enableLowSignificancePrune) {
        // Pass 2 (strict): clean up weak snippets that still survive after continuity fill.
        resolvedSegments = pruneLowSignificanceSegments(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            maxDurationMs: params.lowSignificanceMaxDurationMs,
            minPeakAboveThresholdDb: params.lowSignificanceMinPeakAboveThresholdDb,
            minMeanAboveThresholdDb: params.lowSignificanceMinMeanAboveThresholdDb
        }, trackInfos, 'post');
    }

    if (params.enablePeakAnchorKeep) {
        resolvedSegments = reinforceHighPeakAnchors(resolvedSegments, rmsProfiles, vadResults, {
            frameDurationMs: params.frameDurationMs,
            minDbAboveThreshold: params.peakAnchorMinDbAboveThreshold,
            prePadMs: params.peakAnchorPrePadMs,
            postPadMs: params.peakAnchorPostPadMs,
            minClusterMs: params.peakAnchorMinClusterMs,
            joinGapMs: params.peakAnchorJoinGapMs
        }, trackInfos, totalDurationSec);
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

    var result = {
        version: '2.2.0',
        timestamp: new Date().toISOString(),
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        tracks: trackInfos,
        segments: resolvedSegments,
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
    }

    return {
        pointsPerTrack: waveform,
        timeStep: totalDurationSec / (waveform[0] ? waveform[0].length : 1),
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

function enforceSingleModeParams(params) {
    if (!params) params = {};

    // Single production mode: Smooth Blocks.
    params.independentTrackAnalysis = true;
    params.snippetPadBeforeMs = 1200;
    params.snippetPadAfterMs = 1200;
    params.enablePrimaryTrackGapFill = true;
    params.primaryTrackGapFillMaxMs = 1800;
    params.crossTrackTailTrimInIndependentMode = true;
    params.closeConfirmMs = 1000;
    params.closeConfirmDynamic = true;
    params.enablePreTriggerCleanup = true;
    params.enableSameTrackGapMerge = true;
    params.enableDominantTrackStickiness = true;
    params.enableLowSignificancePrune = true;
    params.enablePeakAnchorKeep = true;
    params.overlapPolicy = 'dominant_wins';
    params.fillGaps = false;

    return params;
}

function applySegmentPadding(allSegments, totalDurationSec, beforeMs, afterMs, options) {
    var pre = Math.max(0, (beforeMs || 0) / 1000);
    var post = Math.max(0, (afterMs || 0) / 1000);
    if (pre === 0 && post === 0) return allSegments;

    options = options || {};
    var referenceSegments = options.referenceSegments || allSegments;
    var crossTrackTailTrim = !!options.independentTrackAnalysis && !!options.crossTrackTailTrimInIndependentMode;
    var tailAllowanceSec = Math.max(0, (options.overlapTailAllowanceMs || 0) / 1000);

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

function computeStatsFromResolvedSegments(trackSegments, totalDurationSec) {
    var active = [];
    for (var i = 0; i < (trackSegments || []).length; i++) {
        if (trackSegments[i].state !== 'suppressed') active.push(trackSegments[i]);
    }
    return segmentBuilder.computeStats(active, totalDurationSec);
}

function applyPrimaryTrackGapFill(resolvedSegments, rmsProfiles, options) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxGapFrames = Math.max(1, Math.round((options.maxGapMs || 900) / frameDurationMs));
    var quietLinear = rmsCalc.dbToLinear(options.quietDb !== undefined ? options.quietDb : -50);

    var trackCount = resolvedSegments.length;
    var frameCount = 0;
    for (var t = 0; t < rmsProfiles.length; t++) {
        if (rmsProfiles[t] && rmsProfiles[t].length > frameCount) frameCount = rmsProfiles[t].length;
    }
    if (frameCount === 0 || trackCount === 0) return resolvedSegments;

    var gates = [];
    for (t = 0; t < trackCount; t++) {
        gates[t] = new Uint8Array(frameCount);
        var segs = resolvedSegments[t] || [];
        for (var s = 0; s < segs.length; s++) {
            if (segs[s].state === 'suppressed') continue;
            var startFrame = Math.max(0, Math.floor(segs[s].start / frameDurSec));
            var endFrame = Math.min(frameCount, Math.ceil(segs[s].end / frameDurSec));
            for (var f = startFrame; f < endFrame; f++) gates[t][f] = 1;
        }
    }

    function anyActiveAt(frameIndex) {
        for (var tr = 0; tr < trackCount; tr++) {
            if (gates[tr][frameIndex]) return true;
        }
        return false;
    }

    function dominantActiveTrackAt(frameIndex) {
        var best = -1;
        var bestRms = -1;
        for (var tr = 0; tr < trackCount; tr++) {
            if (!gates[tr][frameIndex]) continue;
            var val = getFrameValue(rmsProfiles[tr], frameIndex, 0);
            if (val > bestRms) {
                bestRms = val;
                best = tr;
            }
        }
        return best;
    }

    var idx = 0;
    while (idx < frameCount) {
        if (anyActiveAt(idx)) {
            idx++;
            continue;
        }

        var gapStart = idx;
        while (idx < frameCount && !anyActiveAt(idx)) idx++;
        var gapEnd = idx; // exclusive
        var gapLen = gapEnd - gapStart;
        if (gapLen <= 0 || gapLen > maxGapFrames) continue;

        var leftFrame = gapStart - 1;
        if (leftFrame < 0) continue;

        var primaryTrack = dominantActiveTrackAt(leftFrame);
        if (primaryTrack < 0) continue;

        // If there is activity right after the gap, require the same dominant track.
        if (gapEnd < frameCount && anyActiveAt(gapEnd)) {
            var rightDominant = dominantActiveTrackAt(gapEnd);
            if (rightDominant >= 0 && rightDominant !== primaryTrack) continue;
        }

        var safeToFill = true;
        for (var gf = gapStart; gf < gapEnd && safeToFill; gf++) {
            for (var tr = 0; tr < trackCount; tr++) {
                if (tr === primaryTrack) continue;
                if (getFrameValue(rmsProfiles[tr], gf, 0) > quietLinear) {
                    safeToFill = false;
                    break;
                }
            }
        }

        if (!safeToFill) continue;
        for (gf = gapStart; gf < gapEnd; gf++) gates[primaryTrack][gf] = 1;
    }

    var out = [];
    for (t = 0; t < trackCount; t++) {
        var segOut = segmentBuilder.buildSegments(gates[t], t, {
            minSegmentMs: 0,
            minGapMs: 0,
            frameDurationMs: frameDurationMs
        });
        for (s = 0; s < segOut.length; s++) segOut[s].state = 'active';
        out.push(segOut);
    }
    return out;
}

function cleanupWeakPreTriggers(resolvedSegments, rmsProfiles, vadResults, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxDurationSec = Math.max(0, (options.maxDurationMs || 900) / 1000);
    var joinGapSec = Math.max(0, (options.joinGapMs || 1200) / 1000);
    var minPeakDeltaDb = (options.minPeakDeltaDb !== undefined) ? options.minPeakDeltaDb : 4.0;
    var absorbGapSec = Math.max(0, (options.absorbGapMs || 380) / 1000);

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var trackOut = [];
        var dropped = 0;
        var absorbed = 0;

        for (var i = 0; i < segs.length; i++) {
            var cur = segs[i];
            if (!cur || cur.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var nextIndex = i + 1;
            while (nextIndex < segs.length && segs[nextIndex] && segs[nextIndex].state === 'suppressed') nextIndex++;
            if (nextIndex >= segs.length) {
                trackOut.push(cur);
                continue;
            }

            var next = segs[nextIndex];
            if (!next || next.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var curDur = Math.max(0, cur.end - cur.start);
            var gap = Math.max(0, next.start - cur.end);
            if (curDur > maxDurationSec || gap > joinGapSec) {
                trackOut.push(cur);
                continue;
            }

            var curStats = computeSegmentRmsStats(cur, rms, frameDurSec);
            var nextStats = computeSegmentRmsStats(next, rms, frameDurSec);
            if (!curStats || !nextStats) {
                trackOut.push(cur);
                continue;
            }

            var curPeakAbove = curStats.peakDb - thresholdDb;
            var nextPeakAbove = nextStats.peakDb - thresholdDb;
            var peakDelta = nextPeakAbove - curPeakAbove;

            if (peakDelta >= minPeakDeltaDb) {
                if (gap <= absorbGapSec) {
                    var merged = cloneSegment(cur);
                    merged.end = next.end;
                    merged.durationMs = Math.round((merged.end - merged.start) * 1000);
                    trackOut.push(merged);
                    absorbed++;
                    i = nextIndex; // consume next
                } else {
                    dropped++;
                }
                continue;
            }

            trackOut.push(cur);
        }

        if (trackInfos && trackInfos[t]) {
            trackInfos[t].preTriggerDropped = dropped;
            trackInfos[t].preTriggerAbsorbed = absorbed;
        }
        out.push(trackOut);
    }

    return out;
}

function mergeSameTrackNearbySegments(resolvedSegments, rmsProfiles, vadResults, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxGapSec = Math.max(0, (options.maxGapMs || 1400) / 1000);
    var maxOtherOverlapRatio = clampNumber(
        (options.maxOtherOverlapRatio !== undefined) ? options.maxOtherOverlapRatio : 0.20,
        0,
        1
    );
    var minPeakAboveThresholdDb = (options.minPeakAboveThresholdDb !== undefined) ? options.minPeakAboveThresholdDb : 3.0;

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var trackOut = [];
        var mergedCount = 0;

        for (var i = 0; i < segs.length; i++) {
            var cur = segs[i];
            if (!cur || cur.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var nextIndex = i + 1;
            while (nextIndex < segs.length && segs[nextIndex] && segs[nextIndex].state === 'suppressed') nextIndex++;
            if (nextIndex >= segs.length) {
                trackOut.push(cur);
                continue;
            }

            var next = segs[nextIndex];
            if (!next || next.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var gapStart = cur.end;
            var gapEnd = next.start;
            var gapSec = Math.max(0, gapEnd - gapStart);
            if (gapSec <= 0 || gapSec > maxGapSec) {
                trackOut.push(cur);
                continue;
            }

            var otherOverlapRatio = computeOtherTrackOverlapRatio(resolvedSegments, t, gapStart, gapEnd);
            if (otherOverlapRatio > maxOtherOverlapRatio) {
                trackOut.push(cur);
                continue;
            }

            var curStats = computeSegmentRmsStats(cur, rms, frameDurSec);
            var nextStats = computeSegmentRmsStats(next, rms, frameDurSec);
            if (!curStats || !nextStats) {
                trackOut.push(cur);
                continue;
            }

            var curPeakAbove = curStats.peakDb - thresholdDb;
            var nextPeakAbove = nextStats.peakDb - thresholdDb;
            if (Math.max(curPeakAbove, nextPeakAbove) < minPeakAboveThresholdDb) {
                trackOut.push(cur);
                continue;
            }

            var merged = cloneSegment(cur);
            merged.end = next.end;
            merged.durationMs = Math.round((merged.end - merged.start) * 1000);
            trackOut.push(merged);
            mergedCount++;
            i = nextIndex; // consume next
        }

        if (trackInfos && trackInfos[t]) {
            trackInfos[t].sameTrackGapMerged = mergedCount;
        }
        out.push(trackOut);
    }

    return out;
}

function applyDominantTrackStickiness(resolvedSegments, rmsProfiles, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var holdFrames = Math.max(1, Math.round((options.holdMs || 1400) / frameDurationMs));
    var returnWindowFrames = Math.max(holdFrames, Math.round((options.returnWindowMs || 5000) / frameDurationMs));

    var trackCount = resolvedSegments.length;
    if (trackCount === 0) return resolvedSegments;

    var frameCount = 0;
    for (var t = 0; t < rmsProfiles.length; t++) {
        if (rmsProfiles[t] && rmsProfiles[t].length > frameCount) frameCount = rmsProfiles[t].length;
    }
    if (frameCount === 0) return resolvedSegments;

    var gates = [];
    for (t = 0; t < trackCount; t++) {
        gates[t] = new Uint8Array(frameCount);
        var segs = resolvedSegments[t] || [];
        for (var s = 0; s < segs.length; s++) {
            if (!segs[s] || segs[s].state === 'suppressed') continue;
            var startFrame = Math.max(0, Math.floor(segs[s].start / frameDurSec));
            var endFrame = Math.min(frameCount, Math.ceil(segs[s].end / frameDurSec));
            for (var f = startFrame; f < endFrame; f++) gates[t][f] = 1;
        }
    }

    var dominant = new Int16Array(frameCount);
    for (var f0 = 0; f0 < frameCount; f0++) {
        var bestTrack = -1;
        var bestRms = -1;
        for (t = 0; t < trackCount; t++) {
            if (!gates[t][f0]) continue;
            var val = getFrameValue(rmsProfiles[t], f0, 0);
            if (val > bestRms) {
                bestRms = val;
                bestTrack = t;
            }
        }
        dominant[f0] = bestTrack;
    }

    var addedFramesPerTrack = [];
    for (t = 0; t < trackCount; t++) addedFramesPerTrack[t] = 0;

    var idx = 0;
    while (idx < frameCount) {
        if (dominant[idx] < 0) {
            idx++;
            continue;
        }

        var midTrack = dominant[idx];
        var midStart = idx;
        while (idx < frameCount && dominant[idx] === midTrack) idx++;
        var midEnd = idx;
        var midLen = midEnd - midStart;

        if (midLen > holdFrames) continue;

        var leftTrack = (midStart > 0) ? dominant[midStart - 1] : -1;
        var rightTrack = (midEnd < frameCount) ? dominant[midEnd] : -1;
        if (leftTrack < 0 || rightTrack < 0 || leftTrack !== rightTrack || leftTrack === midTrack) continue;

        var leftRunStart = midStart - 1;
        while (leftRunStart > 0 && dominant[leftRunStart - 1] === leftTrack) leftRunStart--;
        var rightRunEnd = midEnd;
        while (rightRunEnd < frameCount && dominant[rightRunEnd] === rightTrack) rightRunEnd++;

        if ((rightRunEnd - leftRunStart) > returnWindowFrames) continue;

        for (var ff = midStart; ff < midEnd; ff++) {
            if (!gates[leftTrack][ff]) {
                gates[leftTrack][ff] = 1;
                addedFramesPerTrack[leftTrack]++;
            }
        }
    }

    var out = [];
    for (t = 0; t < trackCount; t++) {
        var segOut = segmentBuilder.buildSegments(gates[t], t, {
            minSegmentMs: 0,
            minGapMs: 0,
            frameDurationMs: frameDurationMs
        });
        for (s = 0; s < segOut.length; s++) segOut[s].state = 'active';
        out.push(segOut);

        if (trackInfos && trackInfos[t]) {
            trackInfos[t].dominantHoldAddedSec = Math.round((addedFramesPerTrack[t] * frameDurSec) * 100) / 100;
        }
    }

    return out;
}

function computeOtherTrackOverlapRatio(resolvedSegments, trackIndex, startSec, endSec) {
    var span = Math.max(0, endSec - startSec);
    if (span <= 1e-9) return 0;

    var overlap = 0;
    for (var t = 0; t < resolvedSegments.length; t++) {
        if (t === trackIndex) continue;
        var segs = resolvedSegments[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg || seg.state === 'suppressed') continue;
            var ovStart = Math.max(startSec, seg.start);
            var ovEnd = Math.min(endSec, seg.end);
            if (ovEnd > ovStart) overlap += (ovEnd - ovStart);
        }
    }

    return Math.min(1, overlap / span);
}

function computeSegmentRmsStats(seg, rms, frameDurSec) {
    if (!seg || !rms || rms.length === 0) return null;

    var startFrame = Math.max(0, Math.floor(seg.start / frameDurSec));
    var endFrame = Math.min(rms.length, Math.ceil(seg.end / frameDurSec));
    if (endFrame <= startFrame) return null;

    var peakLin = 0;
    var sumLin = 0;
    var count = 0;
    for (var f = startFrame; f < endFrame; f++) {
        var v = getFrameValue(rms, f, 0);
        if (v > peakLin) peakLin = v;
        sumLin += v;
        count++;
    }
    if (count <= 0) return null;

    var meanLin = sumLin / count;
    return {
        startFrame: startFrame,
        endFrame: endFrame,
        count: count,
        peakLin: peakLin,
        meanLin: meanLin,
        peakDb: rmsCalc.linearToDb(Math.max(peakLin, 1e-12)),
        meanDb: rmsCalc.linearToDb(Math.max(meanLin, 1e-12))
    };
}

function cloneSegment(seg) {
    var out = {
        start: seg.start,
        end: seg.end,
        trackIndex: seg.trackIndex,
        state: seg.state
    };
    if (seg.durationMs !== undefined) out.durationMs = seg.durationMs;
    return out;
}

function clampNumber(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function reinforceHighPeakAnchors(resolvedSegments, rmsProfiles, vadResults, options, trackInfos, totalDurationSec) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var minDbAboveThreshold = (options.minDbAboveThreshold !== undefined) ? options.minDbAboveThreshold : 8.0;
    var prePadSec = Math.max(0, (options.prePadMs || 450) / 1000);
    var postPadSec = Math.max(0, (options.postPadMs || 650) / 1000);
    var minClusterFrames = Math.max(1, Math.round((options.minClusterMs || 60) / frameDurationMs));
    var joinGapFrames = Math.max(0, Math.round((options.joinGapMs || 120) / frameDurationMs));

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;

        var activeBase = [];
        for (var i = 0; i < segs.length; i++) {
            if (!segs[i] || segs[i].state === 'suppressed') continue;
            activeBase.push({
                start: segs[i].start,
                end: segs[i].end,
                trackIndex: t,
                state: 'active'
            });
        }

        var anchors = [];
        var startFrame = -1;
        var lastHotFrame = -1;
        for (var f = 0; f < rms.length; f++) {
            var db = rmsCalc.linearToDb(Math.max(getFrameValue(rms, f, 0), 1e-12));
            var hot = (db - thresholdDb) >= minDbAboveThreshold;

            if (hot) {
                if (startFrame < 0) startFrame = f;
                lastHotFrame = f;
                continue;
            }

            if (startFrame >= 0 && (f - lastHotFrame - 1) <= joinGapFrames) {
                continue;
            }

            if (startFrame >= 0) {
                var endFrame = lastHotFrame + 1;
                if ((endFrame - startFrame) >= minClusterFrames) {
                    var st = Math.max(0, (startFrame * frameDurSec) - prePadSec);
                    var en = Math.min(totalDurationSec, (endFrame * frameDurSec) + postPadSec);
                    anchors.push({ start: st, end: en, trackIndex: t, state: 'active' });
                }
                startFrame = -1;
                lastHotFrame = -1;
            }
        }
        if (startFrame >= 0) {
            var endFrameLast = lastHotFrame + 1;
            if ((endFrameLast - startFrame) >= minClusterFrames) {
                var stLast = Math.max(0, (startFrame * frameDurSec) - prePadSec);
                var enLast = Math.min(totalDurationSec, (endFrameLast * frameDurSec) + postPadSec);
                anchors.push({ start: stLast, end: enLast, trackIndex: t, state: 'active' });
            }
        }

        var merged = mergeActiveSegments(activeBase.concat(anchors));
        if (trackInfos && trackInfos[t]) {
            trackInfos[t].peakAnchorsAdded = Math.max(0, merged.length - activeBase.length);
            trackInfos[t].peakAnchorClusters = anchors.length;
        }
        out.push(merged);
    }

    return out;
}

function mergeActiveSegments(segments) {
    if (!segments || segments.length === 0) return [];
    segments.sort(function (a, b) { return a.start - b.start; });
    var out = [segments[0]];
    for (var i = 1; i < segments.length; i++) {
        var prev = out[out.length - 1];
        var cur = segments[i];
        if (cur.start <= prev.end + 0.001) {
            if (cur.end > prev.end) prev.end = cur.end;
        } else {
            out.push({
                start: cur.start,
                end: cur.end,
                trackIndex: cur.trackIndex,
                state: 'active'
            });
        }
    }
    for (i = 0; i < out.length; i++) {
        out[i].durationMs = Math.round((out[i].end - out[i].start) * 1000);
    }
    return out;
}

function pruneLowSignificanceSegments(resolvedSegments, rmsProfiles, vadResults, options, trackInfos, phaseLabel) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxDurationSec = Math.max(0, (options.maxDurationMs || 1800) / 1000);
    var minPeakAboveThresholdDb = (options.minPeakAboveThresholdDb !== undefined) ? options.minPeakAboveThresholdDb : 1.5;
    var minMeanAboveThresholdDb = (options.minMeanAboveThresholdDb !== undefined) ? options.minMeanAboveThresholdDb : -1.0;

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var kept = [];
        var prunedCount = 0;

        for (var s = 0; s < segs.length; s++) {
            var seg = segs[s];
            if (!seg || seg.state === 'suppressed') {
                kept.push(seg);
                continue;
            }

            var durSec = Math.max(0, seg.end - seg.start);
            if (durSec <= 0 || durSec > maxDurationSec) {
                kept.push(seg);
                continue;
            }

            var stats = computeSegmentRmsStats(seg, rms, frameDurSec);
            if (!stats) {
                kept.push(seg);
                continue;
            }

            var peakAboveThreshold = stats.peakDb - thresholdDb;
            var meanAboveThreshold = stats.meanDb - thresholdDb;

            if (peakAboveThreshold < minPeakAboveThresholdDb &&
                meanAboveThreshold < minMeanAboveThresholdDb) {
                prunedCount++;
                continue;
            }

            kept.push(seg);
        }

        if (trackInfos && trackInfos[t]) {
            if (phaseLabel === 'pre') {
                trackInfos[t].lowSignificancePrunedPre = prunedCount;
            } else if (phaseLabel === 'post') {
                trackInfos[t].lowSignificancePrunedPost = prunedCount;
            }
            trackInfos[t].lowSignificancePruned =
                (trackInfos[t].lowSignificancePrunedPre || 0) +
                (trackInfos[t].lowSignificancePrunedPost || 0);
        }
        out.push(kept);
    }

    return out;
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

function cloneUint8Array(arr) {
    var out = new Uint8Array(arr.length);
    out.set(arr);
    return out;
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
        var gateAfterBleed = snapshot.afterBleed || new Uint8Array(0);
        var vadDebug = snapshot.vadDebug || null;
        var spectralDebug = snapshot.spectralDebug || null;

        var frameCount = Math.max(
            ctx.rmsProfiles[t] ? ctx.rmsProfiles[t].length : 0,
            gateAfterBleed.length,
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

            suppressionCounts[reason] = (suppressionCounts[reason] || 0) + 1;

            frames.push({
                frame: f,
                timeSec: roundNumber(f * frameDurSec, 3),
                rmsDb: roundNumber(toDbSafe(rmsLin), 2),
                noiseFloorDb: roundNumber(toDbSafe(floorLin), 2),
                thresholdDb: roundNumber(toDbSafe(thresholdLin), 2),
                spectralConfidence: spectralConfidence === null ? null : roundNumber(spectralConfidence, 3),
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











