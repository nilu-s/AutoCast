/**
 * AutoCast – Voice Activity Detection Gate
 * 
 * Per-track noise gate with adaptive threshold, attack/release,
 * and hold/hangover logic. Designed to handle microphone bleed
 * in multi-person podcast recordings in the same room.
 */

'use strict';

var rmsCalc = require('./rms_calculator');

/**
 * Default VAD parameters
 */
var VAD_DEFAULTS = {
    /** Threshold in dB above per-track noise floor. Higher = more aggressive gating. */
    thresholdAboveFloorDb: 12,
    /** Absolute minimum threshold in dBFS. Prevents opening gate on near-silence. */
    absoluteThresholdDb: -50,
    /** Attack time in frames – gate opens this many frames after signal exceeds threshold */
    attackFrames: 2,
    /** Release time in frames – gate stays open this many frames after signal drops */
    releaseFrames: 5,
    /** Hold time in frames – minimum time gate stays open once triggered */
    holdFrames: 30,
    /** Smoothing window for RMS (frames) before gating. Reduces flutter. */
    smoothingWindow: 5
};

/**
 * Run VAD on a single track's RMS profile.
 * 
 * @param {Float64Array} rmsArray - RMS per frame for this track
 * @param {object} [params] - Override defaults (see VAD_DEFAULTS)
 * @returns {{ 
 *   gateOpen: Uint8Array,       // 1=active, 0=inactive per frame
 *   thresholdLinear: number,    // Computed threshold in linear
 *   noiseFloorDb: number,       // Estimated noise floor
 *   thresholdDb: number         // Effective threshold
 * }}
 */
function detectActivity(rmsArray, params) {
    params = mergeDefaults(params, VAD_DEFAULTS);

    // --- 1. Smooth RMS to reduce micro-fluctuations ---
    var smoothed = rmsCalc.smoothRMS(rmsArray, params.smoothingWindow);

    // --- 2. Estimate per-track noise floor ---
    var noiseInfo = rmsCalc.estimateNoiseFloor(rmsArray);

    // --- 3. Compute adaptive threshold ---
    // Threshold = noise floor + X dB (relative to each track's own noise)
    var thresholdDb = Math.max(
        noiseInfo.noiseFloorDb + params.thresholdAboveFloorDb,
        params.absoluteThresholdDb
    );
    var thresholdLinear = rmsCalc.dbToLinear(thresholdDb);

    // --- 4. Raw gate decision (binary) ---
    var frameCount = smoothed.length;
    var rawGate = new Uint8Array(frameCount);

    for (var i = 0; i < frameCount; i++) {
        rawGate[i] = smoothed[i] >= thresholdLinear ? 1 : 0;
    }

    // --- 5. Apply attack (delay opening) ---
    var afterAttack = applyAttack(rawGate, params.attackFrames);

    // --- 6. Apply hold (keep open for minimum duration) ---
    var afterHold = applyHold(afterAttack, params.holdFrames);

    // --- 7. Apply release (delay closing) ---
    var finalGate = applyRelease(afterHold, params.releaseFrames);

    return {
        gateOpen: finalGate,
        thresholdLinear: thresholdLinear,
        noiseFloorDb: noiseInfo.noiseFloorDb,
        thresholdDb: thresholdDb
    };
}

/**
 * Apply attack: gate only opens after N consecutive frames above threshold.
 */
function applyAttack(rawGate, attackFrames) {
    if (attackFrames <= 1) return rawGate;

    var result = new Uint8Array(rawGate.length);
    var consecutiveOn = 0;

    for (var i = 0; i < rawGate.length; i++) {
        if (rawGate[i]) {
            consecutiveOn++;
            if (consecutiveOn >= attackFrames) {
                result[i] = 1;
            }
        } else {
            consecutiveOn = 0;
        }
    }

    // Backfill: when attack condition met, open the gate from the start of the burst
    var gateIsOpen = false;
    for (var i = rawGate.length - 1; i >= 0; i--) {
        if (result[i]) {
            gateIsOpen = true;
        } else if (!rawGate[i]) {
            gateIsOpen = false;
        }
        if (gateIsOpen && rawGate[i]) {
            result[i] = 1;
        }
    }

    return result;
}

/**
 * Apply hold: once gate opens, keep it open for at least holdFrames.
 */
function applyHold(gateArray, holdFrames) {
    if (holdFrames <= 1) return gateArray;

    var result = new Uint8Array(gateArray.length);
    var holdCounter = 0;

    for (var i = 0; i < gateArray.length; i++) {
        if (gateArray[i]) {
            result[i] = 1;
            holdCounter = holdFrames;
        } else if (holdCounter > 0) {
            result[i] = 1;
            holdCounter--;
        }
    }

    return result;
}

/**
 * Apply release: gate stays open for N frames after signal drops.
 * (Similar to hold but applied after hold processing)
 */
function applyRelease(gateArray, releaseFrames) {
    if (releaseFrames <= 1) return gateArray;

    var result = new Uint8Array(gateArray.length);
    var releaseCounter = 0;

    for (var i = 0; i < gateArray.length; i++) {
        if (gateArray[i]) {
            result[i] = 1;
            releaseCounter = releaseFrames;
        } else if (releaseCounter > 0) {
            result[i] = 1;
            releaseCounter--;
        }
    }

    return result;
}

/**
 * Merge user params with defaults
 */
function mergeDefaults(userParams, defaults) {
    var result = {};
    for (var key in defaults) {
        if (defaults.hasOwnProperty(key)) {
            result[key] = (userParams && userParams[key] !== undefined) ? userParams[key] : defaults[key];
        }
    }
    return result;
}

module.exports = {
    detectActivity: detectActivity,
    VAD_DEFAULTS: VAD_DEFAULTS
};
