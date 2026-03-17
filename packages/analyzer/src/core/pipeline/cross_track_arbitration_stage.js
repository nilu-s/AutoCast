'use strict';

var segmentStage = require('./segment_stage');
var overlapStage = require('./overlap_stage');
var bleedSuppressor = require('../../modules/overlap/bleed_suppressor');
var analyzerExtensions = require('../../extensions/analyzer_extensions');

/**
 * Cross-Track Arbitration Stage
 * 
 * Consolidates frame-level bleed suppression and segment-level overlap resolution.
 * This is the central "decision" point for cross-track conflicts.
 */
function runArbitrationStage(ctx) {
    var params = ctx.params || {};
    var trackCount = ctx.trackCount || 0;
    var rmsProfiles = ctx.rmsProfiles || [];
    var vadResults = ctx.vadResults || [];
    var spectralResults = ctx.spectralResults || [];
    var fingerprintResults = ctx.fingerprintResults || [];
    var gateSnapshots = ctx.gateSnapshots || [];
    var progress = ctx.progress || function () { };

    // 1. Frame-level Bleed Suppression
    // This removes frames that are likely bleed from other tracks before segments are built.
    var bleedSuppressResult = bleedSuppressor.applyBleedSuppression({
        params: params,
        trackCount: trackCount,
        rmsProfiles: rmsProfiles,
        vadResults: vadResults,
        spectralResults: spectralResults,
        fingerprintResults: fingerprintResults,
        gateSnapshots: gateSnapshots,
        progress: progress
    });

    vadResults = bleedSuppressResult.vadResults;
    var bleedEnabled = bleedSuppressResult.bleedEnabled;

    // 2. Segment Building
    // Converts the now "clean" frames into raw segments.
    var segmentResult = segmentStage.runSegmentStage({
        params: params,
        trackCount: trackCount,
        totalDurationSec: ctx.totalDurationSec,
        vadResults: vadResults,
        trackInfos: ctx.trackInfos
    });

    var allSegments = segmentResult.allSegments;

    // Hook: onAfterSegments
    if (ctx.extensions) {
        analyzerExtensions.invokeHook(ctx.extensions, 'onAfterSegments', {
            segments: allSegments,
            trackInfos: ctx.trackInfos,
            params: params
        });
    }

    // 3. Segment-level Overlap Resolution
    // Resolves overlaps between segments using policies (dominant_wins, bleed_safe, etc.)
    var overlapResult = overlapStage.runOverlapStage({
        params: params,
        bleedEnabled: bleedEnabled,
        allSegments: allSegments,
        rmsProfiles: rmsProfiles,
        fingerprintResults: fingerprintResults
    });

    return {
        resolvedSegments: overlapResult.resolvedSegments,
        overlapResolvedSegments: overlapResult.overlapResolvedSegments,
        allSegments: allSegments, // Raw segments for reference
        vadResults: vadResults  // Refined VAD results
    };
}

module.exports = {
    runArbitrationStage: runArbitrationStage
};
