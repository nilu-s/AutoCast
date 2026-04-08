/**
 * AutoCast - Voice Activity Detection Gate
 *
 * Per-track noise gate with adaptive thresholding, attack/release,
 * and hold/hangover logic.
 */

'use strict';

var rmsCalc = require('../energy/rms_calculator');

/**
 * Default VAD parameters
 */
var VAD_DEFAULTS = {
    /** Threshold in dB above estimated floor. Higher = stricter gate. */
    thresholdAboveFloorDb: 9,
    /** Absolute minimum threshold in dBFS. */
    absoluteThresholdDb: -50,
    /** Attack in frames (10 ms default frame -> 2 = 20 ms). */
    attackFrames: 2,
    /** Release in frames. */
    releaseFrames: 4,
    /** Hold in frames. */
    holdFrames: 16,
    /** Require this long below close-threshold before actually closing (ms). */
    closeConfirmMs: 0,
    /** Dynamically adapt close-confirm time by how far below threshold the frame is. */
    closeConfirmDynamic: false,
    /** Lower bound for dynamic close-confirm time (ms). */
    closeConfirmMinMs: 200,
    /** Upper bound for dynamic close-confirm time (ms). */
    closeConfirmMaxMs: 1800,
    /** dB range used to interpolate dynamic close-confirm time. */
    closeConfirmDynamicSlopeDb: 10,
    /** RMS smoothing in frames. */
    smoothingWindow: 5,
    /** Hysteresis in dB. */
    hysteresisDb: 2,
    /** Frame duration used to derive adaptive floor windows. */
    frameDurationMs: 10,
    /** Enable local floor tracking to reduce noise-floor drift false positives. */
    adaptiveNoiseFloor: false,
    /** Rolling local floor window size in ms (used when adaptiveNoiseFloor=true). */
    localNoiseWindowMs: 1200,
    /** Recompute local floor every N ms (used when adaptiveNoiseFloor=true). */
    noiseFloorUpdateMs: 200,
    /** Percentile in local window used as floor candidate (used when adaptiveNoiseFloor=true). */
    localNoisePercentile: 0.15,
    /** Max rise in dB above global floor for adaptive local floor. */
    maxAdaptiveFloorRiseDb: 8,
    /** Include per-frame arrays useful for analyzer diagnostics. */
    debugMode: false,
    /** Hard cut very low-level frames unless nearby strong peaks exist. */
    enableHardSilenceCut: true,
    /** Frames below this dBFS are candidates for forced cut. */
    hardSilenceCutDb: -51,
    /** Keep context around peaks before forcing low-level cuts. */
    hardSilenceLookaroundMs: 220,
    /** Required peak gap (dB) to consider a nearby frame "explicitly louder". */
    hardSilencePeakDeltaDb: 8
};

/**
 * Run VAD on a single track's RMS profile.
 *
 * @param {Float64Array} rmsArray - RMS per frame for this track
 * @param {object} [params] - Override defaults (see VAD_DEFAULTS)
 * @returns {{
 *   gateOpen: Uint8Array,       // 1=active, 0=inactive per frame
 *   thresholdLinear: number,    // Representative threshold (linear)
 *   noiseFloorDb: number,       // Global noise floor estimate
 *   thresholdDb: number         // Representative threshold (dBFS)
 * }}
 */
function detectActivity(rmsArray, params) {
    params = mergeDefaults(params, VAD_DEFAULTS);
    var frameDurationMs = params.frameDurationMs || 10;

    // 1) Smooth RMS to reduce micro-fluctuations.
    var smoothed = rmsCalc.smoothRMS(rmsArray, params.smoothingWindow);
    var frameCount = smoothed.length;

    // 2) Global floor estimate.
    var noiseInfo = rmsCalc.estimateNoiseFloor(rmsArray);

    // 3) Build per-frame floor (global baseline + optional local drift tracking).
    var floorByFrame = buildFloorByFrame(smoothed, noiseInfo, params, frameDurationMs);

    // 4) Compute per-frame thresholds and hysteresis gate decisions.
    var hysteresisDb = (params.hysteresisDb !== undefined) ? params.hysteresisDb : 4;
    var openThresholdByFrame = new Float64Array(frameCount);
    var closeThresholdByFrame = new Float64Array(frameCount);
    var rawGate = new Uint8Array(frameCount);
    var gateCurrentlyOpen = false;
    var closeConfirmFrames = Math.max(1, Math.round((params.closeConfirmMs || 0) / frameDurationMs));
    var dynamicCloseConfirm = !!params.closeConfirmDynamic;
    var closeConfirmMinMs = Math.max(50, params.closeConfirmMinMs || params.closeConfirmMs || 200);
    var closeConfirmMaxMs = Math.max(closeConfirmMinMs, params.closeConfirmMaxMs || params.closeConfirmMs || 1800);
    var closeConfirmSlopeDb = Math.max(1, params.closeConfirmDynamicSlopeDb || 10);
    var belowCloseCounter = 0;

    for (var i = 0; i < frameCount; i++) {
        var floorDb = rmsCalc.linearToDb(floorByFrame[i]);
        if (!isFinite(floorDb)) floorDb = noiseInfo.noiseFloorDb;

        var openThresholdDb = Math.max(
            floorDb + params.thresholdAboveFloorDb,
            params.absoluteThresholdDb
        );
        var closeThresholdDb = openThresholdDb - hysteresisDb;
        var openThresholdLinear = rmsCalc.dbToLinear(openThresholdDb);
        var closeThresholdLinear = rmsCalc.dbToLinear(closeThresholdDb);

        openThresholdByFrame[i] = openThresholdLinear;
        closeThresholdByFrame[i] = closeThresholdLinear;

        if (!gateCurrentlyOpen) {
            // Closed -> only open above open threshold.
            if (smoothed[i] >= openThresholdLinear) {
                gateCurrentlyOpen = true;
                belowCloseCounter = 0;
            }
        } else {
            // Open -> only close after sustained period below close threshold.
            if (smoothed[i] < closeThresholdLinear) {
                belowCloseCounter++;
                var requiredCloseFrames = closeConfirmFrames;
                if (dynamicCloseConfirm) {
                    var curDb = rmsCalc.linearToDb(Math.max(smoothed[i], 1e-12));
                    var closeDb = rmsCalc.linearToDb(Math.max(closeThresholdLinear, 1e-12));
                    var belowByDb = Math.max(0, closeDb - curDb);
                    var t = clamp(belowByDb / closeConfirmSlopeDb, 0, 1);
                    var dynamicMs = closeConfirmMaxMs - t * (closeConfirmMaxMs - closeConfirmMinMs);
                    requiredCloseFrames = Math.max(1, Math.round(dynamicMs / frameDurationMs));
                }
                if (belowCloseCounter >= requiredCloseFrames) {
                    gateCurrentlyOpen = false;
                    belowCloseCounter = 0;
                }
            } else {
                belowCloseCounter = 0;
            }
        }
        rawGate[i] = gateCurrentlyOpen ? 1 : 0;
    }

    // 5) Temporal stabilization.
    var afterAttack = applyAttack(rawGate, params.attackFrames);
    var afterHold = applyHold(afterAttack, params.holdFrames);
    var finalGate = applyRelease(afterHold, params.releaseFrames);
    finalGate = applyHardSilenceCut(
        finalGate,
        smoothed,
        frameDurationMs,
        params
    );

    var representativeThresholdDb = sampleRepresentativeDb(openThresholdByFrame);

    var result = {
        gateOpen: finalGate,
        thresholdLinear: rmsCalc.dbToLinear(representativeThresholdDb),
        noiseFloorDb: noiseInfo.noiseFloorDb,
        thresholdDb: representativeThresholdDb
    };

    if (params.debugMode) {
        result.debug = {
            smoothedRms: smoothed,
            noiseFloorLinearByFrame: floorByFrame,
            openThresholdLinearByFrame: openThresholdByFrame,
            closeThresholdLinearByFrame: closeThresholdByFrame,
            rawGate: rawGate,
            gateAfterAttack: afterAttack,
            gateAfterHold: afterHold
        };
    }

    return result;
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
    for (var j = rawGate.length - 1; j >= 0; j--) {
        if (result[j]) {
            gateIsOpen = true;
        } else if (!rawGate[j]) {
            gateIsOpen = false;
        }
        if (gateIsOpen && rawGate[j]) {
            result[j] = 1;
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



function sampleRepresentativeDb(linearValues) {
    if (!linearValues || linearValues.length === 0) return -Infinity;

    var step = Math.max(1, Math.floor(linearValues.length / 200));
    var sum = 0;
    var count = 0;

    for (var i = 0; i < linearValues.length; i += step) {
        var db = rmsCalc.linearToDb(linearValues[i]);
        if (isFinite(db)) {
            sum += db;
            count++;
        }
    }

    return count > 0 ? (sum / count) : -Infinity;
}

function createFilledArray(length, value) {
    var out = new Float64Array(length);
    for (var i = 0; i < length; i++) out[i] = value;
    return out;
}

function buildFloorByFrame(smoothedRms, noiseInfo, params, frameDurationMs) {
    var frameCount = smoothedRms.length;
    if (!params.adaptiveNoiseFloor || frameCount <= 0) {
        return createFilledArray(frameCount, noiseInfo.noiseFloorLinear);
    }

    var floor = new Float64Array(frameCount);
    var windowFrames = Math.max(10, Math.round((params.localNoiseWindowMs || 1200) / Math.max(1, frameDurationMs)));
    var updateFrames = Math.max(1, Math.round((params.noiseFloorUpdateMs || 200) / Math.max(1, frameDurationMs)));
    var percentile = clamp(params.localNoisePercentile !== undefined ? params.localNoisePercentile : 0.15, 0.01, 0.5);
    var baseDb = noiseInfo.noiseFloorDb;
    var maxRiseDb = Math.max(0, params.maxAdaptiveFloorRiseDb !== undefined ? params.maxAdaptiveFloorRiseDb : 8);
    var maxDb = baseDb + maxRiseDb;
    var currentFloorLinear = noiseInfo.noiseFloorLinear;

    for (var i = 0; i < frameCount; i++) {
        if (i === 0 || (i % updateFrames) === 0) {
            var start = Math.max(0, i - windowFrames + 1);
            var candidateLinear = percentileInRange(smoothedRms, start, i + 1, percentile, noiseInfo.noiseFloorLinear);
            var medianLinear = percentileInRange(smoothedRms, start, i + 1, 0.5, noiseInfo.noiseFloorLinear);
            var candidateDb = rmsCalc.linearToDb(Math.max(candidateLinear, 1e-12));
            var medianDb = rmsCalc.linearToDb(Math.max(medianLinear, 1e-12));
            if (!isFinite(candidateDb)) candidateDb = baseDb;
            if (isFinite(medianDb)) {
                // When the local distribution drifts up, follow the median conservatively.
                candidateDb = Math.max(candidateDb, medianDb - 2);
            }
            candidateDb = clamp(candidateDb, baseDb, maxDb);
            currentFloorLinear = rmsCalc.dbToLinear(candidateDb);
        }
        floor[i] = currentFloorLinear;
    }

    return floor;
}

function percentileInRange(arr, start, endExclusive, percentile, fallback) {
    var values = [];
    for (var i = start; i < endExclusive; i++) {
        var v = arr[i];
        if (!(v > 0) || !isFinite(v)) continue;
        values.push(v);
    }
    if (values.length === 0) return fallback;
    values.sort(function (a, b) { return a - b; });
    var idx = Math.floor(clamp(percentile, 0, 1) * (values.length - 1));
    return values[idx];
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function applyHardSilenceCut(gateArray, smoothedRms, frameDurationMs, params) {
    if (!params.enableHardSilenceCut) return gateArray;
    if (!gateArray || gateArray.length === 0) return gateArray;

    var cutLinear = rmsCalc.dbToLinear(params.hardSilenceCutDb !== undefined ? params.hardSilenceCutDb : -51);
    var lookFrames = Math.max(1, Math.round((params.hardSilenceLookaroundMs || 220) / (frameDurationMs || 10)));
    var peakFactor = rmsCalc.dbToLinear(params.hardSilencePeakDeltaDb !== undefined ? params.hardSilencePeakDeltaDb : 8);

    var out = new Uint8Array(gateArray.length);
    out.set(gateArray);

    for (var i = 0; i < gateArray.length; i++) {
        if (!out[i]) continue;
        var cur = smoothedRms[i];
        if (!(cur > 0) || cur >= cutLinear) continue;

        var requiredPeak = cur * peakFactor;
        var foundLouderNearby = false;

        var start = Math.max(0, i - lookFrames);
        var end = Math.min(gateArray.length - 1, i + lookFrames);
        for (var j = start; j <= end; j++) {
            if (j === i) continue;
            if (smoothedRms[j] >= requiredPeak) {
                foundLouderNearby = true;
                break;
            }
        }

        if (!foundLouderNearby) {
            out[i] = 0;
        }
    }

    return out;
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

