'use strict';

var path = require('path');
var laughterDetector = require('../../src/modules/vad/laughter_detector');
var wavLoader = require('../utils/wav_loader');

var FRAME_MS = 10;

/**
 * Compute mean confidence over a range of frames, excluding edge frames
 * @param {Float64Array} confidence - Confidence array from detector
 * @param {number} skipFrames - Number of frames to skip at start/end
 * @returns {number} Mean confidence value
 */
function computeMeanConfidence(confidence, skipFrames) {
    skipFrames = skipFrames || 10;
    var start = skipFrames;
    var end = confidence.length - skipFrames;
    if (end <= start) {
        start = 0;
        end = confidence.length;
    }
    
    var sum = 0;
    var count = 0;
    for (var i = start; i < end; i++) {
        sum += confidence[i];
        count++;
    }
    return count > 0 ? sum / count : 0;
}

/**
 * Compute maximum confidence in the array
 * @param {Float64Array} confidence - Confidence array
 * @returns {number} Maximum confidence value
 */
function computeMaxConfidence(confidence) {
    var max = 0;
    for (var i = 0; i < confidence.length; i++) {
        if (confidence[i] > max) {
            max = confidence[i];
        }
    }
    return max;
}

/**
 * Compute percentage of frames above a threshold
 * @param {Float64Array} confidence - Confidence array
 * @param {number} threshold - Threshold value
 * @returns {number} Percentage of frames above threshold (0-1)
 */
function computePercentAboveThreshold(confidence, threshold) {
    var count = 0;
    for (var i = 0; i < confidence.length; i++) {
        if (confidence[i] >= threshold) {
            count++;
        }
    }
    return confidence.length > 0 ? count / confidence.length : 0;
}

describe('Laughter Detection with Real WAV Files', function () {
    
    describe('Pure Laughter Files', function () {
        it('should detect laughter in Lachen - 1/lachen.wav with confidence > 0.3', function () {
            var files = wavLoader.getFilesByCategory('Lachen - 1');
            assert(files.length > 0, 'Should find WAV files in Lachen - 1');
            
            var audioData = wavLoader.loadWav(files[0]);
            assert(audioData.samples.length > 0, 'Should load audio samples');
            
            var result = laughterDetector.computeLaughterConfidence(
                audioData.samples,
                audioData.sampleRate,
                FRAME_MS
            );
            
            var meanConfidence = computeMeanConfidence(result.confidence, 20);
            var maxConfidence = computeMaxConfidence(result.confidence);
            var percentAboveThreshold = computePercentAboveThreshold(result.confidence, 0.3);
            
            assert(meanConfidence > 0.3, 
                'Mean confidence should be > 0.3 for pure laughter (got ' + meanConfidence.toFixed(3) + ')');
            assert(maxConfidence > 0.5, 
                'Max confidence should be > 0.5 for pure laughter (got ' + maxConfidence.toFixed(3) + ')');
            assert(percentAboveThreshold > 0.2, 
                'At least 20% of frames should have confidence > 0.3 (got ' + (percentAboveThreshold * 100).toFixed(1) + '%)');
        });
        
        it('should detect laughter in Lachen - 2/lachen.wav with confidence > 0.3', function () {
            var files = wavLoader.getFilesByCategory('Lachen - 2');
            assert(files.length > 0, 'Should find WAV files in Lachen - 2');
            
            var audioData = wavLoader.loadWav(files[0]);
            assert(audioData.samples.length > 0, 'Should load audio samples');
            
            var result = laughterDetector.computeLaughterConfidence(
                audioData.samples,
                audioData.sampleRate,
                FRAME_MS
            );
            
            var meanConfidence = computeMeanConfidence(result.confidence, 20);
            var maxConfidence = computeMaxConfidence(result.confidence);
            
            assert(meanConfidence > 0.3, 
                'Mean confidence should be > 0.3 for pure laughter (got ' + meanConfidence.toFixed(3) + ')');
            assert(maxConfidence > 0.5, 
                'Max confidence should be > 0.5 for pure laughter (got ' + maxConfidence.toFixed(3) + ')');
        });
        
        it('should detect laughter in Lachen - gemeinsam files with confidence > 0.3', function () {
            var files = wavLoader.getFilesByCategory('Lachen - gemeinsam');
            assert(files.length >= 2, 'Should find multiple WAV files in Lachen - gemeinsam');
            
            var totalMeanConfidence = 0;
            var fileCount = 0;
            
            for (var i = 0; i < files.length; i++) {
                var audioData = wavLoader.loadWav(files[i]);
                if (audioData.samples.length === 0) continue;
                
                var result = laughterDetector.computeLaughterConfidence(
                    audioData.samples,
                    audioData.sampleRate,
                    FRAME_MS
                );
                
                var meanConfidence = computeMeanConfidence(result.confidence, 20);
                totalMeanConfidence += meanConfidence;
                fileCount++;
                
                assert(meanConfidence > 0.25, 
                    'File ' + path.basename(files[i]) + ' should have mean confidence > 0.25 (got ' + meanConfidence.toFixed(3) + ')');
            }
            
            var overallMean = fileCount > 0 ? totalMeanConfidence / fileCount : 0;
            assert(overallMean > 0.3, 
                'Average confidence across gemeinsam files should be > 0.3 (got ' + overallMean.toFixed(3) + ')');
        });
    });
    
    describe('Laughter + Speech Mix Files', function () {
        it('should detect laughter in Lachen - SpracheMix - 1 files', function () {
            var files = wavLoader.getFilesByCategory('Lachen - SpracheMix - 1');
            assert(files.length >= 2, 'Should find multiple WAV files in Lachen - SpracheMix - 1');
            
            var laughterFiles = files.filter(function(f) {
                return f.toLowerCase().includes('lachen');
            });
            
            assert(laughterFiles.length > 0, 'Should find files with laughter in mix');
            
            for (var i = 0; i < laughterFiles.length; i++) {
                var audioData = wavLoader.loadWav(laughterFiles[i]);
                if (audioData.samples.length === 0) continue;
                
                var result = laughterDetector.computeLaughterConfidence(
                    audioData.samples,
                    audioData.sampleRate,
                    FRAME_MS
                );
                
                var maxConfidence = computeMaxConfidence(result.confidence);
                var meanConfidence = computeMeanConfidence(result.confidence, 20);
                
                assert(maxConfidence > 0.4, 
                    'Mixed file ' + path.basename(laughterFiles[i]) + ' should have max confidence > 0.4 (got ' + maxConfidence.toFixed(3) + ')');
                assert(meanConfidence > 0.15, 
                    'Mixed file ' + path.basename(laughterFiles[i]) + ' should have mean confidence > 0.15 (got ' + meanConfidence.toFixed(3) + ')');
            }
        });
        
        it('should detect laughter in Lachen - SprachMix - 2 files', function () {
            var files = wavLoader.getFilesByCategory('Lachen - SprachMix - 2');
            assert(files.length >= 2, 'Should find multiple WAV files in Lachen - SprachMix - 2');
            
            var laughterFiles = files.filter(function(f) {
                return f.toLowerCase().includes('lachen');
            });
            
            assert(laughterFiles.length > 0, 'Should find files with laughter in mix');
            
            for (var i = 0; i < laughterFiles.length; i++) {
                var audioData = wavLoader.loadWav(laughterFiles[i]);
                if (audioData.samples.length === 0) continue;
                
                var result = laughterDetector.computeLaughterConfidence(
                    audioData.samples,
                    audioData.sampleRate,
                    FRAME_MS
                );
                
                var maxConfidence = computeMaxConfidence(result.confidence);
                var meanConfidence = computeMeanConfidence(result.confidence, 20);
                
                assert(maxConfidence > 0.4, 
                    'Mixed file ' + path.basename(laughterFiles[i]) + ' should have max confidence > 0.4 (got ' + maxConfidence.toFixed(3) + ')');
                assert(meanConfidence > 0.15, 
                    'Mixed file ' + path.basename(laughterFiles[i]) + ' should have mean confidence > 0.15 (got ' + meanConfidence.toFixed(3) + ')');
            }
        });
    });
    
    describe('Laughter vs Speech Distinction', function () {
        it('should distinguish laughter from pure speech files', function () {
            // Load a laughter file
            var laughterFiles = wavLoader.getFilesByCategory('Lachen - 1');
            assert(laughterFiles.length > 0, 'Should find laughter files');
            
            var laughterAudio = wavLoader.loadWav(laughterFiles[0]);
            var laughterResult = laughterDetector.computeLaughterConfidence(
                laughterAudio.samples,
                laughterAudio.sampleRate,
                FRAME_MS
            );
            var laughterMean = computeMeanConfidence(laughterResult.confidence, 20);
            
            // Load speech files (SpeakerA or SpeakerB)
            var speechFiles = wavLoader.getFilesByCategory('SpeakerA - 1');
            if (speechFiles.length === 0) {
                speechFiles = wavLoader.getFilesByCategory('SpeakerB - 1');
            }
            
            if (speechFiles.length > 0) {
                var speechAudio = wavLoader.loadWav(speechFiles[0]);
                var speechResult = laughterDetector.computeLaughterConfidence(
                    speechAudio.samples,
                    speechAudio.sampleRate,
                    FRAME_MS
                );
                var speechMean = computeMeanConfidence(speechResult.confidence, 20);
                
                assert(laughterMean > speechMean, 
                    'Laughter should have higher confidence than speech (laughter: ' + laughterMean.toFixed(3) + ', speech: ' + speechMean.toFixed(3) + ')');
                assert(laughterMean > speechMean + 0.02, 
                    'Laughter confidence should be higher than speech (diff: ' + (laughterMean - speechMean).toFixed(3) + ')');
            }
        });
        
        it('should have higher confidence for laughter-only vs speech-only in same category', function () {
            // Compare lachen.wav vs speach.wav in Lachen - SprachMix - 2
            var mixFiles = wavLoader.getFilesByCategory('Lachen - SprachMix - 2');
            
            var laughterFile = mixFiles.find(function(f) {
                return f.toLowerCase().includes('lachen') && !f.toLowerCase().includes('speach');
            });
            var speechFile = mixFiles.find(function(f) {
                return f.toLowerCase() === 'speach.wav' || path.basename(f).toLowerCase() === 'speach.wav';
            });
            
            if (laughterFile && speechFile) {
                var laughterAudio = wavLoader.loadWav(laughterFile);
                var speechAudio = wavLoader.loadWav(speechFile);
                
                var laughterResult = laughterDetector.computeLaughterConfidence(
                    laughterAudio.samples,
                    laughterAudio.sampleRate,
                    FRAME_MS
                );
                var speechResult = laughterDetector.computeLaughterConfidence(
                    speechAudio.samples,
                    speechAudio.sampleRate,
                    FRAME_MS
                );
                
                var laughterMean = computeMeanConfidence(laughterResult.confidence, 20);
                var speechMean = computeMeanConfidence(speechResult.confidence, 20);
                
                assert(laughterMean > speechMean + 0.05, 
                    'Laughter-only should score higher than speech-only (laughter: ' + laughterMean.toFixed(3) + ', speech: ' + speechMean.toFixed(3) + ')');
            }
        });
    });
    
    describe('Lachen - gemeinsam - 2 (Additional Group Laughter)', function () {
        it('should detect group laughter with confidence > 0.3', function () {
            var files = wavLoader.getFilesByCategory('Lachen - gemeinsam - 2');
            
            if (files.length === 0) {
                // Skip if category doesn't exist
                return;
            }
            
            var laughterFiles = files.filter(function(f) {
                return f.toLowerCase().includes('lachen') && !f.toLowerCase().includes('speach') && !f.toLowerCase().includes('blead');
            });
            
            assert(laughterFiles.length > 0, 'Should find laughter files in gemeinsam - 2');
            
            for (var i = 0; i < laughterFiles.length; i++) {
                var audioData = wavLoader.loadWav(laughterFiles[i]);
                if (audioData.samples.length === 0) continue;
                
                var result = laughterDetector.computeLaughterConfidence(
                    audioData.samples,
                    audioData.sampleRate,
                    FRAME_MS
                );
                
                var meanConfidence = computeMeanConfidence(result.confidence, 20);
                var maxConfidence = computeMaxConfidence(result.confidence);
                
                assert(meanConfidence > 0.25, 
                    'Group laughter file ' + path.basename(laughterFiles[i]) + ' should have mean confidence > 0.25 (got ' + meanConfidence.toFixed(3) + ')');
                assert(maxConfidence > 0.4, 
                    'Group laughter file ' + path.basename(laughterFiles[i]) + ' should have max confidence > 0.4 (got ' + maxConfidence.toFixed(3) + ')');
            }
        });
    });
});
