'use strict';

var analyzerDefaults = require('../../defaults/analyzer_defaults');
var analyzerParams = require('../../core/utils/analyzer_params');
var analyzerExtensions = require('../../extensions/analyzer_extensions');

var readTracksStage = require('./read_tracks_stage');
var rmsStage = require('./rms_stage');
var featureStage = require('./feature_stage');
var vadStage = require('./vad_stage');
var segmentStage = require('./segment_stage');
var overlapStage = require('./overlap_stage');
var postprocessStage = require('./postprocess_stage');
var finalizeStage = require('./finalize_stage');

function analyze(trackPaths, userParams, progressCallback) {
    var params = analyzerDefaults.mergeWithDefaults(userParams);
    params = analyzerParams.enforceSingleModeParams(params);
    var extensions = analyzerExtensions.loadExtensions(params.extensions);
    var progress = progressCallback || function () { };

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

    audioData = null;

    var vadResult = vadStage.runVadStage({
        params: params,
        trackCount: trackCount,
        trackInfos: trackInfos,
        rmsProfiles: rmsProfiles,
        spectralResults: spectralResults,
        fingerprintResults: fingerprintResults,
        laughterResults: laughterResults,
        progress: progress
    });

    var vadResults = vadResult.vadResults;
    var gateSnapshots = vadResult.gateSnapshots;
    var bleedEnabled = vadResult.bleedEnabled;

    analyzerExtensions.invokeHook(extensions, 'onAfterVad', {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        spectralResults: spectralResults,
        laughterResults: laughterResults,
        rmsProfiles: rmsProfiles,
        trackInfos: trackInfos,
        params: params
    });

    var segmentResult = segmentStage.runSegmentStage({
        params: params,
        trackCount: trackCount,
        totalDurationSec: totalDurationSec,
        vadResults: vadResults,
        trackInfos: trackInfos
    });

    var allSegments = segmentResult.allSegments;

    analyzerExtensions.invokeHook(extensions, 'onAfterSegments', {
        segments: allSegments,
        trackInfos: trackInfos,
        params: params
    });

    progress(70, 'Resolving overlaps...');

    var overlapResult = overlapStage.runOverlapStage({
        params: params,
        bleedEnabled: bleedEnabled,
        allSegments: allSegments,
        rmsProfiles: rmsProfiles,
        fingerprintResults: fingerprintResults
    });

    var resolvedSegments = overlapResult.resolvedSegments;
    var overlapResolvedSegments = overlapResult.overlapResolvedSegments;

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

    analyzerExtensions.invokeHook(extensions, 'onFinalizeResult', {
        result: result,
        trackInfos: trackInfos,
        params: params
    });

    return result;
}

module.exports = {
    analyze: analyze
};

