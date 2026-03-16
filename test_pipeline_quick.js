#!/usr/bin/env node
'use strict';

var wavReader = require('./packages/analyzer/src/modules/io/wav_reader');
var rmsCalc = require('./packages/analyzer/src/modules/energy/rms_calculator');
var vadGate = require('./packages/analyzer/src/modules/vad/vad_gate');
var segmentBuilder = require('./packages/analyzer/src/modules/segmentation/segment_builder');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPath = path.join(testDir, '251024-MP-Antje-003a.wav');

console.log('Testing single track: ' + path.basename(trackPath));
console.log('');

// Read only first 30 seconds (to avoid OOM)
var audio = wavReader.readWav(trackPath);
console.log('Audio loaded:');
console.log('  Sample rate: ' + audio.sampleRate + ' Hz');
console.log('  Channels: ' + audio.channels);
console.log('  Total samples: ' + audio.samples.length);
console.log('  Duration: ' + (audio.samples.length / audio.sampleRate).toFixed(1) + 's');

// Limit to first 30 seconds
var maxSamples = Math.min(audio.samples.length, audio.sampleRate * 30);
var limitedSamples = audio.samples.slice(0, maxSamples);
console.log('  Analyzing first: ' + (maxSamples / audio.sampleRate).toFixed(1) + 's');

// Compute RMS
var frameMs = 10;
var frameSize = Math.round((frameMs / 1000) * audio.sampleRate);
var frameCount = Math.floor(limitedSamples.length / frameSize);
var rmsProfile = new Float64Array(frameCount);

for (var f = 0; f < frameCount; f++) {
    var offset = f * frameSize;
    var sum = 0;
    for (var i = 0; i < frameSize && (offset + i) < limitedSamples.length; i++) {
        sum += limitedSamples[offset + i] * limitedSamples[offset + i];
    }
    rmsProfile[f] = Math.sqrt(sum / frameSize);
}

console.log('');
console.log('RMS Profile:');
console.log('  Frames: ' + rmsProfile.length);
console.log('  Min RMS: ' + rmsCalc.linearToDb(Math.min.apply(null, Array.from(rmsProfile))).toFixed(1) + ' dB');
console.log('  Max RMS: ' + rmsCalc.linearToDb(Math.max.apply(null, Array.from(rmsProfile))).toFixed(1) + ' dB');

// Run VAD
var vadResult = vadGate.detectActivity(rmsProfile, {
    thresholdAboveFloorDb: 0,
    absoluteThresholdDb: -64,
    frameDurationMs: frameMs,
    debugMode: true
});

console.log('');
console.log('VAD Result:');
console.log('  Noise floor: ' + vadResult.noiseFloorDb.toFixed(1) + ' dB');
console.log('  Threshold: ' + vadResult.thresholdDb.toFixed(1) + ' dB');
console.log('  Active frames: ' + vadResult.gateOpen.filter(function(x) { return x; }).length + ' / ' + vadResult.gateOpen.length);

// Build segments
var segments = segmentBuilder.buildSegments(vadResult.gateOpen, 0, {
    minSegmentMs: 260,
    minGapMs: 180,
    frameDurationMs: frameMs
});

console.log('');
console.log('Segments: ' + segments.length);
if (segments.length > 0) {
    segments.slice(0, 10).forEach(function(s, i) {
        console.log('  [' + i + '] ' + s.start.toFixed(2) + 's - ' + s.end.toFixed(2) + 's (' + s.durationMs + 'ms)');
    });
    if (segments.length > 10) {
        console.log('  ... and ' + (segments.length - 10) + ' more');
    }
} else {
    console.log('  NO SEGMENTS FOUND!');
    console.log('');
    console.log('Debug info:');
    if (vadResult.debug) {
        var openThreshDb = vadResult.debug.openThresholdLinearByFrame.map(rmsCalc.linearToDb);
        console.log('  Avg open threshold: ' + (openThreshDb.reduce(function(a,b){return a+b;}, 0) / openThreshDb.length).toFixed(1) + ' dB');
        console.log('  Min open threshold: ' + Math.min.apply(null, openThreshDb).toFixed(1) + ' dB');
        console.log('  Max open threshold: ' + Math.max.apply(null, openThreshDb).toFixed(1) + ' dB');
    }
}
