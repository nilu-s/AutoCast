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

    function normalizeDecisionState(value, isUninteresting) {
        var state = value ? String(value) : 'review';
        if (isUninteresting) return 'uninteresting';
        if (state === 'keep' || state === 'review' || state === 'suppress' || state === 'filled_gap' || state === 'uninteresting') {
            return state;
        }
        return 'review';
    }

    function normalizeContentState(value, isUninteresting) {
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

    function createDefaultMetrics() {
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
        };
    }

    root.AutoCastPanelCutPreviewStateHelpers = {
        defaultParseNum: defaultParseNum,
        defaultClamp: defaultClamp,
        defaultRound: defaultRound,
        defaultTrackDisplayName: defaultTrackDisplayName,
        isUninterestingDefault: isUninterestingDefault,
        normalizeDecisionState: normalizeDecisionState,
        normalizeContentState: normalizeContentState,
        normalizeTimelineStateLabel: normalizeTimelineStateLabel,
        scoreLabelFromScore: scoreLabelFromScore,
        createDefaultMetrics: createDefaultMetrics
    };
})(this);
