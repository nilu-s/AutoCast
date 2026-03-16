#!/usr/bin/env node
'use strict';

var analyzerDefaults = require('./packages/analyzer/src/defaults/analyzer_defaults');
var analyzerParams = require('./packages/analyzer/src/core/utils/analyzer_params');
var readTracksStage = require('./packages/analyzer/src/core/pipeline/read_tracks_stage');
var rmsStage = require('./packages/analyzer/src/core/pipeline/rms_stage');
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

console.log('=== Debug: Optimized VAD Stage ===\n');
console.log('useOptimizedPipeline: ' + params.useOptimizedPipeline);
console.log('enablePreprocess: ' + (params.enablePreprocess !== false));
console.log('');

// Read tracks
var readResult = readTracksStage.runReadTracksStage({
    trackPaths: trackPaths,
    params: params,
    progress: function() {}
});

console.log('Audio data:');
console.log('  Track 0 samples: ' + (readResult.audioData[0] ? readResult.audioData[0].length : 'undefined'));
console.log('  Track 1 samples: ' + (readResult.audioData[1] ? readResult.audioData[1].length : 'undefined'));
console.log('  Track 2 samples: ' + (readResult.audioData[2] ? readResult.audioData[2].length : 'undefined'));

// RMS
var rmsResult = rmsStage.runRmsStage({
    audioData: readResult.audioData,
    effectiveOffsetsSec: readResult.effectiveOffsetsSec,
    params: params,
    progress: function() {},
    trackInfos: readResult.trackInfos
});

console.log('\nRMS profiles:');
console.log('  Track 0: ' + rmsResult.rmsProfiles[0].length + ' frames');
console.log('  Track 1: ' + rmsResult.rmsProfiles[1].length + ' frames');
console.log('  Track 2: ' + rmsResult.rmsProfiles[2].length + ' frames');

// Optimized VAD
console.log('\nRunning optimized VAD...');
var vadResult = optimizedVadStage.runOptimizedVadStage({
    params: params,
    trackCount: readResult.trackCount,
    trackInfos: readResult.trackInfos,
    rmsProfiles: rmsResult.rmsProfiles,
    spectralResults: [],
    fingerprintResults: [],
    laughterResults: [],
    audioData: readResult.audioData,
    progress: function(p, msg) { console.log('  [' + p + '%] ' + msg); }
});

console.log('\nVAD Results:');
vadResult.vadResults.forEach(function(vr, i) {
    var activeFrames = vr.gateOpen.filter(function(x) { return x; }).length;
    console.log('  Track ' + i + ':');
    console.log('    Gate length: ' + vr.gateOpen.length);
    console.log('    Active frames: ' + activeFrames);
    console.log('    Noise floor: ' + vr.noiseFloorDb + ' dB');
    console.log('    Threshold: ' + vr.thresholdDb + ' dB');
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
});
