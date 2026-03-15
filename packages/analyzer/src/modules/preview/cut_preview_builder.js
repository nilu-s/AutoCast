'use strict';

var decisionEngine = require('./cut_preview_decision_engine');
var snippetMetricsBuilder = require('./snippet_metrics_builder');
var modelHelpers = require('./cut_preview_model_helpers');

var buildEvidenceMetrics = snippetMetricsBuilder.buildEvidenceMetrics;
var computeScore = decisionEngine.computeScore;
var inferCoverageDecision = decisionEngine.inferCoverageDecision;
var applyDecisionPolicy = decisionEngine.applyDecisionPolicy;
var canAutoKeepAlwaysOpenFill = decisionEngine.canAutoKeepAlwaysOpenFill;
var classifyType = decisionEngine.classifyType;
var buildReasons = decisionEngine.buildReasons;

var buildSegmentModel = modelHelpers.buildSegmentModel;
var buildSummary = modelHelpers.buildSummary;
var buildStateTimelineByTrack = modelHelpers.buildStateTimelineByTrack;
var appendUninterestingGapItems = modelHelpers.appendUninterestingGapItems;
var hasMatchingAlwaysOpenFillItem = modelHelpers.hasMatchingAlwaysOpenFillItem;
var getUncoveredSpansForTrackItems = modelHelpers.getUncoveredSpansForTrackItems;
var computeCoverageByState = modelHelpers.computeCoverageByState;
var computeCoverageByOrigin = modelHelpers.computeCoverageByOrigin;
var computeSourceSegmentKeepRatio = modelHelpers.computeSourceSegmentKeepRatio;
var filterSegmentsByState = modelHelpers.filterSegmentsByState;
var buildFrameActivityMaps = modelHelpers.buildFrameActivityMaps;
var cloneSegmentsByTrack = modelHelpers.cloneSegmentsByTrack;
var normalizeSegmentSpan = modelHelpers.normalizeSegmentSpan;
var getTrackName = modelHelpers.getTrackName;
var getTrackPath = modelHelpers.getTrackPath;
var getTrackThresholdDb = modelHelpers.getTrackThresholdDb;
var buildItemId = modelHelpers.buildItemId;
var computeMaxEnd = modelHelpers.computeMaxEnd;
var parseNum = modelHelpers.parseNum;
var round = modelHelpers.round;
var isFiniteNumber = modelHelpers.isFiniteNumber;

function buildCutPreview(ctx) {
    ctx = ctx || {};

    var trackInfos = Array.isArray(ctx.trackInfos) ? ctx.trackInfos : [];
    var sourceSegments = cloneSegmentsByTrack(ctx.sourceSegments);
    var overlapSegments = cloneSegmentsByTrack(ctx.overlapSegments);
    var finalSegments = cloneSegmentsByTrack(ctx.finalSegments);
    var rmsProfiles = Array.isArray(ctx.rmsProfiles) ? ctx.rmsProfiles : [];
    var rawRmsProfiles = Array.isArray(ctx.rawRmsProfiles) ? ctx.rawRmsProfiles : rmsProfiles;
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
                keepCount: 0,
                reviewCount: 0,
                suppressCount: 0,
                filledGapCount: 0,
                uninterestingCount: 0,
                selectedCount: 0,
                avgScore: 0,
                trackCount: 0,
                totalDurationSec: 0
            }
        };
    }

    normalizeTrackArrays(trackCount, sourceSegments, overlapSegments, finalSegments);

    var overlapActiveMaps = buildFrameActivityMaps(overlapSegments, frameDurSec, false);
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

            var seedMetrics = buildEvidenceMetrics({
                trackIndex: t,
                start: span.start,
                end: span.end,
                frameDurSec: frameDurSec,
                thresholdDb: getTrackThresholdDb(trackInfos, t),
                rmsProfiles: rmsProfiles,
                rawRmsProfiles: rawRmsProfiles,
                spectralResults: spectralResults,
                laughterResults: laughterResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                mergedSegmentCount: overlapSpan.mergedCount,
                maxMergedGapSec: overlapSpan.maxGapSec
            });

            var decision = applyDecisionPolicy({
                baseState: baseDecision.decisionState,
                baseStage: baseDecision.stage,
                keepCoverage: keepCoverage,
                keptSourceRatio: keptSourceRatio,
                sourceSuppressedCoverage: sourceSuppressedCoverage,
                sourceActiveCoverage: sourceActiveCoverage,
                metrics: seedMetrics.values
            });

            var decisionState = decision.decisionState;
            var decisionStage = decision.stage;
            var allowAlwaysOpenAutoKeep = false;
            if (params && params.enforceAlwaysOneTrackOpen && alwaysOpenFillCoverage >= 0.65 && decisionState !== 'keep') {
                allowAlwaysOpenAutoKeep = canAutoKeepAlwaysOpenFill(decision, seedMetrics.values, params);
            }
            if (allowAlwaysOpenAutoKeep) {
                decisionState = 'keep';
                decisionStage = 'always_open_fill_blend';
                decision.decisionState = 'keep';
                decision.stage = 'always_open_fill_blend';
            } else if (params && params.enforceAlwaysOneTrackOpen && alwaysOpenFillCoverage >= 0.65 &&
                decisionStage !== 'always_open_fill_review' && decisionState !== 'keep') {
                decisionStage = 'always_open_fill_review';
                decision.stage = 'always_open_fill_review';
            }
            var metrics = seedMetrics;
            applyDecisionMetrics(metrics, decision, {
                keptSourceRatio: keptSourceRatio,
                alwaysOpenFillRatio: alwaysOpenFillCoverage
            });

            var scoreInfo = computeScore(decisionState, span.durationSec, metrics);
            var typeInfo = classifyType(decisionState, scoreInfo.score, metrics, params);
            var reasons = buildReasons(decisionState, metrics, scoreInfo, typeInfo, decision);
            var origin = alwaysOpenFillCoverage >= 0.5 ? 'always_open_fill' : 'analysis_active';
            var model = buildSegmentModel({
                decisionState: decisionState,
                contentState: typeInfo.label,
                origin: origin,
                decisionStage: decisionStage,
                alwaysOpenFill: alwaysOpenFillCoverage >= 0.5,
                scoreInfo: scoreInfo,
                typeInfo: typeInfo,
                metrics: metrics,
                reasons: reasons,
                isUninteresting: false
            });

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
                decisionState: model.decisionState,
                selected: model.decisionState === 'keep' || model.decisionState === 'filled_gap',
                score: scoreInfo.score,
                scoreLabel: scoreInfo.label,
                reasons: reasons,
                suppressionReason: model.suppressionReason,
                sourceClipIndex: null,
                mediaPath: getTrackPath(trackInfos, t),
                sourceStartSec: round(span.start, 4),
                sourceEndSec: round(span.end, 4),
                decisionStage: decisionStage,
                origin: origin,
                alwaysOpenFill: alwaysOpenFillCoverage >= 0.5,
                overlapInfo: metrics.overlapInfo,
                metrics: metrics.values,
                evidenceMetrics: model.evidenceMetrics,
                decision: model.decision,
                classification: model.classification,
                explainability: model.explainability,
                contentState: model.contentState,
                quality: model.quality,
                provenance: model.provenance,
                stateModel: model.stateModel
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

                var finalMetrics = buildEvidenceMetrics({
                    trackIndex: t,
                    start: spanStart,
                    end: spanEnd,
                    frameDurSec: frameDurSec,
                    thresholdDb: getTrackThresholdDb(trackInfos, t),
                    rmsProfiles: rmsProfiles,
                    rawRmsProfiles: rawRmsProfiles,
                    spectralResults: spectralResults,
                    laughterResults: laughterResults,
                    gateSnapshots: gateSnapshots,
                    overlapActiveMaps: overlapActiveMaps,
                    mergedSegmentCount: finalSeg.mergedCount,
                    maxMergedGapSec: finalSeg.maxGapSec
                });
                var finalDecision = applyDecisionPolicy({
                    baseState: 'keep',
                    baseStage: isAlwaysOpenFill ? 'always_open_fill' : 'postprocess_added',
                    keepCoverage: 1,
                    keptSourceRatio: 1,
                    sourceSuppressedCoverage: 0,
                    sourceActiveCoverage: 1,
                    metrics: finalMetrics.values
                });
                applyDecisionMetrics(finalMetrics, finalDecision, {
                    keptSourceRatio: 1,
                    alwaysOpenFillRatio: isAlwaysOpenFill ? fillCoverage : 0
                });

                var allowFinalAlwaysOpenAutoKeep = isAlwaysOpenFill
                    ? canAutoKeepAlwaysOpenFill(finalDecision, finalMetrics.values, params)
                    : false;
                var finalState = finalDecision.decisionState;
                var finalStage = finalDecision.stage;
                if (isAlwaysOpenFill && allowFinalAlwaysOpenAutoKeep) {
                    finalState = 'keep';
                    finalStage = 'always_open_fill';
                } else if (isAlwaysOpenFill && !allowFinalAlwaysOpenAutoKeep) {
                    if (finalDecision.bleedHighConfidence || finalState === 'suppress') {
                        finalState = 'review';
                    }
                    finalStage = 'always_open_fill_review';
                }
                finalDecision.decisionState = finalState;
                finalDecision.stage = finalStage;
                var finalScoreInfo = computeScore(finalState, spanDur, finalMetrics);
                var finalTypeInfo = classifyType(finalState, finalScoreInfo.score, finalMetrics, params);
                var finalReasons = buildReasons(finalState, finalMetrics, finalScoreInfo, finalTypeInfo, finalDecision);
                var finalOrigin = isAlwaysOpenFill ? 'always_open_fill' : 'analysis_active';
                var finalModel = buildSegmentModel({
                    decisionState: finalState,
                    contentState: finalTypeInfo.label,
                    origin: finalOrigin,
                    decisionStage: finalStage,
                    alwaysOpenFill: isAlwaysOpenFill,
                    scoreInfo: finalScoreInfo,
                    typeInfo: finalTypeInfo,
                    metrics: finalMetrics,
                    reasons: finalReasons,
                    isUninteresting: false
                });

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
                    decisionState: finalModel.decisionState,
                    selected: finalModel.decisionState === 'keep' || finalModel.decisionState === 'filled_gap',
                    score: finalScoreInfo.score,
                    scoreLabel: finalScoreInfo.label,
                    reasons: finalReasons,
                    suppressionReason: finalModel.suppressionReason,
                    sourceClipIndex: null,
                    mediaPath: getTrackPath(trackInfos, t),
                    sourceStartSec: round(spanStart, 4),
                    sourceEndSec: round(spanEnd, 4),
                    decisionStage: finalStage,
                    origin: finalOrigin,
                    alwaysOpenFill: isAlwaysOpenFill,
                    overlapInfo: finalMetrics.overlapInfo,
                    metrics: finalMetrics.values,
                    evidenceMetrics: finalModel.evidenceMetrics,
                    decision: finalModel.decision,
                    classification: finalModel.classification,
                    explainability: finalModel.explainability,
                    contentState: finalModel.contentState,
                    quality: finalModel.quality,
                    provenance: finalModel.provenance,
                    stateModel: finalModel.stateModel
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
            var fillMetrics = buildEvidenceMetrics({
                trackIndex: t,
                start: fillStart,
                end: fillEnd,
                frameDurSec: frameDurSec,
                thresholdDb: getTrackThresholdDb(trackInfos, t),
                rmsProfiles: rmsProfiles,
                rawRmsProfiles: rawRmsProfiles,
                spectralResults: spectralResults,
                laughterResults: laughterResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                mergedSegmentCount: 1,
                maxMergedGapSec: 0
            });

            var fillKeptSourceRatio = round(
                computeSourceSegmentKeepRatio(overlapSegments[t] || [], finalSegments[t] || []),
                3
            );

            var fillDecision = applyDecisionPolicy({
                baseState: 'keep',
                baseStage: 'always_open_fill',
                keepCoverage: 1,
                keptSourceRatio: 1,
                sourceSuppressedCoverage: 0,
                sourceActiveCoverage: 1,
                metrics: fillMetrics.values
            });
            applyDecisionMetrics(fillMetrics, fillDecision, {
                keptSourceRatio: fillKeptSourceRatio,
                alwaysOpenFillRatio: 1
            });

            var allowFillAutoKeep = canAutoKeepAlwaysOpenFill(fillDecision, fillMetrics.values, params);
            var fillState = fillDecision.decisionState;
            var fillStage = fillDecision.stage;
            if (allowFillAutoKeep) {
                fillState = 'keep';
                fillStage = 'always_open_fill';
            } else {
                if (fillDecision.bleedHighConfidence || fillState === 'suppress') {
                    fillState = 'review';
                }
                fillStage = 'always_open_fill_review';
            }
            fillDecision.decisionState = fillState;
            fillDecision.stage = fillStage;

            var fillScoreInfo = computeScore(fillState, fillDur, fillMetrics);
            var fillTypeInfo = classifyType(fillState, fillScoreInfo.score, fillMetrics, params);
            var fillReasons = buildReasons(fillState, fillMetrics, fillScoreInfo, fillTypeInfo, fillDecision);
            var fillModel = buildSegmentModel({
                decisionState: fillState,
                contentState: fillTypeInfo.label,
                origin: 'always_open_fill',
                decisionStage: fillStage,
                alwaysOpenFill: true,
                scoreInfo: fillScoreInfo,
                typeInfo: fillTypeInfo,
                metrics: fillMetrics,
                reasons: fillReasons,
                isUninteresting: false
            });

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
                decisionState: fillModel.decisionState,
                selected: fillModel.decisionState === 'keep' || fillModel.decisionState === 'filled_gap',
                score: fillScoreInfo.score,
                scoreLabel: fillScoreInfo.label,
                reasons: fillReasons,
                suppressionReason: fillModel.suppressionReason,
                sourceClipIndex: null,
                mediaPath: getTrackPath(trackInfos, t),
                sourceStartSec: round(fillStart, 4),
                sourceEndSec: round(fillEnd, 4),
                decisionStage: fillStage,
                origin: 'always_open_fill',
                alwaysOpenFill: true,
                overlapInfo: fillMetrics.overlapInfo,
                metrics: fillMetrics.values,
                evidenceMetrics: fillModel.evidenceMetrics,
                decision: fillModel.decision,
                classification: fillModel.classification,
                explainability: fillModel.explainability,
                contentState: fillModel.contentState,
                quality: fillModel.quality,
                provenance: fillModel.provenance,
                stateModel: fillModel.stateModel
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

function applyDecisionMetrics(metrics, decision, extras) {
    metrics = metrics || { values: {} };
    metrics.values = metrics.values || {};
    decision = decision || {};
    extras = extras || {};

    var alwaysOpenFillRatio = Math.max(0, parseNum(extras.alwaysOpenFillRatio, 0));
    var alwaysOpenFill = alwaysOpenFillRatio >= 0.5 ? 1 : 0;
    metrics.values.keptSourceRatio = round(parseNum(extras.keptSourceRatio, 0), 3);
    metrics.values.keepLikelihood = round(parseNum(decision.keepLikelihood, 0), 3);
    metrics.values.suppressLikelihood = round(parseNum(decision.suppressLikelihood, 0), 3);
    metrics.values.decisionMargin = round(parseNum(decision.margin, 0), 3);
    metrics.values.bleedHighConfidence = decision.bleedHighConfidence ? 1 : 0;
    metrics.values.postprocessPenalty = round(parseNum(decision.postprocessPenalty, metrics.values.postprocessPenalty), 3);
    metrics.values.alwaysOpenFill = alwaysOpenFill;
    metrics.values.alwaysOpenFillRatio = round(alwaysOpenFillRatio, 3);
    return metrics;
}

module.exports = {
    buildCutPreview: buildCutPreview
};




