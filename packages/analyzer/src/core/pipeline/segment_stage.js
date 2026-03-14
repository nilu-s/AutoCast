'use strict';

var segmentBuilder = require('../../modules/segmentation/segment_builder');

function runSegmentStage(ctx) {
    ctx = ctx || {};

    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var totalDurationSec = ctx.totalDurationSec || 0;
    var vadResults = ctx.vadResults || [];
    var trackInfos = ctx.trackInfos || [];

    var allSegments = [];
    var i;

    for (i = 0; i < trackCount; i++) {
        var segments = segmentBuilder.buildSegments(vadResults[i].gateOpen, i, {
            minSegmentMs: params.minSegmentMs,
            minGapMs: params.minGapMs,
            frameDurationMs: params.frameDurationMs
        });
        allSegments.push(segments);

        if (trackInfos[i]) {
            trackInfos[i].noiseFloorDb = Math.round(vadResults[i].noiseFloorDb * 10) / 10;
            trackInfos[i].thresholdDb = Math.round(vadResults[i].thresholdDb * 10) / 10;
        }
    }

    var rawSegments = allSegments;
    allSegments = applySegmentPadding(
        rawSegments,
        totalDurationSec,
        params.snippetPadBeforeMs,
        params.snippetPadAfterMs,
        {
            independentTrackAnalysis: params.independentTrackAnalysis,
            crossTrackTailTrimInIndependentMode: params.crossTrackTailTrimInIndependentMode,
            overlapTailAllowanceMs: params.overlapTailAllowanceMs,
            crossTrackHeadTrimInIndependentMode: params.crossTrackHeadTrimInIndependentMode,
            handoffHeadLeadMs: params.handoffHeadLeadMs,
            handoffHeadWindowMs: params.handoffHeadWindowMs,
            referenceSegments: rawSegments
        }
    );

    return {
        allSegments: allSegments,
        rawSegments: rawSegments
    };
}

function applySegmentPadding(allSegments, totalDurationSec, beforeMs, afterMs, options) {
    var pre = Math.max(0, (beforeMs || 0) / 1000);
    var post = Math.max(0, (afterMs || 0) / 1000);
    if (pre === 0 && post === 0) return allSegments;

    options = options || {};
    var referenceSegments = options.referenceSegments || allSegments;
    var crossTrackTailTrim = !!options.independentTrackAnalysis && !!options.crossTrackTailTrimInIndependentMode;
    var crossTrackHeadTrim = !!options.independentTrackAnalysis && !!options.crossTrackHeadTrimInIndependentMode;
    var tailAllowanceSec = Math.max(0, (options.overlapTailAllowanceMs || 0) / 1000);
    var handoffHeadLeadSec = Math.max(0, (options.handoffHeadLeadMs || 0) / 1000);
    var handoffHeadWindowSec = Math.max(0, (options.handoffHeadWindowMs || 0) / 1000);

    var out = [];
    for (var t = 0; t < allSegments.length; t++) {
        var segs = allSegments[t] || [];
        if (segs.length === 0) {
            out.push([]);
            continue;
        }

        var expanded = [];
        for (var i = 0; i < segs.length; i++) {
            var s = segs[i];
            var paddedStart = Math.max(0, s.start - pre);
            var paddedEnd = Math.min(totalDurationSec, s.end + post);

            if (crossTrackHeadTrim && pre > 0) {
                var nearbyOtherEnd = findOtherTrackEndNearStart(
                    referenceSegments,
                    t,
                    s.start,
                    pre,
                    handoffHeadWindowSec
                );

                if (isFinite(nearbyOtherEnd)) {
                    var earliestStart = nearbyOtherEnd - handoffHeadLeadSec;
                    if (earliestStart > paddedStart) {
                        paddedStart = Math.min(s.start, earliestStart);
                    }
                }
            }

            if (crossTrackTailTrim && post > 0) {
                var nextOtherStart = findNextOtherTrackStart(referenceSegments, t, s.end);
                if (isFinite(nextOtherStart) && nextOtherStart <= s.end + post + 0.0001) {
                    var capEnd = Math.max(s.end, nextOtherStart + tailAllowanceSec);
                    if (capEnd < paddedEnd) paddedEnd = capEnd;
                }
            }

            expanded.push({
                start: paddedStart,
                end: paddedEnd,
                trackIndex: s.trackIndex
            });
        }

        expanded.sort(function (a, b) { return a.start - b.start; });
        var merged = [expanded[0]];
        for (i = 1; i < expanded.length; i++) {
            var curr = expanded[i];
            var last = merged[merged.length - 1];
            if (curr.start <= last.end + 0.001) {
                if (curr.end > last.end) last.end = curr.end;
            } else {
                merged.push(curr);
            }
        }

        for (i = 0; i < merged.length; i++) {
            merged[i].durationMs = Math.round((merged[i].end - merged[i].start) * 1000);
        }
        out.push(merged);
    }
    return out;
}

function findNextOtherTrackStart(referenceSegments, trackIndex, afterTimeSec) {
    var next = Infinity;
    for (var t = 0; t < referenceSegments.length; t++) {
        if (t === trackIndex) continue;
        var segs = referenceSegments[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var st = segs[i].start;
            if (st > afterTimeSec + 0.0001 && st < next) {
                next = st;
            }
        }
    }
    return next;
}

function findOtherTrackEndNearStart(referenceSegments, trackIndex, startTimeSec, lookbackSec, lookaheadSec) {
    var best = -Infinity;
    var minTime = startTimeSec - Math.max(0, lookbackSec || 0);
    var maxTime = startTimeSec + Math.max(0, lookaheadSec || 0);

    for (var t = 0; t < referenceSegments.length; t++) {
        if (t === trackIndex) continue;
        var segs = referenceSegments[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg) continue;
            if (seg.end < minTime) continue;
            if (seg.start > maxTime) continue;
            if (seg.end > best) best = seg.end;
        }
    }

    return best;
}

module.exports = {
    runSegmentStage: runSegmentStage
};
