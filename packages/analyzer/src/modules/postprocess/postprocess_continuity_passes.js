'use strict';


var rmsCalc = require('../energy/rms_calculator');
var segmentBuilder = require('../segmentation/segment_builder');
var shared = require('./postprocess_shared_utils');
var clampNumber = shared.clampNumber;
var cloneSegment = shared.cloneSegment;
var computeOtherTrackOverlapRatio = shared.computeOtherTrackOverlapRatio;
var findOverlappingOtherTrackEnd = shared.findOverlappingOtherTrackEnd;
var computeSegmentRmsStats = shared.computeSegmentRmsStats;
var mergeContiguousStateSegments = shared.mergeContiguousStateSegments;
var isLaughterProtectedSegment = shared.isLaughterProtectedSegment;
var getFrameValue = shared.getFrameValue;
var mergeActiveSegments = shared.mergeActiveSegments;

function cleanupWeakPreTriggers(resolvedSegments, rmsProfiles, vadResults, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxDurationSec = Math.max(0, (options.maxDurationMs || 900) / 1000);
    var joinGapSec = Math.max(0, (options.joinGapMs || 1200) / 1000);
    var minPeakDeltaDb = (options.minPeakDeltaDb !== undefined) ? options.minPeakDeltaDb : 4.0;
    var absorbGapSec = Math.max(0, (options.absorbGapMs || 380) / 1000);

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var trackOut = [];
        var dropped = 0;
        var absorbed = 0;

        for (var i = 0; i < segs.length; i++) {
            var cur = segs[i];
            if (!cur || cur.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var nextIndex = i + 1;
            while (nextIndex < segs.length && segs[nextIndex] && segs[nextIndex].state === 'suppressed') nextIndex++;
            if (nextIndex >= segs.length) {
                trackOut.push(cur);
                continue;
            }

            var next = segs[nextIndex];
            if (!next || next.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var curDur = Math.max(0, cur.end - cur.start);
            var gap = Math.max(0, next.start - cur.end);
            if (curDur > maxDurationSec || gap > joinGapSec) {
                trackOut.push(cur);
                continue;
            }

            var curStats = computeSegmentRmsStats(cur, rms, frameDurSec);
            var nextStats = computeSegmentRmsStats(next, rms, frameDurSec);
            if (!curStats || !nextStats) {
                trackOut.push(cur);
                continue;
            }

            var curPeakAbove = curStats.peakDb - thresholdDb;
            var nextPeakAbove = nextStats.peakDb - thresholdDb;
            var peakDelta = nextPeakAbove - curPeakAbove;

            if (peakDelta >= minPeakDeltaDb) {
                if (gap <= absorbGapSec) {
                    var merged = cloneSegment(cur);
                    merged.end = next.end;
                    merged.durationMs = Math.round((merged.end - merged.start) * 1000);
                    trackOut.push(merged);
                    absorbed++;
                    i = nextIndex; // consume next
                } else {
                    if (isLaughterProtectedSegment(cur, t, options, frameDurSec)) {
                        trackOut.push(cur);
                    } else {
                        dropped++;
                    }
                }
                continue;
            }

            trackOut.push(cur);
        }

        if (trackInfos && trackInfos[t]) {
            trackInfos[t].preTriggerDropped = dropped;
            trackInfos[t].preTriggerAbsorbed = absorbed;
        }
        out.push(trackOut);
    }

    return out;
}

function mergeSameTrackNearbySegments(resolvedSegments, rmsProfiles, vadResults, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxGapSec = Math.max(0, (options.maxGapMs || 1400) / 1000);
    var maxOtherOverlapRatio = clampNumber(
        (options.maxOtherOverlapRatio !== undefined) ? options.maxOtherOverlapRatio : 0.20,
        0,
        1
    );
    var minPeakAboveThresholdDb = (options.minPeakAboveThresholdDb !== undefined) ? options.minPeakAboveThresholdDb : 3.0;

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var trackOut = [];
        var mergedCount = 0;

        for (var i = 0; i < segs.length; i++) {
            var cur = segs[i];
            if (!cur || cur.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var nextIndex = i + 1;
            while (nextIndex < segs.length && segs[nextIndex] && segs[nextIndex].state === 'suppressed') nextIndex++;
            if (nextIndex >= segs.length) {
                trackOut.push(cur);
                continue;
            }

            var next = segs[nextIndex];
            if (!next || next.state === 'suppressed') {
                trackOut.push(cur);
                continue;
            }

            var gapStart = cur.end;
            var gapEnd = next.start;
            var gapSec = Math.max(0, gapEnd - gapStart);
            if (gapSec <= 0 || gapSec > maxGapSec) {
                trackOut.push(cur);
                continue;
            }

            var otherOverlapRatio = computeOtherTrackOverlapRatio(resolvedSegments, t, gapStart, gapEnd);
            if (otherOverlapRatio > maxOtherOverlapRatio) {
                trackOut.push(cur);
                continue;
            }

            var curStats = computeSegmentRmsStats(cur, rms, frameDurSec);
            var nextStats = computeSegmentRmsStats(next, rms, frameDurSec);
            if (!curStats || !nextStats) {
                trackOut.push(cur);
                continue;
            }

            var curPeakAbove = curStats.peakDb - thresholdDb;
            var nextPeakAbove = nextStats.peakDb - thresholdDb;
            if (Math.max(curPeakAbove, nextPeakAbove) < minPeakAboveThresholdDb) {
                trackOut.push(cur);
                continue;
            }

            var merged = cloneSegment(cur);
            merged.end = next.end;
            merged.durationMs = Math.round((merged.end - merged.start) * 1000);
            trackOut.push(merged);
            mergedCount++;
            i = nextIndex; // consume next
        }

        if (trackInfos && trackInfos[t]) {
            trackInfos[t].sameTrackGapMerged = mergedCount;
        }
        out.push(trackOut);
    }

    return out;
}

function applyDominantTrackStickiness(resolvedSegments, rmsProfiles, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var holdFrames = Math.max(1, Math.round((options.holdMs || 1400) / frameDurationMs));
    var returnWindowFrames = Math.max(holdFrames, Math.round((options.returnWindowMs || 5000) / frameDurationMs));

    var trackCount = resolvedSegments.length;
    if (trackCount === 0) return resolvedSegments;

    var frameCount = 0;
    for (var t = 0; t < rmsProfiles.length; t++) {
        if (rmsProfiles[t] && rmsProfiles[t].length > frameCount) frameCount = rmsProfiles[t].length;
    }
    if (frameCount === 0) return resolvedSegments;

    var gates = [];
    for (t = 0; t < trackCount; t++) {
        gates[t] = new Uint8Array(frameCount);
        var segs = resolvedSegments[t] || [];
        for (var s = 0; s < segs.length; s++) {
            if (!segs[s] || segs[s].state === 'suppressed') continue;
            var startFrame = Math.max(0, Math.floor(segs[s].start / frameDurSec));
            var endFrame = Math.min(frameCount, Math.ceil(segs[s].end / frameDurSec));
            for (var f = startFrame; f < endFrame; f++) gates[t][f] = 1;
        }
    }

    var dominant = new Int16Array(frameCount);
    for (var f0 = 0; f0 < frameCount; f0++) {
        var bestTrack = -1;
        var bestRms = -1;
        for (t = 0; t < trackCount; t++) {
            if (!gates[t][f0]) continue;
            var val = getFrameValue(rmsProfiles[t], f0, 0);
            if (val > bestRms) {
                bestRms = val;
                bestTrack = t;
            }
        }
        dominant[f0] = bestTrack;
    }

    var addedFramesPerTrack = [];
    for (t = 0; t < trackCount; t++) addedFramesPerTrack[t] = 0;

    var idx = 0;
    while (idx < frameCount) {
        if (dominant[idx] < 0) {
            idx++;
            continue;
        }

        var midTrack = dominant[idx];
        var midStart = idx;
        while (idx < frameCount && dominant[idx] === midTrack) idx++;
        var midEnd = idx;
        var midLen = midEnd - midStart;

        if (midLen > holdFrames) continue;

        var leftTrack = (midStart > 0) ? dominant[midStart - 1] : -1;
        var rightTrack = (midEnd < frameCount) ? dominant[midEnd] : -1;
        if (leftTrack < 0 || rightTrack < 0 || leftTrack !== rightTrack || leftTrack === midTrack) continue;

        var leftRunStart = midStart - 1;
        while (leftRunStart > 0 && dominant[leftRunStart - 1] === leftTrack) leftRunStart--;
        var rightRunEnd = midEnd;
        while (rightRunEnd < frameCount && dominant[rightRunEnd] === rightTrack) rightRunEnd++;

        if ((rightRunEnd - leftRunStart) > returnWindowFrames) continue;

        for (var ff = midStart; ff < midEnd; ff++) {
            if (!gates[leftTrack][ff]) {
                gates[leftTrack][ff] = 1;
                addedFramesPerTrack[leftTrack]++;
            }
        }
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

        if (trackInfos && trackInfos[t]) {
            trackInfos[t].dominantHoldAddedSec = Math.round((addedFramesPerTrack[t] * frameDurSec) * 100) / 100;
        }
    }

    return out;
}

function smoothCrossTrackHandovers(resolvedSegments, rmsProfiles, vadResults, options, trackInfos) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var maxDelaySec = Math.max(0, (options.maxStartDelayMs || 3000) / 1000);
    var leadSec = Math.max(0, (options.leadMs || 220) / 1000);
    var weakOnsetProbeSec = Math.max(frameDurSec, (options.weakOnsetProbeMs || 260) / 1000);
    var maxWeakOverlapLeadSec = Math.max(leadSec, (options.maxWeakOverlapLeadMs || 700) / 1000);
    var onsetPeakMinDb = (options.onsetPeakMinDb !== undefined) ? options.onsetPeakMinDb : 2.0;
    var onsetMeanMinDb = (options.onsetMeanMinDb !== undefined) ? options.onsetMeanMinDb : 0.3;
    var minSegmentSec = Math.max(frameDurSec, (options.minSegmentMs || 120) / 1000);

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;
        var trackOut = [];
        var delayedMs = 0;

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg || seg.state === 'suppressed') {
                trackOut.push(seg);
                continue;
            }

            var adjusted = cloneSegment(seg);
            var otherEnd = findOverlappingOtherTrackEnd(resolvedSegments, t, seg.start);

            if (isFinite(otherEnd) && otherEnd > seg.start) {
                var overlapAtStartSec = otherEnd - seg.start;

                // If overlap is very long and the entering track starts weak,
                // trim weak pre-roll so handovers do not start far too early.
                if (overlapAtStartSec > maxWeakOverlapLeadSec + 0.0001 &&
                    overlapAtStartSec <= maxDelaySec + 0.0001) {
                    var weakProbeEnd = Math.min(adjusted.end, adjusted.start + weakOnsetProbeSec);
                    if (weakProbeEnd > adjusted.start + 0.0001) {
                        var weakProbeStats = computeSegmentRmsStats({
                            start: adjusted.start,
                            end: weakProbeEnd
                        }, rms, frameDurSec);

                        if (weakProbeStats) {
                            var weakProbeMeanAbove = weakProbeStats.meanDb - thresholdDb;
                            if (weakProbeMeanAbove < onsetMeanMinDb) {
                                var weakLeadTarget = otherEnd - maxWeakOverlapLeadSec;
                                var weakLeadMaxStart = adjusted.end - minSegmentSec;
                                if (weakLeadTarget > weakLeadMaxStart) weakLeadTarget = weakLeadMaxStart;
                                if (weakLeadTarget > adjusted.start + 0.0001) {
                                    delayedMs += Math.round((weakLeadTarget - adjusted.start) * 1000);
                                    adjusted.start = weakLeadTarget;
                                    adjusted.durationMs = Math.round((adjusted.end - adjusted.start) * 1000);
                                }
                            }
                        }
                    }
                }

                if (overlapAtStartSec <= maxDelaySec) {
                    var onsetEnd = Math.min(adjusted.end, otherEnd);
                    if (onsetEnd > adjusted.start + 0.0001) {
                        var onsetStats = computeSegmentRmsStats({
                            start: adjusted.start,
                            end: onsetEnd
                        }, rms, frameDurSec);

                        if (onsetStats) {
                            var onsetPeakAbove = onsetStats.peakDb - thresholdDb;
                            var onsetMeanAbove = onsetStats.meanDb - thresholdDb;
                            if (onsetPeakAbove < onsetPeakMinDb && onsetMeanAbove < onsetMeanMinDb) {
                                var targetStart = Math.max(adjusted.start, otherEnd - leadSec);
                                var maxStart = adjusted.end - minSegmentSec;
                                if (targetStart > maxStart) targetStart = maxStart;
                                if (targetStart > adjusted.start + 0.0001) {
                                    delayedMs += Math.round((targetStart - adjusted.start) * 1000);
                                    adjusted.start = targetStart;
                                    adjusted.durationMs = Math.round((adjusted.end - adjusted.start) * 1000);
                                }
                            }
                        }
                    }
                }
            }

            trackOut.push(adjusted);
        }

        var merged = mergeContiguousStateSegments(trackOut);
        if (trackInfos && trackInfos[t]) {
            var prevDelayed = parseFloat(trackInfos[t].handoverStartDelayedMs);
            if (!isFinite(prevDelayed)) prevDelayed = 0;
            trackInfos[t].handoverStartDelayedMs = prevDelayed + delayedMs;
        }
        out.push(merged);
    }

    return out;
}

function reinforceHighPeakAnchors(resolvedSegments, rmsProfiles, vadResults, options, trackInfos, totalDurationSec) {
    options = options || {};
    var frameDurationMs = options.frameDurationMs || 10;
    var frameDurSec = frameDurationMs / 1000;
    var minDbAboveThreshold = (options.minDbAboveThreshold !== undefined) ? options.minDbAboveThreshold : 8.0;
    var prePadSec = Math.max(0, (options.prePadMs || 450) / 1000);
    var postPadSec = Math.max(0, (options.postPadMs || 650) / 1000);
    var minClusterFrames = Math.max(1, Math.round((options.minClusterMs || 60) / frameDurationMs));
    var joinGapFrames = Math.max(0, Math.round((options.joinGapMs || 120) / frameDurationMs));

    var out = [];
    for (var t = 0; t < resolvedSegments.length; t++) {
        var segs = resolvedSegments[t] || [];
        var rms = rmsProfiles[t] || [];
        var thresholdDb = (vadResults[t] && isFinite(vadResults[t].thresholdDb)) ? vadResults[t].thresholdDb : -Infinity;

        var activeBase = [];
        for (var i = 0; i < segs.length; i++) {
            if (!segs[i] || segs[i].state === 'suppressed') continue;
            activeBase.push({
                start: segs[i].start,
                end: segs[i].end,
                trackIndex: t,
                state: 'active'
            });
        }

        var anchors = [];
        var startFrame = -1;
        var lastHotFrame = -1;
        for (var f = 0; f < rms.length; f++) {
            var db = rmsCalc.linearToDb(Math.max(getFrameValue(rms, f, 0), 1e-12));
            var hot = (db - thresholdDb) >= minDbAboveThreshold;

            if (hot) {
                if (startFrame < 0) startFrame = f;
                lastHotFrame = f;
                continue;
            }

            if (startFrame >= 0 && (f - lastHotFrame - 1) <= joinGapFrames) {
                continue;
            }

            if (startFrame >= 0) {
                var endFrame = lastHotFrame + 1;
                if ((endFrame - startFrame) >= minClusterFrames) {
                    var st = Math.max(0, (startFrame * frameDurSec) - prePadSec);
                    var en = Math.min(totalDurationSec, (endFrame * frameDurSec) + postPadSec);
                    anchors.push({ start: st, end: en, trackIndex: t, state: 'active' });
                }
                startFrame = -1;
                lastHotFrame = -1;
            }
        }
        if (startFrame >= 0) {
            var endFrameLast = lastHotFrame + 1;
            if ((endFrameLast - startFrame) >= minClusterFrames) {
                var stLast = Math.max(0, (startFrame * frameDurSec) - prePadSec);
                var enLast = Math.min(totalDurationSec, (endFrameLast * frameDurSec) + postPadSec);
                anchors.push({ start: stLast, end: enLast, trackIndex: t, state: 'active' });
            }
        }

        var merged = mergeActiveSegments(activeBase.concat(anchors));
        if (trackInfos && trackInfos[t]) {
            trackInfos[t].peakAnchorsAdded = Math.max(0, merged.length - activeBase.length);
            trackInfos[t].peakAnchorClusters = anchors.length;
        }
        out.push(merged);
    }

    return out;
}

module.exports = {
    cleanupWeakPreTriggers: cleanupWeakPreTriggers,
    mergeSameTrackNearbySegments: mergeSameTrackNearbySegments,
    applyDominantTrackStickiness: applyDominantTrackStickiness,
    smoothCrossTrackHandovers: smoothCrossTrackHandovers,
    reinforceHighPeakAnchors: reinforceHighPeakAnchors
};
