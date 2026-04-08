'use strict';

var spectralVad = require('../../modules/vad/spectral_vad');
var runtimeUtils = require('../../core/utils/runtime_utils');

function applyBleedSuppression(ctx) {
    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var rmsProfiles = ctx.rmsProfiles || [];
    var vadResults = ctx.vadResults || [];
    var spectralResults = ctx.spectralResults || [];
    var fingerprintResults = ctx.fingerprintResults || [];
    var gateSnapshots = ctx.gateSnapshots || [];
    var progress = ctx.progress || function () { };

    var bleedEnabled = (params.enableBleedHandling !== undefined) ? !!params.enableBleedHandling : true;
    var bleedDb = (params.bleedSuppressionDb !== undefined) ? params.bleedSuppressionDb : 0;
    
    if (bleedEnabled && bleedDb > 0 && trackCount > 1) {
        progress(53, 'Suppressing mic bleed...');
        var MathPower = Math.pow; // cache for speed
        var bleedLinearRatio = MathPower(10, bleedDb / 20);

        var minFrames = Infinity;
        var ti, tj, f;
        for (ti = 0; ti < trackCount; ti++) {
            if (!rmsProfiles[ti]) continue;
            if (rmsProfiles[ti].length < minFrames) minFrames = rmsProfiles[ti].length;
        }

        var suppressSimilarityThreshold = (params.bleedSuppressionSimilarityThreshold !== undefined)
            ? params.bleedSuppressionSimilarityThreshold
            : 0.90;
        var protectConfidence = (params.bleedSuppressionProtectConfidence !== undefined)
            ? params.bleedSuppressionProtectConfidence
            : 0.34;

        for (ti = 0; ti < trackCount; ti++) {
            if (!vadResults[ti] || !vadResults[ti].gateOpen) continue;
            var gate = vadResults[ti].gateOpen;
            var rmsA = rmsProfiles[ti];

            if (params.debugMode && gateSnapshots[ti]) {
                gateSnapshots[ti].bleedSuppressor = new Int16Array(Math.min(gate.length, minFrames));
            }

            for (f = 0; f < Math.min(gate.length, minFrames); f++) {
                if (!gate[f]) continue;

                var baseRms = getFrameValue(rmsA, f, 0);
                if (baseRms <= 0) baseRms = 1e-12;

                var suppressBy = -1;

                for (tj = 0; tj < trackCount; tj++) {
                    if (tj === ti) continue;
                    if (!vadResults[tj] || !vadResults[tj].gateOpen) continue;
                    if (f >= vadResults[tj].gateOpen.length || !vadResults[tj].gateOpen[f]) continue;

                    var otherRms = getFrameValue(rmsProfiles[tj], f, 0);
                    if (!(otherRms > baseRms * bleedLinearRatio)) continue;

                    var keepAsOverlap = false;
                    if (params.useSpectralVAD &&
                        spectralResults[ti] &&
                        fingerprintResults[ti] &&
                        fingerprintResults[tj]) {
                        var similarity = spectralVad.computeFrameFingerprintSimilarity(
                            fingerprintResults[tj],
                            fingerprintResults[ti],
                            f
                        );
                        var victimConf = getFrameValue(spectralResults[ti].confidence, f, 0);

                        if (similarity < suppressSimilarityThreshold && victimConf >= protectConfidence) {
                            keepAsOverlap = true;
                        }
                    }

                    if (!keepAsOverlap) {
                        suppressBy = tj;
                        break;
                    }
                }

                if (suppressBy !== -1) {
                    gate[f] = 0;
                    if (params.debugMode && gateSnapshots[ti] && gateSnapshots[ti].bleedSuppressor && f < gateSnapshots[ti].bleedSuppressor.length) {
                        gateSnapshots[ti].bleedSuppressor[f] = suppressBy + 1;
                    }
                }
            }
        }
    }

    return {
        vadResults: vadResults,
        gateSnapshots: gateSnapshots,
        bleedEnabled: bleedEnabled
    };
}

function getFrameValue(arr, frameIndex, fallback) {
    return runtimeUtils.getFrameValue(arr, frameIndex, fallback);
}

module.exports = {
    applyBleedSuppression: applyBleedSuppression
};
