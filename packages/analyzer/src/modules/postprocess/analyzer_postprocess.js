/**
 * AutoCast - Analyzer Postprocessing Passes
 *
 * Split into focused pass modules to keep this facade compact.
 * Behavior is intentionally unchanged.
 */

'use strict';

var gapPasses = require('./postprocess_gap_passes');
var continuityPasses = require('./postprocess_continuity_passes');
var prunePasses = require('./postprocess_prune_passes');

module.exports = {
    enforceMinimumSegmentDuration: gapPasses.enforceMinimumSegmentDuration,
    applyPrimaryTrackGapFill: gapPasses.applyPrimaryTrackGapFill,
    cleanupWeakPreTriggers: continuityPasses.cleanupWeakPreTriggers,
    mergeSameTrackNearbySegments: continuityPasses.mergeSameTrackNearbySegments,
    applyDominantTrackStickiness: continuityPasses.applyDominantTrackStickiness,
    smoothCrossTrackHandovers: continuityPasses.smoothCrossTrackHandovers,
    pruneLowSignificanceSegments: prunePasses.pruneLowSignificanceSegments,
    reinforceHighPeakAnchors: continuityPasses.reinforceHighPeakAnchors,
    pruneResidualSnippets: prunePasses.pruneResidualSnippets,
    filterByAbsolutePeakFloor: prunePasses.filterByAbsolutePeakFloor
};
