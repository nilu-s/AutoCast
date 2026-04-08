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
        if (!vadResults[i]) {
            allSegments.push([]);
            continue;
        }
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

    return {
        allSegments: allSegments,
        rawSegments: allSegments
    };
}

module.exports = {
    runSegmentStage: runSegmentStage
};
