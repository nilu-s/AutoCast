#!/usr/bin/env node
'use strict';

/**
 * Analyze real podcast audio metrics
 * Extracts actual confidence values, similarities, and profile building stats
 * from test_data/ to tune algorithm parameters
 */

var path = require('path');
var fs = require('fs');
var wavLoader = require('../test/utils/wav_loader');
var spectralVad = require('../src/modules/vad/spectral_vad');
var preprocess = require('../src/modules/preprocess/audio_preprocess');

var TEST_DATA_DIR = path.join(__dirname, '..', 'test', 'test_data');
var FRAME_MS = 10;

function computeRMSProfile(samples, sampleRate, frameDurationMs) {
    var frameSize = Math.round((frameDurationMs / 1000) * sampleRate);
    var frameCount = Math.floor(samples.length / frameSize);
    var rmsProfile = new Float64Array(frameCount);
    
    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;
        var sum = 0;
        var count = 0;
        for (var i = 0; i < frameSize && (offset + i) < samples.length; i++) {
            sum += samples[offset + i] * samples[offset + i];
            count++;
        }
        rmsProfile[f] = count > 0 ? Math.sqrt(sum / count) : 0;
    }
    return rmsProfile;
}

function createSimpleGate(rmsProfile, threshold) {
    threshold = threshold || 0.001;  // Lower threshold for real podcast audio
    var gate = new Uint8Array(rmsProfile.length);
    for (var i = 0; i < rmsProfile.length; i++) {
        gate[i] = rmsProfile[i] > threshold ? 1 : 0;
    }
    return gate;
}

function createAdaptiveGate(rmsProfile) {
    // Adaptive threshold based on signal statistics
    var sum = 0;
    var count = 0;
    var max = 0;
    for (var i = 0; i < rmsProfile.length; i++) {
        if (rmsProfile[i] > 0) {
            sum += rmsProfile[i];
            count++;
            if (rmsProfile[i] > max) max = rmsProfile[i];
        }
    }
    var mean = count > 0 ? sum / count : 0;
    // Threshold at 10% of max or 2x mean, whichever is lower
    var threshold = Math.min(max * 0.1, mean * 2);
    threshold = Math.max(threshold, 0.0001);  // Minimum floor
    
    var gate = new Uint8Array(rmsProfile.length);
    var activeCount = 0;
    for (var j = 0; j < rmsProfile.length; j++) {
        gate[j] = rmsProfile[j] > threshold ? 1 : 0;
        if (gate[j]) activeCount++;
    }
    return { gate: gate, threshold: threshold, activeRatio: activeCount / rmsProfile.length };
}

function analyzeFile(filePath, usePreprocess) {
    try {
        var audio = wavLoader.loadWav(filePath);
        
        // Optional pre-processing
        var samples = usePreprocess ? preprocess.preprocess(audio.samples, audio.sampleRate) : audio.samples;
        
        var fp = spectralVad.computeSpectralFingerprint(samples, audio.sampleRate, FRAME_MS);
        var spectralConf = spectralVad.computeSpectralVAD(samples, audio.sampleRate, FRAME_MS);
        
        var rms = computeRMSProfile(samples, audio.sampleRate, FRAME_MS);
        
        // Calculate RMS statistics
        var rmsSum = 0, rmsMax = 0, rmsCount = 0;
        for (var i = 0; i < rms.length; i++) {
            if (rms[i] > 0) {
                rmsSum += rms[i];
                rmsCount++;
                if (rms[i] > rmsMax) rmsMax = rms[i];
            }
        }
        var rmsMean = rmsCount > 0 ? rmsSum / rmsCount : 0;
        
        // Use adaptive gate
        var adaptive = createAdaptiveGate(rms);
        var gate = adaptive.gate;
        
        // Calculate average confidence with adaptive gate
        var avgConf = 0;
        var activeFrames = 0;
        for (var i = 0; i < spectralConf.confidence.length; i++) {
            if (gate[i]) {
                avgConf += spectralConf.confidence[i];
                activeFrames++;
            }
        }
        avgConf = activeFrames > 0 ? avgConf / activeFrames : 0;
        
        // Try building profile with different thresholds
        var profileResults = [];
        var thresholds = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
        var minFramesOptions = [3, 5, 10, 15, 20];
        
        for (var t = 0; t < thresholds.length; t++) {
            for (var m = 0; m < minFramesOptions.length; m++) {
                var profile = spectralVad.buildSpeakerProfile(fp, gate, spectralConf.confidence, {
                    minConfidence: thresholds[t],
                    minFrames: minFramesOptions[m]
                });
                if (profile) {
                    profileResults.push({
                        minConf: thresholds[t],
                        minFrames: minFramesOptions[m],
                        frameCount: profile.frameCount
                    });
                }
            }
        }
        
        return {
            file: path.basename(filePath),
            sampleRate: audio.sampleRate,
            duration: audio.duration,
            frameCount: fp.frameCount,
            rmsMean: rmsMean,
            rmsMax: rmsMax,
            gateThreshold: adaptive.threshold,
            activeRatio: adaptive.activeRatio,
            avgConfidence: avgConf,
            activeFrames: activeFrames,
            profileBuildable: profileResults.length > 0,
            profileOptions: profileResults.slice(0, 3)
        };
    } catch (e) {
        return { file: path.basename(filePath), error: e.message };
    }
}

function analyzeCategory(category, usePreprocess) {
    usePreprocess = usePreprocess || false;
    var categoryDir = path.join(TEST_DATA_DIR, category);
    if (!fs.existsSync(categoryDir)) {
        console.log('Category not found: ' + category);
        return;
    }
    
    var files = fs.readdirSync(categoryDir)
        .filter(function(f) { return f.endsWith('.wav'); })
        .map(function(f) { return path.join(categoryDir, f); });
    
    console.log('\n=== ' + category + (usePreprocess ? ' (with Pre-Processing)' : '') + ' ===');
    console.log('Files: ' + files.length);
    
    var results = files.map(function(f) { return analyzeFile(f, usePreprocess); });
    var successful = results.filter(function(r) { return !r.error; });
    
    if (successful.length === 0) return;
    
    // Summary stats
    var avgConfidences = successful.map(function(r) { return r.avgConfidence; });
    var avgConf = avgConfidences.reduce(function(a, b) { return a + b; }, 0) / avgConfidences.length;
    var minConf = Math.min.apply(null, avgConfidences);
    var maxConf = Math.max.apply(null, avgConfidences);
    
    var buildableCount = successful.filter(function(r) { return r.profileBuildable; }).length;
    
    // RMS stats
    var rmsMeans = successful.map(function(r) { return r.rmsMean; }).filter(function(v) { return v > 0; });
    var rmsMaxs = successful.map(function(r) { return r.rmsMax; }).filter(function(v) { return v > 0; });
    var avgRmsMean = rmsMeans.length > 0 ? rmsMeans.reduce(function(a, b) { return a + b; }, 0) / rmsMeans.length : 0;
    var avgRmsMax = rmsMaxs.length > 0 ? rmsMaxs.reduce(function(a, b) { return a + b; }, 0) / rmsMaxs.length : 0;
    
    // Active ratio stats
    var activeRatios = successful.map(function(r) { return r.activeRatio; });
    var avgActiveRatio = activeRatios.reduce(function(a, b) { return a + b; }, 0) / activeRatios.length;
    
    console.log('RMS Mean: ' + avgRmsMean.toFixed(4) + ', RMS Max: ' + avgRmsMax.toFixed(4));
    console.log('Active Ratio: ' + (avgActiveRatio * 100).toFixed(1) + '%');
    console.log('Average Confidence: ' + avgConf.toFixed(3) + ' (range: ' + minConf.toFixed(3) + ' - ' + maxConf.toFixed(3) + ')');
    console.log('Profile Buildable: ' + buildableCount + '/' + successful.length);
    
    // Per-file details
    successful.forEach(function(r) {
        var status = r.profileBuildable ? '✓' : '✗';
        console.log('  ' + status + ' ' + r.file + ': conf=' + r.avgConfidence.toFixed(3) + 
                   ', rmsMean=' + r.rmsMean.toFixed(4) + ', gateThresh=' + r.gateThreshold.toFixed(4) +
                   ', active=' + (r.activeRatio * 100).toFixed(0) + '%');
        if (r.profileOptions.length > 0) {
            var opts = r.profileOptions.map(function(o) {
                return 'minConf=' + o.minConf + '/minFrames=' + o.minFrames;
            }).join(', ');
            console.log('      Profile options: ' + opts);
        }
    });
    
    return results;
}

function compareSpeakers(file1, file2) {
    var audio1 = wavLoader.loadWav(file1);
    var audio2 = wavLoader.loadWav(file2);
    
    var fp1 = spectralVad.computeSpectralFingerprint(audio1.samples, audio1.sampleRate, FRAME_MS);
    var fp2 = spectralVad.computeSpectralFingerprint(audio2.samples, audio2.sampleRate, FRAME_MS);
    
    var similarity = spectralVad.computeCrossTrackSimilarity(fp1, fp2, 0,
        Math.min(fp1.frameCount, fp2.frameCount));
    
    return similarity;
}

// Main analysis
console.log('========================================');
console.log(' Real Podcast Audio Metrics Analysis');
console.log('========================================');

// Analyze key categories
var categories = [
    'Sprecherwechsel - 1',
    'Sprecherwechsel - 2', 
    'Sprecherwechsel - 3',
    'Lachen - 1',
    'Lachen - gemeinsam',
    'SpeakerA - 1',
    'SpeakerB - 1',
    'Mhm - 1'
];

categories.forEach(analyzeCategory);

// Cross-speaker similarity analysis
console.log('\n=== Cross-Speaker Similarity ===');
var sprecherwechsel1 = path.join(TEST_DATA_DIR, 'Sprecherwechsel - 1');
if (fs.existsSync(sprecherwechsel1)) {
    var files = fs.readdirSync(sprecherwechsel1).filter(function(f) { return f.endsWith('.wav'); });
    if (files.length >= 2) {
        var sim = compareSpeakers(
            path.join(sprecherwechsel1, files[0]),
            path.join(sprecherwechsel1, files[1])
        );
        console.log('Sprecherwechsel - 1: ' + files[0] + ' vs ' + files[1] + ' = ' + sim.toFixed(3));
    }
}

// Compare with and without pre-processing
console.log('\n=== Pre-Processing Impact Comparison ===');
var testCategories = ['Sprecherwechsel - 1', 'SpeakerA - 1'];
testCategories.forEach(function(cat) {
    console.log('\n--- ' + cat + ' ---');
    var withoutPP = analyzeCategory(cat, false);
    var withPP = analyzeCategory(cat, true);
    
    if (withoutPP && withPP) {
        var avgConfWithout = withoutPP.filter(function(r) { return !r.error; })
            .map(function(r) { return r.avgConfidence; })
            .reduce(function(a, b) { return a + b; }, 0) / withoutPP.length;
        var avgConfWith = withPP.filter(function(r) { return !r.error; })
            .map(function(r) { return r.avgConfidence; })
            .reduce(function(a, b) { return a + b; }, 0) / withPP.length;
        
        console.log('Confidence WITHOUT pre-processing: ' + avgConfWithout.toFixed(3));
        console.log('Confidence WITH pre-processing: ' + avgConfWith.toFixed(3));
        console.log('Improvement: ' + ((avgConfWith - avgConfWithout) * 100).toFixed(1) + '%');
    }
});

console.log('\n========================================');
console.log(' Analysis Complete');
console.log('========================================');
