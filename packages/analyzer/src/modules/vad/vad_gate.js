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
    absoluteThresholdDb: -56,
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
    /** Enable local, rolling floor adaptation. */
    adaptiveNoiseFloor: true,
    /** Rolling floor window size. */
    localNoiseWindowMs: 1800,
    /** How often to recompute the local floor. */
    noiseFloorUpdateMs: 500,
    /** Quantile for local floor estimation. */
    localNoisePercentile: 0.15,
    /** Sub-sampling stride for local floor percentile windows (performance). */
    localNoiseSampleStride: 2,
    /** Maximum floor rise above global floor (in dB). */
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

    // 3) Per-frame adaptive floor (optional), bounded against global floor.
    var floorByFrame = createFilledArray(frameCount, noiseInfo.noiseFloorLinear);
    if (params.adaptiveNoiseFloor && frameCount > 0) {
        floorByFrame = estimateAdaptiveNoiseFloor(smoothed, noiseInfo.noiseFloorLinear, {
            frameDurationMs: frameDurationMs,
            localNoiseWindowMs: params.localNoiseWindowMs,
            noiseFloorUpdateMs: params.noiseFloorUpdateMs,
            localNoisePercentile: params.localNoisePercentile,
            maxAdaptiveFloorRiseDb: params.maxAdaptiveFloorRiseDb,
            localNoiseSampleStride: params.localNoiseSampleStride
        });
    }

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

function estimateAdaptiveNoiseFloor(smoothedRms, globalFloorLinear, cfg) {
    var len = smoothedRms.length;
    var floors = new Float64Array(len);
    if (len === 0) return floors;

    var frameDurationMs = cfg.frameDurationMs || 10;
    var windowFrames = Math.max(8, Math.round((cfg.localNoiseWindowMs || 1500) / frameDurationMs));
    var updateFrames = Math.max(1, Math.round((cfg.noiseFloorUpdateMs || 250) / frameDurationMs));
    var percentile = clamp(cfg.localNoisePercentile, 0.05, 0.40);
    var sampleStride = Math.max(1, Math.floor(cfg.localNoiseSampleStride || 1));
    var maxRiseDb = (cfg.maxAdaptiveFloorRiseDb !== undefined) ? cfg.maxAdaptiveFloorRiseDb : 8;

    var globalDb = rmsCalc.linearToDb(globalFloorLinear);
    if (!isFinite(globalDb)) globalDb = -Infinity;

    var anchorFrames = [];
    var anchorFloors = [];
    var halfWindow = Math.floor(windowFrames / 2);

    for (var center = 0; center < len; center += updateFrames) {
        var start = Math.max(0, center - halfWindow);
        var end = Math.min(len, center + halfWindow + 1);
        var localFloor = computeWindowPercentile(
            smoothedRms,
            start,
            end,
            percentile,
            globalFloorLinear,
            sampleStride
        );
        var localDb = rmsCalc.linearToDb(localFloor);
        if (!isFinite(localDb)) localDb = globalDb;
        if (isFinite(globalDb)) {
            localDb = Math.max(globalDb, Math.min(localDb, globalDb + maxRiseDb));
        }
        anchorFrames.push(center);
        anchorFloors.push(rmsCalc.dbToLinear(localDb));
    }

    if (anchorFrames.length === 0 || anchorFrames[anchorFrames.length - 1] !== (len - 1)) {
        var lastStart = Math.max(0, (len - 1) - halfWindow);
        var lastEnd = len;
        var lastFloor = computeWindowPercentile(
            smoothedRms,
            lastStart,
            lastEnd,
            percentile,
            globalFloorLinear,
            sampleStride
        );
        var lastDb = rmsCalc.linearToDb(lastFloor);
        if (!isFinite(lastDb)) lastDb = globalDb;
        if (isFinite(globalDb)) {
            lastDb = Math.max(globalDb, Math.min(lastDb, globalDb + maxRiseDb));
        }
        anchorFrames.push(len - 1);
        anchorFloors.push(rmsCalc.dbToLinear(lastDb));
    }

    var anchorIdx = 0;
    for (var i = 0; i < len; i++) {
        while (anchorIdx < anchorFrames.length - 2 && i > anchorFrames[anchorIdx + 1]) {
            anchorIdx++;
        }

        var leftFrame = anchorFrames[anchorIdx];
        var rightFrame = anchorFrames[Math.min(anchorIdx + 1, anchorFrames.length - 1)];
        var leftFloor = anchorFloors[anchorIdx];
        var rightFloor = anchorFloors[Math.min(anchorIdx + 1, anchorFloors.length - 1)];

        if (rightFrame <= leftFrame) {
            floors[i] = leftFloor;
        } else {
            var t = (i - leftFrame) / (rightFrame - leftFrame);
            floors[i] = leftFloor + (rightFloor - leftFloor) * t;
        }
    }

    return floors;
}

function computeWindowPercentile(values, start, end, percentile, fallback, stride) {
    stride = Math.max(1, stride || 1);
    var window = [];
    for (var i = start; i < end; i += stride) {
        var v = values[i];
        if (v > 1e-12) window.push(v);
    }

    if (window.length === 0) return fallback || 0;

    window.sort(function (a, b) { return a - b; });
    var idx = Math.floor((window.length - 1) * percentile);
    if (idx < 0) idx = 0;
    if (idx >= window.length) idx = window.length - 1;
    return window[idx];
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

