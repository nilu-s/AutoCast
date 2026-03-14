'use strict';

var overlapResolver = require('../../modules/overlap/overlap_resolver');

function runOverlapStage(ctx) {
    ctx = ctx || {};

    var params = ctx.params || {};
    var bleedEnabled = !!ctx.bleedEnabled;
    var allSegments = ctx.allSegments || [];
    var rmsProfiles = ctx.rmsProfiles || [];
    var fingerprintResults = ctx.fingerprintResults || [];

    var resolvedSegments;
    if (params.independentTrackAnalysis) {
        resolvedSegments = markAllSegmentsActive(allSegments);
    } else {
        var overlapPolicy = params.overlapPolicy;
        if (!bleedEnabled && (overlapPolicy === 'bleed_safe' || overlapPolicy === 'spectral_bleed_safe')) {
            overlapPolicy = 'dominant_wins';
        }

        resolvedSegments = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
            policy: overlapPolicy,
            frameDurationMs: params.frameDurationMs,
            overlapMarginDb: params.overlapMarginDb,
            bleedMarginDb: params.bleedMarginDb,
            fingerprints: fingerprintResults.length > 0 ? fingerprintResults : null,
            bleedSimilarityThreshold: params.bleedSimilarityThreshold,
            overlapSimilarityThreshold: params.overlapSimilarityThreshold,
            suppressionScoreThreshold: params.suppressionScoreThreshold,
            fillGaps: params.fillGaps
        });
    }

    return {
        resolvedSegments: resolvedSegments,
        overlapResolvedSegments: cloneSegmentsArray(resolvedSegments)
    };
}

function markAllSegmentsActive(allSegments) {
    var out = [];
    for (var t = 0; t < allSegments.length; t++) {
        var segs = allSegments[t] || [];
        var trackOut = [];
        for (var i = 0; i < segs.length; i++) {
            trackOut.push({
                start: segs[i].start,
                end: segs[i].end,
                trackIndex: segs[i].trackIndex,
                state: 'active'
            });
        }
        out.push(trackOut);
    }
    return out;
}

function cloneSegmentsArray(segmentsByTrack) {
    var out = [];
    if (!segmentsByTrack) return out;

    for (var t = 0; t < segmentsByTrack.length; t++) {
        var segs = segmentsByTrack[t] || [];
        var trackOut = [];

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg) continue;
            trackOut.push({
                start: seg.start,
                end: seg.end,
                trackIndex: seg.trackIndex,
                state: seg.state,
                origin: seg.origin,
                durationMs: seg.durationMs
            });
        }

        out.push(trackOut);
    }
    return out;
}

module.exports = {
    runOverlapStage: runOverlapStage
};
