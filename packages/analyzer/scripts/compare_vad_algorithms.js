#!/usr/bin/env node
'use strict';

/**
 * Compare base vs optimized spectral VAD
 * Shows confidence improvements on real podcast audio
 */

var path = require('path');
var fs = require('fs');
var wavLoader = require('../test/utils/wav_loader');
var spectralVad = require('../src/modules/vad/spectral_vad');
var optimizedVad = require('../src/modules/vad/spectral_vad_optimized');
var preprocess = require('../src/modules/preprocess/audio_preprocess');

var TEST_DATA_DIR = path.join(__dirname, '..', 'test', 'test_data');

function analyzeFile(filePath) {
    try {
        var audio = wavLoader.loadWav(filePath);
        var preprocessed = preprocess.preprocess(audio.samples, audio.sampleRate);
        
        // Base algorithm (10ms frames)
        var baseResult = spectralVad.computeSpectralVAD(preprocessed, audio.sampleRate, 10);
        var baseAvg = baseResult.confidence.reduce(function(a, b) { return a + b; }, 0) / baseResult.confidence.length;
        
        // Optimized algorithm (20ms frames, extended bands)
        var optResult = optimizedVad.computeOptimizedSpectralVAD(preprocessed, audio.sampleRate, {
            frameDurationMs: 20,
            speechLowHz: 200,
            speechHighHz: 4000
        });
        var optSmoothed = optimizedVad.smoothConfidence(optResult.confidence, 3);
        var optAvg = optSmoothed.reduce(function(a, b) { return a + b; }, 0) / optSmoothed.length;
        
        return {
            file: path.basename(filePath),
            baseConfidence: baseAvg,
            optimizedConfidence: optAvg,
            improvement: ((optAvg - baseAvg) / baseAvg * 100).toFixed(1)
        };
    } catch (e) {
        return { file: path.basename(filePath), error: e.message };
    }
}

function analyzeCategory(category) {
    var categoryDir = path.join(TEST_DATA_DIR, category);
    if (!fs.existsSync(categoryDir)) {
        console.log('Category not found: ' + category);
        return;
    }
    
    var files = fs.readdirSync(categoryDir)
        .filter(function(f) { return f.endsWith('.wav'); })
        .map(function(f) { return path.join(categoryDir, f); });
    
    console.log('\n=== ' + category + ' ===');
    
    var results = files.map(analyzeFile).filter(function(r) { return !r.error; });
    
    if (results.length === 0) return;
    
    var avgBase = results.reduce(function(a, r) { return a + r.baseConfidence; }, 0) / results.length;
    var avgOpt = results.reduce(function(a, r) { return a + r.optimizedConfidence; }, 0) / results.length;
    var avgImprovement = ((avgOpt - avgBase) / avgBase * 100).toFixed(1);
    
    console.log('Average Base Confidence: ' + avgBase.toFixed(3));
    console.log('Average Optimized Confidence: ' + avgOpt.toFixed(3));
    console.log('Improvement: ' + avgImprovement + '%');
    
    results.forEach(function(r) {
        console.log('  ' + r.file + ': ' + r.baseConfidence.toFixed(3) + ' → ' + 
                   r.optimizedConfidence.toFixed(3) + ' (' + (r.improvement > 0 ? '+' : '') + r.improvement + '%)');
    });
}

console.log('========================================');
console.log(' Base vs Optimized VAD Comparison');
console.log('========================================');

var categories = [
    'Sprecherwechsel - 1',
    'Sprecherwechsel - 2',
    'Sprecherwechsel - 3',
    'Lachen - 1',
    'SpeakerA - 1',
    'Mhm - 1'
];

categories.forEach(analyzeCategory);

console.log('\n========================================');
console.log(' Optimizations applied:');
console.log('  - Extended frequency range: 200-4000 Hz');
console.log('  - Longer analysis window: 20ms (vs 10ms)');
console.log('  - Formant emphasis: 500-2000 Hz boost');
console.log('  - Temporal smoothing: 3-frame window');
console.log('========================================');