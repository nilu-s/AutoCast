#!/usr/bin/env node
'use strict';

var wavReader = require('./packages/analyzer/src/modules/io/wav_reader');
var rmsCalc = require('./packages/analyzer/src/modules/energy/rms_calculator');
var vadGate = require('./packages/analyzer/src/modules/vad/vad_gate');
var segmentBuilder = require('./packages/analyzer/src/modules/segmentation/segment_builder');
var analyzerDefaults = require('./packages/analyzer/src/defaults/analyzer_defaults');
var analyzerParams = require('./packages/analyzer/src/core/utils/analyzer_params');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPath = path.join(testDir, '251024-MP-Antje-003a_30s.wav');

console.log('Testing with defaults from analyzer_defaults.js');
console.log('');

// Get actual defaults
var params = analyzerDefaults.mergeWithDefaults({});
params = analyzerParams.enforceSingleModeParams(params);

console.log('VAD Parameters:');
console.log('  thresholdAboveFloorDb: ' + params.thresholdAboveFloorDb);
console.log('  absoluteThresholdDb: ' + params.absoluteThresholdDb);
console.log('  adaptiveNoiseFloor: ' + params.adaptiveNoiseFloor);
console.log('  enableHardSilenceCut: ' + params.enableHardSilenceCut);
console.log('  hardSilenceCutDb: ' + params.hardSilenceCutDb);
console.log('');

var audio = wavReader.readWav(trackPath);
console.log('Audio: ' + audio.sampleRate + ' Hz, ' + audio.channels + ' ch, ' + (audio.samples.length/audio.sampleRate).toFixed(1) + 's');

// Compute RMS
var frameMs = params.frameDurationMs;
var frameSize = Math.round((frameMs / 1000) * audio.sampleRate);
var frameCount = Math.floor(audio.samples.length / frameSize);
var rmsProfile = new Float64Array(frameCount);

for (var f = 0; f < frameCount; f++) {
    var offset = f * frameSize;
    var sum = 0;
    for (var i = 0; i < frameSize && (offset + i) < audio.samples.length; i++) {
        sum += audio.samples[offset + i] * audio.samples[offset + i];
    }
    rmsProfile[f] = Math.sqrt(sum / frameSize);
}

console.log('RMS Profile: ' + rmsProfile.length + ' frames');

// Check for silence
var silentFrames = 0;
for (var i = 0; i < rmsProfile.length; i++) {
    if (rmsProfile[i] < 1e-10) silentFrames++;
}
console.log('Silent frames (< 1e-10): ' + silentFrames + ' / ' + rmsProfile.length);

// Run VAD with actual defaults
var vadResult = vadGate.detectActivity(rmsProfile, {
    thresholdAboveFloorDb: params.thresholdAboveFloorDb,
    absoluteThresholdDb: params.absoluteThresholdDb,
    frameDurationMs: frameMs,
    adaptiveNoiseFloor: params.adaptiveNoiseFloor,
    localNoiseWindowMs: params.localNoiseWindowMs,
    noiseFloorUpdateMs: params.noiseFloorUpdateMs,
    localNoisePercentile: params.localNoisePercentile,
    maxAdaptiveFloorRiseDb: params.maxAdaptiveFloorRiseDb,
    enableHardSilenceCut: params.enableHardSilenceCut,
    hardSilenceCutDb: params.hardSilenceCutDb,
    hardSilenceLookaroundMs: params.hardSilenceLookaroundMs,
    hardSilencePeakDeltaDb: params.hardSilencePeakDeltaDb,
    debugMode: true
});

console.log('');
console.log('VAD Result:');
console.log('  Noise floor: ' + vadResult.noiseFloorDb.toFixed(1) + ' dB');
console.log('  Threshold: ' + vadResult.thresholdDb.toFixed(1) + ' dB');
console.log('  Active frames: ' + vadResult.gateOpen.filter(function(x) { return x; }).length + ' / ' + vadResult.gateOpen.length);

// Build segments with actual defaults
var segments = segmentBuilder.buildSegments(vadResult.gateOpen, 0, {
    minSegmentMs: params.minSegmentMs,
    minGapMs: params.minGapMs,
    frameDurationMs: frameMs
});

console.log('');
console.log('Segments: ' + segments.length);
if (segments.length > 0) {
    segments.forEach(function(s, i) {
        console.log('  [' + i + '] ' + s.start.toFixed(2) + 's - ' + s.end.toFixed(2) + 's (' + s.durationMs + 'ms)');
    });
}

// Check if all frames are active
var allActive = vadResult.gateOpen.every(function(x) { return x === 1; });
console.log('');
console.log('All frames active? ' + allActive);
if (allActive) {
    console.log('PROBLEM: VAD gate is always open!');
    console.log('');
    console.log('Debug - first 10 frames:');
    if (vadResult.debug) {
        for (var i = 0; i < Math.min(10, rmsProfile.length); i++) {
            var rmsDb = rmsCalc.linearToDb(rmsProfile[i]);
            var floorDb = rmsCalc.linearToDb(vadResult.debug.noiseFloorLinearByFrame[i]);
            var threshDb = rmsCalc.linearToDb(vadResult.debug.openThresholdLinearByFrame[i]);
            console.log('  Frame ' + i + ': RMS=' + rmsDb.toFixed(1) + 'dB, Floor=' + floorDb.toFixed(1) + 'dB, Thresh=' + threshDb.toFixed(1) + 'dB, Gate=' + vadResult.gateOpen[i]);
        }
    }
}
