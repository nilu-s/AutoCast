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
    var laughterResults = Array.isArray(ctx.laughterResults) ? ctx.laughterResults : [];
    var gateSnapshots = Array.isArray(ctx.gateSnapshots) ? ctx.gateSnapshots : [];
    var params = ctx.params || {};
    var frameDurationMs = isFiniteNumber(ctx.frameDurationMs) ? ctx.frameDurationMs : 10;
    var frameDurSec = frameDurationMs / 1000;
    var previewMergeEnabled = params.previewSegmentMergeEnabled !== false;
    var previewMergeGapSec = Math.max(0, parseNum(params.previewSegmentMergeGapMs, 1000) / 1000);
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
        var overlapSpans = buildConsolidatedPreviewSpans(overlapTrackSegs, {
            enabled: previewMergeEnabled,
            mergeGapSec: previewMergeGapSec
        });
        for (var s = 0; s < overlapSpans.length; s++) {
            var overlapSpan = overlapSpans[s];
            var span = {
                start: overlapSpan.start,
                end: overlapSpan.end,
                durationSec: overlapSpan.durationSec
            };
            var keepCoverage = computeCoverageByState(finalSegments[t], span.start, span.end, 'active');
            var sourceSuppressedCoverage = computeCoverageByState(overlapSpan.sourceSegments, span.start, span.end, 'suppressed');
            var sourceActiveCoverage = computeCoverageByState(overlapSpan.sourceSegments, span.start, span.end, 'active');
            var decisionState = 'near_miss';
            var decisionStage = 'postprocess_pruned';

            if (keepCoverage > 0.55) {
                decisionState = 'kept';
                decisionStage = 'final_kept';
            } else if (sourceSuppressedCoverage >= 0.60 && keepCoverage < 0.25) {
                decisionState = 'suppressed';
                decisionStage = 'overlap_resolve';
            } else if (sourceActiveCoverage < 0.20 && sourceSuppressedCoverage >= 0.45) {
                decisionState = 'suppressed';
                decisionStage = 'overlap_resolve';
            }

            var metrics = computeMetrics({
                trackIndex: t,
                start: span.start,
                end: span.end,
                frameDurSec: frameDurSec,
                thresholdDb: getTrackThresholdDb(trackInfos, t),
                rmsProfiles: rmsProfiles,
                spectralResults: spectralResults,
                laughterResults: laughterResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                finalActiveMaps: finalActiveMaps,
                mergedSegmentCount: overlapSpan.mergedCount,
                maxMergedGapSec: overlapSpan.maxGapSec,
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
        var finalSpans = buildConsolidatedPreviewSpans(finalActiveSegs, {
            enabled: previewMergeEnabled,
            mergeGapSec: previewMergeGapSec
        });
        for (var j = 0; j < finalSpans.length; j++) {
            var finalSeg = finalSpans[j];
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
                laughterResults: laughterResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                finalActiveMaps: finalActiveMaps,
                mergedSegmentCount: finalSeg.mergedCount,
                maxMergedGapSec: finalSeg.maxGapSec,
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

function buildConsolidatedPreviewSpans(trackSegs, options) {
    options = options || {};
    var enabled = options.enabled !== false;
    var mergeGapSec = Math.max(0, parseNum(options.mergeGapSec, 0));
    var normalized = [];

    if (!Array.isArray(trackSegs) || trackSegs.length === 0) return normalized;

    for (var i = 0; i < trackSegs.length; i++) {
        var seg = trackSegs[i];
        if (!seg) continue;
        var span = normalizeSegmentSpan(seg);
        if (!span) continue;
        normalized.push({
            start: span.start,
            end: span.end,
            durationSec: span.durationSec,
            trackIndex: isFiniteNumber(seg.trackIndex) ? seg.trackIndex : 0,
            state: seg.state || 'active'
        });
    }

    if (!normalized.length) return normalized;

    normalized.sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        return a.end - b.end;
    });

    if (!enabled || mergeGapSec <= 0) {
        var passthrough = [];
        for (i = 0; i < normalized.length; i++) {
            passthrough.push({
                start: normalized[i].start,
                end: normalized[i].end,
                durationSec: normalized[i].durationSec,
                mergedCount: 1,
                maxGapSec: 0,
                sourceSegments: [normalized[i]]
            });
        }
        return passthrough;
    }

    var out = [];
    var cur = null;
    for (i = 0; i < normalized.length; i++) {
        var it = normalized[i];
        if (!cur) {
            cur = {
                start: it.start,
                end: it.end,
                mergedCount: 1,
                maxGapSec: 0,
                sourceSegments: [it]
            };
            continue;
        }

        var gapSec = it.start - cur.end;
        if (it.start <= cur.end + mergeGapSec) {
            if (gapSec > cur.maxGapSec) cur.maxGapSec = gapSec;
            if (it.end > cur.end) cur.end = it.end;
            cur.mergedCount++;
            cur.sourceSegments.push(it);
        } else {
            cur.durationSec = cur.end - cur.start;
            if (cur.maxGapSec < 0) cur.maxGapSec = 0;
            out.push(cur);
            cur = {
                start: it.start,
                end: it.end,
                mergedCount: 1,
                maxGapSec: 0,
                sourceSegments: [it]
            };
        }
    }

    if (cur) {
        cur.durationSec = cur.end - cur.start;
        if (cur.maxGapSec < 0) cur.maxGapSec = 0;
        out.push(cur);
    }

    return out;
}

function computeMetrics(ctx) {
    var startFrame = Math.max(0, Math.floor(ctx.start / ctx.frameDurSec));
    var endFrame = Math.max(startFrame + 1, Math.ceil(ctx.end / ctx.frameDurSec));
    var rmsTrack = ctx.rmsProfiles[ctx.trackIndex] || [];
    var spectralTrack = (ctx.spectralResults[ctx.trackIndex] && ctx.spectralResults[ctx.trackIndex].confidence)
        ? ctx.spectralResults[ctx.trackIndex].confidence
        : null;
    var laughterTrack = (ctx.laughterResults[ctx.trackIndex] && ctx.laughterResults[ctx.trackIndex].confidence)
        ? ctx.laughterResults[ctx.trackIndex].confidence
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
    var laughterConfidence = clamp(averageRange(laughterTrack, startFrame, endFrame, 0), 0, 1);
    var laughterPeakConfidence = clamp(maxRange(laughterTrack, startFrame, endFrame, laughterConfidence), 0, 1);
    var speakerLockScore = clamp(averageRange(speakerSimilarity, startFrame, endFrame, spectralConfidence), 0, 1);

    var overlapStats = computeOverlapStats(
        ctx.trackIndex,
        startFrame,
        endFrame,
        ctx.overlapActiveMaps,
        ctx.rmsProfiles
    );
    var mergedSegmentCount = Math.max(1, Math.round(parseNum(ctx.mergedSegmentCount, 1)));
    var maxMergedGapSec = Math.max(0, parseNum(ctx.maxMergedGapSec, 0));

    var postprocessPenalty = computePostprocessPenalty(ctx.state, {
        peakOverThreshold: peakDb - thresholdDb,
        meanOverThreshold: meanDb - thresholdDb,
        spectralConfidence: spectralConfidence,
        overlapPenalty: overlapStats.penalty
    });
    var classEvidence = computeClassEvidence({
        state: ctx.state,
        peakOverThreshold: peakDb - thresholdDb,
        meanOverThreshold: meanDb - thresholdDb,
        spectralConfidence: spectralConfidence,
        laughterConfidence: laughterConfidence,
        laughterPeakConfidence: laughterPeakConfidence,
        speakerLockScore: speakerLockScore,
        overlapPenalty: overlapStats.penalty,
        overlapRatio: overlapStats.overlapRatio,
        strongerRatio: overlapStats.strongerRatio,
        postprocessPenalty: postprocessPenalty
    });
    var bleedConfidence = clamp(
        classEvidence.bleed * 0.68 +
        clamp(overlapStats.strongerRatio, 0, 1) * 0.22 +
        clamp(overlapStats.overlapRatio, 0, 1) * 0.10,
        0,
        1
    );

    return {
        values: {
            meanOverThreshold: round(meanDb - thresholdDb, 2),
            peakOverThreshold: round(peakDb - thresholdDb, 2),
            spectralConfidence: round(spectralConfidence, 3),
            laughterConfidence: round(laughterConfidence, 3),
            overlapPenalty: round(overlapStats.penalty, 3),
            speakerLockScore: round(speakerLockScore, 3),
            postprocessPenalty: round(postprocessPenalty, 3),
            speechEvidence: round(classEvidence.speech, 3),
            laughterEvidence: round(classEvidence.laughter, 3),
            bleedEvidence: round(classEvidence.bleed, 3),
            bleedConfidence: round(bleedConfidence, 3),
            noiseEvidence: round(classEvidence.noise, 3),
            classMargin: round(classEvidence.margin, 3),
            mergedSegmentCount: mergedSegmentCount,
            maxMergedGapMs: round(maxMergedGapSec * 1000, 1)
        },
        classEvidence: classEvidence,
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

function rankClassEvidence(scores) {
    var firstLabel = 'unknown';
    var secondLabel = 'unknown';
    var firstScore = -Infinity;
    var secondScore = -Infinity;

    for (var key in scores) {
        if (!scores.hasOwnProperty(key)) continue;
        var value = clamp(parseNum(scores[key], 0), 0, 1);
        if (value > firstScore) {
            secondScore = firstScore;
            secondLabel = firstLabel;
            firstScore = value;
            firstLabel = key;
        } else if (value > secondScore) {
            secondScore = value;
            secondLabel = key;
        }
    }

    if (!isFiniteNumber(firstScore)) firstScore = 0;
    if (!isFiniteNumber(secondScore)) secondScore = 0;

    return {
        firstLabel: firstLabel,
        firstScore: firstScore,
        secondLabel: secondLabel,
        secondScore: secondScore,
        margin: clamp(firstScore - secondScore, 0, 1)
    };
}

function evidenceConfidence(primaryScore, margin, bias) {
    var norm = clamp(primaryScore * 0.78 + margin * 0.22 + (bias || 0), 0, 1);
    return clamp(Math.round(norm * 100), 0, 100);
}

function computeClassEvidence(ctx) {
    var peakNorm = clamp((ctx.peakOverThreshold + 1.5) / 12, 0, 1);
    var meanNorm = clamp((ctx.meanOverThreshold + 2.0) / 9, 0, 1);
    var energyNorm = clamp(peakNorm * 0.60 + meanNorm * 0.40, 0, 1);
    var spectral = clamp(ctx.spectralConfidence, 0, 1);
    var laughter = clamp(ctx.laughterConfidence, 0, 1);
    var laughterPeak = clamp(ctx.laughterPeakConfidence, 0, 1);
    var speaker = clamp(ctx.speakerLockScore, 0, 1);
    var overlapPenalty = clamp(ctx.overlapPenalty, 0, 1);
    var overlapRatio = clamp(ctx.overlapRatio, 0, 1);
    var strongerRatio = clamp(ctx.strongerRatio, 0, 1);
    var postPenalty = clamp(ctx.postprocessPenalty, 0, 1);

    var speechScore = clamp(
        spectral * 0.38 +
        speaker * 0.20 +
        energyNorm * 0.26 +
        (1 - overlapPenalty) * 0.08 +
        (1 - laughter) * 0.08,
        0,
        1
    );
    var laughterScore = clamp(
        laughter * 0.48 +
        laughterPeak * 0.20 +
        energyNorm * 0.14 +
        (1 - speaker) * 0.08 +
        (1 - overlapPenalty) * 0.10,
        0,
        1
    );
    var bleedScore = clamp(
        overlapPenalty * 0.40 +
        strongerRatio * 0.28 +
        overlapRatio * 0.18 +
        (1 - speaker) * 0.07 +
        (1 - spectral) * 0.07,
        0,
        1
    );
    var noiseScore = clamp(
        (1 - spectral) * 0.28 +
        postPenalty * 0.26 +
        clamp((0 - ctx.meanOverThreshold) / 8, 0, 1) * 0.20 +
        clamp((0 - ctx.peakOverThreshold) / 8, 0, 1) * 0.12 +
        (1 - energyNorm) * 0.14,
        0,
        1
    );

    if (ctx.state === 'suppressed') {
        bleedScore = clamp(bleedScore + 0.14, 0, 1);
    }

    var ranked = rankClassEvidence({
        speech: speechScore,
        laughter: laughterScore,
        bleed: bleedScore,
        noise: noiseScore
    });

    return {
        speech: speechScore,
        laughter: laughterScore,
        bleed: bleedScore,
        noise: noiseScore,
        dominant: ranked.firstLabel,
        secondary: ranked.secondLabel,
        margin: ranked.margin
    };
}

function classifyType(state, score, metrics, params) {
    var minSpectral = isFiniteNumber(params.spectralMinConfidence) ? params.spectralMinConfidence : 0.18;
    var values = metrics.values || {};
    var spectral = clamp(parseNum(values.spectralConfidence, 0), 0, 1);
    var overlapPenalty = clamp(parseNum(values.overlapPenalty, 0), 0, 1);
    var postPenalty = clamp(parseNum(values.postprocessPenalty, 0), 0, 1);
    var speechEvidence = clamp(parseNum(values.speechEvidence, 0), 0, 1);
    var laughterEvidence = clamp(parseNum(values.laughterEvidence, 0), 0, 1);
    var bleedEvidence = clamp(parseNum(values.bleedEvidence, 0), 0, 1);
    var noiseEvidence = clamp(parseNum(values.noiseEvidence, 0), 0, 1);

    var evidence = metrics.classEvidence;
    if (!evidence) {
        var ranked = rankClassEvidence({
            speech: speechEvidence,
            laughter: laughterEvidence,
            bleed: bleedEvidence,
            noise: noiseEvidence
        });
        evidence = {
            speech: speechEvidence,
            laughter: laughterEvidence,
            bleed: bleedEvidence,
            noise: noiseEvidence,
            dominant: ranked.firstLabel,
            secondary: ranked.secondLabel,
            margin: ranked.margin
        };
    }

    var label = 'unknown';
    var confidence = 35;
    if (state === 'suppressed') {
        if (evidence.bleed >= 0.48 || evidence.dominant === 'bleed') {
            label = 'suppressed_bleed';
            confidence = evidenceConfidence(evidence.bleed, evidence.margin, 0.08);
        } else if (evidence.laughter >= 0.54 && evidence.laughter > evidence.speech + 0.08) {
            label = 'laughter_candidate';
            confidence = evidenceConfidence(evidence.laughter, evidence.margin, 0.02);
        } else {
            label = 'overlap_candidate';
            confidence = evidenceConfidence(Math.max(evidence.bleed, overlapPenalty), evidence.margin, -0.05);
        }
        return {
            label: label,
            confidence: clamp(Math.round(confidence), 0, 100)
        };
    }

    var mixedSpeechLaughter = evidence.speech >= 0.42 &&
        evidence.laughter >= 0.42 &&
        Math.abs(evidence.speech - evidence.laughter) <= 0.14;

    if (mixedSpeechLaughter) {
        label = 'mixed_speech_laughter';
        confidence = evidenceConfidence(
            Math.min(evidence.speech, evidence.laughter),
            1 - Math.abs(evidence.speech - evidence.laughter),
            0.05
        );
    } else if (evidence.bleed >= 0.56 && (evidence.bleed >= evidence.speech + 0.10)) {
        label = 'bleed_candidate';
        confidence = evidenceConfidence(evidence.bleed, evidence.margin, 0.04);
    } else if (evidence.dominant === 'laughter' && evidence.laughter >= 0.46) {
        label = 'laughter_candidate';
        confidence = evidenceConfidence(evidence.laughter, evidence.margin, 0.02);
    } else if (overlapPenalty >= 0.5 || (evidence.dominant === 'bleed' && evidence.bleed >= 0.46)) {
        label = 'overlap_candidate';
        confidence = evidenceConfidence(Math.max(evidence.bleed, overlapPenalty), evidence.margin, -0.02);
    } else if (score >= 70 && spectral >= Math.max(minSpectral, 0.30) && evidence.speech >= 0.58) {
        label = 'primary_speech';
        confidence = evidenceConfidence(evidence.speech, evidence.margin, 0.08);
    } else if (evidence.speech >= 0.40 || score >= 45 || spectral >= (minSpectral - 0.04)) {
        label = 'borderline_speech';
        confidence = evidenceConfidence(Math.max(evidence.speech, score / 100), evidence.margin, 0.01);
    } else {
        label = 'weak_voice';
        confidence = evidenceConfidence(Math.max(noiseEvidence, 1 - postPenalty), evidence.margin, -0.08);
    }

    if (state === 'near_miss' && label === 'primary_speech') {
        label = 'borderline_speech';
        confidence = clamp(confidence - 8, 0, 100);
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
    if (vals.mergedSegmentCount > 1) {
        out.push('Merged ' + vals.mergedSegmentCount + ' nearby snippets (max gap ' + round(parseNum(vals.maxMergedGapMs, 0), 0) + ' ms)');
    }

    if (vals.peakOverThreshold >= 4) out.push('Peak is clearly above gate threshold');
    else if (vals.peakOverThreshold >= 0) out.push('Peak is just above threshold');
    else out.push('Peak stays below keep threshold');

    if (vals.spectralConfidence >= 0.45) out.push('High spectral speech confidence');
    else if (vals.spectralConfidence >= 0.25) out.push('Moderate spectral confidence');
    else out.push('Low spectral confidence');

    if (vals.overlapPenalty >= 0.55) out.push('Strong overlap/bleed pressure');
    else if (vals.overlapPenalty >= 0.25) out.push('Some overlap competition');
    if (vals.bleedConfidence >= 0.60) out.push('High bleed confidence');
    else if (vals.bleedConfidence >= 0.42) out.push('Moderate bleed confidence');

    if (vals.speakerLockScore >= 0.62) out.push('Speaker-lock similarity is strong');
    else if (vals.speakerLockScore < 0.35) out.push('Weak speaker-lock similarity');
    if (vals.laughterConfidence >= 0.55) out.push('Strong laughter confidence');
    else if (vals.laughterConfidence >= 0.35) out.push('Moderate laughter confidence');

    if (vals.laughterEvidence >= vals.speechEvidence + 0.08) {
        out.push('Laughter evidence outweighs speech evidence');
    } else if (vals.speechEvidence >= vals.laughterEvidence + 0.08) {
        out.push('Speech evidence outweighs laughter evidence');
    } else {
        out.push('Speech and laughter evidence are close');
    }

    if (scoreInfo.label === 'borderline') out.push('Ranked as borderline confidence');
    if (typeInfo.label === 'suppressed_bleed') out.push('Pattern matches likely bleed');
    if (typeInfo.label === 'bleed_candidate') out.push('Likely bleed-dominant segment');
    if (typeInfo.label === 'laughter_candidate') out.push('Segment pattern matches likely laughter');
    if (typeInfo.label === 'mixed_speech_laughter') out.push('Mixed speech and laughter profile detected');

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
