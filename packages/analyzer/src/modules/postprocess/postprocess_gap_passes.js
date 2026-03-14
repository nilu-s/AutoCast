'use strict';


var rmsCalc = require('../energy/rms_calculator');
var segmentBuilder = require('../segmentation/segment_builder');
var shared = require('./postprocess_shared_utils');
var cloneSegmentsArray = shared.cloneSegmentsArray;
var getFrameValue = shared.getFrameValue;

function enforceMinimumSegmentDuration(segmentsArray, minSec) {
    var out = [];
    for (var i = 0; i < segmentsArray.length; i++) {
        var trackSegs = cloneSegmentsArray(segmentsArray[i]);
        if (!trackSegs || trackSegs.length === 0) {
            out.push([]);
            continue;
        }

        var changed = true;
        // Prevent infinite loop by capping passes. Usually resolves in 1-2 passes.
        var maxPasses = 10; 
        while(changed && trackSegs.length > 1 && maxPasses > 0) {
            changed = false;
            maxPasses--;
            for (var j = 0; j < trackSegs.length; j++) {
                var dur = trackSegs[j].end - trackSegs[j].start;
                if (dur < minSec) {
                    var prev = j > 0 ? trackSegs[j-1] : null;
                    var next = j < trackSegs.length - 1 ? trackSegs[j+1] : null;

                    if (!prev && !next) continue;

                    var target = prev;
                    if (prev && next) {
                         var prevDur = prev.end - prev.start;
                         var nextDur = next.end - next.start;
                         target = prevDur > nextDur ? prev : next;
                    } else if (next) {
                         target = next;
                    }

                    if (trackSegs[j].state !== target.state) {
                        trackSegs[j].state = target.state; 
                        changed = true;
                    }
                }
            }
            
            var merged = [];
            if (trackSegs.length > 0) {
                merged.push(trackSegs[0]);
                for (var k = 1; k < trackSegs.length; k++) {
                    var last = merged[merged.length - 1];
                    var curr = trackSegs[k];
                    if (last.state === curr.state && Math.abs(last.end - curr.start) < 0.005) {
                        last.end = curr.end;
                        if (last.durationMs !== undefined) last.durationMs = Math.round((last.end - last.start) * 1000);
                    } else {
                        merged.push(curr);
                    }
                }
            }
            trackSegs = merged;
        }
        out.push(trackSegs);
    }
    return out;
}

function applyPrimaryTrackGapFill(resolvedSegments, rmsProfiles, options) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxGapFrames = Math.max(1, Math.round((options.maxGapMs || 900) / frameDurationMs));
    var quietLinear = rmsCalc.dbToLinear(options.quietDb !== undefined ? options.quietDb : -50);

    var trackCount = resolvedSegments.length;
    var frameCount = 0;
    for (var t = 0; t < rmsProfiles.length; t++) {
        if (rmsProfiles[t] && rmsProfiles[t].length > frameCount) frameCount = rmsProfiles[t].length;
    }
    if (frameCount === 0 || trackCount === 0) return resolvedSegments;

    var gates = [];
    for (t = 0; t < trackCount; t++) {
        gates[t] = new Uint8Array(frameCount);
        var segs = resolvedSegments[t] || [];
        for (var s = 0; s < segs.length; s++) {
            if (segs[s].state === 'suppressed') continue;
            var startFrame = Math.max(0, Math.floor(segs[s].start / frameDurSec));
            var endFrame = Math.min(frameCount, Math.ceil(segs[s].end / frameDurSec));
            for (var f = startFrame; f < endFrame; f++) gates[t][f] = 1;
        }
    }

    function anyActiveAt(frameIndex) {
        for (var tr = 0; tr < trackCount; tr++) {
            if (gates[tr][frameIndex]) return true;
        }
        return false;
    }

    function dominantActiveTrackAt(frameIndex) {
        var best = -1;
        var bestRms = -1;
        for (var tr = 0; tr < trackCount; tr++) {
            if (!gates[tr][frameIndex]) continue;
            var val = getFrameValue(rmsProfiles[tr], frameIndex, 0);
            if (val > bestRms) {
                bestRms = val;
                best = tr;
            }
        }
        return best;
    }

    var idx = 0;
    while (idx < frameCount) {
        if (anyActiveAt(idx)) {
            idx++;
            continue;
        }

        var gapStart = idx;
        while (idx < frameCount && !anyActiveAt(idx)) idx++;
        var gapEnd = idx; // exclusive
        var gapLen = gapEnd - gapStart;
        if (gapLen <= 0 || gapLen > maxGapFrames) continue;

        var leftFrame = gapStart - 1;
        if (leftFrame < 0) continue;

        var primaryTrack = dominantActiveTrackAt(leftFrame);
        if (primaryTrack < 0) continue;

        // If there is activity right after the gap, require the same dominant track.
        if (gapEnd < frameCount && anyActiveAt(gapEnd)) {
            var rightDominant = dominantActiveTrackAt(gapEnd);
            if (rightDominant >= 0 && rightDominant !== primaryTrack) continue;
        }

        var safeToFill = true;
        for (var gf = gapStart; gf < gapEnd && safeToFill; gf++) {
            for (var tr = 0; tr < trackCount; tr++) {
                if (tr === primaryTrack) continue;
                if (getFrameValue(rmsProfiles[tr], gf, 0) > quietLinear) {
                    safeToFill = false;
                    break;
                }
            }
        }

        if (!safeToFill) continue;
        for (gf = gapStart; gf < gapEnd; gf++) gates[primaryTrack][gf] = 1;
    }

    var out = [];
    for (t = 0; t < trackCount; t++) {
        var segOut = segmentBuilder.buildSegments(gates[t], t, {
            minSegmentMs: 0,
            minGapMs: 0,
            frameDurationMs: frameDurationMs
        });
        for (s = 0; s < segOut.length; s++) segOut[s].state = 'active';
        out.push(segOut);
    }
    return out;
}

module.exports = {
    enforceMinimumSegmentDuration: enforceMinimumSegmentDuration,
    applyPrimaryTrackGapFill: applyPrimaryTrackGapFill
};
