#!/usr/bin/env node
'use strict';

var analyzerDefaults = require('./packages/analyzer/src/defaults/analyzer_defaults');
var analyzerParams = require('./packages/analyzer/src/core/utils/analyzer_params');
var readTracksStage = require('./packages/analyzer/src/core/pipeline/read_tracks_stage');
var rmsStage = require('./packages/analyzer/src/core/pipeline/rms_stage');
var preprocess = require('./packages/analyzer/src/modules/preprocess/audio_preprocess');
var rmsCalc = require('./packages/analyzer/src/modules/energy/rms_calculator');
var vadGate = require('./packages/analyzer/src/modules/vad/vad_gate');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPaths = [
    path.join(testDir, '251024-MP-Antje-003a_30s.wav')
];

var params = analyzerDefaults.mergeWithDefaults({});
params = analyzerParams.enforceSingleModeParams(params);

console.log('=== Debug Optimized VAD Stage ===\n');

// Read tracks
var readResult = readTracksStage.runReadTracksStage({
    trackPaths: trackPaths,
    params: params,
    progress: function() {}
});

console.log('Audio data:');
console.log('  Track 0 samples: ' + readResult.audioData[0].length);

// RMS
var rmsResult = rmsStage.runRmsStage({
    audioData: readResult.audioData,
    effectiveOffsetsSec: readResult.effectiveOffsetsSec,
    params: params,
    progress: function() {},
    trackInfos: readResult.trackInfos
});

console.log('  RMS profile: ' + rmsResult.rmsProfiles[0].length + ' frames');

// Preprocess
console.log('\nPreprocessing...');
var preprocessed = preprocess.preprocess(readResult.audioData[0], readResult.trackInfos[0].sampleRate, {
    noiseGate: false
});
console.log('  Preprocessed samples: ' + preprocessed.length);

// Calculate RMS from preprocessed
var rmsResult2 = rmsCalc.calculateRMS(preprocessed, readResult.trackInfos[0].sampleRate, params.frameDurationMs || 10);
console.log('  New RMS profile: ' + rmsResult2.rms.length + ' frames');

// Run VAD
console.log('\nRunning VAD...');
var vadResult = vadGate.detectActivity(rmsResult2.rms, {
    thresholdAboveFloorDb: params.thresholdAboveFloorDb,
    absoluteThresholdDb: params.absoluteThresholdDb,
    frameDurationMs: params.frameDurationMs,
    debugMode: true
});

console.log('  Gate open length: ' + vadResult.gateOpen.length);
console.log('  Active frames: ' + vadResult.gateOpen.filter(function(x) { return x; }).length);
console.log('  Noise floor: ' + vadResult.noiseFloorDb.toFixed(1) + ' dB');
console.log('  Threshold: ' + vadResult.thresholdDb.toFixed(1) + ' dB');
