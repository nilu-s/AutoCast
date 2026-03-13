'use strict';

var rmsCalc = require('./rms_calculator');

function buildCutPreview(ctx) {
    ctx = ctx || {};

    var trackInfos = Array.isArray(ctx.trackInfos) ? ctx.trackInfos : [];
    var sourceSegments = cloneSegmentsByTrack(ctx.sourceSegments);
    var overlapSegments = cloneSegmentsByTrack(ctx.overlapSegments);
    var finalSegments = cloneSegmentsByTrack(ctx.finalSegments);
    var rmsProfiles = Array.isArray(ctx.rmsProfiles) ? ctx.rmsProfiles : [];
    var spectralResults = Array.isArray(ctx.spectralResults) ? ctx.spectralResults : [];
    var gateSnapshots = Array.isArray(ctx.gateSnapshots) ? ctx.gateSnapshots : [];
    var params = ctx.params || {};
    var frameDurationMs = isFiniteNumber(ctx.frameDurationMs) ? ctx.frameDurationMs : 10;
    var frameDurSec = frameDurationMs / 1000;
    var totalDurationSec = isFiniteNumber(ctx.totalDurationSec)
        ? Math.max(0, ctx.totalDurationSec)
        : computeMaxEnd(finalSegments);

    if (overlapSegments.length === 0) overlapSegments = sourceSegments;
    if (finalSegments.length === 0) finalSegments = overlapSegments;

    var trackCount = Math.max(trackInfos.length, overlapSegments.length, finalSegments.length, sourceSegments.length);
    if (trackCount <= 0) {
        return {
            items: [],
            lanes: [],
            summary: {
                totalItems: 0,
                keptCount: 0,
                nearMissCount: 0,
                suppressedCount: 0,
                selectedCount: 0,
                avgScore: 0,
                trackCount: 0,
                totalDurationSec: 0
            }
        };
    }

    normalizeTrackArrays(trackCount, sourceSegments, overlapSegments, finalSegments);

    var overlapActiveMaps = buildFrameActivityMaps(overlapSegments, frameDurSec, false);
    var finalActiveMaps = buildFrameActivityMaps(finalSegments, frameDurSec, false);
    var itemCounter = 0;
    var items = [];
    var laneIdBuckets = [];
    var t;

    for (t = 0; t < trackCount; t++) {
        laneIdBuckets[t] = [];
    }

    for (t = 0; t < trackCount; t++) {
        var overlapTrackSegs = overlapSegments[t] || [];
        for (var s = 0; s < overlapTrackSegs.length; s++) {
            var overlapSeg = overlapTrackSegs[s];
            if (!overlapSeg) continue;

            var span = normalizeSegmentSpan(overlapSeg);
            if (!span) continue;

            var keepCoverage = computeCoverageByState(finalSegments[t], span.start, span.end, 'active');
            var decisionState = 'near_miss';
            var decisionStage = 'postprocess_pruned';

            if (overlapSeg.state === 'suppressed') {
                decisionState = 'suppressed';
                decisionStage = 'overlap_resolve';
            } else if (keepCoverage > 0.55) {
                decisionState = 'kept';
                decisionStage = 'final_kept';
            }

            var metrics = computeMetrics({
                trackIndex: t,
                start: span.start,
                end: span.end,
                frameDurSec: frameDurSec,
                thresholdDb: getTrackThresholdDb(trackInfos, t),
                rmsProfiles: rmsProfiles,
                spectralResults: spectralResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                finalActiveMaps: finalActiveMaps,
                state: decisionState
            });

            var scoreInfo = computeScore(decisionState, span.durationSec, metrics);
            var typeInfo = classifyType(decisionState, scoreInfo.score, metrics, params);
            var reasons = buildReasons(decisionState, metrics, scoreInfo, typeInfo);

            itemCounter++;
            var item = {
                id: buildItemId(t, span.start, span.end, itemCounter),
                trackIndex: t,
                trackName: getTrackName(trackInfos, t),
                trackColor: null,
                laneIndex: t,
                start: round(span.start, 4),
                end: round(span.end, 4),
                durationMs: Math.max(1, Math.round(span.durationSec * 1000)),
                state: decisionState,
                selected: decisionState === 'kept',
                score: scoreInfo.score,
                scoreLabel: scoreInfo.label,
                reasons: reasons,
                typeLabel: typeInfo.label,
                typeConfidence: typeInfo.confidence,
                sourceClipIndex: null,
                mediaPath: getTrackPath(trackInfos, t),
                sourceStartSec: round(span.start, 4),
                sourceEndSec: round(span.end, 4),
                decisionStage: decisionStage,
                overlapInfo: metrics.overlapInfo,
                metrics: metrics.values
            };

            items.push(item);
            laneIdBuckets[t].push(item.id);
        }
    }

    for (t = 0; t < trackCount; t++) {
        var finalActiveSegs = filterSegmentsByState(finalSegments[t], 'active');
        for (var j = 0; j < finalActiveSegs.length; j++) {
            var finalSeg = normalizeSegmentSpan(finalActiveSegs[j]);
            if (!finalSeg) continue;
            if (hasMatchingItem(items, t, finalSeg.start, finalSeg.end)) continue;

            var finalMetrics = computeMetrics({
                trackIndex: t,
                start: finalSeg.start,
                end: finalSeg.end,
                frameDurSec: frameDurSec,
                thresholdDb: getTrackThresholdDb(trackInfos, t),
                rmsProfiles: rmsProfiles,
                spectralResults: spectralResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                finalActiveMaps: finalActiveMaps,
                state: 'kept'
            });
            var finalScoreInfo = computeScore('kept', finalSeg.durationSec, finalMetrics);
            var finalTypeInfo = classifyType('kept', finalScoreInfo.score, finalMetrics, params);
            var finalReasons = buildReasons('kept', finalMetrics, finalScoreInfo, finalTypeInfo);

            itemCounter++;
            var addedItem = {
                id: buildItemId(t, finalSeg.start, finalSeg.end, itemCounter),
                trackIndex: t,
                trackName: getTrackName(trackInfos, t),
                trackColor: null,
                laneIndex: t,
                start: round(finalSeg.start, 4),
                end: round(finalSeg.end, 4),
                durationMs: Math.max(1, Math.round(finalSeg.durationSec * 1000)),
                state: 'kept',
                selected: true,
                score: finalScoreInfo.score,
                scoreLabel: finalScoreInfo.label,
                reasons: finalReasons,
                typeLabel: finalTypeInfo.label,
                typeConfidence: finalTypeInfo.confidence,
                sourceClipIndex: null,
                mediaPath: getTrackPath(trackInfos, t),
                sourceStartSec: round(finalSeg.start, 4),
                sourceEndSec: round(finalSeg.end, 4),
                decisionStage: 'postprocess_added',
                overlapInfo: finalMetrics.overlapInfo,
                metrics: finalMetrics.values
            };
            items.push(addedItem);
            laneIdBuckets[t].push(addedItem.id);
        }
    }

    items.sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
        return a.end - b.end;
    });

    var lanes = [];
    for (t = 0; t < trackCount; t++) {
        lanes.push({
            laneIndex: t,
            trackIndex: t,
            trackName: getTrackName(trackInfos, t),
            trackColor: null,
            itemIds: laneIdBuckets[t]
        });
    }

    var summary = buildSummary(items, trackCount, totalDurationSec);
    return {
        items: items,
        lanes: lanes,
        summary: summary
    };
}

function normalizeTrackArrays(trackCount, sourceSegments, overlapSegments, finalSegments) {
    for (var i = 0; i < trackCount; i++) {
        if (!Array.isArray(sourceSegments[i])) sourceSegments[i] = [];
        if (!Array.isArray(overlapSegments[i])) overlapSegments[i] = sourceSegments[i];
        if (!Array.isArray(finalSegments[i])) finalSegments[i] = overlapSegments[i];
    }
}

function computeMetrics(ctx) {
    var startFrame = Math.max(0, Math.floor(ctx.start / ctx.frameDurSec));
    var endFrame = Math.max(startFrame + 1, Math.ceil(ctx.end / ctx.frameDurSec));
    var rmsTrack = ctx.rmsProfiles[ctx.trackIndex] || [];
    var spectralTrack = (ctx.spectralResults[ctx.trackIndex] && ctx.spectralResults[ctx.trackIndex].confidence)
        ? ctx.spectralResults[ctx.trackIndex].confidence
        : null;
    var speakerSimilarity = (ctx.gateSnapshots[ctx.trackIndex] &&
        ctx.gateSnapshots[ctx.trackIndex].speakerDebug &&
        ctx.gateSnapshots[ctx.trackIndex].speakerDebug.similarity)
        ? ctx.gateSnapshots[ctx.trackIndex].speakerDebug.similarity
        : null;

    var meanLin = averageRange(rmsTrack, startFrame, endFrame, 0);
    var peakLin = maxRange(rmsTrack, startFrame, endFrame, 0);
    var meanDb = rmsCalc.linearToDb(Math.max(meanLin, 1e-12));
    var peakDb = rmsCalc.linearToDb(Math.max(peakLin, 1e-12));
    var thresholdDb = isFiniteNumber(ctx.thresholdDb) ? ctx.thresholdDb : -60;

    var spectralConfidence = clamp(averageRange(spectralTrack, startFrame, endFrame, 0), 0, 1);
    var speakerLockScore = clamp(averageRange(speakerSimilarity, startFrame, endFrame, spectralConfidence), 0, 1);

    var overlapStats = computeOverlapStats(
        ctx.trackIndex,
        startFrame,
        endFrame,
        ctx.overlapActiveMaps,
        ctx.rmsProfiles
    );

    var postprocessPenalty = computePostprocessPenalty(ctx.state, {
        peakOverThreshold: peakDb - thresholdDb,
        meanOverThreshold: meanDb - thresholdDb,
        spectralConfidence: spectralConfidence,
        overlapPenalty: overlapStats.penalty
    });

    return {
        values: {
            meanOverThreshold: round(meanDb - thresholdDb, 2),
            peakOverThreshold: round(peakDb - thresholdDb, 2),
            spectralConfidence: round(spectralConfidence, 3),
            overlapPenalty: round(overlapStats.penalty, 3),
            speakerLockScore: round(speakerLockScore, 3),
            postprocessPenalty: round(postprocessPenalty, 3)
        },
        overlapInfo: {
            overlapRatio: round(overlapStats.overlapRatio, 3),
            strongerOverlapRatio: round(overlapStats.strongerRatio, 3),
            dominantTrackIndex: overlapStats.dominantTrackIndex
        }
    };
}

function computeOverlapStats(trackIndex, startFrame, endFrame, activeMaps, rmsProfiles) {
    var frameCount = Math.max(1, endFrame - startFrame);
    var overlapFrames = 0;
    var strongerFrames = 0;
    var penaltyAcc = 0;
    var dominantCounter = {};

    for (var f = startFrame; f < endFrame; f++) {
        var selfActive = getFrameValue(activeMaps[trackIndex], f, 0) > 0;
        if (!selfActive) continue;

        var selfRms = getFrameValue(rmsProfiles[trackIndex], f, 0);
        var hasOverlap = false;
        var dominantTrack = -1;
        var dominantRms = selfRms;

        for (var t = 0; t < activeMaps.length; t++) {
            if (t === trackIndex) continue;
            if (getFrameValue(activeMaps[t], f, 0) <= 0) continue;
            hasOverlap = true;
            var otherRms = getFrameValue(rmsProfiles[t], f, 0);
            if (otherRms > dominantRms) {
                dominantRms = otherRms;
                dominantTrack = t;
            }
        }

        if (!hasOverlap) continue;
        overlapFrames++;

        if (dominantTrack >= 0) {
            strongerFrames++;
            dominantCounter[dominantTrack] = (dominantCounter[dominantTrack] || 0) + 1;
            var strength = dominantRms / Math.max(selfRms, 1e-12);
            penaltyAcc += clamp((strength - 1) / 4, 0, 1);
        } else {
            penaltyAcc += 0.12;
        }
    }

    var dominantTrackIndex = -1;
    var dominantCount = 0;
    for (var key in dominantCounter) {
        if (!dominantCounter.hasOwnProperty(key)) continue;
        if (dominantCounter[key] > dominantCount) {
            dominantCount = dominantCounter[key];
            dominantTrackIndex = parseInt(key, 10);
        }
    }

    return {
        overlapRatio: overlapFrames / frameCount,
        strongerRatio: strongerFrames / frameCount,
        penalty: overlapFrames > 0 ? clamp(penaltyAcc / overlapFrames, 0, 1) : 0,
        dominantTrackIndex: dominantTrackIndex
    };
}

function computePostprocessPenalty(state, metrics) {
    var relativeWeakness = clamp((0 - metrics.peakOverThreshold) / 8, 0, 1);
    var meanWeakness = clamp((0 - metrics.meanOverThreshold) / 8, 0, 1);
    var spectralWeakness = 1 - clamp(metrics.spectralConfidence, 0, 1);
    var overlapPenalty = clamp(metrics.overlapPenalty, 0, 1);

    if (state === 'suppressed') {
        return clamp(0.72 + overlapPenalty * 0.25, 0, 1);
    }
    if (state === 'near_miss') {
        return clamp(0.42 + relativeWeakness * 0.28 + meanWeakness * 0.18 + spectralWeakness * 0.12, 0, 1);
    }
    return clamp(0.08 + overlapPenalty * 0.10 + relativeWeakness * 0.06, 0, 1);
}

function computeScore(state, durationSec, metrics) {
    var durationNorm = clamp(durationSec / 2.2, 0, 1);
    var peakNorm = clamp((metrics.values.peakOverThreshold + 2.0) / 14.0, 0, 1);
    var meanNorm = clamp((metrics.values.meanOverThreshold + 3.0) / 10.0, 0, 1);
    var spectralNorm = clamp(metrics.values.spectralConfidence, 0, 1);
    var speakerNorm = clamp(metrics.values.speakerLockScore, 0, 1);
    var overlapPenalty = clamp(metrics.values.overlapPenalty, 0, 1);
    var postprocessPenalty = clamp(metrics.values.postprocessPenalty, 0, 1);

    var stateAdjust = 0;
    if (state === 'kept') {
        stateAdjust = 0.10;
    } else if (state === 'near_miss') {
        stateAdjust = 0.02;
    } else {
        stateAdjust = -0.10;
    }

    var norm = 0;
    norm += durationNorm * 0.22;
    norm += peakNorm * 0.24;
    norm += meanNorm * 0.20;
    norm += spectralNorm * 0.16;
    norm += speakerNorm * 0.10;
    norm += stateAdjust;
    norm -= overlapPenalty * 0.14;
    norm -= postprocessPenalty * 0.16;
    norm = clamp(norm, 0, 1);

    var score = Math.round(norm * 100);
    var label = 'weak';
    if (score >= 70) label = 'strong';
    else if (score >= 45) label = 'borderline';

    return {
        score: score,
        label: label
    };
}

function classifyType(state, score, metrics, params) {
    var minSpectral = isFiniteNumber(params.spectralMinConfidence) ? params.spectralMinConfidence : 0.18;
    var peak = metrics.values.peakOverThreshold;
    var mean = metrics.values.meanOverThreshold;
    var spectral = metrics.values.spectralConfidence;
    var overlapPenalty = metrics.values.overlapPenalty;
    var postPenalty = metrics.values.postprocessPenalty;
    var speaker = metrics.values.speakerLockScore;

    var label = 'unknown';
    var confidence = 35;

    if (state === 'suppressed') {
        if (overlapPenalty >= 0.55) {
            label = 'suppressed_bleed';
            confidence = 60 + Math.round(overlapPenalty * 35);
        } else {
            label = 'overlap_candidate';
            confidence = 45 + Math.round(overlapPenalty * 45);
        }
        return {
            label: label,
            confidence: clamp(Math.round(confidence), 0, 100)
        };
    }

    if (state === 'near_miss') {
        if (score >= 45 || spectral >= (minSpectral - 0.05)) {
            label = 'borderline_speech';
            confidence = 48 + Math.round((score / 100) * 28);
        } else {
            label = 'weak_voice';
            confidence = 40 + Math.round((1 - postPenalty) * 18);
        }
        return {
            label: label,
            confidence: clamp(Math.round(confidence), 0, 100)
        };
    }

    if (overlapPenalty >= 0.5) {
        label = 'overlap_candidate';
        confidence = 50 + Math.round(overlapPenalty * 30);
    } else if (score >= 70 && spectral >= Math.max(minSpectral, 0.30) && (peak > 0 || mean > -0.5)) {
        label = 'primary_speech';
        confidence = Math.round((clamp(peak / 12, 0, 1) * 0.35 +
            clamp(mean / 8, 0, 1) * 0.20 +
            clamp(spectral, 0, 1) * 0.30 +
            clamp(speaker, 0, 1) * 0.15) * 100);
    } else if (score >= 45) {
        label = 'borderline_speech';
        confidence = 50 + Math.round((score / 100) * 24);
    } else {
        label = 'weak_voice';
        confidence = 35 + Math.round((1 - postPenalty) * 20);
    }

    return {
        label: label,
        confidence: clamp(Math.round(confidence), 0, 100)
    };
}

function buildReasons(state, metrics, scoreInfo, typeInfo) {
    var out = [];
    var vals = metrics.values;

    if (state === 'kept') out.push('Kept in final decision');
    if (state === 'near_miss') out.push('Pruned in postprocess pass');
    if (state === 'suppressed') out.push('Suppressed in overlap resolution');

    if (vals.peakOverThreshold >= 4) out.push('Peak is clearly above gate threshold');
    else if (vals.peakOverThreshold >= 0) out.push('Peak is just above threshold');
    else out.push('Peak stays below keep threshold');

    if (vals.spectralConfidence >= 0.45) out.push('High spectral speech confidence');
    else if (vals.spectralConfidence >= 0.25) out.push('Moderate spectral confidence');
    else out.push('Low spectral confidence');

    if (vals.overlapPenalty >= 0.55) out.push('Strong overlap/bleed pressure');
    else if (vals.overlapPenalty >= 0.25) out.push('Some overlap competition');

    if (vals.speakerLockScore >= 0.62) out.push('Speaker-lock similarity is strong');
    else if (vals.speakerLockScore < 0.35) out.push('Weak speaker-lock similarity');

    if (scoreInfo.label === 'borderline') out.push('Ranked as borderline confidence');
    if (typeInfo.label === 'suppressed_bleed') out.push('Pattern matches likely bleed');

    var deduped = [];
    var seen = {};
    for (var i = 0; i < out.length; i++) {
        if (seen[out[i]]) continue;
        seen[out[i]] = true;
        deduped.push(out[i]);
    }

    while (deduped.length < 2) {
        deduped.push('Heuristic score-based classification');
    }
    if (deduped.length > 5) deduped = deduped.slice(0, 5);
    return deduped;
}

function buildSummary(items, trackCount, totalDurationSec) {
    var kept = 0;
    var nearMiss = 0;
    var suppressed = 0;
    var selected = 0;
    var scoreSum = 0;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.state === 'kept') kept++;
        else if (item.state === 'near_miss') nearMiss++;
        else suppressed++;

        if (item.selected) selected++;
        scoreSum += item.score || 0;
    }

    return {
        totalItems: items.length,
        keptCount: kept,
        nearMissCount: nearMiss,
        suppressedCount: suppressed,
        selectedCount: selected,
        avgScore: items.length > 0 ? round(scoreSum / items.length, 1) : 0,
        trackCount: trackCount,
        totalDurationSec: round(totalDurationSec, 3)
    };
}

function hasMatchingItem(items, trackIndex, start, end) {
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.trackIndex !== trackIndex) continue;
        var overlap = getOverlapSec(item.start, item.end, start, end);
        if (overlap <= 0) continue;
        var itemDur = Math.max(1e-6, item.end - item.start);
        var segDur = Math.max(1e-6, end - start);
        if ((overlap / itemDur) >= 0.60 || (overlap / segDur) >= 0.60) {
            return true;
        }
    }
    return false;
}

function computeCoverageByState(trackSegs, start, end, wantedState) {
    if (!Array.isArray(trackSegs) || trackSegs.length === 0) return 0;
    var dur = Math.max(1e-6, end - start);
    var covered = 0;

    for (var i = 0; i < trackSegs.length; i++) {
        var seg = trackSegs[i];
        if (!seg) continue;
        var state = seg.state || 'active';
        if (wantedState && state !== wantedState) continue;
        covered += getOverlapSec(start, end, seg.start, seg.end);
    }
    return covered / dur;
}

function filterSegmentsByState(segs, state) {
    var out = [];
    if (!Array.isArray(segs)) return out;
    for (var i = 0; i < segs.length; i++) {
        if (!segs[i]) continue;
        var segState = segs[i].state || 'active';
        if (segState === state) out.push(segs[i]);
    }
    return out;
}

function buildFrameActivityMaps(segmentsByTrack, frameDurSec, includeSuppressed) {
    var out = [];
    var maxEnd = computeMaxEnd(segmentsByTrack);
    var frameCount = Math.max(1, Math.ceil(maxEnd / Math.max(1e-6, frameDurSec)));

    for (var t = 0; t < segmentsByTrack.length; t++) {
        var map = new Uint8Array(frameCount);
        var segs = segmentsByTrack[t] || [];

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg) continue;
            if (!includeSuppressed && seg.state === 'suppressed') continue;
            var st = Math.max(0, Math.floor(seg.start / frameDurSec));
            var en = Math.min(frameCount, Math.ceil(seg.end / frameDurSec));
            for (var f = st; f < en; f++) map[f] = 1;
        }

        out.push(map);
    }
    return out;
}

function cloneSegmentsByTrack(segmentsByTrack) {
    if (!Array.isArray(segmentsByTrack)) return [];
    var out = [];
    for (var t = 0; t < segmentsByTrack.length; t++) {
        var segs = segmentsByTrack[t];
        if (!Array.isArray(segs)) {
            out.push([]);
            continue;
        }
        var trackOut = [];
        for (var i = 0; i < segs.length; i++) {
            if (!segs[i]) continue;
            trackOut.push({
                start: parseNum(segs[i].start, 0),
                end: parseNum(segs[i].end, 0),
                trackIndex: isFiniteNumber(segs[i].trackIndex) ? segs[i].trackIndex : t,
                state: segs[i].state || 'active'
            });
        }
        out.push(trackOut);
    }
    return out;
}

function normalizeSegmentSpan(seg) {
    if (!seg) return null;
    var start = parseNum(seg.start, 0);
    var end = parseNum(seg.end, start);
    if (!(end > start)) return null;
    return {
        start: start,
        end: end,
        durationSec: end - start
    };
}

function averageRange(arr, start, end, fallback) {
    if (!arr || typeof arr.length !== 'number' || arr.length === 0) return fallback;
    var st = Math.max(0, start);
    var en = Math.min(arr.length, end);
    if (en <= st) return fallback;
    var sum = 0;
    var count = 0;
    for (var i = st; i < en; i++) {
        var v = arr[i];
        if (!isFiniteNumber(v)) continue;
        sum += v;
        count++;
    }
    if (count <= 0) return fallback;
    return sum / count;
}

function maxRange(arr, start, end, fallback) {
    if (!arr || typeof arr.length !== 'number' || arr.length === 0) return fallback;
    var st = Math.max(0, start);
    var en = Math.min(arr.length, end);
    if (en <= st) return fallback;
    var best = -Infinity;
    for (var i = st; i < en; i++) {
        var v = arr[i];
        if (!isFiniteNumber(v)) continue;
        if (v > best) best = v;
    }
    if (!isFiniteNumber(best)) return fallback;
    return best;
}

function getFrameValue(arr, idx, fallback) {
    if (!arr || idx < 0 || idx >= arr.length) return fallback;
    return arr[idx];
}

function getTrackName(trackInfos, trackIndex) {
    if (trackInfos[trackIndex] && trackInfos[trackIndex].name) return trackInfos[trackIndex].name;
    return 'Track ' + (trackIndex + 1);
}

function getTrackPath(trackInfos, trackIndex) {
    if (trackInfos[trackIndex] && trackInfos[trackIndex].path) return trackInfos[trackIndex].path;
    return null;
}

function getTrackThresholdDb(trackInfos, trackIndex) {
    if (trackInfos[trackIndex] && isFiniteNumber(trackInfos[trackIndex].thresholdDb)) {
        return trackInfos[trackIndex].thresholdDb;
    }
    return -60;
}

function buildItemId(trackIndex, start, end, counter) {
    var startMs = Math.max(0, Math.round(start * 1000));
    var endMs = Math.max(startMs + 1, Math.round(end * 1000));
    return 'cp_' + trackIndex + '_' + startMs + '_' + endMs + '_' + counter;
}

function computeMaxEnd(segmentsByTrack) {
    var maxEnd = 0;
    if (!Array.isArray(segmentsByTrack)) return maxEnd;
    for (var t = 0; t < segmentsByTrack.length; t++) {
        var segs = segmentsByTrack[t] || [];
        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            if (!seg) continue;
            var end = parseNum(seg.end, 0);
            if (end > maxEnd) maxEnd = end;
        }
    }
    return maxEnd;
}

function getOverlapSec(aStart, aEnd, bStart, bEnd) {
    var st = Math.max(aStart, bStart);
    var en = Math.min(aEnd, bEnd);
    if (en <= st) return 0;
    return en - st;
}

function parseNum(v, fallback) {
    var n = parseFloat(v);
    return isFiniteNumber(n) ? n : fallback;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function round(v, digits) {
    if (!isFiniteNumber(v)) return 0;
    var p = Math.pow(10, digits || 0);
    return Math.round(v * p) / p;
}

function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
}

module.exports = {
    buildCutPreview: buildCutPreview
};
