#!/usr/bin/env node
'use strict';

var preprocess = require('./packages/analyzer/src/modules/preprocess/audio_preprocess');
var rmsCalc = require('./packages/analyzer/src/modules/energy/rms_calculator');
var wavReader = require('./packages/analyzer/src/modules/io/wav_reader');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPath = path.join(testDir, '251024-MP-Antje-003a_30s.wav');

console.log('=== Testing Preprocessing ===\n');

var audio = wavReader.readWav(trackPath);
console.log('Original audio:');
console.log('  Samples: ' + audio.samples.length);
console.log('  Sample rate: ' + audio.sampleRate);

// Check original RMS
var frameMs = 10;
var frameSize = Math.round((frameMs / 1000) * audio.sampleRate);
var frameCount = Math.floor(audio.samples.length / frameSize);
var originalRms = new Float64Array(frameCount);

for (var f = 0; f < frameCount; f++) {
    var offset = f * frameSize;
    var sum = 0;
    for (var i = 0; i < frameSize && (offset + i) < audio.samples.length; i++) {
        sum += audio.samples[offset + i] * audio.samples[offset + i];
    }
    originalRms[f] = Math.sqrt(sum / frameSize);
}

var origMinDb = rmsCalc.linearToDb(Math.min.apply(null, Array.from(originalRms)));
var origMaxDb = rmsCalc.linearToDb(Math.max.apply(null, Array.from(originalRms)));
console.log('  RMS range: ' + origMinDb.toFixed(1) + ' dB to ' + origMaxDb.toFixed(1) + ' dB');

// Apply preprocessing
console.log('\nApplying preprocessing...');
var preprocessed = preprocess.preprocess(audio.samples, audio.sampleRate);

console.log('Preprocessed audio:');
console.log('  Samples: ' + preprocessed.length);

// Check preprocessed RMS
var preprocRms = new Float64Array(frameCount);
for (var f = 0; f < frameCount; f++) {
    var offset = f * frameSize;
    var sum = 0;
    for (var i = 0; i < frameSize && (offset + i) < preprocessed.length; i++) {
        sum += preprocessed[offset + i] * preprocessed[offset + i];
    }
    preprocRms[f] = Math.sqrt(sum / frameSize);
}

var preprocMinDb = rmsCalc.linearToDb(Math.min.apply(null, Array.from(preprocRms)));
var preprocMaxDb = rmsCalc.linearToDb(Math.max.apply(null, Array.from(preprocRms)));
console.log('  RMS range: ' + preprocMinDb.toFixed(1) + ' dB to ' + preprocMaxDb.toFixed(1) + ' dB');

// Count silent frames
var silentFrames = 0;
for (var i = 0; i < preprocRms.length; i++) {
    if (preprocRms[i] < 1e-10) silentFrames++;
}
console.log('  Silent frames: ' + silentFrames + ' / ' + preprocRms.length);

// Check if all frames are silent
if (preprocMaxDb < -80) {
    console.log('\nPROBLEM: Preprocessing killed all signal!');
}
