'use strict';

/**
 * Audio Pre-Processing for Real Podcast Audio
 * 
 * Improves signal quality before analysis:
 * - High-pass filter (removes rumble/noise below 80Hz)
 * - Normalization (consistent levels)
 * - Noise gate (removes silence/noise floor)
 */

/**
 * Simple high-pass filter (removes low frequency rumble)
 * Cutoff around 80Hz for speech
 */
function highPassFilter(samples, sampleRate, cutoffHz) {
    cutoffHz = cutoffHz || 80;
    var rc = 1.0 / (2.0 * Math.PI * cutoffHz);
    var dt = 1.0 / sampleRate;
    var alpha = rc / (rc + dt);
    
    var filtered = new Float32Array(samples.length);
    filtered[0] = samples[0];
    
    for (var i = 1; i < samples.length; i++) {
        filtered[i] = alpha * (filtered[i - 1] + samples[i] - samples[i - 1]);
    }
    
    return filtered;
}

/**
 * Normalize audio to target peak level
 */
function normalize(samples, targetPeak) {
    targetPeak = targetPeak || 0.5;
    
    var max = 0;
    for (var i = 0; i < samples.length; i++) {
        var abs = Math.abs(samples[i]);
        if (abs > max) max = abs;
    }
    
    if (max === 0) return samples;
    
    var gain = targetPeak / max;
    var normalized = new Float32Array(samples.length);
    for (var j = 0; j < samples.length; j++) {
        normalized[j] = samples[j] * gain;
    }
    
    return normalized;
}

/**
 * Adaptive noise gate based on signal statistics
 */
function noiseGate(samples, sampleRate, frameMs) {
    frameMs = frameMs || 10;
    var frameSize = Math.round((frameMs / 1000) * sampleRate);
    var frameCount = Math.floor(samples.length / frameSize);
    
    // Calculate RMS per frame
    var rmsValues = [];
    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;
        var sum = 0;
        for (var i = 0; i < frameSize && (offset + i) < samples.length; i++) {
            sum += samples[offset + i] * samples[offset + i];
        }
        rmsValues.push(Math.sqrt(sum / frameSize));
    }
    
    // Find noise floor (using histogram approach)
    var sorted = rmsValues.slice().sort(function(a, b) { return a - b; });
    var noiseFloor = sorted[Math.floor(sorted.length * 0.1)]; // 10th percentile
    var signalPeak = sorted[Math.floor(sorted.length * 0.9)]; // 90th percentile
    
    // Adaptive threshold
    var threshold = noiseFloor * 2 + (signalPeak - noiseFloor) * 0.1;
    threshold = Math.max(threshold, 0.001);
    
    // Apply gate with smoothing
    var gated = new Float32Array(samples.length);
    var attackFrames = 2;  // 20ms
    var releaseFrames = 10; // 100ms
    var currentGain = 0;
    
    for (var frame = 0; frame < frameCount; frame++) {
        var isActive = rmsValues[frame] > threshold;
        var targetGain = isActive ? 1.0 : 0.0;
        
        // Smooth gain changes
        if (targetGain > currentGain) {
            currentGain = Math.min(targetGain, currentGain + 1.0 / attackFrames);
        } else {
            currentGain = Math.max(targetGain, currentGain - 1.0 / releaseFrames);
        }
        
        // Apply gain to frame
        var offset = frame * frameSize;
        for (var s = 0; s < frameSize && (offset + s) < samples.length; s++) {
            gated[offset + s] = samples[offset + s] * currentGain;
        }
    }
    
    return gated;
}

/**
 * Full pre-processing pipeline
 */
function preprocess(samples, sampleRate, options) {
    options = options || {};
    
    // Step 1: High-pass filter (remove rumble)
    var filtered = options.highPass !== false 
        ? highPassFilter(samples, sampleRate, options.highPassCutoff || 80)
        : samples;
    
    // Step 2: Noise gate (remove silence/noise floor)
    var gated = options.noiseGate !== false
        ? noiseGate(filtered, sampleRate, options.frameMs || 10)
        : filtered;
    
    // Step 3: Normalize (consistent levels)
    var normalized = options.normalize !== false
        ? normalize(gated, options.targetPeak || 0.5)
        : gated;
    
    return normalized;
}

module.exports = {
    highPassFilter: highPassFilter,
    normalize: normalize,
    noiseGate: noiseGate,
    preprocess: preprocess
};