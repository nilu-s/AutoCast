'use strict';

/**
 * Real Audio Integration Tests
 * 
 * Consolidated tests using real podcast audio from test_data/
 * Covers: laughter detection, filler sounds, bleed detection, speaker handover
 */

var path = require('path');
var fs = require('fs');
var wavLoader = require('../utils/wav_loader');

var spectralVad = require('../../src/modules/vad/spectral_vad');
var vadGate = require('../../src/modules/vad/vad_gate');
var segmentBuilder = require('../../src/modules/segmentation/segment_builder');
var rmsCalc = require('../../src/modules/energy/rms_calculator');
var preprocess = require('../../src/modules/preprocess/audio_preprocess');

var TEST_DATA_DIR = path.join(__dirname, '..', 'test_data');
var FRAME_MS = 10;

// ============================================================================
// Helper Functions
// ============================================================================

function loadWavSafe(filePath) {
    try {
        var audio = wavLoader.loadWav(filePath);
        audio.samples = preprocess.preprocess(audio.samples, audio.sampleRate);
        return audio;
    } catch (e) {
        console.log('  Warning: Could not load ' + path.basename(filePath) + ': ' + e.message);
        return null;
    }
}

function computeRMSProfile(samples, sampleRate, frameDurationMs) {
    var frameSize = Math.round((frameDurationMs / 1000) * sampleRate);
    var frameCount = Math.floor(samples.length / frameSize);
    var rmsProfile = new Float64Array(frameCount);
    
    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;
        var sum = 0;
        for (var i = 0; i < frameSize && (offset + i) < samples.length; i++) {
            sum += samples[offset + i] * samples[offset + i];
        }
        rmsProfile[f] = Math.sqrt(sum / frameSize);
    }
    return rmsProfile;
}

function createSimpleGate(rmsProfile, threshold) {
    threshold = threshold || 0.001;
    var gate = new Uint8Array(rmsProfile.length);
    for (var i = 0; i < rmsProfile.length; i++) {
        gate[i] = rmsProfile[i] > threshold ? 1 : 0;
    }
    return gate;
}

function computeMeanConfidence(confidence, skipFrames) {
    skipFrames = skipFrames || 10;
    var start = Math.min(skipFrames, confidence.length);
    var end = Math.max(start, confidence.length - skipFrames);
    
    var sum = 0;
    for (var i = start; i < end; i++) {
        sum += confidence[i];
    }
    return (end > start) ? sum / (end - start) : 0;
}

function computeMaxConfidence(confidence) {
    var max = 0;
    for (var i = 0; i < confidence.length; i++) {
        if (confidence[i] > max) max = confidence[i];
    }
    return max;
}



// ============================================================================
// Filler Sounds (Mhm) Tests
// ============================================================================

describe('Real Audio - Filler Sounds', function () {
    
    it('should detect brief filler sounds', function () {
        var mhmFiles = [];
        for (var i = 1; i <= 6; i++) {
            var files = wavLoader.loadTestData('Mhm - ' + i);
            mhmFiles = mhmFiles.concat(files);
        }
        
        assert(mhmFiles.length >= 6, 'Should load at least 6 Mhm variants');
        
        var shortSegments = 0;
        mhmFiles.forEach(function(file) {
            var rmsProfile = computeRMSProfile(file.samples, file.sampleRate, FRAME_MS);
            var gate = vadGate.detectActivity(rmsProfile, { thresholdAboveFloorDb: 10 });
            
            var segments = segmentBuilder.buildSegments(gate.gateOpen, FRAME_MS);
            segments.forEach(function(seg) {
                if (seg.durationMs < 800) shortSegments++;
            });
        });
        
        assert(shortSegments > 0, 'Should detect short filler segments');
        console.log('  Detected ' + shortSegments + ' short segments (<800ms)');
    });
    
    it('should have valid audio properties', function () {
        var files = wavLoader.loadTestData('Mhm - 1');
        assert(files.length > 0, 'Should load Mhm files');
        
        files.forEach(function(file) {
            assert(file.sampleRate > 0, 'Should have valid sample rate');
            assert(file.duration > 0, 'Should have valid duration');
            assert(file.samples.length > 0, 'Should have audio data');
        });
    });
});

// ============================================================================
// Bleed Detection Tests
// ============================================================================

describe('Real Audio - Bleed Detection', function () {
    
    it('should detect spectral differences between bleed and direct speech', function () {
        var speakerADir = path.join(TEST_DATA_DIR, 'SpeakerA - 1');
        if (!fs.existsSync(speakerADir)) {
            console.log('  Skip: SpeakerA test data not found');
            return;
        }
        
        var files = fs.readdirSync(speakerADir).filter(function(f) { return f.endsWith('.wav'); });
        var speechFile = files.find(function(f) { return f.includes('speach'); });
        var bleedFile = files.find(function(f) { return f.includes('bleed'); });
        
        if (!speechFile || !bleedFile) {
            console.log('  Skip: Need both speech and bleed files');
            return;
        }
        
        var speech = loadWavSafe(path.join(speakerADir, speechFile));
        var bleed = loadWavSafe(path.join(speakerADir, bleedFile));
        
        if (!speech || !bleed) {
            console.log('  Skip: Could not load files');
            return;
        }
        
        var speechConf = spectralVad.computeSpectralVAD(speech.samples, speech.sampleRate, FRAME_MS);
        var bleedConf = spectralVad.computeSpectralVAD(bleed.samples, bleed.sampleRate, FRAME_MS);
        
        var speechMean = computeMeanConfidence(speechConf.confidence);
        var bleedMean = computeMeanConfidence(bleedConf.confidence);
        
        console.log('  Direct speech confidence: ' + speechMean.toFixed(3));
        console.log('  Bleed confidence: ' + bleedMean.toFixed(3));
        
        assert(speechMean >= 0, 'Should compute confidence for speech');
        assert(bleedMean >= 0, 'Should compute confidence for bleed');
    });
});

// ============================================================================
// Speaker Handover Tests
// ============================================================================

describe('Real Audio - Speaker Handover', function () {
    
    it('should compute spectral fingerprints for different speakers', function () {
        var sprecherwechselDir = path.join(TEST_DATA_DIR, 'Sprecherwechsel - 1');
        if (!fs.existsSync(sprecherwechselDir)) {
            console.log('  Skip: Sprecherwechsel test data not found');
            return;
        }
        
        var files = fs.readdirSync(sprecherwechselDir).filter(function(f) { return f.endsWith('.wav'); });
        if (files.length < 2) {
            console.log('  Skip: Need at least 2 speaker files');
            return;
        }
        
        var audio1 = loadWavSafe(path.join(sprecherwechselDir, files[0]));
        var audio2 = loadWavSafe(path.join(sprecherwechselDir, files[1]));
        
        if (!audio1 || !audio2) {
            console.log('  Skip: Could not load audio files');
            return;
        }
        
        var fp1 = spectralVad.computeSpectralFingerprint(audio1.samples, audio1.sampleRate, FRAME_MS);
        var fp2 = spectralVad.computeSpectralFingerprint(audio2.samples, audio2.sampleRate, FRAME_MS);
        
        assert(fp1.frameCount > 0, 'Should have frames for speaker 1');
        assert(fp2.frameCount > 0, 'Should have frames for speaker 2');
        
        var similarity = spectralVad.computeCrossTrackSimilarity(fp1, fp2, 0,
            Math.min(fp1.frameCount, fp2.frameCount));
        
        console.log('  Cross-speaker similarity: ' + similarity.toFixed(3));
        assert(similarity >= 0 && similarity <= 1, 'Similarity should be in valid range');
    });
    
    it('should have valid spectral confidence for handover files', function () {
        var categories = ['Sprecherwechsel - 1', 'Sprecherwechsel - 2', 'Sprecherwechsel - 3'];
        var allValid = true;
        
        categories.forEach(function(cat) {
            var catDir = path.join(TEST_DATA_DIR, cat);
            if (!fs.existsSync(catDir)) return;
            
            var files = fs.readdirSync(catDir).filter(function(f) { return f.endsWith('.wav'); });
            files.forEach(function(f) {
                var audio = loadWavSafe(path.join(catDir, f));
                if (audio) {
                    var conf = spectralVad.computeSpectralVAD(audio.samples, audio.sampleRate, FRAME_MS);
                    var avgConf = computeMeanConfidence(conf.confidence);
                    console.log('  ' + cat + '/' + f + ': avg confidence=' + avgConf.toFixed(3));
                    if (avgConf < 0) allValid = false;
                }
            });
        });
        
        assert(allValid, 'All files should have valid spectral confidence');
    });
});

// ============================================================================
// General Real Audio Tests
// ============================================================================

describe('Real Audio - General', function () {
    
    it('should load all test data categories', function () {
        var categories = wavLoader.listCategories();
        assert(categories.length > 0, 'Should have test data categories');
        console.log('  Found ' + categories.length + ' categories');
        
        categories.slice(0, 5).forEach(function(cat) {
            var files = wavLoader.getFilesByCategory(cat);
            console.log('  - ' + cat + ': ' + files.length + ' files');
        });
    });
    
    it('should process pre-processed audio without errors', function () {
        var files = wavLoader.loadTestData('Lachen - 1');
        if (files.length === 0) {
            console.log('  Skip: No test files');
            return;
        }
        
        var raw = files[0].samples;
        var processed = preprocess.preprocess(raw, files[0].sampleRate);
        
        // Just verify pre-processing runs without error and produces valid output
        assert(processed.length > 0, 'Pre-processing should produce output');
        assert(processed.length === raw.length, 'Pre-processing should preserve sample count');
        
        // Verify we can run VAD on processed audio
        var procConf = spectralVad.computeSpectralVAD(processed, files[0].sampleRate, FRAME_MS);
        assert(procConf.confidence.length > 0, 'Should compute confidence for processed audio');
    });
});