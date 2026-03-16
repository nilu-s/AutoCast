#!/usr/bin/env node
'use strict';

var analyzerDefaults = require('./packages/analyzer/src/defaults/analyzer_defaults');
var analyzerParams = require('./packages/analyzer/src/core/utils/analyzer_params');
var readTracksStage = require('./packages/analyzer/src/core/pipeline/read_tracks_stage');
var rmsStage = require('./packages/analyzer/src/core/pipeline/rms_stage');
var featureStage = require('./packages/analyzer/src/core/pipeline/feature_stage');
var optimizedVadStage = require('./packages/analyzer/src/core/pipeline/vad_stage_optimized');
var segmentStage = require('./packages/analyzer/src/core/pipeline/segment_stage');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPaths = [
    path.join(testDir, '251024-MP-Antje-003a_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003b_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003c_30s.wav')
];

var params = analyzerDefaults.mergeWithDefaults({});
params = analyzerParams.enforceSingleModeParams(params);

console.log('=== Testing Optimized VAD Stage ===\n');
console.log('useOptimizedPipeline param: ' + params.useOptimizedPipeline);
console.log('');

// Read tracks
var readResult = readTracksStage.runReadTracksStage({
    trackPaths: trackPaths,
    params: params,
    progress: function() {}
});

// RMS
var rmsResult = rmsStage.runRmsStage({
    audioData: readResult.audioData,
    effectiveOffsetsSec: readResult.effectiveOffsetsSec,
    params: params,
    progress: function() {},
    trackInfos: readResult.trackInfos
});

// Features
var featureResult = featureStage.runFeatureStage({
    audioData: readResult.audioData,
    effectiveOffsetsSec: readResult.effectiveOffsetsSec,
    params: params,
    progress: function() {}
});

// Optimized VAD
console.log('Running optimized VAD stage...');
var vadResult = optimizedVadStage.runOptimizedVadStage({
    params: params,
    trackCount: readResult.trackCount,
    trackInfos: readResult.trackInfos,
    rmsProfiles: rmsResult.rmsProfiles,
    spectralResults: featureResult.spectralResults,
    fingerprintResults: featureResult.fingerprintResults,
    laughterResults: featureResult.laughterResults,
    audioData: readResult.audioData,
    progress: function() {}
});

console.log('\nVAD Results:');
vadResult.vadResults.forEach(function(vr, i) {
    var activeFrames = vr.gateOpen.filter(function(x) { return x; }).length;
    console.log('  Track ' + i + ':');
    console.log('    Active frames: ' + activeFrames + '/' + vr.gateOpen.length);
    console.log('    Noise floor: ' + vr.noiseFloorDb + ' dB');
    console.log('    Threshold: ' + vr.thresholdDb + ' dB');
    console.log('    Has thresholdLinear: ' + ('thresholdLinear' in vr));
    if (vr.thresholdLinear !== undefined) {
        console.log('    thresholdLinear: ' + vr.thresholdLinear);
    }
});

// Segment
console.log('\nRunning segment stage...');
var segmentResult = segmentStage.runSegmentStage({
    params: params,
    trackCount: readResult.trackCount,
    totalDurationSec: readResult.totalDurationSec,
    vadResults: vadResult.vadResults,
    trackInfos: readResult.trackInfos
});

console.log('\nSegments:');
segmentResult.allSegments.forEach(function(segs, i) {
    console.log('  Track ' + i + ': ' + segs.length + ' segments');
    segs.forEach(function(s, j) {
        console.log('    [' + j + '] ' + s.start.toFixed(2) + 's - ' + s.end.toFixed(2) + 's');
    });
});
