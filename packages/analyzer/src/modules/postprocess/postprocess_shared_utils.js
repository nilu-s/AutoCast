'use strict';


var rmsCalc = require('../energy/rms_calculator');

function computeOtherTrackOverlapRatio(resolvedSegments, trackIndex, startSec, endSec) {
    var span = Math.max(0, endSec - startSec);
    if (span <= 1e-9) return 0;

    var overlap = 0;
    for (var t = 0; t < resolvedSegments.length; t++) {
        if (t === trackIndex) continue;
        var segs = resolvedSegments[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg || seg.state === 'suppressed') continue;
            var ovStart = Math.max(startSec, seg.start);
            var ovEnd = Math.min(endSec, seg.end);
            if (ovEnd > ovStart) overlap += (ovEnd - ovStart);
        }
    }

    return Math.min(1, overlap / span);
}

function findOverlappingOtherTrackEnd(resolvedSegments, trackIndex, timeSec) {
    var nearestEnd = Infinity;
    for (var t = 0; t < resolvedSegments.length; t++) {
        if (t === trackIndex) continue;
        var segs = resolvedSegments[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg || seg.state === 'suppressed') continue;
            if (seg.start <= timeSec + 0.0001 && seg.end > timeSec + 0.0001) {
                if (seg.end < nearestEnd) nearestEnd = seg.end;
            }
        }
    }
    return nearestEnd;
}

function computeSegmentRmsStats(seg, rms, frameDurSec) {
    if (!seg || !rms || rms.length === 0) return null;

    var startFrame = Math.max(0, Math.floor(seg.start / frameDurSec));
    var endFrame = Math.min(rms.length, Math.ceil(seg.end / frameDurSec));
    if (endFrame <= startFrame) return null;

    var peakLin = 0;
    var sumLin = 0;
    var count = 0;
    for (var f = startFrame; f < endFrame; f++) {
        var v = getFrameValue(rms, f, 0);
        if (v > peakLin) peakLin = v;
        sumLin += v;
        count++;
    }
    if (count <= 0) return null;

    var meanLin = sumLin / count;
    return {
        startFrame: startFrame,
        endFrame: endFrame,
        count: count,
        peakLin: peakLin,
        meanLin: meanLin,
        peakDb: rmsCalc.linearToDb(Math.max(peakLin, 1e-12)),
        meanDb: rmsCalc.linearToDb(Math.max(meanLin, 1e-12))
    };
}

function cloneSegment(seg) {
    var out = {};
    for (var key in seg) {
        if (seg.hasOwnProperty(key)) out[key] = seg[key];
    }
    if (out.durationMs === undefined && isFinite(out.start) && isFinite(out.end)) {
        out.durationMs = Math.round((out.end - out.start) * 1000);
    }
    return out;
}

function cloneSegmentsArray(trackSegs) {
    if (!trackSegs || !trackSegs.length) return [];
    var out = [];
    for (var i = 0; i < trackSegs.length; i++) {
        if (!trackSegs[i]) continue;
        out.push(cloneSegment(trackSegs[i]));
    }
    return out;
}

function clampNumber(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function mergeActiveSegments(segments) {
    if (!segments || segments.length === 0) return [];
    segments.sort(function (a, b) { return a.start - b.start; });
    var out = [segments[0]];
    for (var i = 1; i < segments.length; i++) {
        var prev = out[out.length - 1];
        var cur = segments[i];
        if (cur.start <= prev.end + 0.001) {
            if (cur.end > prev.end) prev.end = cur.end;
        } else {
            out.push({
                start: cur.start,
                end: cur.end,
                trackIndex: cur.trackIndex,
                state: 'active'
            });
        }
    }
    for (i = 0; i < out.length; i++) {
        out[i].durationMs = Math.round((out[i].end - out[i].start) * 1000);
    }
    return out;
}

function findNeighborActive(segs, index, direction) {
    var i = index + direction;
    while (i >= 0 && i < segs.length) {
        if (segs[i] && segs[i].state !== 'suppressed') return segs[i];
        i += direction;
    }
    return null;
}

function mergeContiguousStateSegments(segs) {
    if (!segs || segs.length === 0) return [];

    var ordered = segs.slice().sort(function (a, b) { return a.start - b.start; });
    var out = [cloneSegment(ordered[0])];
    for (var i = 1; i < ordered.length; i++) {
        var cur = ordered[i];
        var prev = out[out.length - 1];
        if (prev.state === cur.state && cur.start <= prev.end + 0.001) {
            if (cur.end > prev.end) prev.end = cur.end;
            prev.durationMs = Math.round((prev.end - prev.start) * 1000);
        } else {
            var copied = cloneSegment(cur);
            copied.durationMs = Math.round((copied.end - copied.start) * 1000);
            out.push(copied);
        }
    }
    return out;
}

function isLaughterProtectedSegment(seg, trackIndex, options, frameDurSec) {
    if (!options || !options.protectLaughter || !seg) return false;

    var laughterResults = options.laughterResults;
    if (!laughterResults || !laughterResults[trackIndex] || !laughterResults[trackIndex].confidence) {
        return false;
    }

    var conf = laughterResults[trackIndex].confidence;
    var minConf = (options.laughterProtectMinConfidence !== undefined)
        ? options.laughterProtectMinConfidence
        : 0.46;
    var minCoverage = clampNumber(
        (options.laughterProtectMinCoverage !== undefined) ? options.laughterProtectMinCoverage : 0.24,
        0.01,
        1
    );
    var strongConf = Math.min(0.98, minConf + 0.18);

    var startFrame = Math.max(0, Math.floor(seg.start / frameDurSec));
    var endFrame = Math.min(conf.length, Math.ceil(seg.end / frameDurSec));
    if (endFrame <= startFrame) return false;

    var total = 0;
    var hit = 0;
    var strongHit = 0;
    var longestRun = 0;
    var run = 0;

    for (var f = startFrame; f < endFrame; f++) {
        var c = getFrameValue(conf, f, 0);
        total++;
        if (c >= minConf) {
            hit++;
            run++;
            if (run > longestRun) longestRun = run;
        } else {
            run = 0;
        }
        if (c >= strongConf) strongHit++;
    }

    if (total <= 0) return false;
    var coverage = hit / total;

    // Keep if confidence is sustained or has at least one clearly strong local laugh region.
    return coverage >= minCoverage || (longestRun >= 2 && strongHit >= 1);
}

function getFrameValue(arr, frameIndex, fallback) {
    if (!arr || frameIndex < 0 || frameIndex >= arr.length) return fallback;
    return arr[frameIndex];
}

module.exports = {
    computeOtherTrackOverlapRatio: computeOtherTrackOverlapRatio,
    findOverlappingOtherTrackEnd: findOverlappingOtherTrackEnd,
    computeSegmentRmsStats: computeSegmentRmsStats,
    cloneSegment: cloneSegment,
    cloneSegmentsArray: cloneSegmentsArray,
    clampNumber: clampNumber,
    mergeActiveSegments: mergeActiveSegments,
    findNeighborActive: findNeighborActive,
    mergeContiguousStateSegments: mergeContiguousStateSegments,
    isLaughterProtectedSegment: isLaughterProtectedSegment,
    getFrameValue: getFrameValue
};
