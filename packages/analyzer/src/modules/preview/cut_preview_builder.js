'use strict';

var decisionEngine = require('./cut_preview_decision_engine');
var snippetMetricsBuilder = require('./snippet_metrics_builder');
var modelHelpers = require('./cut_preview_model_helpers');

var buildEvidenceMetrics = snippetMetricsBuilder.buildEvidenceMetrics;
var evaluatePreviewDecision = decisionEngine.evaluatePreviewDecision;
var PREVIEW_POLICY_VERSION = decisionEngine.PREVIEW_POLICY_VERSION;
var SNIPPET_METRICS_VERSION = snippetMetricsBuilder.SNIPPET_METRICS_VERSION;

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
    var rawRmsProfiles = Array.isArray(ctx.rawRmsProfiles) ? ctx.rawRmsProfiles : [];
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
            },
            policyVersion: PREVIEW_POLICY_VERSION,
            metricsVersion: SNIPPET_METRICS_VERSION
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
            itemCounter++;
            var item = buildPreviewItem({
                trackIndex: t,
                startSec: span.start,
                endSec: span.end,
                mergedSegmentCount: overlapSpan.mergedCount,
                maxMergedGapSec: overlapSpan.maxGapSec,
                decisionContext: {
                    keepCoverage: keepCoverage,
                    keptSourceRatio: keptSourceRatio,
                    sourceSuppressedCoverage: sourceSuppressedCoverage,
                    sourceActiveCoverage: sourceActiveCoverage
                },
                alwaysOpenFill: !!(params && params.enforceAlwaysOneTrackOpen && alwaysOpenFillCoverage >= 0.65),
                alwaysOpenFillRatio: alwaysOpenFillCoverage,
                origin: alwaysOpenFillCoverage >= 0.5 ? 'always_open_fill' : 'analysis_active',
                frameDurSec: frameDurSec,
                trackInfos: trackInfos,
                rmsProfiles: rmsProfiles,
                rawRmsProfiles: rawRmsProfiles,
                spectralResults: spectralResults,
                laughterResults: laughterResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                params: params,
                itemCounter: itemCounter
            });

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
                itemCounter++;
                var addedItem = buildPreviewItem({
                    trackIndex: t,
                    startSec: spanStart,
                    endSec: spanEnd,
                    mergedSegmentCount: finalSeg.mergedCount,
                    maxMergedGapSec: finalSeg.maxGapSec,
                    decisionContext: {
                        keepCoverage: 1,
                        keptSourceRatio: 1,
                        sourceSuppressedCoverage: 0,
                        sourceActiveCoverage: 1
                    },
                    alwaysOpenFill: isAlwaysOpenFill,
                    alwaysOpenFillRatio: isAlwaysOpenFill ? fillCoverage : 0,
                    origin: isAlwaysOpenFill ? 'always_open_fill' : 'analysis_active',
                    frameDurSec: frameDurSec,
                    trackInfos: trackInfos,
                    rmsProfiles: rmsProfiles,
                    rawRmsProfiles: rawRmsProfiles,
                    spectralResults: spectralResults,
                    laughterResults: laughterResults,
                    gateSnapshots: gateSnapshots,
                    overlapActiveMaps: overlapActiveMaps,
                    params: params,
                    itemCounter: itemCounter
                });
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

            var fillKeptSourceRatio = round(
                computeSourceSegmentKeepRatio(overlapSegments[t] || [], finalSegments[t] || []),
                3
            );

            itemCounter++;
            var fillItem = buildPreviewItem({
                trackIndex: t,
                startSec: fillStart,
                endSec: fillEnd,
                mergedSegmentCount: 1,
                maxMergedGapSec: 0,
                decisionContext: {
                    keepCoverage: 1,
                    keptSourceRatio: fillKeptSourceRatio,
                    sourceSuppressedCoverage: 0,
                    sourceActiveCoverage: 1
                },
                alwaysOpenFill: true,
                alwaysOpenFillRatio: 1,
                origin: 'always_open_fill',
                frameDurSec: frameDurSec,
                trackInfos: trackInfos,
                rmsProfiles: rmsProfiles,
                rawRmsProfiles: rawRmsProfiles,
                spectralResults: spectralResults,
                laughterResults: laughterResults,
                gateSnapshots: gateSnapshots,
                overlapActiveMaps: overlapActiveMaps,
                params: params,
                itemCounter: itemCounter
            });

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
        stateTimelineByTrack: stateTimelineByTrack,
        policyVersion: PREVIEW_POLICY_VERSION,
        metricsVersion: SNIPPET_METRICS_VERSION
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

function buildPreviewItem(ctx) {
    ctx = ctx || {};

    var trackIndex = Math.max(0, parseInt(ctx.trackIndex, 10) || 0);
    var startSec = parseNum(ctx.startSec, 0);
    var endSec = parseNum(ctx.endSec, startSec);
    var durationSec = Math.max(0, endSec - startSec);
    var decisionContext = ctx.decisionContext || {};
    var alwaysOpenFill = !!ctx.alwaysOpenFill;
    var alwaysOpenFillRatio = Math.max(0, parseNum(ctx.alwaysOpenFillRatio, 0));
    var origin = ctx.origin || (alwaysOpenFill ? 'always_open_fill' : 'analysis_active');
    var params = ctx.params || {};

    var metrics = buildEvidenceMetrics({
        trackIndex: trackIndex,
        start: startSec,
        end: endSec,
        frameDurSec: ctx.frameDurSec,
        thresholdDb: getTrackThresholdDb(ctx.trackInfos || [], trackIndex),
        rmsProfiles: ctx.rmsProfiles || [],
        rawRmsProfiles: ctx.rawRmsProfiles || [],
        spectralResults: ctx.spectralResults || [],
        laughterResults: ctx.laughterResults || [],
        gateSnapshots: ctx.gateSnapshots || [],
        overlapActiveMaps: ctx.overlapActiveMaps || [],
        mergedSegmentCount: ctx.mergedSegmentCount,
        maxMergedGapSec: ctx.maxMergedGapSec,
        params: params
    });

    var decision = evaluatePreviewDecision({
        metrics: metrics.values,
        keepCoverage: decisionContext.keepCoverage,
        keptSourceRatio: decisionContext.keptSourceRatio,
        sourceSuppressedCoverage: decisionContext.sourceSuppressedCoverage,
        sourceActiveCoverage: decisionContext.sourceActiveCoverage,
        durationSec: durationSec,
        alwaysOpenFill: alwaysOpenFill,
        params: params
    });

    applyDecisionMetrics(metrics, decision, {
        keptSourceRatio: decisionContext.keptSourceRatio,
        alwaysOpenFillRatio: alwaysOpenFillRatio
    });

    var decisionState = decision.decisionState;
    var stage = decision.stage;
    var typeInfo = decision.typeInfo;
    var scoreInfo = decision.scoreInfo;
    var reasons = decision.reasons;
    var model = buildSegmentModel({
        decisionState: decisionState,
        contentState: typeInfo.label,
        origin: origin,
        decisionStage: stage,
        alwaysOpenFill: alwaysOpenFill || decisionState === 'filled_gap',
        scoreInfo: scoreInfo,
        typeInfo: typeInfo,
        metrics: metrics,
        reasons: reasons,
        isUninteresting: false
    });

    return {
        id: buildItemId(trackIndex, startSec, endSec, ctx.itemCounter),
        trackIndex: trackIndex,
        trackName: getTrackName(ctx.trackInfos || [], trackIndex),
        trackColor: null,
        laneIndex: trackIndex,
        start: round(startSec, 4),
        end: round(endSec, 4),
        durationMs: Math.max(1, Math.round(durationSec * 1000)),
        decisionState: model.decisionState,
        selected: model.decisionState === 'keep' || model.decisionState === 'filled_gap',
        score: scoreInfo.score,
        scoreLabel: scoreInfo.label,
        reasons: reasons,
        suppressionReason: model.suppressionReason,
        sourceClipIndex: null,
        mediaPath: getTrackPath(ctx.trackInfos || [], trackIndex),
        sourceStartSec: round(startSec, 4),
        sourceEndSec: round(endSec, 4),
        decisionStage: stage,
        decisionPolicyVersion: PREVIEW_POLICY_VERSION,
        decisionMetricsVersion: SNIPPET_METRICS_VERSION,
        origin: origin,
        alwaysOpenFill: alwaysOpenFill || decisionState === 'filled_gap',
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
    metrics.values.reviewLikelihood = round(parseNum(decision.reviewLikelihood, 0), 3);
    metrics.values.decisionMargin = round(parseNum(decision.margin, 0), 3);
    metrics.values.corridorDecisionMargin = round(parseNum(decision.corridorDecisionMargin, parseNum(decision.margin, 0)), 3);
    metrics.values.corridorClassMargin = round(parseNum(decision.corridorClassMargin, parseNum(metrics.values.classMargin, 0)), 3);
    metrics.values.corridorCombinedMargin = round(parseNum(decision.corridorCombinedMargin, 0), 3);
    metrics.values.uncertaintyScore = round(parseNum(decision.uncertaintyScore, 0), 3);
    metrics.values.hardReviewCorridor = decision.hardReviewCorridor ? 1 : 0;
    metrics.values.uncertaintyBleedGate = decision.uncertaintyBleedGate ? 1 : 0;
    metrics.values.bleedHighConfidence = decision.bleedHighConfidence ? 1 : 0;
    metrics.values.decisionPenalty = round(parseNum(decision.decisionPenalty, 0), 3);
    metrics.values.alwaysOpenFill = alwaysOpenFill;
    metrics.values.alwaysOpenFillRatio = round(alwaysOpenFillRatio, 3);
    return metrics;
}

module.exports = {
    buildCutPreview: buildCutPreview
};




