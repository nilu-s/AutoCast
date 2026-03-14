'use strict';

var rmsCalc = require('../../modules/energy/rms_calculator');
var runtimeUtils = require('../utils/runtime_utils');

function getFrameValue(arr, frameIndex, fallback) {
    return runtimeUtils.getFrameValue(arr, frameIndex, fallback);
}

function enforceAtLeastOneOpenTrack(vadResults, rmsProfiles, options) {
    options = options || {};

    var trackCount = vadResults ? vadResults.length : 0;
    if (trackCount === 0) {
        return {
            filledFrames: 0,
            perTrackFilledFrames: []
        };
    }

    var maxFrames = 0;
    for (var t = 0; t < trackCount; t++) {
        var gate = vadResults[t] && vadResults[t].gateOpen ? vadResults[t].gateOpen : null;
        if (gate && gate.length > maxFrames) maxFrames = gate.length;
    }

    var perTrackFilledFrames = new Array(trackCount);
    for (t = 0; t < trackCount; t++) perTrackFilledFrames[t] = 0;
    if (maxFrames === 0) {
        return {
            filledFrames: 0,
            perTrackFilledFrames: perTrackFilledFrames
        };
    }

    var frameDurationMs = options.frameDurationMs || 10;
    var dominanceWindowMs = Math.max(frameDurationMs, options.dominanceWindowMs || 2500);
    var windowFrames = Math.max(1, Math.round(dominanceWindowMs / frameDurationMs));
    var decay = Math.exp(-1 / windowFrames);
    var stickinessLinear = rmsCalc.dbToLinear(options.stickinessDb !== undefined ? options.stickinessDb : 2.5);

    var dominanceScore = new Float64Array(trackCount);
    var lastChosenTrack = -1;
    var filledFrames = 0;

    for (var f = 0; f < maxFrames; f++) {
        var activeCount = 0;
        for (t = 0; t < trackCount; t++) {
            dominanceScore[t] *= decay;
            gate = vadResults[t].gateOpen;
            if (f < gate.length && gate[f]) {
                activeCount++;
                dominanceScore[t] += 1;
            }
        }

        if (activeCount > 0) continue;

        var bestTrack = -1;
        var bestScore = -1;
        var bestRms = -1;
        var lastTrackRms = -1;

        for (t = 0; t < trackCount; t++) {
            gate = vadResults[t].gateOpen;
            if (f >= gate.length) continue;

            var frameRms = getFrameValue(rmsProfiles[t], f, 0);
            var score = dominanceScore[t];
            if (score > bestScore || (score === bestScore && frameRms > bestRms)) {
                bestScore = score;
                bestRms = frameRms;
                bestTrack = t;
            }

            if (t === lastChosenTrack) {
                lastTrackRms = frameRms;
            }
        }

        if (bestTrack === -1) continue;

        var chosenTrack = bestTrack;
        if (lastChosenTrack !== -1 &&
            f < vadResults[lastChosenTrack].gateOpen.length &&
            lastTrackRms > 0 &&
            bestRms > 0 &&
            lastTrackRms * stickinessLinear >= bestRms) {
            chosenTrack = lastChosenTrack;
        }

        vadResults[chosenTrack].gateOpen[f] = 1;
        dominanceScore[chosenTrack] += 1;
        perTrackFilledFrames[chosenTrack]++;
        filledFrames++;
        lastChosenTrack = chosenTrack;
    }

    return {
        filledFrames: filledFrames,
        perTrackFilledFrames: perTrackFilledFrames
    };
}

function buildSegmentsFromGateDiff(filledGate, originalGate, trackIndex, frameDurationMs) {
    var out = [];
    if (!filledGate || filledGate.length === 0) return out;

    var frameDurSec = (frameDurationMs || 10) / 1000;
    var inSeg = false;
    var segStart = 0;
    var segOrigin = 'analysis_active';

    function pushSeg(endFrame) {
        if (!inSeg) return;
        var startSec = segStart * frameDurSec;
        var endSec = endFrame * frameDurSec;
        if (endSec <= startSec + 1e-6) {
            inSeg = false;
            return;
        }
        out.push({
            start: startSec,
            end: endSec,
            trackIndex: trackIndex,
            state: 'active',
            origin: segOrigin,
            durationMs: Math.round((endSec - startSec) * 1000)
        });
        inSeg = false;
    }

    for (var f = 0; f <= filledGate.length; f++) {
        var active = (f < filledGate.length) ? (filledGate[f] > 0) : false;
        var origin = 'analysis_active';
        if (active) {
            var wasOriginal = originalGate && f < originalGate.length && originalGate[f] > 0;
            origin = wasOriginal ? 'analysis_active' : 'always_open_fill';
        }

        if (!inSeg) {
            if (active) {
                inSeg = true;
                segStart = f;
                segOrigin = origin;
            }
            continue;
        }

        if (!active) {
            pushSeg(f);
            continue;
        }

        if (origin !== segOrigin) {
            pushSeg(f);
            inSeg = true;
            segStart = f;
            segOrigin = origin;
        }
    }

    return out;
}

function enforceAlwaysOneTrackOnResolvedSegments(resolvedSegments, rmsProfiles, options) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var trackCount = resolvedSegments ? resolvedSegments.length : 0;
    var maxFrames = 0;

    for (var t = 0; t < rmsProfiles.length; t++) {
        if (rmsProfiles[t] && rmsProfiles[t].length > maxFrames) maxFrames = rmsProfiles[t].length;
    }

    if (trackCount === 0 || maxFrames === 0) {
        return {
            resolvedSegments: resolvedSegments || [],
            filledFrames: 0,
            perTrackFilledFrames: []
        };
    }

    var originalGates = [];
    var filledWrappers = [];
    for (t = 0; t < trackCount; t++) {
        var gate = new Uint8Array(maxFrames);
        var segs = resolvedSegments[t] || [];

        for (var s = 0; s < segs.length; s++) {
            var seg = segs[s];
            if (!seg || seg.state === 'suppressed') continue;
            var stFrame = Math.max(0, Math.floor(seg.start / frameDurSec));
            var enFrame = Math.min(maxFrames, Math.ceil(seg.end / frameDurSec));
            for (var f = stFrame; f < enFrame; f++) gate[f] = 1;
        }

        originalGates.push(gate);

        var filledGate = new Uint8Array(maxFrames);
        filledGate.set(gate);
        filledWrappers.push({ gateOpen: filledGate });
    }

    var fillStats = enforceAtLeastOneOpenTrack(filledWrappers, rmsProfiles, {
        frameDurationMs: frameDurationMs,
        dominanceWindowMs: options.dominanceWindowMs,
        stickinessDb: options.stickinessDb
    });

    var out = [];
    for (t = 0; t < trackCount; t++) {
        out.push(buildSegmentsFromGateDiff(
            filledWrappers[t].gateOpen,
            originalGates[t],
            t,
            frameDurationMs
        ));
    }

    return {
        resolvedSegments: out,
        filledFrames: fillStats.filledFrames,
        perTrackFilledFrames: fillStats.perTrackFilledFrames
    };
}

module.exports = {
    enforceAtLeastOneOpenTrack: enforceAtLeastOneOpenTrack,
    enforceAlwaysOneTrackOnResolvedSegments: enforceAlwaysOneTrackOnResolvedSegments
};

