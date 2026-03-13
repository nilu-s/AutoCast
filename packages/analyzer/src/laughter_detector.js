/**
 * AutoCast - Laughter Detector
 *
 * Lightweight heuristic detector for per-frame laughter confidence.
 * Goals:
 * - keep voiced/unvoiced laugh bursts
 * - suppress isolated transients (e.g. table knocks)
 */

'use strict';

var rmsCalc = require('./rms_calculator');

var LAUGHTER_FEATURE_DEFAULTS = {
    minEnergyAboveFloorDb: 5.5,
    absoluteFloorDb: -58.0,
    zcrMin: 0.03,
    zcrMax: 0.24,
    modulationWindowMs: 420,
    continuityWindowMs: 220,
    crestMin: 1.8,
    crestMax: 6.8,
    spreadMin: 0.08,
    spreadMax: 0.72,
    sampleSpreadPeakRatio: 0.22,
    impulseCrestMin: 7.2,
    impulseCrestMax: 14.0,
    transientRiseDb: 7.0,
    transientFallDb: 6.0,
    energyWeight: 0.40,
    zcrWeight: 0.18,
    modulationWeight: 0.16,
    crestWeight: 0.13,
    spreadWeight: 0.18,
    continuityWeight: 0.05,
    transientPenaltyWeight: 0.34
};

var LAUGHTER_RESCUE_DEFAULTS = {
    minConfidence: 0.50,
    holdFrames: 10,
    absoluteFloorDb: -58.0,
    minRelativeToThresholdDb: -10.0,
    thresholdLinear: 0,
    minStreakFrames: 2,
    streakWindowFrames: 5,
    baseSupportWindowFrames: 8,
    minBaseSupportFrames: 2,
    returnDebug: false
};

var LAUGHTER_CONTINUITY_DEFAULTS = {
    edgeMinConfidence: 0.40,
    gapMinConfidence: 0.36,
    maxGapFrames: 18,
    longGapMaxFrames: 75,
    longGapMinConfidence: 0.24,
    longGapMinCoverage: 0.60,
    longGapEdgeMinConfidence: 0.44,
    maxEdgeExtendFrames: 24,
    minGapCoverage: 0.45,
    minGapHits: 2,
    absoluteFloorDb: -58.0,
    minRelativeToThresholdDb: -10.0,
    thresholdLinear: 0,
    baseSupportWindowFrames: 8,
    minBaseSupportFrames: 2,
    transientPenalty: null,
    maxTransientPenalty: 0.70,
    returnDebug: false
};

var LAUGHTER_BURST_REINFORCE_DEFAULTS = {
    seedMinConfidence: 0.52,
    extendMinConfidence: 0.34,
    relativeWindowFrames: 45,
    relativeSeedDelta: 0.08,
    relativeSeedMinConfidence: 0.24,
    relativeExtendDelta: 0.04,
    relativeExtendMinConfidence: 0.18,
    targetMinFrames: 26,
    maxSeedGapFrames: 10,
    maxSideExtendFrames: 22,
    absoluteFloorDb: -64.0,
    minRelativeToThresholdDb: -12.0,
    thresholdLinear: 0,
    baseSupportWindowFrames: 8,
    minBaseSupportFrames: 2,
    maxTransientPenalty: 0.62,
    transientPenalty: null,
    returnDebug: false
};

function computeLaughterConfidence(samples, sampleRate, frameDurationMs, options) {
    options = mergeDefaults(options, LAUGHTER_FEATURE_DEFAULTS);
    frameDurationMs = frameDurationMs || 10;

    var frameSize = Math.round((frameDurationMs / 1000) * sampleRate);
    var frameCount = frameSize > 0 ? Math.floor(samples.length / frameSize) : 0;

    var confidence = new Float64Array(frameCount);
    var rmsByFrame = new Float64Array(frameCount);
    var zcrByFrame = new Float64Array(frameCount);
    var crestByFrame = new Float64Array(frameCount);
    var spreadByFrame = new Float64Array(frameCount);
    var modulationScore = new Float64Array(frameCount);
    var continuityScore = new Float64Array(frameCount);
    var transientPenalty = new Float64Array(frameCount);

    if (frameCount === 0) {
        return {
            confidence: confidence,
            rms: rmsByFrame,
            zcr: zcrByFrame,
            crest: crestByFrame,
            spread: spreadByFrame,
            modulation: modulationScore,
            continuity: continuityScore,
            transientPenalty: transientPenalty,
            noiseFloorDb: -Infinity,
            frameCount: 0
        };
    }

    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;
        var sumSq = 0;
        var crossings = 0;
        var prevSign = 0;
        var hasPrev = false;
        var peakAbs = 0;

        for (var i = 0; i < frameSize; i++) {
            var v = samples[offset + i];
            var absV = Math.abs(v);
            if (absV > peakAbs) peakAbs = absV;
            sumSq += v * v;

            var sign = (v >= 0) ? 1 : -1;
            if (hasPrev && sign !== prevSign && absV > 1e-5) {
                crossings++;
            }
            prevSign = sign;
            hasPrev = true;
        }

        rmsByFrame[f] = Math.sqrt(sumSq / frameSize);
        zcrByFrame[f] = crossings / frameSize;
        crestByFrame[f] = peakAbs / Math.max(rmsByFrame[f], 1e-9);

        var spreadThreshold = Math.max(peakAbs * options.sampleSpreadPeakRatio, 1e-5);
        var spreadCount = 0;
        for (i = 0; i < frameSize; i++) {
            if (Math.abs(samples[offset + i]) >= spreadThreshold) spreadCount++;
        }
        spreadByFrame[f] = spreadCount / frameSize;
    }

    var noiseInfo = rmsCalc.estimateNoiseFloor(rmsByFrame);
    var noiseFloorDb = noiseInfo.noiseFloorDb;
    if (!isFinite(noiseFloorDb)) noiseFloorDb = options.absoluteFloorDb;

    var smoothEnergy = rmsCalc.smoothRMS(rmsByFrame, 3);
    modulationScore = computeModulationScore(smoothEnergy, frameDurationMs, options.modulationWindowMs);
    transientPenalty = computeTransientPenalty(rmsByFrame, crestByFrame, spreadByFrame, options);

    var energyThresholdDb = Math.max(
        noiseFloorDb + options.minEnergyAboveFloorDb,
        options.absoluteFloorDb
    );

    var baseWithoutContinuity = new Float64Array(frameCount);
    var baseWeightSum = Math.max(
        1e-6,
        options.energyWeight +
        options.zcrWeight +
        options.modulationWeight +
        options.crestWeight +
        options.spreadWeight
    );

    for (f = 0; f < frameCount; f++) {
        var frameDb = rmsCalc.linearToDb(Math.max(rmsByFrame[f], 1e-12));
        var energyScore = clamp((frameDb - energyThresholdDb) / 12, 0, 1);
        var zcrScore = scoreZcr(zcrByFrame[f], options.zcrMin, options.zcrMax);
        var crestScore = scoreCrest(crestByFrame[f], options.crestMin, options.crestMax);
        var spreadScore = scoreSpread(spreadByFrame[f], options.spreadMin, options.spreadMax);

        var baseCombined =
            energyScore * options.energyWeight +
            zcrScore * options.zcrWeight +
            modulationScore[f] * options.modulationWeight +
            crestScore * options.crestWeight +
            spreadScore * options.spreadWeight;

        baseWithoutContinuity[f] = clamp(baseCombined / baseWeightSum, 0, 1);
    }

    continuityScore = computeContinuityScore(
        baseWithoutContinuity,
        frameDurationMs,
        options.continuityWindowMs
    );

    var fullWeightSum = Math.max(
        1e-6,
        options.energyWeight +
        options.zcrWeight +
        options.modulationWeight +
        options.crestWeight +
        options.spreadWeight +
        options.continuityWeight
    );

    for (f = 0; f < frameCount; f++) {
        frameDb = rmsCalc.linearToDb(Math.max(rmsByFrame[f], 1e-12));
        energyScore = clamp((frameDb - energyThresholdDb) / 12, 0, 1);
        zcrScore = scoreZcr(zcrByFrame[f], options.zcrMin, options.zcrMax);
        crestScore = scoreCrest(crestByFrame[f], options.crestMin, options.crestMax);
        spreadScore = scoreSpread(spreadByFrame[f], options.spreadMin, options.spreadMax);

        var combined =
            energyScore * options.energyWeight +
            zcrScore * options.zcrWeight +
            modulationScore[f] * options.modulationWeight +
            crestScore * options.crestWeight +
            spreadScore * options.spreadWeight +
            continuityScore[f] * options.continuityWeight;

        var normalized = clamp(combined / fullWeightSum, 0, 1);
        var penalized = normalized - transientPenalty[f] * options.transientPenaltyWeight;
        confidence[f] = clamp(penalized, 0, 1);
    }

    return {
        confidence: confidence,
        rms: rmsByFrame,
        zcr: zcrByFrame,
        crest: crestByFrame,
        spread: spreadByFrame,
        modulation: modulationScore,
        continuity: continuityScore,
        transientPenalty: transientPenalty,
        noiseFloorDb: noiseFloorDb,
        frameCount: frameCount
    };
}

function rescueGateWithLaughter(baseGate, refinedGate, laughterConfidence, rmsProfile, options) {
    options = mergeDefaults(options, LAUGHTER_RESCUE_DEFAULTS);

    if (!baseGate || !refinedGate || !laughterConfidence) {
        return options.returnDebug ? { gateOpen: refinedGate, rescuedFrames: 0 } : refinedGate;
    }

    var len = Math.min(baseGate.length, refinedGate.length, laughterConfidence.length);
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = refinedGate[i] ? 1 : 0;

    var reasonCode = options.returnDebug ? new Uint8Array(len) : null;
    var absFloorLinear = rmsCalc.dbToLinear(options.absoluteFloorDb);
    var relativeFactor = rmsCalc.dbToLinear(options.minRelativeToThresholdDb);
    var thresholdLinear = options.thresholdLinear || 0;
    var holdFrames = Math.max(0, options.holdFrames || 0);
    var minConfidence = clamp(options.minConfidence, 0, 1);
    var softConfidence = clamp(minConfidence * 0.82, 0, 1);
    var minStreakFrames = Math.max(1, options.minStreakFrames || 1);
    var streakWindowFrames = Math.max(minStreakFrames, options.streakWindowFrames || minStreakFrames);
    var baseSupportWindowFrames = Math.max(1, options.baseSupportWindowFrames || 1);
    var minBaseSupportFrames = Math.max(1, options.minBaseSupportFrames || 1);

    var holdCounter = 0;
    var rescuedFrames = 0;

    for (i = 0; i < len; i++) {
        if (out[i]) {
            holdCounter = holdFrames;
            if (reasonCode) reasonCode[i] = 0; // already active
            continue;
        }

        var hasBaseSupport = baseGate[i] ? true : hasLocalBinarySupport(
            baseGate,
            i,
            minBaseSupportFrames,
            baseSupportWindowFrames
        );
        if (!hasBaseSupport) {
            holdCounter = 0;
            if (reasonCode) reasonCode[i] = 3; // no base VAD support
            continue;
        }

        var conf = laughterConfidence[i];
        var frameRms = getFrameValue(rmsProfile, i, 0);
        var minEnergy = Math.max(absFloorLinear, thresholdLinear * relativeFactor);
        var energetic = frameRms >= minEnergy;

        var hasStreak = hasLocalConfidenceStreak(
            laughterConfidence,
            i,
            softConfidence,
            minStreakFrames,
            streakWindowFrames
        );

        var strongRescue = conf >= minConfidence && energetic && hasStreak;
        var softRescue = holdCounter > 0 && conf >= softConfidence && energetic;

        if (strongRescue || softRescue) {
            out[i] = 1;
            rescuedFrames++;
            if (strongRescue) {
                holdCounter = holdFrames;
            } else {
                holdCounter--;
            }
            if (reasonCode) reasonCode[i] = 1; // rescued by laughter
            continue;
        }

        holdCounter = 0;
        if (reasonCode) reasonCode[i] = hasStreak ? 2 : 4; // rejected or no confidence streak
    }

    if (options.returnDebug) {
        return {
            gateOpen: out,
            rescuedFrames: rescuedFrames,
            reasonCode: reasonCode
        };
    }

    return out;
}

function recoverGateContinuityWithLaughter(baseGate, gateOpen, laughterConfidence, rmsProfile, options) {
    options = mergeDefaults(options, LAUGHTER_CONTINUITY_DEFAULTS);

    if (!gateOpen || !laughterConfidence) {
        return options.returnDebug ? { gateOpen: gateOpen, recoveredFrames: 0 } : gateOpen;
    }

    var len = Math.min(gateOpen.length, laughterConfidence.length);
    if (baseGate) len = Math.min(len, baseGate.length);
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = gateOpen[i] ? 1 : 0;

    var absFloorLinear = rmsCalc.dbToLinear(options.absoluteFloorDb);
    var relativeFactor = rmsCalc.dbToLinear(options.minRelativeToThresholdDb);
    var thresholdLinear = options.thresholdLinear || 0;
    var edgeMin = clamp(options.edgeMinConfidence, 0, 1);
    var gapMin = clamp(options.gapMinConfidence, 0, 1);
    var maxGapFrames = Math.max(1, options.maxGapFrames || 1);
    var longGapMaxFrames = Math.max(maxGapFrames, options.longGapMaxFrames || maxGapFrames);
    var longGapMinConf = clamp(options.longGapMinConfidence, 0, 1);
    var longGapMinCoverage = clamp(options.longGapMinCoverage, 0, 1);
    var longGapEdgeMinConf = clamp(options.longGapEdgeMinConfidence, 0, 1);
    var maxEdgeExtendFrames = Math.max(0, options.maxEdgeExtendFrames || 0);
    var minGapCoverage = clamp(options.minGapCoverage, 0, 1);
    var minGapHits = Math.max(1, options.minGapHits || 1);
    var baseSupportWindowFrames = Math.max(1, options.baseSupportWindowFrames || 1);
    var minBaseSupportFrames = Math.max(1, options.minBaseSupportFrames || 1);
    var transientPenalty = options.transientPenalty;
    var maxTransientPenalty = clamp(options.maxTransientPenalty, 0, 1);
    var reasonCode = options.returnDebug ? new Uint8Array(len) : null;

    function energeticAt(frameIndex) {
        var frameRms = getFrameValue(rmsProfile, frameIndex, 0);
        var minEnergy = Math.max(absFloorLinear, thresholdLinear * relativeFactor);
        return frameRms >= minEnergy;
    }

    function baseSupportAt(frameIndex) {
        if (!baseGate) return true;
        if (baseGate[frameIndex]) return true;
        return hasLocalBinarySupport(baseGate, frameIndex, minBaseSupportFrames, baseSupportWindowFrames);
    }

    function isEligible(frameIndex, minConf) {
        if (frameIndex < 0 || frameIndex >= len) return false;
        var transientOk = !transientPenalty || getFrameValue(transientPenalty, frameIndex, 0) <= maxTransientPenalty;
        return laughterConfidence[frameIndex] >= minConf &&
            energeticAt(frameIndex) &&
            baseSupportAt(frameIndex) &&
            transientOk;
    }

    var recoveredFrames = 0;

    // 1) Fill short gaps between already active chunks when laughter support exists.
    i = 1;
    while (i < len - 1) {
        if (out[i]) {
            i++;
            continue;
        }

        if (!out[i - 1]) {
            i++;
            continue;
        }

        var gapStart = i;
        while (i < len && !out[i]) i++;
        if (i >= len) break;
        var gapEnd = i - 1;
        var gapLen = gapEnd - gapStart + 1;
        if (gapLen <= 0 || gapLen > longGapMaxFrames) continue;
        if (!out[i]) continue;

        var hits = 0;
        for (var g = gapStart; g <= gapEnd; g++) {
            if (isEligible(g, gapMin)) hits++;
        }
        var coverage = hits / gapLen;
        var shortGapOk = gapLen <= maxGapFrames && hits >= minGapHits && coverage >= minGapCoverage;

        var longGapOk = false;
        if (!shortGapOk && gapLen > maxGapFrames) {
            var leftConf = getFrameValue(laughterConfidence, gapStart - 1, 0);
            var rightConf = getFrameValue(laughterConfidence, gapEnd + 1, 0);
            if (leftConf >= longGapEdgeMinConf && rightConf >= longGapEdgeMinConf) {
                var longHits = 0;
                for (g = gapStart; g <= gapEnd; g++) {
                    if (isEligible(g, longGapMinConf)) longHits++;
                }
                var longCoverage = longHits / gapLen;
                longGapOk = longCoverage >= longGapMinCoverage;
            }
        }

        if (shortGapOk || longGapOk) {
            for (g = gapStart; g <= gapEnd; g++) {
                out[g] = 1;
                recoveredFrames++;
                if (reasonCode) reasonCode[g] = shortGapOk ? 2 : 5; // short/long continuity bridge
            }
        }
    }

    // 2) Extend segment boundaries when adjacent frames still look like laughter.
    i = 0;
    while (i < len) {
        if (!out[i]) {
            i++;
            continue;
        }

        var segStart = i;
        while (i < len && out[i]) i++;
        var segEnd = i - 1;

        var steps = 0;
        var l = segStart - 1;
        while (l >= 0 && !out[l] && steps < maxEdgeExtendFrames && isEligible(l, edgeMin)) {
            out[l] = 1;
            recoveredFrames++;
            if (reasonCode) reasonCode[l] = 1; // boundary extend
            l--;
            steps++;
        }

        steps = 0;
        var r = segEnd + 1;
        while (r < len && !out[r] && steps < maxEdgeExtendFrames && isEligible(r, edgeMin)) {
            out[r] = 1;
            recoveredFrames++;
            if (reasonCode) reasonCode[r] = 1; // boundary extend
            r++;
            steps++;
        }
    }

    if (options.returnDebug) {
        return {
            gateOpen: out,
            recoveredFrames: recoveredFrames,
            reasonCode: reasonCode
        };
    }

    return out;
}

function reinforceLaughterBursts(baseGate, gateOpen, laughterConfidence, rmsProfile, options) {
    options = mergeDefaults(options, LAUGHTER_BURST_REINFORCE_DEFAULTS);

    if (!gateOpen || !laughterConfidence) {
        return options.returnDebug ? { gateOpen: gateOpen, recoveredFrames: 0 } : gateOpen;
    }

    var len = Math.min(gateOpen.length, laughterConfidence.length);
    if (baseGate) len = Math.min(len, baseGate.length);
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = gateOpen[i] ? 1 : 0;

    var absFloorLinear = rmsCalc.dbToLinear(options.absoluteFloorDb);
    var relativeFactor = rmsCalc.dbToLinear(options.minRelativeToThresholdDb);
    var thresholdLinear = options.thresholdLinear || 0;
    var seedMin = clamp(options.seedMinConfidence, 0, 1);
    var extendMin = clamp(options.extendMinConfidence, 0, 1);
    var relativeWindowFrames = Math.max(1, options.relativeWindowFrames || 1);
    var relativeSeedDelta = clamp(options.relativeSeedDelta, 0, 1);
    var relativeSeedMinConfidence = clamp(options.relativeSeedMinConfidence, 0, 1);
    var relativeExtendDelta = clamp(options.relativeExtendDelta, 0, 1);
    var relativeExtendMinConfidence = clamp(options.relativeExtendMinConfidence, 0, 1);
    var targetMinFrames = Math.max(1, options.targetMinFrames || 1);
    var maxSeedGapFrames = Math.max(0, options.maxSeedGapFrames || 0);
    var maxSideExtendFrames = Math.max(0, options.maxSideExtendFrames || 0);
    var baseSupportWindowFrames = Math.max(1, options.baseSupportWindowFrames || 1);
    var minBaseSupportFrames = Math.max(1, options.minBaseSupportFrames || 1);
    var maxTransientPenalty = clamp(options.maxTransientPenalty, 0, 1);
    var transientPenalty = options.transientPenalty;
    var reasonCode = options.returnDebug ? new Uint8Array(len) : null;

    var confPrefix = new Float64Array(len + 1);
    for (i = 0; i < len; i++) confPrefix[i + 1] = confPrefix[i] + laughterConfidence[i];

    function energeticAt(frameIndex) {
        var frameRms = getFrameValue(rmsProfile, frameIndex, 0);
        var minEnergy = Math.max(absFloorLinear, thresholdLinear * relativeFactor);
        return frameRms >= minEnergy;
    }

    function baseSupportAt(frameIndex) {
        if (!baseGate) return true;
        if (baseGate[frameIndex]) return true;
        return hasLocalBinarySupport(baseGate, frameIndex, minBaseSupportFrames, baseSupportWindowFrames);
    }

    function transientOkAt(frameIndex) {
        if (!transientPenalty) return true;
        return getFrameValue(transientPenalty, frameIndex, 0) <= maxTransientPenalty;
    }

    function localConfidenceMean(frameIndex) {
        var half = Math.floor(relativeWindowFrames / 2);
        var start = Math.max(0, frameIndex - half);
        var end = Math.min(len - 1, frameIndex + half);
        var count = end - start + 1;
        if (count <= 0) return 0;
        return (confPrefix[end + 1] - confPrefix[start]) / count;
    }

    function passesConfidence(frameIndex, mode) {
        if (frameIndex < 0 || frameIndex >= len) return false;
        var conf = laughterConfidence[frameIndex];
        if (mode === 'seed') {
            if (conf >= seedMin) return true;
            var localMeanSeed = localConfidenceMean(frameIndex);
            return conf >= relativeSeedMinConfidence && conf >= (localMeanSeed + relativeSeedDelta);
        }
        if (conf >= extendMin) return true;
        var localMeanExtend = localConfidenceMean(frameIndex);
        return conf >= relativeExtendMinConfidence && conf >= (localMeanExtend + relativeExtendDelta);
    }

    function isEligible(frameIndex, mode) {
        if (frameIndex < 0 || frameIndex >= len) return false;
        return passesConfidence(frameIndex, mode) &&
            energeticAt(frameIndex) &&
            baseSupportAt(frameIndex) &&
            transientOkAt(frameIndex);
    }

    var recoveredFrames = 0;
    var seeds = [];
    for (i = 0; i < len; i++) {
        if (isEligible(i, 'seed')) seeds.push(i);
    }

    if (seeds.length === 0) {
        return options.returnDebug
            ? { gateOpen: out, recoveredFrames: 0, reasonCode: reasonCode }
            : out;
    }

    var clusterStart = seeds[0];
    var clusterEnd = seeds[0];

    function fillCluster(startFrame, endFrame) {
        if (endFrame < startFrame) return;

        var clusterLen = endFrame - startFrame + 1;
        var center = Math.floor((startFrame + endFrame) / 2);
        var desiredStart = startFrame;
        var desiredEnd = endFrame;

        if (clusterLen < targetMinFrames) {
            desiredStart = Math.max(0, center - Math.floor(targetMinFrames / 2));
            desiredEnd = desiredStart + targetMinFrames - 1;
            if (desiredEnd >= len) {
                desiredEnd = len - 1;
                desiredStart = Math.max(0, desiredEnd - targetMinFrames + 1);
            }
        }

        // Pass 1: confident region fill.
        var f;
        for (f = desiredStart; f <= desiredEnd; f++) {
            if (isEligible(f, 'extend')) {
                if (!out[f]) {
                    out[f] = 1;
                    recoveredFrames++;
                    if (reasonCode) reasonCode[f] = 3; // burst reinforce
                }
            }
        }

        // Pass 2: short side extension to meet target duration if possible.
        var currentStart = desiredStart;
        var currentEnd = desiredEnd;
        while (currentStart <= currentEnd && !out[currentStart]) currentStart++;
        while (currentEnd >= currentStart && !out[currentEnd]) currentEnd--;
        if (currentEnd < currentStart) return;

        var currentLen = currentEnd - currentStart + 1;
        var need = targetMinFrames - currentLen;
        if (need <= 0) return;

        var left = currentStart - 1;
        var right = currentEnd + 1;
        var leftSteps = 0;
        var rightSteps = 0;

        while (need > 0 && (left >= 0 || right < len)) {
            var canLeft = left >= 0 &&
                leftSteps < maxSideExtendFrames &&
                energeticAt(left) &&
                baseSupportAt(left) &&
                transientOkAt(left);
            var canRight = right < len &&
                rightSteps < maxSideExtendFrames &&
                energeticAt(right) &&
                baseSupportAt(right) &&
                transientOkAt(right);

            if (!canLeft && !canRight) break;

            if (canLeft && canRight) {
                if (laughterConfidence[left] >= laughterConfidence[right]) {
                    if (!out[left]) {
                        out[left] = 1;
                        recoveredFrames++;
                        if (reasonCode) reasonCode[left] = 4; // forced side extend
                        need--;
                    }
                    left--;
                    leftSteps++;
                } else {
                    if (!out[right]) {
                        out[right] = 1;
                        recoveredFrames++;
                        if (reasonCode) reasonCode[right] = 4;
                        need--;
                    }
                    right++;
                    rightSteps++;
                }
            } else if (canLeft) {
                if (!out[left]) {
                    out[left] = 1;
                    recoveredFrames++;
                    if (reasonCode) reasonCode[left] = 4;
                    need--;
                }
                left--;
                leftSteps++;
            } else {
                if (!out[right]) {
                    out[right] = 1;
                    recoveredFrames++;
                    if (reasonCode) reasonCode[right] = 4;
                    need--;
                }
                right++;
                rightSteps++;
            }
        }
    }

    for (i = 1; i < seeds.length; i++) {
        if (seeds[i] - clusterEnd <= maxSeedGapFrames + 1) {
            clusterEnd = seeds[i];
        } else {
            fillCluster(clusterStart, clusterEnd);
            clusterStart = seeds[i];
            clusterEnd = seeds[i];
        }
    }
    fillCluster(clusterStart, clusterEnd);

    if (options.returnDebug) {
        return {
            gateOpen: out,
            recoveredFrames: recoveredFrames,
            reasonCode: reasonCode
        };
    }

    return out;
}

function computeModulationScore(energy, frameDurationMs, windowMs) {
    var len = energy.length;
    var score = new Float64Array(len);
    if (len === 0) return score;

    var windowFrames = Math.max(6, Math.round((windowMs || 420) / frameDurationMs));
    var half = Math.floor(windowFrames / 2);

    for (var i = 0; i < len; i++) {
        var start = Math.max(1, i - half);
        var end = Math.min(len - 2, i + half);
        if (end <= start + 1) continue;

        var sum = 0;
        var sumSq = 0;
        var count = 0;
        for (var j = start; j <= end; j++) {
            var v = energy[j];
            sum += v;
            sumSq += v * v;
            count++;
        }
        if (count <= 0) continue;

        var mean = sum / count;
        if (!(mean > 1e-12)) continue;
        var variance = Math.max(0, (sumSq / count) - mean * mean);
        var std = Math.sqrt(variance);

        var peaks = 0;
        var peakMin = mean * 1.08;
        for (j = start + 1; j < end; j++) {
            var cur = energy[j];
            if (cur > energy[j - 1] && cur >= energy[j + 1] && cur > peakMin) {
                peaks++;
            }
        }

        var peakScore = 0;
        if (peaks <= 1) {
            peakScore = 0;
        } else if (peaks <= 3) {
            peakScore = (peaks - 1) / 2;
        } else if (peaks <= 6) {
            peakScore = 1 - ((peaks - 3) * 0.18);
        } else {
            peakScore = 0.2;
        }
        peakScore = clamp(peakScore, 0, 1);

        var variability = clamp((std / mean - 0.12) / 0.60, 0, 1);
        score[i] = clamp(peakScore * 0.65 + variability * 0.35, 0, 1);
    }

    return score;
}

function computeContinuityScore(baseScore, frameDurationMs, windowMs) {
    var len = baseScore.length;
    var score = new Float64Array(len);
    if (len === 0) return score;

    var windowFrames = Math.max(3, Math.round((windowMs || 260) / frameDurationMs));
    var half = Math.floor(windowFrames / 2);
    var prefix = new Float64Array(len + 1);

    for (var i = 0; i < len; i++) {
        prefix[i + 1] = prefix[i] + baseScore[i];
    }

    for (i = 0; i < len; i++) {
        var start = Math.max(0, i - half);
        var end = Math.min(len - 1, i + half);
        var count = end - start + 1;
        if (count <= 0) continue;
        var mean = (prefix[end + 1] - prefix[start]) / count;
        score[i] = clamp((mean - 0.20) / 0.55, 0, 1);
    }

    return score;
}

function computeTransientPenalty(rmsByFrame, crestByFrame, spreadByFrame, options) {
    var len = rmsByFrame.length;
    var penalty = new Float64Array(len);
    if (len < 3) return penalty;

    var crestSpan = Math.max(1e-6, options.impulseCrestMax - options.impulseCrestMin);

    for (var i = 1; i < len - 1; i++) {
        var prevDb = toDbSafe(rmsByFrame[i - 1]);
        var currDb = toDbSafe(rmsByFrame[i]);
        var nextDb = toDbSafe(rmsByFrame[i + 1]);

        var riseDb = currDb - prevDb;
        var fallDb = currDb - nextDb;

        var riseScore = clamp((riseDb - options.transientRiseDb) / 8, 0, 1);
        var fallScore = clamp((fallDb - options.transientFallDb) / 10, 0, 1);
        var crestScore = clamp((crestByFrame[i] - options.impulseCrestMin) / crestSpan, 0, 1);
        var spreadShape = clamp((options.spreadMin - spreadByFrame[i]) / Math.max(1e-6, options.spreadMin), 0, 1);
        var impulseShape = 0.45 + 0.55 * spreadShape;

        penalty[i] = clamp(riseScore * fallScore * crestScore * impulseShape, 0, 1);
    }

    return penalty;
}

function scoreZcr(zcr, zcrMin, zcrMax) {
    if (!(zcr > 0)) return 0;

    var mid = (zcrMin + zcrMax) / 2;
    var half = Math.max(1e-6, (zcrMax - zcrMin) / 2);
    var dist = Math.abs(zcr - mid) / (half * 1.35);
    var triangular = clamp(1 - dist, 0, 1);

    if (zcr < zcrMin * 0.5) triangular *= 0.5;
    if (zcr > zcrMax * 1.8) triangular *= 0.4;

    return triangular;
}

function scoreCrest(crest, crestMin, crestMax) {
    if (!(crest > 0)) return 0;

    var mid = (crestMin + crestMax) / 2;
    var half = Math.max(1e-6, (crestMax - crestMin) / 2);
    var dist = Math.abs(crest - mid) / (half * 1.45);
    var score = clamp(1 - dist, 0, 1);

    if (crest < crestMin * 0.6) score *= 0.5;
    if (crest > crestMax * 1.8) score *= 0.2;

    return score;
}

function scoreSpread(spread, spreadMin, spreadMax) {
    if (!(spread > 0)) return 0;

    var mid = (spreadMin + spreadMax) / 2;
    var half = Math.max(1e-6, (spreadMax - spreadMin) / 2);
    var dist = Math.abs(spread - mid) / (half * 1.5);
    var score = clamp(1 - dist, 0, 1);

    if (spread < spreadMin * 0.55) score *= 0.25;
    if (spread > spreadMax * 1.8) score *= 0.5;

    return score;
}

function hasLocalConfidenceStreak(conf, index, threshold, requiredCount, windowFrames) {
    var len = conf.length;
    var half = Math.max(0, Math.floor(windowFrames / 2));
    var start = Math.max(0, index - half);
    var end = Math.min(len - 1, index + half);
    var count = 0;

    for (var i = start; i <= end; i++) {
        if (conf[i] >= threshold) count++;
    }

    return count >= requiredCount;
}

function hasLocalBinarySupport(bits, index, requiredCount, windowFrames) {
    var len = bits.length;
    var half = Math.max(0, Math.floor(windowFrames / 2));
    var start = Math.max(0, index - half);
    var end = Math.min(len - 1, index + half);
    var count = 0;

    for (var i = start; i <= end; i++) {
        if (bits[i]) count++;
    }

    return count >= requiredCount;
}

function toDbSafe(linear) {
    if (!linear || linear <= 0) return -120;
    return rmsCalc.linearToDb(linear);
}

function getFrameValue(arr, idx, fallback) {
    if (!arr || idx < 0 || idx >= arr.length) return fallback;
    return arr[idx];
}

function mergeDefaults(userParams, defaults) {
    var result = {};
    for (var key in defaults) {
        if (defaults.hasOwnProperty(key)) {
            result[key] = (userParams && userParams[key] !== undefined) ? userParams[key] : defaults[key];
        }
    }
    return result;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

module.exports = {
    computeLaughterConfidence: computeLaughterConfidence,
    rescueGateWithLaughter: rescueGateWithLaughter,
    recoverGateContinuityWithLaughter: recoverGateContinuityWithLaughter,
    reinforceLaughterBursts: reinforceLaughterBursts,
    LAUGHTER_FEATURE_DEFAULTS: LAUGHTER_FEATURE_DEFAULTS,
    LAUGHTER_RESCUE_DEFAULTS: LAUGHTER_RESCUE_DEFAULTS,
    LAUGHTER_CONTINUITY_DEFAULTS: LAUGHTER_CONTINUITY_DEFAULTS,
    LAUGHTER_BURST_REINFORCE_DEFAULTS: LAUGHTER_BURST_REINFORCE_DEFAULTS
};
