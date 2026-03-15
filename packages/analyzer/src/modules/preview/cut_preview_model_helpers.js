'use strict';

function buildSegmentModel(ctx) {
    ctx = ctx || {};
    var metrics = ctx.metrics || {};
    var values = metrics.values || {};
    var isUninteresting = !!ctx.isUninteresting;
    var decisionState = normalizeDecisionState(
        ctx.decisionState || 'review',
        !!ctx.alwaysOpenFill,
        isUninteresting
    );
    var contentState = normalizeContentState(
        ctx.contentState || (ctx.typeInfo && ctx.typeInfo.label) || 'unknown',
        !!ctx.alwaysOpenFill,
        isUninteresting
    );
    var suppressionReason = mapSuppressionReason({
        decisionState: decisionState,
        decisionStage: ctx.decisionStage || '',
        values: values,
        contentState: contentState,
        isUninteresting: isUninteresting
    });
    var modelOrigin = mapModelOrigin({
        origin: ctx.origin || 'analysis_active',
        decisionStage: ctx.decisionStage || '',
        alwaysOpenFill: !!ctx.alwaysOpenFill,
        isUninteresting: isUninteresting
    });
    var classificationConfidence = clamp(parseNum(ctx.typeInfo && ctx.typeInfo.confidence, 0), 0, 100);
    var quality = buildQualityObject(ctx.scoreInfo, classificationConfidence, values);
    var provenance = buildProvenance(ctx.decisionStage || '', modelOrigin);
    var stateModel = {
        contentState: contentState,
        decisionState: decisionState,
        quality: quality,
        provenance: provenance
    };

    return {
        decisionState: decisionState,
        contentState: contentState,
        quality: quality,
        provenance: provenance,
        stateModel: stateModel,
        suppressionReason: suppressionReason,
        origin: modelOrigin,
        evidenceMetrics: buildEvidenceMetrics(values),
        decision: {
            decisionState: decisionState,
            suppressionReason: suppressionReason,
            origin: modelOrigin,
            keepLikelihood: round(clamp(parseNum(values.keepLikelihood, 0), 0, 1), 3),
            suppressLikelihood: round(clamp(parseNum(values.suppressLikelihood, 0), 0, 1), 3),
            reviewLikelihood: round(clamp(parseNum(values.reviewLikelihood, 0), 0, 1), 3),
            margin: round(clamp(parseNum(values.decisionMargin, 0), 0, 1), 3),
            corridorDecisionMargin: round(clamp(parseNum(values.corridorDecisionMargin, parseNum(values.decisionMargin, 0)), 0, 1), 3),
            corridorClassMargin: round(clamp(parseNum(values.corridorClassMargin, parseNum(values.classMargin, 0)), 0, 1), 3),
            corridorCombinedMargin: round(clamp(parseNum(values.corridorCombinedMargin, 0), 0, 1), 3),
            uncertaintyScore: round(clamp(parseNum(values.uncertaintyScore, 0), 0, 1), 3),
            hardReviewCorridor: round(clamp(parseNum(values.hardReviewCorridor, 0), 0, 1), 3),
            uncertaintyBleedGate: round(clamp(parseNum(values.uncertaintyBleedGate, 0), 0, 1), 3),
            decisionPenalty: round(clamp(parseNum(values.decisionPenalty, 0), 0, 1), 3)
        },
        classification: {
            contentState: contentState,
            confidence: round(classificationConfidence / 100, 3)
        },
        explainability: {
            reasons: Array.isArray(ctx.reasons) ? ctx.reasons.slice(0) : [],
            decisionStage: ctx.decisionStage || '',
            overlapInfo: metrics.overlapInfo || null,
            stateModel: stateModel
        }
    };
}

function buildEvidenceMetrics(values) {
    values = values || {};
    return {
        meanOverThresholdDb: round(parseNum(values.meanOverThreshold, 0), 2),
        peakOverThresholdDb: round(parseNum(values.peakOverThreshold, 0), 2),
        rawMeanDbFs: round(parseNum(values.rawMeanDbFs, -90), 2),
        rawPeakDbFs: round(parseNum(values.rawPeakDbFs, -90), 2),
        spectralConfidence: round(clamp(parseNum(values.spectralConfidence, 0), 0, 1), 3),
        laughterConfidence: round(clamp(parseNum(values.laughterConfidence, 0), 0, 1), 3),
        overlapPenalty: round(clamp(parseNum(values.overlapPenalty, 0), 0, 1), 3),
        overlapTrust: round(clamp(parseNum(values.overlapTrust, 0), 0, 1), 3),
        speakerLockScore: round(clamp(parseNum(values.speakerLockScore, 0), 0, 1), 3),
        speakerMatchP10: round(clamp(parseNum(values.speakerMatchP10, parseNum(values.speakerLockScore, 0)), 0, 1), 3),
        speakerMatchMedian: round(clamp(parseNum(values.speakerMatchMedian, parseNum(values.speakerLockScore, 0)), 0, 1), 3),
        voiceFrameRatio: round(clamp(parseNum(values.voiceFrameRatio, 0), 0, 1), 3),
        inSnippetDropoutRatio: round(clamp(parseNum(values.inSnippetDropoutRatio, 0), 0, 1), 3),
        mergeHeterogeneity: round(clamp(parseNum(values.mergeHeterogeneity, 0), 0, 1), 3),
        speechEvidence: round(clamp(parseNum(values.speechEvidence, 0), 0, 1), 3),
        laughterEvidence: round(clamp(parseNum(values.laughterEvidence, 0), 0, 1), 3),
        bleedEvidence: round(clamp(parseNum(values.bleedEvidence, 0), 0, 1), 3),
        bleedConfidence: round(clamp(parseNum(values.bleedConfidence, 0), 0, 1), 3),
        noiseEvidence: round(clamp(parseNum(values.noiseEvidence, 0), 0, 1), 3),
        classMargin: round(clamp(parseNum(values.classMargin, 0), 0, 1), 3),
        mergedSegmentCount: Math.max(1, Math.round(parseNum(values.mergedSegmentCount, 1))),
        maxMergedGapMs: round(Math.max(0, parseNum(values.maxMergedGapMs, 0)), 1)
    };
}

function normalizeDecisionState(decisionState, alwaysOpenFill, isUninteresting) {
    var state = decisionState ? String(decisionState) : 'review';
    if (isUninteresting) return 'uninteresting';
    if (state === 'keep' || state === 'review' || state === 'suppress' || state === 'filled_gap' || state === 'uninteresting') {
        return state;
    }
    return 'review';
}

function normalizeContentState(contentState, alwaysOpenFill, isUninteresting) {
    var state = contentState ? String(contentState) : 'unknown';
    if (isUninteresting) return 'noise';
    if (state === 'speech' ||
        state === 'laughter' ||
        state === 'mixed' ||
        state === 'bleed' ||
        state === 'noise' ||
        state === 'silence_fill' ||
        state === 'unknown') {
        return state;
    }
    return 'unknown';
}

function buildQualityObject(scoreInfo, classificationConfidence, values) {
    var score = round(clamp(parseNum(scoreInfo && scoreInfo.score, 0), 0, 100), 1);
    var confidence = round(clamp(parseNum(classificationConfidence, 0) / 100, 0, 1), 3);
    var margin = round(clamp(parseNum(values && values.decisionMargin, 0), 0, 1), 3);
    return {
        score0to100: score,
        confidence0to1: confidence,
        margin0to1: margin
    };
}

function buildProvenance(decisionStage, modelOrigin) {
    var stage = decisionStage || '';
    var origin = modelOrigin || 'vad';
    var passesTouched = [];

    if (stage.indexOf('always_open_fill') === 0 || stage === 'timeline_gap_uninteresting') {
        passesTouched.push('continuity');
    }
    if (stage === 'overlap_resolve' || stage.indexOf('bleed_high_confidence') === 0) {
        passesTouched.push('overlap');
    }
    if (stage.indexOf('postprocess_') === 0 || stage === 'postprocess_pruned') {
        passesTouched.push('postprocess');
    }
    if (!passesTouched.length) {
        passesTouched.push('preview');
    }

    return {
        stage: stage || 'unknown',
        origin: origin,
        passesTouched: passesTouched
    };
}

function mapSuppressionReason(ctx) {
    var state = ctx.decisionState;
    var stage = ctx.decisionStage || '';
    var values = ctx.values || {};

    if (state === 'keep' || state === 'filled_gap') return null;
    if (ctx.isUninteresting) return 'postprocess_prune';

    if (stage.indexOf('always_open_fill_review') === 0) return 'continuity_override';
    if (stage === 'overlap_resolve' || stage.indexOf('bleed_high_confidence') === 0) return 'bleed';
    if (stage === 'postprocess_pruned' || stage === 'timeline_gap_uninteresting' || stage.indexOf('postprocess_') === 0) {
        return 'postprocess_prune';
    }
    var spectral = clamp(parseNum(values.spectralConfidence, 0), 0, 1);
    var peakOver = parseNum(values.peakOverThreshold, 0);
    var meanOver = parseNum(values.meanOverThreshold, 0);
    var overlap = clamp(parseNum(values.overlapPenalty, 0), 0, 1);
    var overlapTrust = clamp(parseNum(values.overlapTrust, 0), 0, 1);
    var overlapPressure = overlap * overlapTrust;
    var bleedConf = clamp(parseNum(values.bleedConfidence, parseNum(values.bleedEvidence, 0)), 0, 1);

    if (ctx.contentState === 'bleed' || bleedConf >= 0.60) return 'bleed';
    if (overlapPressure >= 0.40 && bleedConf < 0.60) return 'dominance_loss';
    if (spectral < 0.20) return 'low_spectral_confidence';
    if (peakOver < 0 && meanOver < 0) return 'low_energy';
    return 'unknown';
}

function mapModelOrigin(ctx) {
    var stage = ctx.decisionStage || '';
    var origin = ctx.origin || 'analysis_active';

    if (ctx.isUninteresting) return 'postprocess';
    if (ctx.alwaysOpenFill || origin === 'always_open_fill' || origin === 'timeline_gap') {
        return 'continuity_fill';
    }
    if (stage === 'overlap_resolve' || stage.indexOf('bleed_high_confidence') === 0) {
        return 'overlap_resolve';
    }
    if (stage === 'postprocess_pruned' || stage === 'timeline_gap_uninteresting' ||
        stage.indexOf('postprocess_') === 0) {
        return 'postprocess';
    }
    return 'vad';
}

function buildSummary(items, trackCount, totalDurationSec) {
    var keep = 0;
    var review = 0;
    var suppress = 0;
    var filledGap = 0;
    var uninteresting = 0;
    var selected = 0;
    var scoreSum = 0;
    var scoredCount = 0;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var decisionState = normalizeDecisionState(item && item.decisionState, !!(item && item.alwaysOpenFill), !!(item && item.isUninteresting));
        if (isUninterestingItem(item)) {
            uninteresting++;
        } else if (decisionState === 'filled_gap') {
            filledGap++;
            keep++;
        } else if (decisionState === 'keep') {
            keep++;
        } else if (decisionState === 'review') {
            review++;
        } else {
            suppress++;
        }

        if (item.selected) selected++;
        if (!isUninterestingItem(item)) {
            scoreSum += item.score || 0;
            scoredCount++;
        }
    }

    return {
        totalItems: items.length,
        keepCount: keep,
        reviewCount: review,
        suppressCount: suppress,
        filledGapCount: filledGap,
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
        filled_gap: 4,
        keep: 3,
        review: 2,
        suppress: 1,
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
                state: item.decisionState || 'suppress'
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
                var rank = priority.hasOwnProperty(state) ? priority[state] : priority.suppress;
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
            var gapReasons = ['No relevant speech candidate in this span'];
            var gapModel = buildSegmentModel({
                decisionState: 'uninteresting',
                contentState: 'noise',
                origin: 'timeline_gap',
                decisionStage: 'timeline_gap_uninteresting',
                alwaysOpenFill: false,
                scoreInfo: { score: 0, label: 'weak' },
                typeInfo: { label: 'noise', confidence: 100 },
                metrics: { values: buildUninterestingMetrics(), overlapInfo: null },
                reasons: gapReasons,
                isUninteresting: true
            });

            var gapItem = {
                id: buildItemId(t, st, en, counter),
                trackIndex: t,
                trackName: getTrackName(trackInfos, t),
                trackColor: null,
                laneIndex: t,
                start: round(st, 4),
                end: round(en, 4),
                durationMs: Math.max(1, Math.round((en - st) * 1000)),
                decisionState: gapModel.decisionState,
                selected: false,
                selectable: false,
                isUninteresting: true,
                score: 0,
                scoreLabel: 'weak',
                reasons: gapReasons,
                suppressionReason: gapModel.suppressionReason,
                sourceClipIndex: null,
                mediaPath: getTrackPath(trackInfos, t),
                sourceStartSec: round(st, 4),
                sourceEndSec: round(en, 4),
                decisionStage: 'timeline_gap_uninteresting',
                origin: 'timeline_gap',
                alwaysOpenFill: false,
                overlapInfo: null,
                metrics: buildUninterestingMetrics(),
                evidenceMetrics: gapModel.evidenceMetrics,
                decision: gapModel.decision,
                classification: gapModel.classification,
                explainability: gapModel.explainability,
                contentState: gapModel.contentState,
                quality: gapModel.quality,
                provenance: gapModel.provenance,
                stateModel: gapModel.stateModel
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
        rawMeanDbFs: -90,
        rawPeakDbFs: -90,
        spectralConfidence: 0,
        laughterConfidence: 0,
        overlapPenalty: 0,
        overlapTrust: 0,
        speakerLockScore: 0,
        speakerMatchP10: 0,
        speakerMatchMedian: 0,
        voiceFrameRatio: 0,
        inSnippetDropoutRatio: 1,
        mergeHeterogeneity: 0,
        decisionPenalty: 0,
        speechEvidence: 0,
        laughterEvidence: 0,
        bleedEvidence: 0,
        bleedConfidence: 0,
        noiseEvidence: 1,
        classMargin: 1,
        keptSourceRatio: 0,
        keepLikelihood: 0,
        suppressLikelihood: 1,
        reviewLikelihood: 0,
        decisionMargin: 1,
        corridorDecisionMargin: 1,
        corridorClassMargin: 1,
        corridorCombinedMargin: 1,
        uncertaintyScore: 1,
        hardReviewCorridor: 1,
        uncertaintyBleedGate: 0,
        bleedHighConfidence: 0,
        alwaysOpenFill: 0,
        mergedSegmentCount: 1,
        maxMergedGapMs: 0,
        uninterestingGap: 1
    };
}

function normalizeStateLabel(state) {
    if (state === 'keep' || state === 'review' || state === 'suppress' || state === 'filled_gap' || state === 'uninteresting') {
        return state;
    }
    if (state === 'active') return 'keep';
    return 'suppress';
}

function isUninterestingItem(item) {
    if (!item) return false;
    if (item.isUninteresting) return true;
    if (item.decisionState === 'uninteresting') return true;
    if (item.origin === 'timeline_gap') return true;
    return item.metrics && parseNum(item.metrics.uninterestingGap, 0) >= 0.5;
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
    buildSegmentModel: buildSegmentModel,
    buildEvidenceMetrics: buildEvidenceMetrics,
    normalizeDecisionState: normalizeDecisionState,
    normalizeContentState: normalizeContentState,
    buildQualityObject: buildQualityObject,
    buildProvenance: buildProvenance,
    mapSuppressionReason: mapSuppressionReason,
    mapModelOrigin: mapModelOrigin,
    buildSummary: buildSummary,
    buildStateTimelineByTrack: buildStateTimelineByTrack,
    appendUninterestingGapItems: appendUninterestingGapItems,
    buildUninterestingMetrics: buildUninterestingMetrics,
    normalizeStateLabel: normalizeStateLabel,
    isUninterestingItem: isUninterestingItem,
    computeMaxEndFromItems: computeMaxEndFromItems,
    hasMatchingItem: hasMatchingItem,
    hasMatchingAlwaysOpenFillItem: hasMatchingAlwaysOpenFillItem,
    getUncoveredSpansForTrackItems: getUncoveredSpansForTrackItems,
    computeCoverageByState: computeCoverageByState,
    computeCoverageByOrigin: computeCoverageByOrigin,
    computeSourceSegmentKeepRatio: computeSourceSegmentKeepRatio,
    filterSegmentsByState: filterSegmentsByState,
    buildFrameActivityMaps: buildFrameActivityMaps,
    cloneSegmentsByTrack: cloneSegmentsByTrack,
    normalizeSegmentSpan: normalizeSegmentSpan,
    averageRange: averageRange,
    maxRange: maxRange,
    getFrameValue: getFrameValue,
    getTrackName: getTrackName,
    getTrackPath: getTrackPath,
    getTrackThresholdDb: getTrackThresholdDb,
    buildItemId: buildItemId,
    computeMaxEnd: computeMaxEnd,
    getOverlapSec: getOverlapSec,
    parseNum: parseNum,
    clamp: clamp,
    round: round,
    isFiniteNumber: isFiniteNumber
};

