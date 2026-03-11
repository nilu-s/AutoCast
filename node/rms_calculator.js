/**
 * AutoCast – RMS Energy Calculator
 * 
 * Computes per-frame RMS (Root Mean Square) energy from audio samples.
 * Used as the basis for voice activity detection.
 */

'use strict';

/**
 * Calculate RMS energy per frame.
 * @param {Float32Array} samples - Normalized audio samples [-1, 1]
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} [frameDurationMs=10] - Frame size in milliseconds
 * @returns {{ rms: Float64Array, peak: Float64Array, frameCount: number, frameDurationMs: number }}
 */
function calculateRMS(samples, sampleRate, frameDurationMs) {
    frameDurationMs = frameDurationMs || 10;

    var frameSize = Math.round((frameDurationMs / 1000) * sampleRate);
    var frameCount = Math.floor(samples.length / frameSize);

    var rms = new Float64Array(frameCount);
    var peak = new Float64Array(frameCount);

    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;
        var sumSq = 0;
        var maxAbs = 0;

        for (var s = 0; s < frameSize; s++) {
            var val = samples[offset + s];
            sumSq += val * val;
            var absVal = Math.abs(val);
            if (absVal > maxAbs) maxAbs = absVal;
        }

        rms[f] = Math.sqrt(sumSq / frameSize);
        peak[f] = maxAbs;
    }

    return {
        rms: rms,
        peak: peak,
        frameCount: frameCount,
        frameDurationMs: frameDurationMs
    };
}

/**
 * Convert linear RMS value to dBFS.
 * @param {number} linear - Linear RMS value (0 to 1)
 * @returns {number} dBFS value (negative, -Infinity for silence)
 */
function linearToDb(linear) {
    if (linear <= 0) return -Infinity;
    return 20 * Math.log10(linear);
}

/**
 * Convert dBFS to linear multiplier.
 * @param {number} db - dBFS value
 * @returns {number} Linear value (0 to 1)
 */
function dbToLinear(db) {
    if (db <= -150) return 0; // Treat as silence
    return Math.pow(10, db / 20);
}

/**
 * Smooth RMS array with a simple moving average.
 * @param {Float64Array} rmsArray - Raw RMS values
 * @param {number} windowSize - Number of frames to average over
 * @returns {Float64Array} Smoothed RMS values
 */
function smoothRMS(rmsArray, windowSize) {
    if (windowSize <= 1) return rmsArray;

    var result = new Float64Array(rmsArray.length);
    var halfWin = Math.floor(windowSize / 2);
    var sum = 0;
    var count = 0;

    // Initialize window
    for (var i = 0; i < Math.min(halfWin + 1, rmsArray.length); i++) {
        sum += rmsArray[i];
        count++;
    }

    for (var f = 0; f < rmsArray.length; f++) {
        // Add right edge
        var rightIdx = f + halfWin + 1;
        if (rightIdx < rmsArray.length) {
            sum += rmsArray[rightIdx];
            count++;
        }
        // Remove left edge
        var leftIdx = f - halfWin;
        if (leftIdx > 0) {
            sum -= rmsArray[leftIdx - 1];
            count--;
        }

        result[f] = sum / count;
    }

    return result;
}

/**
 * Estimate noise floor of a track (lowest 10th percentile of non-zero RMS).
 * Used to set per-track adaptive thresholds.
 * @param {Float64Array} rmsArray - RMS values per frame
 * @returns {{ noiseFloorLinear: number, noiseFloorDb: number, medianRms: number, dynamicRangeDb: number }}
 */
function estimateNoiseFloor(rmsArray) {
    // Collect non-zero values and sort
    var values = [];
    for (var i = 0; i < rmsArray.length; i++) {
        if (rmsArray[i] > 1e-10) { // Skip true silence
            values.push(rmsArray[i]);
        }
    }

    if (values.length === 0) {
        return {
            noiseFloorLinear: 0,
            noiseFloorDb: -Infinity,
            medianRms: 0,
            dynamicRangeDb: 0
        };
    }

    values.sort(function (a, b) { return a - b; });

    // 5th percentile = noise floor estimate
    // Using 5% instead of 10% makes the floor more conservative – mic bleed
    // (which sits between true silence and active speech) is less likely to
    // inflate the floor estimate, which in turn keeps the VAD threshold high
    // enough to suppress bleed on idle tracks.
    var p5Idx = Math.floor(values.length * 0.05);
    var noiseFloor = values[p5Idx];

    // Median = typical level (useful for dynamic-range checks)
    var medianIdx = Math.floor(values.length * 0.50);
    var median = values[medianIdx];

    return {
        noiseFloorLinear: noiseFloor,
        noiseFloorDb: linearToDb(noiseFloor),
        medianRms: median,
        dynamicRangeDb: linearToDb(median) - linearToDb(noiseFloor)
    };
}

module.exports = {
    calculateRMS: calculateRMS,
    linearToDb: linearToDb,
    dbToLinear: dbToLinear,
    smoothRMS: smoothRMS,
    estimateNoiseFloor: estimateNoiseFloor
};
