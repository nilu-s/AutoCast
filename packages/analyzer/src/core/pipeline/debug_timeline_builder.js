'use strict';

var rmsCalc = require('../../modules/energy/rms_calculator');
var runtimeUtils = require('../utils/runtime_utils');

function getFrameValue(arr, frameIndex, fallback) {
    return runtimeUtils.getFrameValue(arr, frameIndex, fallback);
}

function roundNumber(v, digits) {
    return runtimeUtils.roundNumber(v, digits);
}

function toDbSafe(linear) {
    if (!linear || linear <= 0) return -Infinity;
    return rmsCalc.linearToDb(linear);
}

function buildOverlapFrameMap(trackSegments, frameCount, frameDurSec) {
    var map = new Uint8Array(frameCount);

    for (var i = 0; i < trackSegments.length; i++) {
        var seg = trackSegments[i];
        var val = seg.state === 'suppressed' ? 2 : 1;

        var startFrame = Math.max(0, Math.floor(seg.start / frameDurSec));
        var endFrame = Math.min(frameCount, Math.ceil(seg.end / frameDurSec));

        for (var f = startFrame; f < endFrame; f++) {
            map[f] = val;
        }
    }

    return map;
}

function buildAnalysisDebug(ctx) {
    var frameDurationMs = ctx.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxFrames = ctx.debugMaxFrames || 5000;

    var tracks = [];

    for (var t = 0; t < ctx.rmsProfiles.length; t++) {
        var snapshot = ctx.gateSnapshots[t] || {};
        var gateAfterVad = snapshot.afterVad || new Uint8Array(0);
        var gateAfterSpectral = snapshot.afterSpectral || new Uint8Array(0);
        var gateAfterSpeakerLock = snapshot.afterSpeakerLock || new Uint8Array(0);
        var gateAfterLaughter = snapshot.afterLaughter || gateAfterSpeakerLock;
        var gateAfterBleed = snapshot.afterBleed || new Uint8Array(0);
        var vadDebug = snapshot.vadDebug || null;
        var spectralDebug = snapshot.spectralDebug || null;

        var frameCount = Math.max(
            ctx.rmsProfiles[t] ? ctx.rmsProfiles[t].length : 0,
            gateAfterBleed.length,
            gateAfterLaughter.length,
            gateAfterSpeakerLock.length,
            gateAfterSpectral.length,
            gateAfterVad.length
        );

        var step = Math.max(1, Math.ceil(frameCount / maxFrames));
        var overlapMap = buildOverlapFrameMap(ctx.resolvedSegments[t] || [], frameCount, frameDurSec);

        var suppressionCounts = {
            active: 0,
            below_threshold: 0,
            spectral_reject: 0,
            speaker_mismatch: 0,
            bleed_suppressed: 0,
            overlap_rejected: 0
        };

        var frames = [];

        for (var f = 0; f < frameCount; f += step) {
            var rmsLin = getFrameValue(ctx.rmsProfiles[t], f, 0);
            var thresholdLin = vadDebug && vadDebug.openThresholdLinearByFrame
                ? getFrameValue(vadDebug.openThresholdLinearByFrame, f, 0)
                : 0;
            var floorLin = vadDebug && vadDebug.noiseFloorLinearByFrame
                ? getFrameValue(vadDebug.noiseFloorLinearByFrame, f, 0)
                : 0;
            var spectralConfidence = ctx.spectralResults[t]
                ? getFrameValue(ctx.spectralResults[t].confidence, f, 0)
                : null;
            var laughterConfidence = ctx.laughterResults && ctx.laughterResults[t]
                ? getFrameValue(ctx.laughterResults[t].confidence, f, 0)
                : null;
            var speechScore = spectralDebug && spectralDebug.score
                ? getFrameValue(spectralDebug.score, f, 0)
                : (getFrameValue(gateAfterBleed, f, 0) ? 1 : 0);

            var gateState = getFrameValue(gateAfterBleed, f, 0) ? 1 : 0;
            var reason = 'active';

            if (getFrameValue(overlapMap, f, 0) === 2) {
                reason = 'overlap_rejected';
            } else if (!gateState) {
                var wasVadActive = getFrameValue(gateAfterVad, f, 0) ? 1 : 0;
                var wasSpectralActive = getFrameValue(gateAfterSpectral, f, 0) ? 1 : 0;
                var wasSpeakerActive = getFrameValue(gateAfterSpeakerLock, f, 0) ? 1 : 0;
                var wasLaughterActive = getFrameValue(gateAfterLaughter, f, 0) ? 1 : 0;

                if (wasLaughterActive) {
                    reason = 'bleed_suppressed';
                } else {
                    if (wasSpectralActive) {
                        if (!wasSpeakerActive) {
                            reason = 'speaker_mismatch';
                        } else {
                            reason = 'bleed_suppressed';
                        }
                    } else if (wasVadActive && !wasSpectralActive) {
                        reason = 'spectral_reject';
                    } else {
                        reason = 'below_threshold';
                    }
                }
            }

            suppressionCounts[reason] = (suppressionCounts[reason] || 0) + 1;

            frames.push({
                frame: f,
                timeSec: roundNumber(f * frameDurSec, 3),
                rmsDb: roundNumber(toDbSafe(rmsLin), 2),
                noiseFloorDb: roundNumber(toDbSafe(floorLin), 2),
                thresholdDb: roundNumber(toDbSafe(thresholdLin), 2),
                spectralConfidence: spectralConfidence === null ? null : roundNumber(spectralConfidence, 3),
                laughterConfidence: laughterConfidence === null ? null : roundNumber(laughterConfidence, 3),
                speechScore: roundNumber(speechScore, 3),
                gateState: gateState,
                reason: reason
            });
        }

        tracks.push({
            trackIndex: t,
            frameCount: frameCount,
            sampledEveryFrames: step,
            suppressionCounts: suppressionCounts,
            frames: frames
        });
    }

    return {
        frameDurationMs: frameDurationMs,
        trackCount: tracks.length,
        tracks: tracks
    };
}

module.exports = {
    buildAnalysisDebug: buildAnalysisDebug
};

