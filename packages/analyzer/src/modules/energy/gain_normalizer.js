/**
 * AutoCast – Auto-Gain Normalizer
 * 
 * Normalizes track volumes before analysis so that quiet speakers
 * are treated fairly. Works by computing each track's median RMS
 * and applying a gain multiplier to equalize them.
 * 
 * This does NOT modify the original audio – it adjusts the RMS
 * profile used for VAD so that thresholds work consistently
 * across tracks with different recording levels.
 */

'use strict';

var rmsCalc = require('./rms_calculator');

/**
 * Compute gain multipliers to normalize all tracks to the same median level.
 * 
 * @param {Array<Float64Array>} rmsProfiles - RMS arrays per track
 * @returns {{ gains: Array<number>, medians: Array<number>, targetMedian: number }}
 */
function computeGainMatching(rmsProfiles) {
    var trackCount = rmsProfiles.length;
    var medians = [];

    for (var t = 0; t < trackCount; t++) {
        if (!rmsProfiles[t]) {
            medians.push(0);
            continue;
        }
        var noiseInfo = rmsCalc.estimateNoiseFloor(rmsProfiles[t]);

        // Use the 70th percentile as "typical speech level"
        // (above noise, below peaks)
        var values = [];
        for (var i = 0; i < rmsProfiles[t].length; i++) {
            if (rmsProfiles[t][i] > noiseInfo.noiseFloorLinear * 2) {
                values.push(rmsProfiles[t][i]);
            }
        }

        if (values.length === 0) {
            medians.push(0);
            continue;
        }

        values.sort(function (a, b) { return a - b; });
        var p70Idx = Math.floor(values.length * 0.70);
        medians.push(values[p70Idx]);
    }

    // Target = geometric mean of all medians (avoids bias toward loud tracks)
    var validMedians = medians.filter(function (m) { return m > 0; });
    var targetMedian;

    if (validMedians.length === 0) {
        targetMedian = 0.01;
    } else {
        var logSum = 0;
        for (var i = 0; i < validMedians.length; i++) {
            logSum += Math.log(validMedians[i]);
        }
        targetMedian = Math.exp(logSum / validMedians.length);
    }

    // Compute gain multiplier per track
    var gains = [];
    for (var t = 0; t < trackCount; t++) {
        if (medians[t] <= 0) {
            gains.push(1.0); // Silent track, no adjustment
        } else {
            var gain = targetMedian / medians[t];
            // Clamp to ±18 dB (factor 8.0 / 0.126).
            // ±12 dB was too narrow – a quiet speaker more than 12 dB below
            // reference would not be fully normalised, leaving their signal
            // below the VAD threshold even after gain matching.
            gain = Math.max(0.126, Math.min(8.0, gain));
            gains.push(gain);
        }
    }

    return {
        gains: gains,
        medians: medians,
        targetMedian: targetMedian,
        gainsDb: gains.map(function (g) { return Math.round(rmsCalc.linearToDb(g) * 10) / 10; })
    };
}

/**
 * Apply gain normalization to RMS profiles.
 * Returns new arrays (does not mutate originals).
 * 
 * @param {Array<Float64Array>} rmsProfiles 
 * @param {Array<number>} gains 
 * @returns {Array<Float64Array>}
 */
function applyGainToRMS(rmsProfiles, gains) {
    var result = [];
    for (var t = 0; t < rmsProfiles.length; t++) {
        if (!rmsProfiles[t]) {
            result.push(null);
            continue;
        }
        var gain = gains[t];
        var normalized = new Float64Array(rmsProfiles[t].length);
        for (var i = 0; i < rmsProfiles[t].length; i++) {
            normalized[i] = rmsProfiles[t][i] * gain;
        }
        result.push(normalized);
    }
    return result;
}

module.exports = {
    computeGainMatching: computeGainMatching,
    applyGainToRMS: applyGainToRMS
};
