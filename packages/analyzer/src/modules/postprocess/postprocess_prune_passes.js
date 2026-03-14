'use strict';


var shared = require('./postprocess_shared_utils');
var clampNumber = shared.clampNumber;
var computeOtherTrackOverlapRatio = shared.computeOtherTrackOverlapRatio;
var computeSegmentRmsStats = shared.computeSegmentRmsStats;
var mergeContiguousStateSegments = shared.mergeContiguousStateSegments;
var isLaughterProtectedSegment = shared.isLaughterProtectedSegment;
var findNeighborActive = shared.findNeighborActive;

function pruneLowSignificanceSegments(resolvedSegments, rmsProfiles, vadResults, options, trackInfos, phaseLabel) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxDurationSec = Math.max(0, (options.maxDurationMs || 1800) / 1000);
    var minPeakAboveThresholdDb = (options.minPeakAboveThresholdDb !== undefined) ? options.minPeakAboveThresholdDb : 1.5;
    var minMeanAboveThresholdDb = (options.minMeanAboveThresholdDb !== undefined) ? options.minMeanAboveThresholdDb : -1.0;

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var kept = [];
        var prunedCount = 0;

        for (var s = 0; s < segs.length; s++) {
            var seg = segs[s];
            if (!seg || seg.state === 'suppressed') {
                kept.push(seg);
                continue;
            }

            var durSec = Math.max(0, seg.end - seg.start);
            if (durSec <= 0 || durSec > maxDurationSec) {
                kept.push(seg);
                continue;
            }

            var stats = computeSegmentRmsStats(seg, rms, frameDurSec);
            if (!stats) {
                kept.push(seg);
                continue;
            }

            var peakAboveThreshold = stats.peakDb - thresholdDb;
            var meanAboveThreshold = stats.meanDb - thresholdDb;

            if (peakAboveThreshold < minPeakAboveThresholdDb &&
                meanAboveThreshold < minMeanAboveThresholdDb) {
                if (isLaughterProtectedSegment(seg, t, options, frameDurSec)) {
                    kept.push(seg);
                } else {
                    prunedCount++;
                }
                continue;
            }

            kept.push(seg);
        }

        if (trackInfos && trackInfos[t]) {
            if (phaseLabel === 'pre') {
                trackInfos[t].lowSignificancePrunedPre = prunedCount;
            } else if (phaseLabel === 'post') {
                trackInfos[t].lowSignificancePrunedPost = prunedCount;
            }
            trackInfos[t].lowSignificancePruned =
                (trackInfos[t].lowSignificancePrunedPre || 0) +
                (trackInfos[t].lowSignificancePrunedPost || 0);
        }
        out.push(kept);
    }

    return out;
}

function pruneResidualSnippets(resolvedSegments, rmsProfiles, rawRmsProfiles, vadResults, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxDurationSec = Math.max(0, (options.maxDurationMs || 220) / 1000);
    var minPeakAboveThresholdDb = (options.minPeakAboveThresholdDb !== undefined) ? options.minPeakAboveThresholdDb : 2.5;
    var minMeanAboveThresholdDb = (options.minMeanAboveThresholdDb !== undefined) ? options.minMeanAboveThresholdDb : -0.5;
    var maxPeakDbFs = (options.maxPeakDbFs !== undefined) ? options.maxPeakDbFs : -53.0;
    var maxMeanDbFs = (options.maxMeanDbFs !== undefined) ? options.maxMeanDbFs : -57.0;
    var protectGapSec = Math.max(0, (options.protectGapMs || 240) / 1000);
    var protectOtherOverlapRatio = clampNumber(
        (options.protectOtherOverlapRatio !== undefined) ? options.protectOtherOverlapRatio : 0.12,
        0,
        1
    );

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var rmsRaw = (rawRmsProfiles && rawRmsProfiles[t]) ? rawRmsProfiles[t] : rms;
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var trackOut = [];
        var pruned = 0;

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg || seg.state === 'suppressed') {
                trackOut.push(seg);
                continue;
            }

            var durSec = Math.max(0, seg.end - seg.start);
            if (durSec <= 0 || durSec > maxDurationSec) {
                trackOut.push(seg);
                continue;
            }

            var prevActive = findNeighborActive(segs, i, -1);
            var nextActive = findNeighborActive(segs, i, 1);
            // Keep boundary snippets unless they are clearly weak in absolute dBFS.
            if (!prevActive || !nextActive) {
                var edgeStats = computeSegmentRmsStats(seg, rmsRaw, frameDurSec);
                if (!edgeStats) {
                    trackOut.push(seg);
                    continue;
                }
                var weakEdgeByAbsolute = edgeStats.peakDb <= maxPeakDbFs && edgeStats.meanDb <= maxMeanDbFs;
                if (!weakEdgeByAbsolute) {
                    trackOut.push(seg);
                    continue;
                }
                if (isLaughterProtectedSegment(seg, t, options, frameDurSec)) {
                    trackOut.push(seg);
                } else {
                    pruned++;
                }
                continue;
            }

            if (prevActive && nextActive) {
                var leftGap = Math.max(0, seg.start - prevActive.end);
                var rightGap = Math.max(0, nextActive.start - seg.end);
                if (leftGap <= protectGapSec || rightGap <= protectGapSec) {
                    trackOut.push(seg);
                    continue;
                }
            }

            var overlapRatio = computeOtherTrackOverlapRatio(resolvedSegments, t, seg.start, seg.end);
            if (overlapRatio > protectOtherOverlapRatio) {
                trackOut.push(seg);
                continue;
            }

            var stats = computeSegmentRmsStats(seg, rms, frameDurSec);
            var rawStats = computeSegmentRmsStats(seg, rmsRaw, frameDurSec);
            if (!stats || !rawStats) {
                trackOut.push(seg);
                continue;
            }

            var peakAboveThreshold = stats.peakDb - thresholdDb;
            var meanAboveThreshold = stats.meanDb - thresholdDb;
            var weakByRelative = peakAboveThreshold < minPeakAboveThresholdDb &&
                meanAboveThreshold < minMeanAboveThresholdDb;
            var weakByAbsolute = rawStats.peakDb <= maxPeakDbFs &&
                rawStats.meanDb <= maxMeanDbFs;
            if (!(weakByRelative || weakByAbsolute)) {
                trackOut.push(seg);
                continue;
            }

            if (isLaughterProtectedSegment(seg, t, options, frameDurSec)) {
                trackOut.push(seg);
            } else {
                pruned++;
            }
        }

        var merged = mergeContiguousStateSegments(trackOut);
        if (trackInfos && trackInfos[t]) {
            trackInfos[t].residualSnippetsPruned = pruned;
        }
        out.push(merged);
    }
    return out;
}

function filterByAbsolutePeakFloor(resolvedSegments, rmsProfiles, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var minPeakDbFs = (options.minPeakDbFs !== undefined) ? options.minPeakDbFs : -52.0;

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var kept = [];
        var pruned = 0;

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg || seg.state === 'suppressed') {
                kept.push(seg);
                continue;
            }

            var stats = computeSegmentRmsStats(seg, rms, frameDurSec);
            if (!stats) {
                // If stats are unavailable, keep segment to avoid accidental data loss.
                kept.push(seg);
                continue;
            }

            if (stats.peakDb < minPeakDbFs) {
                if (isLaughterProtectedSegment(seg, t, options, frameDurSec)) {
                    kept.push(seg);
                } else {
                    pruned++;
                }
                continue;
            }

            kept.push(seg);
        }

        var merged = mergeContiguousStateSegments(kept);
        if (trackInfos && trackInfos[t]) {
            trackInfos[t].finalPeakFloorPruned = pruned;
        }
        out.push(merged);
    }

    return out;
}

module.exports = {
    pruneLowSignificanceSegments: pruneLowSignificanceSegments,
    pruneResidualSnippets: pruneResidualSnippets,
    filterByAbsolutePeakFloor: filterByAbsolutePeakFloor
};
