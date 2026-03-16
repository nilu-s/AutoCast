#!/usr/bin/env node
'use strict';

var analyzerDefaults = require('./packages/analyzer/src/defaults/analyzer_defaults');
var analyzerParams = require('./packages/analyzer/src/core/utils/analyzer_params');
var readTracksStage = require('./packages/analyzer/src/core/pipeline/read_tracks_stage');
var rmsStage = require('./packages/analyzer/src/core/pipeline/rms_stage');
var featureStage = require('./packages/analyzer/src/core/pipeline/feature_stage');
var vadStage = require('./packages/analyzer/src/core/pipeline/vad_stage');
var segmentStage = require('./packages/analyzer/src/core/pipeline/segment_stage');
var overlapStage = require('./packages/analyzer/src/core/pipeline/overlap_stage');
var postprocessStage = require('./packages/analyzer/src/core/pipeline/postprocess_stage');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPaths = [
    path.join(testDir, '251024-MP-Antje-003a_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003b_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003c_30s.wav')
];

var params = analyzerDefaults.mergeWithDefaults({ useOptimizedPipeline: false });
params = analyzerParams.enforceSingleModeParams(params);

console.log('=== Stage-by-Stage Debug ===\n');

// Stage 1: Read tracks
console.log('Stage 1: Read tracks...');
var readResult = readTracksStage.runReadTracksStage({
    trackPaths: trackPaths,
    params: params,
    progress: function() {}
});
console.log('  Tracks: ' + readResult.trackCount);
console.log('  Duration: ' + readResult.totalDurationSec.toFixed(1) + 's');

// Stage 2: RMS
console.log('\nStage 2: RMS...');
var rmsResult = rmsStage.runRmsStage({
    audioData: readResult.audioData,
    effectiveOffsetsSec: readResult.effectiveOffsetsSec,
    params: params,
    progress: function() {},
    trackInfos: readResult.trackInfos
});
console.log('  RMS profiles: ' + rmsResult.rmsProfiles.length);
rmsResult.rmsProfiles.forEach(function(rms, i) {
    console.log('    Track ' + i + ': ' + rms.length + ' frames');
});

// Stage 3: Features
console.log('\nStage 3: Features...');
var featureResult = featureStage.runFeatureStage({
    audioData: readResult.audioData,
    effectiveOffsetsSec: readResult.effectiveOffsetsSec,
    params: params,
    progress: function() {}
});
console.log('  Spectral results: ' + featureResult.spectralResults.length);

// Stage 4: VAD
console.log('\nStage 4: VAD...');
var vadResult = vadStage.runVadStage({
    params: params,
    trackCount: readResult.trackCount,
    trackInfos: readResult.trackInfos,
    rmsProfiles: rmsResult.rmsProfiles,
    spectralResults: featureResult.spectralResults,
    fingerprintResults: featureResult.fingerprintResults,
    laughterResults: featureResult.laughterResults,
    progress: function() {}
});
console.log('  VAD results: ' + vadResult.vadResults.length);
vadResult.vadResults.forEach(function(vr, i) {
    var activeFrames = vr.gateOpen.filter(function(x) { return x; }).length;
    console.log('    Track ' + i + ': ' + activeFrames + '/' + vr.gateOpen.length + ' active frames, ' +
                'noiseFloor=' + vr.noiseFloorDb.toFixed(1) + 'dB, threshold=' + vr.thresholdDb.toFixed(1) + 'dB');
});

// Stage 5: Segment
console.log('\nStage 5: Segment...');
var segmentResult = segmentStage.runSegmentStage({
    params: params,
    trackCount: readResult.trackCount,
    totalDurationSec: readResult.totalDurationSec,
    vadResults: vadResult.vadResults,
    trackInfos: readResult.trackInfos
});
console.log('  All segments: ' + segmentResult.allSegments.length);
segmentResult.allSegments.forEach(function(segs, i) {
    console.log('    Track ' + i + ': ' + segs.length + ' segments');
    if (segs.length > 0 && segs.length <= 5) {
        segs.forEach(function(s, j) {
            console.log('      [' + j + '] ' + s.start.toFixed(2) + 's - ' + s.end.toFixed(2) + 's');
        });
    }
});

// Stage 6: Overlap
console.log('\nStage 6: Overlap...');
var overlapResult = overlapStage.runOverlapStage({
    params: params,
    bleedEnabled: vadResult.bleedEnabled,
    allSegments: segmentResult.allSegments,
    rmsProfiles: rmsResult.rmsProfiles,
    fingerprintResults: featureResult.fingerprintResults
});
console.log('  Resolved segments: ' + overlapResult.resolvedSegments.length);
overlapResult.resolvedSegments.forEach(function(segs, i) {
    var active = segs.filter(function(s) { return s.state !== 'suppressed'; });
    console.log('    Track ' + i + ': ' + segs.length + ' total, ' + active.length + ' active');
});

// Stage 7: Postprocess
console.log('\nStage 7: Postprocess...');
var postResult = postprocessStage.runPostprocessStage({
    resolvedSegments: overlapResult.resolvedSegments,
    rmsProfiles: rmsResult.rmsProfiles,
    rawRmsProfiles: rmsResult.rawRmsProfiles,
    vadResults: vadResult.vadResults,
    laughterResults: featureResult.laughterResults,
    trackInfos: readResult.trackInfos,
    params: params,
    totalDurationSec: readResult.totalDurationSec,
    progress: function() {}
});
console.log('  Final segments: ' + postResult.resolvedSegments.length);
postResult.resolvedSegments.forEach(function(segs, i) {
    var active = segs.filter(function(s) { return s.state !== 'suppressed'; });
    console.log('    Track ' + i + ': ' + segs.length + ' total, ' + active.length + ' active');
    if (active.length > 0 && active.length <= 5) {
        active.forEach(function(s, j) {
            console.log('      [' + j + '] ' + s.start.toFixed(2) + 's - ' + s.end.toFixed(2) + 's');
        });
    }
});
