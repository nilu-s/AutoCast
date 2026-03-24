'use strict';

var rmsCalc = require('../../modules/energy/rms_calculator');

var continuityEnforcer = require('../../core/pipeline/continuity_enforcer');
var runtimeUtils = require('../../core/utils/runtime_utils');

function applyFrameContinuity(ctx) {
    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var trackInfos = ctx.trackInfos || [];
    var rmsProfiles = ctx.rmsProfiles || [];
    var vadResults = ctx.vadResults || [];
    var laughterResults = ctx.laughterResults || [];
    var gateSnapshots = ctx.gateSnapshots || [];
    var i;

    for (i = 0; i < trackCount; i++) {
        var healed = null;
        if (params.enableInSpeechDropoutHeal) {
            healed = healInSpeechDropouts(vadResults[i].gateOpen, rmsProfiles[i], vadResults[i].debug, {
                frameDurationMs: params.frameDurationMs,
                maxDropoutMs: params.maxInSpeechDropoutMs,
                minRelativeDb: params.dropoutHealMinRelativeDb,
                absoluteFloorDb: params.dropoutHealAbsoluteFloorDb,
                minEnergyCoverage: params.dropoutHealMinEnergyCoverage,
                fallbackThresholdLinear: vadResults[i].thresholdLinear
            });

            vadResults[i].gateOpen = healed.gateOpen;
            if (trackInfos[i]) {
                trackInfos[i].dropoutHealedFrames = healed.healedFrames;
                trackInfos[i].dropoutHealedGaps = healed.healedGaps;
            }
        } else if (trackInfos[i]) {
            trackInfos[i].dropoutHealedFrames = 0;
            trackInfos[i].dropoutHealedGaps = 0;
        }
    }



    if (params.enforceAlwaysOneTrackOpen) {
        var alwaysOpenStats = continuityEnforcer.enforceAtLeastOneOpenTrack(vadResults, rmsProfiles, {
            frameDurationMs: params.frameDurationMs,
            dominanceWindowMs: params.alwaysOpenDominanceWindowMs,
            stickinessDb: params.alwaysOpenStickinessDb
        });
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) {
                trackInfos[i].alwaysOpenFilledFrames = alwaysOpenStats.perTrackFilledFrames[i] || 0;
            }
        }
    } else {
        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) trackInfos[i].alwaysOpenFilledFrames = 0;
        }
    }

    return {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots
    };
}

function healInSpeechDropouts(gateArray, rmsArray, vadDebug, options) {
    options = options || {};
    if (!gateArray || gateArray.length === 0) {
        return {
            gateOpen: gateArray || new Uint8Array(0),
            healedFrames: 0,
            healedGaps: 0
        };
    }

    var out = cloneUint8Array(gateArray);
    var frameDurationMs = options.frameDurationMs || 10;
    var maxDropoutFrames = Math.max(1, Math.round((options.maxDropoutMs || 260) / frameDurationMs));
    var minCoverage = clampNumber(
        (options.minEnergyCoverage !== undefined) ? options.minEnergyCoverage : 0.35,
        0.05,
        1
    );
    var relativeFactor = rmsCalc.dbToLinear(
        (options.minRelativeDb !== undefined) ? options.minRelativeDb : -8
    );
    var absFloorLinear = rmsCalc.dbToLinear(
        (options.absoluteFloorDb !== undefined) ? options.absoluteFloorDb : -62
    );

    var thresholdByFrame = vadDebug && vadDebug.openThresholdLinearByFrame
        ? vadDebug.openThresholdLinearByFrame
        : null;
    var fallbackThreshold = vadDebug && vadDebug.openThresholdLinearByFrame && vadDebug.openThresholdLinearByFrame.length > 0
        ? getFrameValue(vadDebug.openThresholdLinearByFrame, 0, 0)
        : (options.fallbackThresholdLinear || 0);

    var healedFrames = 0;
    var healedGaps = 0;

    var i = 0;
    while (i < out.length) {
        if (out[i]) {
            i++;
            continue;
        }

        var gapStart = i;
        while (i < out.length && !out[i]) i++;
        var gapEnd = i - 1;
        var gapFrames = gapEnd - gapStart + 1;

        if (gapFrames > maxDropoutFrames) continue;
        if (gapStart <= 0 || gapEnd >= out.length - 1) continue;
        if (!out[gapStart - 1] || !out[gapEnd + 1]) continue;

        var energeticFrames = 0;
        for (var f = gapStart; f <= gapEnd; f++) {
            var frameRms = getFrameValue(rmsArray, f, 0);
            var frameThreshold = thresholdByFrame
                ? getFrameValue(thresholdByFrame, f, fallbackThreshold)
                : fallbackThreshold;
            var minKeep = Math.max(absFloorLinear, frameThreshold * relativeFactor);
            if (frameRms >= minKeep) energeticFrames++;
        }

        var requiredFrames = Math.max(1, Math.ceil(gapFrames * minCoverage));
        if (energeticFrames >= requiredFrames) {
            for (var j = gapStart; j <= gapEnd; j++) {
                out[j] = 1;
            }
            healedFrames += gapFrames;
            healedGaps++;
        }
    }

    return {
        gateOpen: out,
        healedFrames: healedFrames,
        healedGaps: healedGaps
    };
}

function getFrameValue(arr, frameIndex, fallback) {
    return runtimeUtils.getFrameValue(arr, frameIndex, fallback);
}

function cloneUint8Array(arr) {
    return runtimeUtils.cloneUint8Array(arr);
}

function clampNumber(v, min, max) {
    return runtimeUtils.clampNumber(v, min, max);
}

module.exports = {
    applyFrameContinuity: applyFrameContinuity
};
