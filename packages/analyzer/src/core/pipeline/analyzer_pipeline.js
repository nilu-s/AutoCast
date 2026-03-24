'use strict';

var analyzerDefaults = require('../../defaults/analyzer_defaults');
var analyzerParams = require('../../core/utils/analyzer_params');
var analyzerExtensions = require('../../extensions/analyzer_extensions');

var readTracksStage = require('./read_tracks_stage');
var rmsStage = require('./rms_stage');
var featureStage = require('./feature_stage');
var calibrationStage = require('./calibration_stage');
var frameContinuity = require('../../modules/postprocess/frame_continuity');
var vadStage = require('./vad_stage');
var arbitrationStage = require('./cross_track_arbitration_stage');
var postprocessStage = require('./postprocess_stage');
var segmentPadding = require('../../modules/segmentation/segment_padding');
var finalizeStage = require('./finalize_stage');

function analyze(trackPaths, userParams, progressCallback) {
    var params = analyzerDefaults.mergeWithDefaults(userParams);
    params = analyzerParams.enforceSingleModeParams(params);
    var extensions = analyzerExtensions.loadExtensions(params.extensions);
    var progress = progressCallback || function () { };
    var memorySnapshots = [];

    recordMemorySnapshot(params, memorySnapshots, 'start');

    var readResult = readTracksStage.runReadTracksStage({
        trackPaths: trackPaths,
        params: params,
        progress: progress
    });

    var trackCount = readResult.trackCount;
    var trackInfos = readResult.trackInfos;
    var audioData = readResult.audioData;
    var alignment = readResult.alignment;
    var totalDurationSec = readResult.totalDurationSec;
    var effectiveOffsetsSec = readResult.effectiveOffsetsSec;
    recordMemorySnapshot(params, memorySnapshots, 'afterReadTracks');

    analyzerExtensions.invokeHook(extensions, 'onAfterReadTracks', {
        trackPaths: trackPaths,
        trackInfos: trackInfos,
        audioData: audioData,
        alignment: alignment,
        params: params
    });

    var rmsResult = rmsStage.runRmsStage({
        audioData: audioData,
        effectiveOffsetsSec: effectiveOffsetsSec,
        params: params,
        progress: progress,
        trackInfos: trackInfos
    });

    var rmsProfiles = rmsResult.rmsProfiles;
    var rawRmsProfiles = rmsResult.rawRmsProfiles;
    var gainInfo = rmsResult.gainInfo;
    recordMemorySnapshot(params, memorySnapshots, 'afterRms');

    analyzerExtensions.invokeHook(extensions, 'onAfterRms', {
        rmsProfiles: rmsProfiles,
        rawRmsProfiles: rawRmsProfiles,
        trackInfos: trackInfos,
        params: params
    });

    var featureResult = featureStage.runFeatureStage({
        audioData: audioData,
        effectiveOffsetsSec: effectiveOffsetsSec,
        params: params,
        progress: progress
    });

    var spectralResults = featureResult.spectralResults;
    var fingerprintResults = featureResult.fingerprintResults;
    var laughterResults = featureResult.laughterResults;
    recordMemorySnapshot(params, memorySnapshots, 'afterFeatures');

    audioData = null;

    var trackThresholds = calibrationStage.computeTrackThresholds({
        params: params,
        trackCount: trackCount,
        trackInfos: trackInfos
    });

    // VAD Stage - einheitlicher Pfad
    var vadResult = vadStage.runVadStage({
        params: params,
        trackCount: trackCount,
        trackInfos: trackInfos,
        rmsProfiles: rmsProfiles,
        trackThresholds: trackThresholds,
        spectralResults: spectralResults,
        fingerprintResults: fingerprintResults,
        laughterResults: laughterResults,
        progress: progress
    });

    var vadResults = vadResult.vadResults;
    var gateSnapshots = vadResult.gateSnapshots;
    var bleedEnabled = vadResult.bleedEnabled;
    recordMemorySnapshot(params, memorySnapshots, 'afterVad');

    // Apply Loudness Latch if enabled
    if (params.enableLoudnessLatch) {
        vadResults = calibrationStage.applyLoudnessLatchToTrackResults({
            params: params,
            trackCount: trackCount,
            rmsProfiles: rmsProfiles,
            vadResults: vadResults
        });
    }

    // Frame Continuity (Dropout / Laughter)
    frameContinuity.applyFrameContinuity({
        params: params,
        trackCount: trackCount,
        trackInfos: trackInfos,
        rmsProfiles: rmsProfiles,
        vadResults: vadResults,
        laughterResults: laughterResults,
        gateSnapshots: gateSnapshots
    });

    analyzerExtensions.invokeHook(extensions, 'onAfterVad', {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        spectralResults: spectralResults,
        laughterResults: laughterResults,
        rmsProfiles: rmsProfiles,
        trackInfos: trackInfos,
        params: params
    });

    // Cross-Track Arbitration (Stage)
    // Consolidates Bleed Suppression, Segment Building, and Overlap Resolution.
    var arbitrationResult = arbitrationStage.runArbitrationStage({
        params: params,
        trackCount: trackCount,
        totalDurationSec: totalDurationSec,
        trackInfos: trackInfos,
        rmsProfiles: rmsProfiles,
        vadResults: vadResults,
        spectralResults: spectralResults,
        fingerprintResults: fingerprintResults,
        gateSnapshots: gateSnapshots,
        extensions: extensions, // Pass extensions for internal hooks if needed
        progress: progress
    });

    var resolvedSegments = arbitrationResult.resolvedSegments;
    var overlapResolvedSegments = arbitrationResult.overlapResolvedSegments;
    var allSegments = arbitrationResult.allSegments;
    vadResults = arbitrationResult.vadResults;
    recordMemorySnapshot(params, memorySnapshots, 'afterArbitration');

    for (var ti = 0; ti < trackCount; ti++) {
        if (vadResults[ti] && vadResults[ti].gateOpen) {
            gateSnapshots[ti].afterBleed = new Uint8Array(vadResults[ti].gateOpen);
        }
    }

    analyzerExtensions.invokeHook(extensions, 'onAfterResolveOverlaps', {
        resolvedSegments: resolvedSegments,
        sourceSegments: allSegments,
        rmsProfiles: rmsProfiles,
        trackInfos: trackInfos,
        params: params
    });

    var postprocessResult = postprocessStage.runPostprocessStage({
        resolvedSegments: resolvedSegments,
        rmsProfiles: rmsProfiles,
        rawRmsProfiles: rawRmsProfiles,
        vadResults: vadResults,
        laughterResults: laughterResults,
        trackInfos: trackInfos,
        params: params,
        totalDurationSec: totalDurationSec,
        progress: progress
    });

    resolvedSegments = postprocessResult.resolvedSegments;
    recordMemorySnapshot(params, memorySnapshots, 'afterPostprocess');

    // Segment Padding (Editorial Policy)
    progress(93, 'Applying segment padding...');
    resolvedSegments = segmentPadding.applySegmentPadding(
        resolvedSegments,
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
            referenceSegments: allSegments
        }
    );

    assertRawRmsProfilesAvailable(rawRmsProfiles, rmsProfiles);

    var finalizeResult = finalizeStage.runFinalizeStage({
        params: params,
        totalDurationSec: totalDurationSec,
        trackInfos: trackInfos,
        resolvedSegments: resolvedSegments,
        allSegments: allSegments,
        overlapResolvedSegments: overlapResolvedSegments,
        alignment: alignment,
        gainInfo: gainInfo,
        rmsProfiles: rmsProfiles,
        rawRmsProfiles: rawRmsProfiles,
        spectralResults: spectralResults,
        laughterResults: laughterResults,
        gateSnapshots: gateSnapshots,
        progress: progress
    });

    var result = finalizeResult.result;
    recordMemorySnapshot(params, memorySnapshots, 'afterFinalize');

    if (params.debugMode) {
        result.debugMemory = memorySnapshots;
    }

    analyzerExtensions.invokeHook(extensions, 'onFinalizeResult', {
        result: result,
        trackInfos: trackInfos,
        params: params
    });

    return result;
}

function assertRawRmsProfilesAvailable(rawRmsProfiles, rmsProfiles) {
    var normalized = Array.isArray(rmsProfiles) ? rmsProfiles : [];
    if (!Array.isArray(rawRmsProfiles) || rawRmsProfiles.length < normalized.length) {
        throw new Error('Analyzer pipeline requires rawRmsProfiles for preview finalize stage.');
    }
    for (var i = 0; i < normalized.length; i++) {
        if (!rawRmsProfiles[i] || typeof rawRmsProfiles[i].length !== 'number') {
            throw new Error('Analyzer pipeline missing raw RMS profile for track ' + i + '.');
        }
    }
}

module.exports = {
    analyze: analyze
};

function recordMemorySnapshot(params, out, stage) {
    if (!params || !params.debugMode) return;
    if (!Array.isArray(out)) return;

    var mem = process.memoryUsage();
    out.push({
        stage: stage,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external
    });
}

