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
    absoluteThresholdDb: -45,
    /** Attack time in frames – gate opens this many frames after signal exceeds threshold.
     *  3 frames = 30ms at 10ms frame size, filters out click/knock transients. */
    attackFrames: 3,
    /** Release time in frames – gate stays open this many frames after signal drops */
    releaseFrames: 5,
    /** Hold time in frames – minimum time gate stays open once triggered */
    holdFrames: 30,
    /** Smoothing window for RMS (frames) before gating. Reduces flutter. */
    smoothingWindow: 5,
    /** Hysteresis in dB: gate opens at threshold, but only closes once signal drops
     *  this many dB below threshold. Prevents gate chatter near the boundary.
     *  Keep low (2 dB) so quiet speakers are not permanently locked out. */
    hysteresisDb: 2
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

    // --- 3. Compute adaptive threshold (with hysteresis) ---
    // Open threshold: signal must rise ABOVE this to open the gate
    // Close threshold: signal must fall BELOW this to close the gate
    // Hysteresis prevents chatter when signal hovers right at the boundary
    // (typical for mic bleed which sits just below/at the threshold).
    var openThresholdDb = Math.max(
        noiseInfo.noiseFloorDb + params.thresholdAboveFloorDb,
        params.absoluteThresholdDb
    );
    var hysteresisDb = (params.hysteresisDb !== undefined) ? params.hysteresisDb : 4;
    var closeThresholdDb = openThresholdDb - hysteresisDb;

    var openThresholdLinear  = rmsCalc.dbToLinear(openThresholdDb);
    var closeThresholdLinear = rmsCalc.dbToLinear(closeThresholdDb);

    // --- 4. Hysteresis gate decision ---
    var frameCount = smoothed.length;
    var rawGate = new Uint8Array(frameCount);
    var gateCurrentlyOpen = false;

    for (var i = 0; i < frameCount; i++) {
        if (!gateCurrentlyOpen) {
            // Gate is closed: open only when signal rises ABOVE open threshold
            if (smoothed[i] >= openThresholdLinear) {
                gateCurrentlyOpen = true;
            }
        } else {
            // Gate is open: close only when signal falls BELOW close threshold
            if (smoothed[i] < closeThresholdLinear) {
                gateCurrentlyOpen = false;
            }
        }
        rawGate[i] = gateCurrentlyOpen ? 1 : 0;
    }

    // --- 5. Apply attack (delay opening) ---
    var afterAttack = applyAttack(rawGate, params.attackFrames);

    // --- 6. Apply hold (keep open for minimum duration) ---
    var afterHold = applyHold(afterAttack, params.holdFrames);

    // --- 7. Apply release (delay closing) ---
    var finalGate = applyRelease(afterHold, params.releaseFrames);

    return {
        gateOpen: finalGate,
        thresholdLinear: openThresholdLinear,
        noiseFloorDb: noiseInfo.noiseFloorDb,
        thresholdDb: openThresholdDb
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
