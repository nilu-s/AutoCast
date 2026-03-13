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
            var alwaysOpenFillCoverage = computeCoverageByOrigin(finalSegments[t], span.start, span.end, 'always_open_fill');
            var keptSourceRatio = computeSourceSegmentKeepRatio(overlapSpan.sourceSegments, finalSegments[t]);
            var sourceSuppressedCoverage = computeCoverageByState(overlapSpan.sourceSegments, span.start, span.end, 'suppressed');
            var sourceActiveCoverage = computeCoverageByState(overlapSpan.sourceSegments, span.start, span.end, 'active');
            var baseDecision = inferCoverageDecision({
                keepCoverage: keepCoverage,
                keptSourceRatio: keptSourceRatio,
                sourceSuppressedCoverage: sourceSuppressedCoverage,
                sourceActiveCoverage: sourceActiveCoverage
            });

            var seedMetrics = computeMetrics({
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
                state: baseDecision.state
            });

            var decision = decidePreviewState({
                baseState: baseDecision.state,
                baseStage: baseDecision.stage,
                keepCoverage: keepCoverage,
                keptSourceRatio: keptSourceRatio,
                sourceSuppressedCoverage: sourceSuppressedCoverage,
                sourceActiveCoverage: sourceActiveCoverage,
                metrics: seedMetrics.values
            });

            var decisionState = decision.state;
            var decisionStage = decision.stage;
            var allowAlwaysOpenAutoKeep = false;
            if (params && params.enforceAlwaysOneTrackOpen && alwaysOpenFillCoverage >= 0.65 && decisionState !== 'kept') {
                allowAlwaysOpenAutoKeep = canAutoKeepAlwaysOpenFill(decision, seedMetrics.values, params);
            }
            if (allowAlwaysOpenAutoKeep) {
                decisionState = 'kept';
                decisionStage = 'always_open_fill_blend';
                decision.state = 'kept';
                decision.stage = 'always_open_fill_blend';
            } else if (params && params.enforceAlwaysOneTrackOpen && alwaysOpenFillCoverage >= 0.65 &&
                decisionStage !== 'always_open_fill_review' && decisionState !== 'kept') {
                decisionStage = 'always_open_fill_review';
                decision.stage = 'always_open_fill_review';
            }
            var metrics = seedMetrics;
            if (decisionState !== baseDecision.state) {
                metrics = computeMetrics({
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
            }

            metrics.values.keptSourceRatio = round(keptSourceRatio, 3);
            metrics.values.keepLikelihood = round(decision.keepLikelihood, 3);
            metrics.values.suppressLikelihood = round(decision.suppressLikelihood, 3);
            metrics.values.decisionMargin = round(decision.margin, 3);
            metrics.values.bleedHighConfidence = decision.bleedHighConfidence ? 1 : 0;
            metrics.values.alwaysOpenFill = alwaysOpenFillCoverage >= 0.5 ? 1 : 0;
            metrics.values.alwaysOpenFillRatio = round(alwaysOpenFillCoverage, 3);

            var scoreInfo = computeScore(decisionState, span.durationSec, metrics);
            var typeInfo = classifyType(decisionState, scoreInfo.score, metrics, params);
            var reasons = buildReasons(decisionState, metrics, scoreInfo, typeInfo, decision);

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
                origin: alwaysOpenFillCoverage >= 0.5 ? 'always_open_fill' : 'analysis_active',
                alwaysOpenFill: alwaysOpenFillCoverage >= 0.5,
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
            var uncoveredSpans = getUncoveredSpansForTrackItems(items, t, finalSeg.start, finalSeg.end);
            if (!uncoveredSpans.length) continue;

            for (var u = 0; u < uncoveredSpans.length; u++) {
                var spanStart = uncoveredSpans[u].start;
                var spanEnd = uncoveredSpans[u].end;
                var spanDur = Math.max(0, spanEnd - spanStart);
                if (spanDur <= 0.0001) continue;

                var fillCoverage = computeCoverageByOrigin(finalSegments[t], spanStart, spanEnd, 'always_open_fill');
                var isAlwaysOpenFill = !!(params && params.enforceAlwaysOneTrackOpen && fillCoverage >= 0.55);

                var finalMetrics = computeMetrics({
                    trackIndex: t,
                    start: spanStart,
                    end: spanEnd,
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
                var finalDecision = decidePreviewState({
                    baseState: 'kept',
                    baseStage: isAlwaysOpenFill ? 'always_open_fill' : 'postprocess_added',
                    keepCoverage: 1,
                    keptSourceRatio: 1,
                    sourceSuppressedCoverage: 0,
                    sourceActiveCoverage: 1,
                    metrics: finalMetrics.values
                });
                finalMetrics.values.keptSourceRatio = 1;
                finalMetrics.values.keepLikelihood = round(finalDecision.keepLikelihood, 3);
                finalMetrics.values.suppressLikelihood = round(finalDecision.suppressLikelihood, 3);
                finalMetrics.values.decisionMargin = round(finalDecision.margin, 3);
                finalMetrics.values.bleedHighConfidence = finalDecision.bleedHighConfidence ? 1 : 0;
                finalMetrics.values.alwaysOpenFill = isAlwaysOpenFill ? 1 : 0;
                finalMetrics.values.alwaysOpenFillRatio = round(fillCoverage, 3);

                var allowFinalAlwaysOpenAutoKeep = isAlwaysOpenFill
                    ? canAutoKeepAlwaysOpenFill(finalDecision, finalMetrics.values, params)
                    : false;
                var finalState = finalDecision.state;
                var finalStage = finalDecision.stage;
                if (isAlwaysOpenFill && allowFinalAlwaysOpenAutoKeep) {
                    finalState = 'kept';
                    finalStage = 'always_open_fill';
                } else if (isAlwaysOpenFill && !allowFinalAlwaysOpenAutoKeep) {
                    if (finalDecision.bleedHighConfidence || finalState === 'suppressed') {
                        finalState = 'near_miss';
                    }
                    finalStage = 'always_open_fill_review';
                }
                if (finalState !== 'kept') {
                    finalMetrics = computeMetrics({
                        trackIndex: t,
                        start: spanStart,
                        end: spanEnd,
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
                        state: finalState
                    });
                    finalMetrics.values.keptSourceRatio = 1;
                    finalMetrics.values.keepLikelihood = round(finalDecision.keepLikelihood, 3);
                    finalMetrics.values.suppressLikelihood = round(finalDecision.suppressLikelihood, 3);
                    finalMetrics.values.decisionMargin = round(finalDecision.margin, 3);
                    finalMetrics.values.bleedHighConfidence = finalDecision.bleedHighConfidence ? 1 : 0;
                    finalMetrics.values.alwaysOpenFill = isAlwaysOpenFill ? 1 : 0;
                    finalMetrics.values.alwaysOpenFillRatio = round(fillCoverage, 3);
                }
                var finalScoreInfo = computeScore(finalState, spanDur, finalMetrics);
                var finalTypeInfo = classifyType(finalState, finalScoreInfo.score, finalMetrics, params);
                var finalReasons = buildReasons(finalState, finalMetrics, finalScoreInfo, finalTypeInfo, finalDecision);

                itemCounter++;
                var addedItem = {
                    id: buildItemId(t, spanStart, spanEnd, itemCounter),
                    trackIndex: t,
                    trackName: getTrackName(trackInfos, t),
                    trackColor: null,
                    laneIndex: t,
                    start: round(spanStart, 4),
                    end: round(spanEnd, 4),
                    durationMs: Math.max(1, Math.round(spanDur * 1000)),
                    state: finalState,
                    selected: finalState === 'kept',
                    score: finalScoreInfo.score,
                    scoreLabel: finalScoreInfo.label,
                    reasons: finalReasons,
                    typeLabel: finalTypeInfo.label,
                    typeConfidence: finalTypeInfo.confidence,
                    sourceClipIndex: null,
                    mediaPath: getTrackPath(trackInfos, t),
                    sourceStartSec: round(spanStart, 4),
                    sourceEndSec: round(spanEnd, 4),
                    decisionStage: finalStage,
                    origin: isAlwaysOpenFill ? 'always_open_fill' : 'analysis_active',
                    alwaysOpenFill: isAlwaysOpenFill,
                    overlapInfo: finalMetrics.overlapInfo,
                    metrics: finalMetrics.values
                };
                items.push(addedItem);
                laneIdBuckets[t].push(addedItem.id);
            }
        }
    }

    for (t = 0; t < trackCount; t++) {
        var finalTrackSegs = finalSegments[t] || [];
        for (var fsi = 0; fsi < finalTrackSegs.length; fsi++) {
            var finalTrackSeg = finalTrackSegs[fsi];
            if (!finalTrackSeg || finalTrackSeg.state === 'suppressed') continue;
            if (finalTrackSeg.origin !== 'always_open_fill') continue;

            var fillStart = parseNum(finalTrackSeg.start, 0);
            var fillEnd = parseNum(finalTrackSeg.end, fillStart);
            if (!(fillEnd > fillStart)) continue;
            if (hasMatchingAlwaysOpenFillItem(items, t, fillStart, fillEnd)) continue;

            var fillDur = fillEnd - fillStart;
            var fillMetrics = computeMetrics({
                trackIndex: t,
                start: fillStart,
                end: fillEnd,
                frameDurSec: frameDurSec,
                thresholdDb: getTrackThresholdDb(trackInfos, t),
                rmsProfiles: rmsProfiles,
                spectralResults: spectralResults,
                laughterResults: laughterResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                finalActiveMaps: finalActiveMaps,
                mergedSegmentCount: 1,
                maxMergedGapSec: 0,
                state: 'kept'
            });

            fillMetrics.values.keptSourceRatio = round(
                computeSourceSegmentKeepRatio(overlapSegments[t] || [], finalSegments[t] || []),
                3
            );
            fillMetrics.values.alwaysOpenFill = 1;
            fillMetrics.values.alwaysOpenFillRatio = 1;

            var fillDecision = decidePreviewState({
                baseState: 'kept',
                baseStage: 'always_open_fill',
                keepCoverage: 1,
                keptSourceRatio: 1,
                sourceSuppressedCoverage: 0,
                sourceActiveCoverage: 1,
                metrics: fillMetrics.values
            });
            fillMetrics.values.keepLikelihood = round(fillDecision.keepLikelihood, 3);
            fillMetrics.values.suppressLikelihood = round(fillDecision.suppressLikelihood, 3);
            fillMetrics.values.decisionMargin = round(fillDecision.margin, 3);
            fillMetrics.values.bleedHighConfidence = fillDecision.bleedHighConfidence ? 1 : 0;

            var allowFillAutoKeep = canAutoKeepAlwaysOpenFill(fillDecision, fillMetrics.values, params);
            var fillState = fillDecision.state;
            var fillStage = fillDecision.stage;
            if (allowFillAutoKeep) {
                fillState = 'kept';
                fillStage = 'always_open_fill';
            } else {
                if (fillDecision.bleedHighConfidence || fillState === 'suppressed') {
                    fillState = 'near_miss';
                }
                fillStage = 'always_open_fill_review';
            }

            if (fillState !== 'kept') {
                fillMetrics = computeMetrics({
                    trackIndex: t,
                    start: fillStart,
                    end: fillEnd,
                    frameDurSec: frameDurSec,
                    thresholdDb: getTrackThresholdDb(trackInfos, t),
                    rmsProfiles: rmsProfiles,
                    spectralResults: spectralResults,
                    laughterResults: laughterResults,
                    gateSnapshots: gateSnapshots,
                    overlapActiveMaps: overlapActiveMaps,
                    finalActiveMaps: finalActiveMaps,
                    mergedSegmentCount: 1,
                    maxMergedGapSec: 0,
                    state: fillState
                });
                fillMetrics.values.keptSourceRatio = round(
                    computeSourceSegmentKeepRatio(overlapSegments[t] || [], finalSegments[t] || []),
                    3
                );
                fillMetrics.values.keepLikelihood = round(fillDecision.keepLikelihood, 3);
                fillMetrics.values.suppressLikelihood = round(fillDecision.suppressLikelihood, 3);
                fillMetrics.values.decisionMargin = round(fillDecision.margin, 3);
                fillMetrics.values.bleedHighConfidence = fillDecision.bleedHighConfidence ? 1 : 0;
                fillMetrics.values.alwaysOpenFill = 1;
                fillMetrics.values.alwaysOpenFillRatio = 1;
            }

            var fillScoreInfo = computeScore(fillState, fillDur, fillMetrics);
            var fillTypeInfo = classifyType(fillState, fillScoreInfo.score, fillMetrics, params);
            var fillReasons = buildReasons(fillState, fillMetrics, fillScoreInfo, fillTypeInfo, fillDecision);

            itemCounter++;
            var fillItem = {
                id: buildItemId(t, fillStart, fillEnd, itemCounter),
                trackIndex: t,
                trackName: getTrackName(trackInfos, t),
                trackColor: null,
                laneIndex: t,
                start: round(fillStart, 4),
                end: round(fillEnd, 4),
                durationMs: Math.max(1, Math.round(fillDur * 1000)),
                state: fillState,
                selected: fillState === 'kept',
                score: fillScoreInfo.score,
                scoreLabel: fillScoreInfo.label,
                reasons: fillReasons,
                typeLabel: fillTypeInfo.label,
                typeConfidence: fillTypeInfo.confidence,
                sourceClipIndex: null,
                mediaPath: getTrackPath(trackInfos, t),
                sourceStartSec: round(fillStart, 4),
                sourceEndSec: round(fillEnd, 4),
                decisionStage: fillStage,
                origin: 'always_open_fill',
                alwaysOpenFill: true,
                overlapInfo: fillMetrics.overlapInfo,
                metrics: fillMetrics.values
            };

            items.push(fillItem);
            laneIdBuckets[t].push(fillItem.id);
        }
    }

    var stateTimelineByTrack = buildStateTimelineByTrack(items, trackCount, totalDurationSec);
    itemCounter = appendUninterestingGapItems({
        items: items,
        laneIdBuckets: laneIdBuckets,
        stateTimelineByTrack: stateTimelineByTrack,
        trackInfos: trackInfos,
        trackCount: trackCount,
        itemCounter: itemCounter
    });

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
        summary: summary,
        stateTimelineByTrack: stateTimelineByTrack
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

function inferCoverageDecision(ctx) {
    var keepCoverage = clamp(parseNum(ctx.keepCoverage, 0), 0, 1);
    var keptSourceRatio = clamp(parseNum(ctx.keptSourceRatio, 0), 0, 1);
    var sourceSuppressedCoverage = clamp(parseNum(ctx.sourceSuppressedCoverage, 0), 0, 1);
    var sourceActiveCoverage = clamp(parseNum(ctx.sourceActiveCoverage, 0), 0, 1);

    if (keepCoverage > 0.55 || keptSourceRatio >= 0.80) {
        return { state: 'kept', stage: 'final_kept' };
    }
    if (sourceSuppressedCoverage >= 0.60 && keepCoverage < 0.25) {
        return { state: 'suppressed', stage: 'overlap_resolve' };
    }
    if (sourceActiveCoverage < 0.20 && sourceSuppressedCoverage >= 0.45) {
        return { state: 'suppressed', stage: 'overlap_resolve' };
    }
    return { state: 'near_miss', stage: 'postprocess_pruned' };
}

function decidePreviewState(ctx) {
    var baseState = ctx.baseState || 'near_miss';
    var baseStage = ctx.baseStage || 'postprocess_pruned';
    var values = ctx.metrics || {};

    var keepCoverage = clamp(parseNum(ctx.keepCoverage, 0), 0, 1);
    var keptSourceRatio = clamp(parseNum(ctx.keptSourceRatio, 0), 0, 1);
    var sourceSuppressedCoverage = clamp(parseNum(ctx.sourceSuppressedCoverage, 0), 0, 1);
    var sourceActiveCoverage = clamp(parseNum(ctx.sourceActiveCoverage, 0), 0, 1);

    var speechEvidence = clamp(parseNum(values.speechEvidence, 0), 0, 1);
    var laughterEvidence = clamp(parseNum(values.laughterEvidence, 0), 0, 1);
    var bleedEvidence = clamp(parseNum(values.bleedEvidence, 0), 0, 1);
    var noiseEvidence = clamp(parseNum(values.noiseEvidence, 0), 0, 1);
    var bleedConfidence = clamp(parseNum(values.bleedConfidence, bleedEvidence), 0, 1);
    var spectralConfidence = clamp(parseNum(values.spectralConfidence, 0), 0, 1);
    var speakerLockScore = clamp(parseNum(values.speakerLockScore, 0), 0, 1);
    var overlapPenalty = clamp(parseNum(values.overlapPenalty, 0), 0, 1);
    var postprocessPenalty = clamp(parseNum(values.postprocessPenalty, 0), 0, 1);
    var classMargin = clamp(parseNum(values.classMargin, 0), 0, 1);
    var peakNorm = clamp((parseNum(values.peakOverThreshold, 0) + 2) / 12, 0, 1);
    var meanNorm = clamp((parseNum(values.meanOverThreshold, 0) + 2) / 9, 0, 1);
    var laughterDominance = clamp((laughterEvidence - speechEvidence + 0.15) / 0.5, 0, 1);

    var speechSupport = clamp(
        speechEvidence * 0.32 +
        spectralConfidence * 0.14 +
        speakerLockScore * 0.14 +
        peakNorm * 0.12 +
        meanNorm * 0.10 +
        classMargin * 0.08 +
        (1 - noiseEvidence) * 0.10,
        0,
        1
    );
    var suppressPressure = clamp(
        bleedEvidence * 0.25 +
        overlapPenalty * 0.19 +
        postprocessPenalty * 0.17 +
        noiseEvidence * 0.12 +
        sourceSuppressedCoverage * 0.14 +
        (1 - sourceActiveCoverage) * 0.06 +
        laughterDominance * 0.07,
        0,
        1
    );
    var keepLikelihood = clamp(
        keepCoverage * 0.34 +
        keptSourceRatio * 0.20 +
        speechSupport * 0.30 +
        (1 - suppressPressure) * 0.16,
        0,
        1
    );
    var suppressLikelihood = clamp(
        sourceSuppressedCoverage * 0.28 +
        suppressPressure * 0.44 +
        (1 - keepCoverage) * 0.10 +
        (1 - keptSourceRatio) * 0.08 +
        (1 - speechSupport) * 0.10,
        0,
        1
    );
    var margin = clamp(Math.abs(keepLikelihood - suppressLikelihood), 0, 1);

    var nextState = baseState;
    var nextStage = baseStage;
    var bleedHighConfidence = false;

    if (suppressLikelihood >= 0.74 && keepLikelihood <= 0.46) {
        nextState = 'suppressed';
        nextStage = (baseState === 'suppressed') ? baseStage : 'metrics_demoted_suppressed';
    } else if (keepLikelihood >= 0.66 && keepCoverage >= 0.22) {
        nextState = 'kept';
        nextStage = (baseState === 'kept') ? baseStage : 'metrics_promoted_keep';
    } else {
        nextState = 'near_miss';
        if (baseState === 'near_miss') nextStage = baseStage;
        else if (baseState === 'kept') nextStage = 'metrics_demoted_near_miss';
        else nextStage = 'metrics_recovered_near_miss';
    }

    // Hard safety gate: very high bleed probability should not stay "kept"
    // unless speech evidence is exceptionally strong.
    if (bleedConfidence >= 0.80 && overlapPenalty >= 0.55) {
        bleedHighConfidence = true;
        var strongSpeechCounterEvidence = (
            speechSupport >= 0.78 &&
            keepCoverage >= 0.78 &&
            keptSourceRatio >= 0.72 &&
            spectralConfidence >= 0.58 &&
            speakerLockScore >= 0.70
        );

        if (strongSpeechCounterEvidence) {
            if (nextState === 'kept') {
                nextState = 'near_miss';
                nextStage = 'bleed_high_confidence_review';
            }
        } else {
            nextState = 'suppressed';
            nextStage = 'bleed_high_confidence';
        }
    }

    // Guardrails: do not flip clear structural outcomes unless pressure is very high.
    if (baseState === 'kept' &&
        keepCoverage >= 0.82 &&
        keptSourceRatio >= 0.82 &&
        keepLikelihood >= 0.62 &&
        suppressLikelihood < 0.78 &&
        !bleedHighConfidence) {
        nextState = 'kept';
        nextStage = baseStage;
    }
    if (baseState === 'suppressed' &&
        sourceSuppressedCoverage >= 0.68 &&
        keepCoverage < 0.25 &&
        keepLikelihood < 0.72) {
        nextState = 'suppressed';
        nextStage = baseStage;
    }

    return {
        state: nextState,
        stage: nextStage,
        baseState: baseState,
        bleedHighConfidence: bleedHighConfidence,
        keepLikelihood: keepLikelihood,
        suppressLikelihood: suppressLikelihood,
        margin: margin
    };
}

function canAutoKeepAlwaysOpenFill(decision, metricValues, params) {
    decision = decision || {};
    metricValues = metricValues || {};
    params = params || {};

    var keepLikelihood = clamp(parseNum(decision.keepLikelihood, parseNum(metricValues.keepLikelihood, 0)), 0, 1);
    var suppressLikelihood = clamp(parseNum(decision.suppressLikelihood, parseNum(metricValues.suppressLikelihood, 0)), 0, 1);
    var speechEvidence = clamp(parseNum(metricValues.speechEvidence, 0), 0, 1);
    var bleedConfidence = clamp(
        parseNum(metricValues.bleedConfidence, parseNum(metricValues.bleedEvidence, 0)),
        0,
        1
    );
    var bleedHighConfidence = !!decision.bleedHighConfidence || (parseNum(metricValues.bleedHighConfidence, 0) >= 0.5);
    var state = decision.state || '';

    var maxBleed = clamp(parseNum(params.alwaysOpenFillAutoKeepBleedMaxConfidence, 0.76), 0, 1);
    var minSpeech = clamp(parseNum(params.alwaysOpenFillAutoKeepMinSpeechEvidence, 0.46), 0, 1);
    var minKeepLikelihood = clamp(parseNum(params.alwaysOpenFillAutoKeepMinKeepLikelihood, 0.60), 0, 1);
    var promoteSuppressed = !!params.alwaysOpenFillPromoteSuppressed;

    if (!promoteSuppressed && state === 'suppressed') return false;
    if (bleedHighConfidence) return false;
    if (bleedConfidence >= maxBleed && speechEvidence < (minSpeech + 0.06)) return false;
    if (keepLikelihood < minKeepLikelihood && speechEvidence < minSpeech) return false;
    if (suppressLikelihood > (keepLikelihood + 0.08)) return false;

    return true;
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

function buildReasons(state, metrics, scoreInfo, typeInfo, decision) {
    var out = [];
    var vals = metrics.values;

    if (state === 'kept') out.push('Kept in final decision');
    if (state === 'near_miss') out.push('Pruned in postprocess pass');
    if (state === 'suppressed') out.push('Suppressed in overlap resolution');
    if (parseNum(vals.alwaysOpenFill, 0) >= 0.5) {
        out.push('Dominant speaker continuity fill (always-open safety)');
    }
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
    if (decision) {
        out.push('Decision model keep ' + Math.round(clamp(parseNum(decision.keepLikelihood, 0), 0, 1) * 100) +
            '% vs suppress ' + Math.round(clamp(parseNum(decision.suppressLikelihood, 0), 0, 1) * 100) + '%');
        if (decision.bleedHighConfidence) {
            out.push('High bleed confidence safety gate is active');
        }
        if (decision.baseState && decision.state && decision.baseState !== decision.state) {
            out.push('State adjusted by combined metrics (' + decision.baseState + ' -> ' + decision.state + ')');
        }
        if (parseNum(decision.margin, 1) < 0.12) {
            out.push('Decision is close; manual review recommended');
        }
    }

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
    var uninteresting = 0;
    var selected = 0;
    var scoreSum = 0;
    var scoredCount = 0;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (isUninterestingItem(item)) {
            uninteresting++;
        } else if (item.state === 'kept') {
            kept++;
        } else if (item.state === 'near_miss') {
            nearMiss++;
        } else {
            suppressed++;
        }

        if (item.selected) selected++;
        if (!isUninterestingItem(item)) {
            scoreSum += item.score || 0;
            scoredCount++;
        }
    }

    return {
        totalItems: items.length,
        keptCount: kept,
        nearMissCount: nearMiss,
        suppressedCount: suppressed,
        uninterestingCount: uninteresting,
        selectedCount: selected,
        avgScore: scoredCount > 0 ? round(scoreSum / scoredCount, 1) : 0,
        trackCount: trackCount,
        totalDurationSec: round(totalDurationSec, 3)
    };
}

function buildStateTimelineByTrack(items, trackCount, totalDurationSec) {
    var timeline = [];
    var duration = Math.max(0, parseNum(totalDurationSec, computeMaxEndFromItems(items)));
    var epsilon = 0.0001;
    var priority = {
        kept: 3,
        near_miss: 2,
        suppressed: 1,
        uninteresting: 0
    };

    for (var t = 0; t < trackCount; t++) {
        var trackItems = [];
        var points = [0, duration];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item || item.trackIndex !== t) continue;
            var st = clamp(parseNum(item.start, 0), 0, duration);
            var en = clamp(parseNum(item.end, st), 0, duration);
            if (!(en > st + epsilon)) continue;

            trackItems.push({
                start: st,
                end: en,
                state: item.state || 'suppressed'
            });
            points.push(st, en);
        }

        points.sort(function (a, b) { return a - b; });
        var uniq = [];
        for (i = 0; i < points.length; i++) {
            if (!uniq.length || Math.abs(points[i] - uniq[uniq.length - 1]) > epsilon) {
                uniq.push(points[i]);
            }
        }

        var trackTimeline = [];
        for (i = 0; i < uniq.length - 1; i++) {
            var segStart = uniq[i];
            var segEnd = uniq[i + 1];
            if (!(segEnd > segStart + epsilon)) continue;

            var bestState = 'uninteresting';
            var bestRank = priority.uninteresting;

            for (var j = 0; j < trackItems.length; j++) {
                var trItem = trackItems[j];
                if (trItem.end <= segStart + epsilon || trItem.start >= segEnd - epsilon) continue;
                var state = normalizeStateLabel(trItem.state);
                var rank = priority.hasOwnProperty(state) ? priority[state] : priority.suppressed;
                if (rank > bestRank) {
                    bestRank = rank;
                    bestState = state;
                }
            }

            if (!trackTimeline.length || trackTimeline[trackTimeline.length - 1].state !== bestState) {
                trackTimeline.push({
                    start: round(segStart, 4),
                    end: round(segEnd, 4),
                    trackIndex: t,
                    state: bestState
                });
            } else {
                trackTimeline[trackTimeline.length - 1].end = round(segEnd, 4);
            }
        }

        if (!trackTimeline.length && duration > epsilon) {
            trackTimeline.push({
                start: 0,
                end: round(duration, 4),
                trackIndex: t,
                state: 'uninteresting'
            });
        }

        timeline.push(trackTimeline);
    }

    return timeline;
}

function appendUninterestingGapItems(ctx) {
    var items = Array.isArray(ctx.items) ? ctx.items : [];
    var laneIdBuckets = ctx.laneIdBuckets || [];
    var timeline = Array.isArray(ctx.stateTimelineByTrack) ? ctx.stateTimelineByTrack : [];
    var trackCount = Math.max(0, parseInt(ctx.trackCount, 10) || 0);
    var trackInfos = ctx.trackInfos || [];
    var counter = parseInt(ctx.itemCounter, 10) || 0;

    for (var t = 0; t < trackCount; t++) {
        var trackTimeline = timeline[t] || [];
        if (!laneIdBuckets[t]) laneIdBuckets[t] = [];

        for (var i = 0; i < trackTimeline.length; i++) {
            var seg = trackTimeline[i];
            if (!seg || seg.state !== 'uninteresting') continue;
            var st = parseNum(seg.start, 0);
            var en = parseNum(seg.end, st);
            if (!(en > st + 0.0001)) continue;

            counter++;
            var gapItem = {
                id: buildItemId(t, st, en, counter),
                trackIndex: t,
                trackName: getTrackName(trackInfos, t),
                trackColor: null,
                laneIndex: t,
                start: round(st, 4),
                end: round(en, 4),
                durationMs: Math.max(1, Math.round((en - st) * 1000)),
                state: 'suppressed',
                selected: false,
                selectable: false,
                isUninteresting: true,
                score: 0,
                scoreLabel: 'weak',
                reasons: ['No relevant speech candidate in this span'],
                typeLabel: 'uninteresting_gap',
                typeConfidence: 100,
                sourceClipIndex: null,
                mediaPath: getTrackPath(trackInfos, t),
                sourceStartSec: round(st, 4),
                sourceEndSec: round(en, 4),
                decisionStage: 'timeline_gap_uninteresting',
                origin: 'timeline_gap',
                alwaysOpenFill: false,
                overlapInfo: null,
                metrics: buildUninterestingMetrics()
            };

            items.push(gapItem);
            laneIdBuckets[t].push(gapItem.id);
        }
    }

    return counter;
}

function buildUninterestingMetrics() {
    return {
        meanOverThreshold: 0,
        peakOverThreshold: 0,
        spectralConfidence: 0,
        laughterConfidence: 0,
        overlapPenalty: 0,
        speakerLockScore: 0,
        postprocessPenalty: 0,
        speechEvidence: 0,
        laughterEvidence: 0,
        bleedEvidence: 0,
        bleedConfidence: 0,
        noiseEvidence: 1,
        classMargin: 1,
        keptSourceRatio: 0,
        keepLikelihood: 0,
        suppressLikelihood: 1,
        decisionMargin: 1,
        bleedHighConfidence: 0,
        alwaysOpenFill: 0,
        mergedSegmentCount: 1,
        maxMergedGapMs: 0,
        uninterestingGap: 1
    };
}

function normalizeStateLabel(state) {
    if (state === 'kept' || state === 'near_miss' || state === 'suppressed' || state === 'uninteresting') {
        return state;
    }
    if (state === 'active') return 'kept';
    return 'suppressed';
}

function isUninterestingItem(item) {
    if (!item) return false;
    if (item.isUninteresting) return true;
    if (item.origin === 'timeline_gap') return true;
    return item.typeLabel === 'uninteresting_gap';
}

function computeMaxEndFromItems(items) {
    var maxEnd = 0;
    for (var i = 0; i < (items || []).length; i++) {
        var item = items[i];
        if (!item) continue;
        var end = parseNum(item.end, 0);
        if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
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

function hasMatchingAlwaysOpenFillItem(items, trackIndex, start, end) {
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || item.trackIndex !== trackIndex) continue;
        var isFill = !!(item.alwaysOpenFill || (item.origin === 'always_open_fill') ||
            (item.metrics && parseNum(item.metrics.alwaysOpenFill, 0) >= 0.5));
        if (!isFill) continue;

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

function getUncoveredSpansForTrackItems(items, trackIndex, start, end) {
    var st = parseNum(start, 0);
    var en = parseNum(end, st);
    if (!(en > st)) return [];

    var overlaps = [];
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || item.trackIndex !== trackIndex) continue;
        var ovStart = Math.max(st, parseNum(item.start, st));
        var ovEnd = Math.min(en, parseNum(item.end, en));
        if (ovEnd <= ovStart) continue;
        overlaps.push({ start: ovStart, end: ovEnd });
    }

    if (!overlaps.length) return [{ start: st, end: en }];

    overlaps.sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        return a.end - b.end;
    });

    var merged = [overlaps[0]];
    for (i = 1; i < overlaps.length; i++) {
        var cur = overlaps[i];
        var prev = merged[merged.length - 1];
        if (cur.start <= prev.end + 0.0001) {
            if (cur.end > prev.end) prev.end = cur.end;
        } else {
            merged.push(cur);
        }
    }

    var out = [];
    var cursor = st;
    for (i = 0; i < merged.length; i++) {
        var m = merged[i];
        if (m.start > cursor + 0.0001) {
            out.push({ start: cursor, end: m.start });
        }
        if (m.end > cursor) cursor = m.end;
    }
    if (cursor < en - 0.0001) {
        out.push({ start: cursor, end: en });
    }

    return out;
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

function computeCoverageByOrigin(trackSegs, start, end, wantedOrigin) {
    if (!Array.isArray(trackSegs) || trackSegs.length === 0) return 0;
    var dur = Math.max(1e-6, end - start);
    var covered = 0;

    for (var i = 0; i < trackSegs.length; i++) {
        var seg = trackSegs[i];
        if (!seg) continue;
        var origin = seg.origin || 'analysis_active';
        if (wantedOrigin && origin !== wantedOrigin) continue;
        covered += getOverlapSec(start, end, seg.start, seg.end);
    }
    return covered / dur;
}

function computeSourceSegmentKeepRatio(sourceSegments, finalSegments) {
    if (!Array.isArray(sourceSegments) || sourceSegments.length === 0) return 0;
    var keptCount = 0;

    for (var i = 0; i < sourceSegments.length; i++) {
        var seg = sourceSegments[i];
        if (!seg) continue;
        if (seg.state === 'suppressed') continue;

        var dur = Math.max(1e-6, parseNum(seg.end, 0) - parseNum(seg.start, 0));
        var overlap = 0;
        for (var j = 0; j < finalSegments.length; j++) {
            var f = finalSegments[j];
            if (!f || f.state === 'suppressed') continue;
            overlap += getOverlapSec(seg.start, seg.end, f.start, f.end);
        }

        if ((overlap / dur) >= 0.60) keptCount++;
    }

    var total = 0;
    for (i = 0; i < sourceSegments.length; i++) {
        if (sourceSegments[i] && sourceSegments[i].state !== 'suppressed') total++;
    }
    if (total <= 0) return 0;
    return keptCount / total;
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
                state: segs[i].state || 'active',
                origin: segs[i].origin || 'analysis_active'
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
