'use strict';

var loudnessLatch = require('../../modules/vad/loudness_latch');

function computeTrackThresholds(ctx) {
    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var trackInfos = ctx.trackInfos || [];

    var trackThresholds = [];

    for (var i = 0; i < trackCount; i++) {
        var trackThreshold = params.thresholdAboveFloorDb;
        if (params.perTrackThresholdDb && params.perTrackThresholdDb[i] !== undefined) {
            trackThreshold = params.perTrackThresholdDb[i];
        }
        if (params.enableTrackLoudnessBias && trackInfos[i] && trackInfos[i].gainAdjustDb !== undefined) {
            var loudnessBias = trackInfos[i].gainAdjustDb * (params.trackLoudnessBiasStrength || 0);
            trackThreshold = trackThreshold - loudnessBias;
            if (trackThreshold < -6) trackThreshold = -6;
            if (trackThreshold > 18) trackThreshold = 18;
        }
        trackThresholds.push(trackThreshold);
    }

    return trackThresholds;
}

function applyLoudnessLatchToTrackResults(ctx) {
    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var rmsProfiles = ctx.rmsProfiles || [];
    var vadResults = ctx.vadResults;

    if (!params.enableLoudnessLatch || !vadResults) {
        return vadResults;
    }

    var newVadResults = [];
    for (var i = 0; i < trackCount; i++) {
        if (!vadResults[i] || !vadResults[i].gateOpen) {
            newVadResults.push(vadResults[i]);
            continue;
        }
        var trackGate = vadResults[i].gateOpen;
        var trackRms = rmsProfiles[i];
        
        // Pass a dummy array of same length, since latch logic produces an entirely new array
        var dummyFrames = new Array(trackGate.length);
        var latchedGate = loudnessLatch.applyLoudnessLatch(dummyFrames, trackRms, params);
        
        newVadResults.push({
            gateOpen: latchedGate, // Replace gate
            thresholdDb: vadResults[i].thresholdDb,
            noiseFloorDb: vadResults[i].noiseFloorDb,
            thresholdLinear: vadResults[i].thresholdLinear,
            debug: vadResults[i].debug
        });
    }
    return newVadResults;
}

module.exports = {
    computeTrackThresholds: computeTrackThresholds,
    applyLoudnessLatchToTrackResults: applyLoudnessLatchToTrackResults
};
