/**
 * AutoCast - Analyzer Postprocessing Passes
 *
 * Extracted from analyzer.js to keep the main pipeline readable.
 * Behavior is intentionally unchanged.
 */

'use strict';

var rmsCalc = require('./rms_calculator');
var segmentBuilder = require('./segment_builder');

function enforceMinimumSegmentDuration(segmentsArray, minSec) {
    var out = [];
    for (var i = 0; i < segmentsArray.length; i++) {
        var trackSegs = JSON.parse(JSON.stringify(segmentsArray[i]));
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
    var out = {
        start: seg.start,
        end: seg.end,
        trackIndex: seg.trackIndex,
        state: seg.state
    };
    if (seg.durationMs !== undefined) out.durationMs = seg.durationMs;
    return out;
}

function clampNumber(v, min, max) {
    return Math.max(min, Math.min(max, v));
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
    enforceMinimumSegmentDuration: enforceMinimumSegmentDuration,
    applyPrimaryTrackGapFill: applyPrimaryTrackGapFill,
    cleanupWeakPreTriggers: cleanupWeakPreTriggers,
    mergeSameTrackNearbySegments: mergeSameTrackNearbySegments,
    applyDominantTrackStickiness: applyDominantTrackStickiness,
    smoothCrossTrackHandovers: smoothCrossTrackHandovers,
    pruneLowSignificanceSegments: pruneLowSignificanceSegments,
    reinforceHighPeakAnchors: reinforceHighPeakAnchors,
    pruneResidualSnippets: pruneResidualSnippets,
    filterByAbsolutePeakFloor: filterByAbsolutePeakFloor
};
