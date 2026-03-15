'use strict';

(function (root) {
    function defaultParseNum(value, fallback) {
        var num = parseFloat(value);
        return isFinite(num) ? num : fallback;
    }

    function defaultClamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function defaultRound(value, digits) {
        var factor = Math.pow(10, digits || 0);
        return Math.round(value * factor) / factor;
    }

    function defaultTrackDisplayName(trackIndex) {
        return 'Track ' + (parseInt(trackIndex, 10) + 1);
    }

    function isUninterestingDefault(item) {
        return !!(item && (item.isUninteresting || item.decisionState === 'uninteresting'));
    }

    function normalizeDecisionState(value, alwaysOpenFill, isUninteresting) {
        var state = value ? String(value) : 'review';
        if (isUninteresting) return 'uninteresting';
        if (state === 'keep' || state === 'review' || state === 'suppress' || state === 'filled_gap' || state === 'uninteresting') {
            return state;
        }
        return 'review';
    }

    function normalizeContentState(value, alwaysOpenFill, isUninteresting) {
        var state = value ? String(value) : 'unknown';
        if (isUninteresting) return 'noise';
        if (state === 'speech' || state === 'laughter' || state === 'mixed' || state === 'bleed' ||
            state === 'noise' || state === 'silence_fill' || state === 'unknown') {
            return state;
        }
        return 'unknown';
    }

    function normalizeTimelineStateLabel(stateLabel) {
        if (stateLabel === 'keep' || stateLabel === 'review' || stateLabel === 'suppress' ||
            stateLabel === 'filled_gap' || stateLabel === 'uninteresting') {
            return stateLabel;
        }
        if (stateLabel === 'active') return 'keep';
        return 'suppress';
    }

    function scoreLabelFromScore(scoreValue) {
        if (scoreValue >= 70) return 'strong';
        if (scoreValue >= 45) return 'borderline';
        return 'weak';
    }

    function getDeps(context) {
        var deps = context || {};
        deps.parseNum = typeof deps.parseNum === 'function' ? deps.parseNum : defaultParseNum;
        deps.clamp = typeof deps.clamp === 'function' ? deps.clamp : defaultClamp;
        deps.round = typeof deps.round === 'function' ? deps.round : defaultRound;
        deps.getTrackDisplayName = typeof deps.getTrackDisplayName === 'function'
            ? deps.getTrackDisplayName
            : defaultTrackDisplayName;
        deps.isUninterestingSnippet = typeof deps.isUninterestingSnippet === 'function'
            ? deps.isUninterestingSnippet
            : isUninterestingDefault;
        deps.hydrateItemSourceMapping = typeof deps.hydrateItemSourceMapping === 'function'
            ? deps.hydrateItemSourceMapping
            : null;
        deps.trackColors = Array.isArray(deps.trackColors) && deps.trackColors.length
            ? deps.trackColors
            : ['#4ea1f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#ffeb3b', '#795548'];
        deps.tracks = Array.isArray(deps.tracks) ? deps.tracks : [];
        deps.trackCount = isFinite(parseInt(deps.trackCount, 10))
            ? parseInt(deps.trackCount, 10)
            : deps.tracks.length;
        return deps;
    }

    function normalizeCutPreviewItem(raw, fallbackTrackIndex, counter, deps) {
        var parseNum = deps.parseNum;
        var round = deps.round;
        var getTrackDisplayName = deps.getTrackDisplayName;
        var trackColors = deps.trackColors;

        var start = parseNum(raw && raw.start, 0);
        var end = parseNum(raw && raw.end, start);
        if (end <= start) end = start + 0.01;

        var trackIndex = parseInt(raw && raw.trackIndex, 10);
        if (!isFinite(trackIndex)) trackIndex = fallbackTrackIndex;

        var rawMetrics = (raw && raw.metrics) ? raw.metrics : null;
        var rawDecision = (raw && raw.decision) ? raw.decision : null;
        var rawClassification = (raw && raw.classification) ? raw.classification : null;
        var rawStateModel = (raw && raw.stateModel && typeof raw.stateModel === 'object') ? raw.stateModel : null;

        var rawDecisionStage = raw && raw.decisionStage ? String(raw.decisionStage) : 'preview';
        var rawOrigin = raw && raw.origin ? String(raw.origin) : 'analysis_active';
        var rawAlwaysOpenFill = !!(
            (raw && raw.alwaysOpenFill === true) ||
            rawOrigin === 'always_open_fill' ||
            parseNum(rawMetrics && rawMetrics.alwaysOpenFill, 0) >= 0.5 ||
            rawDecisionStage.indexOf('always_open_fill') === 0
        );
        var rawUninteresting = !!(
            (raw && raw.isUninteresting === true) ||
            rawOrigin === 'timeline_gap' ||
            parseNum(rawMetrics && rawMetrics.uninterestingGap, 0) >= 0.5
        );

        var decisionState = normalizeDecisionState(
            rawStateModel && rawStateModel.decisionState ? rawStateModel.decisionState
                : (raw && raw.decisionState ? raw.decisionState
                    : (rawDecision && rawDecision.decisionState ? rawDecision.decisionState : 'review')),
            rawAlwaysOpenFill,
            rawUninteresting
        );

        var contentState = normalizeContentState(
            rawStateModel && rawStateModel.contentState ? rawStateModel.contentState
                : (raw && raw.contentState ? raw.contentState
                    : (rawClassification && rawClassification.contentState ? rawClassification.contentState : 'unknown')),
            rawAlwaysOpenFill,
            rawUninteresting
        );

        var rawQuality = (raw && raw.quality && typeof raw.quality === 'object') ? raw.quality
            : (rawStateModel && rawStateModel.quality && typeof rawStateModel.quality === 'object'
                ? rawStateModel.quality
                : null);
        var scoreValue = Math.max(0, Math.min(100, round(parseNum(
            raw && raw.score,
            rawQuality && rawQuality.score0to100 !== undefined ? rawQuality.score0to100 : (decisionState === 'keep' ? 70 : 35)
        ), 1)));

        var quality = rawQuality ? {
            score0to100: Math.max(0, Math.min(100, round(parseNum(rawQuality.score0to100, scoreValue), 1))),
            confidence0to1: Math.max(0, Math.min(1, round(parseNum(rawQuality.confidence0to1, 0), 3))),
            margin0to1: Math.max(0, Math.min(1, round(parseNum(rawQuality.margin0to1, parseNum(rawMetrics && rawMetrics.decisionMargin, 0)), 3)))
        } : {
            score0to100: scoreValue,
            confidence0to1: Math.max(0, Math.min(1, round(parseNum(rawClassification && rawClassification.confidence, 0), 3))),
            margin0to1: Math.max(0, Math.min(1, round(parseNum(rawMetrics && rawMetrics.decisionMargin, 0), 3)))
        };

        var rawProvenance = (raw && raw.provenance && typeof raw.provenance === 'object') ? raw.provenance
            : (rawStateModel && rawStateModel.provenance && typeof rawStateModel.provenance === 'object'
                ? rawStateModel.provenance
                : null);
        var provenance = rawProvenance ? {
            stage: rawProvenance.stage || rawDecisionStage,
            origin: rawProvenance.origin || rawOrigin || 'vad',
            passesTouched: Array.isArray(rawProvenance.passesTouched) ? rawProvenance.passesTouched.slice(0) : []
        } : {
            stage: rawDecisionStage,
            origin: rawOrigin || 'vad',
            passesTouched: []
        };

        var rawSelectable = (raw && typeof raw.selectable === 'boolean') ? raw.selectable : !rawUninteresting;
        var selectedDefault = decisionState === 'keep' || decisionState === 'filled_gap';

        var item = {
            id: raw && raw.id ? String(raw.id) : ('cp_ui_' + trackIndex + '_' + Math.round(start * 1000) + '_' + Math.round(end * 1000) + '_' + counter),
            trackIndex: trackIndex,
            trackName: raw && raw.trackName ? String(raw.trackName) : getTrackDisplayName(trackIndex),
            trackColor: raw && raw.trackColor ? String(raw.trackColor) : trackColors[Math.abs(trackIndex) % trackColors.length],
            laneIndex: isFinite(parseInt(raw && raw.laneIndex, 10)) ? parseInt(raw.laneIndex, 10) : trackIndex,
            start: round(start, 4),
            end: round(end, 4),
            durationMs: Math.max(1, Math.round((end - start) * 1000)),
            decisionState: decisionState,
            selected: rawSelectable && ((raw && typeof raw.selected === 'boolean') ? raw.selected : selectedDefault),
            selectable: !!rawSelectable,
            isUninteresting: rawUninteresting,
            score: scoreValue,
            scoreLabel: raw && raw.scoreLabel ? String(raw.scoreLabel) : scoreLabelFromScore(scoreValue),
            reasons: (raw && raw.reasons && raw.reasons.length) ? raw.reasons.slice(0) : ['No detailed analyzer reason available'],
            contentState: contentState,
            suppressionReason: raw && raw.suppressionReason ? String(raw.suppressionReason)
                : (rawDecision && rawDecision.suppressionReason ? String(rawDecision.suppressionReason) : null),
            sourceClipIndex: (raw && raw.sourceClipIndex !== undefined && raw.sourceClipIndex !== null) ? parseInt(raw.sourceClipIndex, 10) : null,
            mediaPath: raw && raw.mediaPath ? String(raw.mediaPath) : '',
            sourceStartSec: parseNum(raw && raw.sourceStartSec, start),
            sourceEndSec: parseNum(raw && raw.sourceEndSec, end),
            previewParts: [],
            decisionStage: rawDecisionStage,
            origin: rawOrigin,
            alwaysOpenFill: rawAlwaysOpenFill,
            overlapInfo: raw && raw.overlapInfo ? raw.overlapInfo : null,
            evidenceMetrics: (raw && raw.evidenceMetrics) ? raw.evidenceMetrics : null,
            decision: rawDecision ? rawDecision : null,
            classification: rawClassification ? rawClassification : null,
            explainability: (raw && raw.explainability) ? raw.explainability : null,
            quality: quality,
            provenance: provenance,
            metrics: rawMetrics ? rawMetrics : {
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
                noiseEvidence: 0,
                classMargin: 0,
                keptSourceRatio: 0,
                keepLikelihood: 0,
                suppressLikelihood: 0,
                reviewLikelihood: 0,
                decisionMargin: 0,
                corridorDecisionMargin: 0,
                corridorClassMargin: 0,
                corridorCombinedMargin: 0,
                uncertaintyScore: 0,
                hardReviewCorridor: 0,
                uncertaintyBleedGate: 0,
                bleedHighConfidence: 0,
                alwaysOpenFill: 0,
                mergedSegmentCount: 1,
                maxMergedGapMs: 0,
                uninterestingGap: 0
            }
        };

        item.stateModel = {
            contentState: item.contentState,
            decisionState: item.decisionState,
            quality: item.quality,
            provenance: item.provenance
        };

        if (item.isUninteresting) {
            item.metrics.uninterestingGap = 1;
            item.selected = false;
            item.selectable = false;
            item.score = 0;
            item.scoreLabel = 'weak';
            item.decisionState = 'uninteresting';
            item.contentState = 'noise';
            item.quality.score0to100 = 0;
            item.quality.margin0to1 = 1;
            item.stateModel.decisionState = 'uninteresting';
            item.stateModel.contentState = 'noise';
        }

        if (item.alwaysOpenFill && item.metrics) {
            item.metrics.alwaysOpenFill = 1;
            if (!isFinite(parseNum(item.metrics.alwaysOpenFillRatio, NaN))) {
                item.metrics.alwaysOpenFillRatio = 1;
            }
        }

        if (raw && raw.previewParts && raw.previewParts.length) {
            for (var pi = 0; pi < raw.previewParts.length; pi++) {
                var part = raw.previewParts[pi];
                if (!part || !part.mediaPath) continue;
                var partStart = parseNum(part.sourceStartSec, item.sourceStartSec);
                var partEnd = parseNum(part.sourceEndSec, item.sourceEndSec);
                if (partEnd <= partStart) continue;
                item.previewParts.push({
                    mediaPath: String(part.mediaPath),
                    sourceStartSec: round(partStart, 4),
                    sourceEndSec: round(partEnd, 4),
                    sourceClipIndex: (part.sourceClipIndex !== undefined && part.sourceClipIndex !== null)
                        ? parseInt(part.sourceClipIndex, 10)
                        : null,
                    timelineStartSec: round(parseNum(part.timelineStartSec, item.start), 4),
                    timelineEndSec: round(parseNum(part.timelineEndSec, item.end), 4),
                    coverageSec: round(Math.max(0, partEnd - partStart), 4)
                });
            }
        }

        if (!item.reasons || item.reasons.length === 0) {
            item.reasons = ['Heuristic ranking applied'];
        }

        return item;
    }

    function createEmptyCutPreview(deps) {
        var lanes = [];
        for (var i = 0; i < deps.trackCount; i++) {
            lanes.push({
                laneIndex: i,
                trackIndex: i,
                trackName: deps.getTrackDisplayName(i),
                trackColor: deps.trackColors[i % deps.trackColors.length],
                itemIds: []
            });
        }

        return {
            items: [],
            lanes: lanes,
            summary: null,
            stateTimelineByTrack: []
        };
    }

    function computeCutPreviewSummary(items, deps) {
        var parseNum = deps.parseNum;
        var round = deps.round;
        var isUninterestingSnippet = deps.isUninterestingSnippet;

        var summary = {
            totalItems: items.length,
            keepCount: 0,
            reviewCount: 0,
            suppressCount: 0,
            filledGapCount: 0,
            uninterestingCount: 0,
            selectedCount: 0,
            avgScore: 0
        };
        var scoreSum = 0;
        var scoreCount = 0;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (isUninterestingSnippet(item)) {
                summary.uninterestingCount++;
            } else if (item.decisionState === 'filled_gap') {
                summary.filledGapCount++;
                summary.keepCount++;
            } else if (item.decisionState === 'keep') {
                summary.keepCount++;
            } else if (item.decisionState === 'review') {
                summary.reviewCount++;
            } else {
                summary.suppressCount++;
            }
            if (item.selected) summary.selectedCount++;
            if (!isUninterestingSnippet(item)) {
                scoreSum += parseNum(item.score, 0);
                scoreCount++;
            }
        }
        summary.avgScore = scoreCount > 0 ? round(scoreSum / scoreCount, 1) : 0;
        return summary;
    }

    function getMaxTrackIndex(items) {
        var maxIdx = -1;
        for (var i = 0; i < items.length; i++) {
            if (items[i].trackIndex > maxIdx) maxIdx = items[i].trackIndex;
        }
        return maxIdx;
    }

    function normalizeStateTimelineByTrack(rawTimelineByTrack, laneCount, totalDurationSec, deps) {
        var parseNum = deps.parseNum;
        var clamp = deps.clamp;
        var round = deps.round;

        var out = [];
        var epsilon = 0.0001;
        var duration = Math.max(0, parseNum(totalDurationSec, 0));

        for (var t = 0; t < laneCount; t++) {
            var rawTrack = rawTimelineByTrack && rawTimelineByTrack[t] ? rawTimelineByTrack[t] : [];
            var normalizedTrack = [];

            for (var i = 0; i < rawTrack.length; i++) {
                var seg = rawTrack[i];
                if (!seg) continue;
                var st = clamp(parseNum(seg.start, 0), 0, duration);
                var en = clamp(parseNum(seg.end, st), 0, duration);
                if (!(en > st + epsilon)) continue;
                var stateLabel = normalizeTimelineStateLabel(seg.state || 'suppress');

                if (!normalizedTrack.length || normalizedTrack[normalizedTrack.length - 1].state !== stateLabel) {
                    normalizedTrack.push({
                        start: round(st, 4),
                        end: round(en, 4),
                        trackIndex: t,
                        state: stateLabel
                    });
                } else {
                    normalizedTrack[normalizedTrack.length - 1].end = round(en, 4);
                }
            }

            if (!normalizedTrack.length && duration > epsilon) {
                normalizedTrack.push({
                    start: 0,
                    end: round(duration, 4),
                    trackIndex: t,
                    state: 'uninteresting'
                });
            }

            out.push(normalizedTrack);
        }

        return out;
    }

    function buildStateTimelineFromItems(items, laneCount, totalDurationSec, deps) {
        var parseNum = deps.parseNum;
        var clamp = deps.clamp;
        var round = deps.round;
        var isUninterestingSnippet = deps.isUninterestingSnippet;

        var duration = Math.max(0, parseNum(totalDurationSec, 0));
        var epsilon = 0.0001;
        var priority = {
            filled_gap: 4,
            keep: 3,
            review: 2,
            suppress: 1,
            uninteresting: 0
        };
        var out = [];

        for (var t = 0; t < laneCount; t++) {
            var points = [0, duration];
            var trackItems = [];

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (!item || item.trackIndex !== t) continue;
                var st = clamp(parseNum(item.start, 0), 0, duration);
                var en = clamp(parseNum(item.end, st), 0, duration);
                if (!(en > st + epsilon)) continue;
                trackItems.push({
                    start: st,
                    end: en,
                    state: isUninterestingSnippet(item)
                        ? 'uninteresting'
                        : normalizeTimelineStateLabel(item.decisionState)
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
                var bestRank = 0;
                for (var j = 0; j < trackItems.length; j++) {
                    var trItem = trackItems[j];
                    if (trItem.end <= segStart + epsilon || trItem.start >= segEnd - epsilon) continue;
                    var label = normalizeTimelineStateLabel(trItem.state);
                    var rank = priority.hasOwnProperty(label) ? priority[label] : 1;
                    if (rank > bestRank) {
                        bestRank = rank;
                        bestState = label;
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

            out.push(trackTimeline);
        }

        return out;
    }

    function buildCutPreviewState(result, context) {
        var deps = getDeps(context);

        var base = (result && result.cutPreview && Array.isArray(result.cutPreview.items))
            ? result.cutPreview
            : createEmptyCutPreview(deps);

        var rawItems = base.items || [];
        var normalizedItems = [];
        var idCounter = 0;

        for (var i = 0; i < rawItems.length; i++) {
            idCounter++;
            var fallbackTrack = isFinite(parseInt(rawItems[i] && rawItems[i].trackIndex, 10))
                ? parseInt(rawItems[i].trackIndex, 10)
                : 0;
            var item = normalizeCutPreviewItem(rawItems[i], fallbackTrack, idCounter, deps);
            if (deps.hydrateItemSourceMapping) {
                item = deps.hydrateItemSourceMapping(item) || item;
            }
            normalizedItems.push(item);
        }

        normalizedItems.sort(function (a, b) {
            if (a.start !== b.start) return a.start - b.start;
            if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
            return a.end - b.end;
        });

        var laneCount = Math.max(deps.trackCount, getMaxTrackIndex(normalizedItems) + 1);
        var lanes = [];
        var perLaneIds = {};

        for (var li = 0; li < laneCount; li++) {
            perLaneIds[li] = [];
        }
        for (i = 0; i < normalizedItems.length; i++) {
            if (!perLaneIds[normalizedItems[i].trackIndex]) perLaneIds[normalizedItems[i].trackIndex] = [];
            perLaneIds[normalizedItems[i].trackIndex].push(normalizedItems[i].id);
        }

        if (base.lanes && base.lanes.length) {
            for (i = 0; i < base.lanes.length; i++) {
                var ln = base.lanes[i];
                var laneTrackIndex = isFinite(parseInt(ln.trackIndex, 10))
                    ? parseInt(ln.trackIndex, 10)
                    : (isFinite(parseInt(ln.laneIndex, 10)) ? parseInt(ln.laneIndex, 10) : i);
                lanes.push({
                    laneIndex: isFinite(parseInt(ln.laneIndex, 10)) ? parseInt(ln.laneIndex, 10) : laneTrackIndex,
                    trackIndex: laneTrackIndex,
                    trackName: ln.trackName || deps.getTrackDisplayName(laneTrackIndex),
                    trackColor: ln.trackColor || deps.trackColors[laneTrackIndex % deps.trackColors.length],
                    itemIds: perLaneIds[laneTrackIndex] || []
                });
            }
        }

        if (!lanes.length) {
            for (i = 0; i < laneCount; i++) {
                lanes.push({
                    laneIndex: i,
                    trackIndex: i,
                    trackName: deps.getTrackDisplayName(i),
                    trackColor: deps.trackColors[i % deps.trackColors.length],
                    itemIds: perLaneIds[i] || []
                });
            }
        }

        var totalDuration = deps.parseNum((result && result.totalDurationSec), NaN);
        if (!isFinite(totalDuration)) {
            totalDuration = 0;
            for (i = 0; i < normalizedItems.length; i++) {
                if (normalizedItems[i].end > totalDuration) totalDuration = normalizedItems[i].end;
            }
        }
        var hasRawTimeline = !!(base && base.stateTimelineByTrack && base.stateTimelineByTrack.length);
        var stateTimelineByTrack = hasRawTimeline
            ? normalizeStateTimelineByTrack(base.stateTimelineByTrack, laneCount, totalDuration, deps)
            : buildStateTimelineFromItems(normalizedItems, laneCount, totalDuration, deps);

        return {
            items: normalizedItems,
            lanes: lanes,
            summary: computeCutPreviewSummary(normalizedItems, deps),
            stateTimelineByTrack: stateTimelineByTrack
        };
    }

    root.AutoCastPanelCutPreviewFeature = {
        buildCutPreviewState: buildCutPreviewState
    };
})(this);
