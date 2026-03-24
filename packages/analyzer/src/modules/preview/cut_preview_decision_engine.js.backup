'use strict';

var modelHelpers = require('./cut_preview_model_helpers');

var parseNum = modelHelpers.parseNum;
var clamp = modelHelpers.clamp;
var isFiniteNumber = modelHelpers.isFiniteNumber;
var round = modelHelpers.round;
var PREVIEW_POLICY_VERSION = 'preview-policy.v2';

function computeDecisionPenalty(values) {
    values = values || {};
    var overlapPenalty = clamp(parseNum(values.overlapPenalty, 0), 0, 1);
    var overlapTrust = clamp(parseNum(values.overlapTrust, 0), 0, 1);
    var spectralWeakness = 1 - clamp(parseNum(values.spectralConfidence, 0), 0, 1);
    var rawPeakWeakness = clamp((-54 - parseNum(values.rawPeakDbFs, -90)) / 20, 0, 1);
    var rawMeanWeakness = clamp((-58 - parseNum(values.rawMeanDbFs, -90)) / 20, 0, 1);
    var peakWeakness = clamp((0 - parseNum(values.peakOverThreshold, 0)) / 8, 0, 1);
    var meanWeakness = clamp((0 - parseNum(values.meanOverThreshold, 0)) / 8, 0, 1);
    var mergeHeterogeneity = clamp(parseNum(values.mergeHeterogeneity, 0), 0, 1);
    var inSnippetDropoutRatio = clamp(parseNum(values.inSnippetDropoutRatio, 0), 0, 1);
    var noise = clamp(parseNum(values.noiseEvidence, 0), 0, 1);
    var contextualOverlapPenalty = clamp(overlapPenalty * overlapTrust, 0, 1);

    return clamp(
        contextualOverlapPenalty * 0.18 +
        spectralWeakness * 0.16 +
        rawPeakWeakness * 0.14 +
        rawMeanWeakness * 0.11 +
        peakWeakness * 0.12 +
        meanWeakness * 0.09 +
        mergeHeterogeneity * 0.11 +
        inSnippetDropoutRatio * 0.05 +
        noise * 0.04,
        0,
        1
    );
}

function computeDecisionSignals(values, ctx) {
    values = values || {};
    ctx = ctx || {};

    var keepCoverage = clamp(parseNum(ctx.keepCoverage, 0), 0, 1);
    var keptSourceRatio = clamp(parseNum(ctx.keptSourceRatio, 0), 0, 1);
    var sourceSuppressedCoverage = clamp(parseNum(ctx.sourceSuppressedCoverage, 0), 0, 1);
    var sourceActiveCoverage = clamp(parseNum(ctx.sourceActiveCoverage, 0), 0, 1);

    var speechEvidence = clamp(parseNum(values.speechEvidence, 0), 0, 1);
    var bleedEvidence = clamp(parseNum(values.bleedEvidence, 0), 0, 1);
    var noiseEvidence = clamp(parseNum(values.noiseEvidence, 0), 0, 1);
    var spectralConfidence = clamp(parseNum(values.spectralConfidence, 0), 0, 1);
    var speakerLockScore = clamp(parseNum(values.speakerLockScore, 0), 0, 1);
    var speakerMatchMedian = clamp(parseNum(values.speakerMatchMedian, speakerLockScore), 0, 1);
    var speakerMatchP10 = clamp(parseNum(values.speakerMatchP10, speakerLockScore), 0, 1);
    var overlapPenalty = clamp(parseNum(values.overlapPenalty, 0), 0, 1);
    var overlapTrust = clamp(parseNum(values.overlapTrust, 0), 0, 1);
    var contextualOverlapPenalty = clamp(overlapPenalty * overlapTrust, 0, 1);
    var classMargin = clamp(parseNum(values.classMargin, 0), 0, 1);
    var voiceFrameRatio = clamp(parseNum(values.voiceFrameRatio, speechEvidence), 0, 1);
    var inSnippetDropoutRatio = clamp(parseNum(values.inSnippetDropoutRatio, 0), 0, 1);
    var mergeHeterogeneity = clamp(parseNum(values.mergeHeterogeneity, 0), 0, 1);
    var bleedConfidence = clamp(parseNum(values.bleedConfidence, bleedEvidence), 0, 1);

    var peakNorm = clamp((parseNum(values.peakOverThreshold, 0) + 2) / 12, 0, 1);
    var meanNorm = clamp((parseNum(values.meanOverThreshold, 0) + 2) / 9, 0, 1);
    var rawPeakNorm = clamp((parseNum(values.rawPeakDbFs, -90) + 62) / 20, 0, 1);
    var rawMeanNorm = clamp((parseNum(values.rawMeanDbFs, -90) + 66) / 20, 0, 1);
    var energySupport = clamp(
        peakNorm * 0.34 +
        meanNorm * 0.24 +
        rawPeakNorm * 0.24 +
        rawMeanNorm * 0.18,
        0,
        1
    );
    var speechSupport = clamp(
        speechEvidence * 0.28 +
        spectralConfidence * 0.15 +
        speakerLockScore * 0.10 +
        speakerMatchMedian * 0.08 +
        voiceFrameRatio * 0.08 +
        energySupport * 0.20 +
        (1 - contextualOverlapPenalty) * 0.06 +
        classMargin * 0.05,
        0,
        1
    );
    var suppressPressure = clamp(
        bleedConfidence * 0.26 +
        bleedEvidence * 0.15 +
        contextualOverlapPenalty * 0.17 +
        overlapTrust * 0.10 +
        noiseEvidence * 0.07 +
        sourceSuppressedCoverage * 0.10 +
        (1 - sourceActiveCoverage) * 0.05 +
        (1 - speechEvidence) * 0.05 +
        inSnippetDropoutRatio * 0.03 +
        mergeHeterogeneity * 0.02,
        0,
        1
    );
    var coverageKeep = clamp(
        keepCoverage * 0.56 +
        keptSourceRatio * 0.28 +
        sourceActiveCoverage * 0.16,
        0,
        1
    );
    var keepLikelihood = clamp(
        speechSupport * 0.42 +
        coverageKeep * 0.38 +
        (1 - suppressPressure) * 0.20,
        0,
        1
    );
    var suppressLikelihood = clamp(
        suppressPressure * 0.52 +
        sourceSuppressedCoverage * 0.22 +
        (1 - coverageKeep) * 0.16 +
        (1 - speechSupport) * 0.10,
        0,
        1
    );
    var margin = clamp(Math.abs(keepLikelihood - suppressLikelihood), 0, 1);
    var reviewLikelihood = clamp(
        1 - margin + (1 - classMargin) * 0.20 + mergeHeterogeneity * 0.10 + inSnippetDropoutRatio * 0.06,
        0,
        1
    );
    var uncertaintyScore = clamp(
        (1 - margin) * 0.48 +
        (1 - classMargin) * 0.30 +
        mergeHeterogeneity * 0.12 +
        inSnippetDropoutRatio * 0.06 +
        (1 - speakerMatchP10) * 0.04,
        0,
        1
    );
    var bleedHighConfidence = (
        bleedConfidence >= 0.80 &&
        contextualOverlapPenalty >= 0.44
    );
    var bleedLean = (
        bleedEvidence >= 0.42 ||
        bleedConfidence >= 0.46 ||
        contextualOverlapPenalty >= 0.32
    );

    return {
        keepLikelihood: keepLikelihood,
        suppressLikelihood: suppressLikelihood,
        reviewLikelihood: reviewLikelihood,
        margin: margin,
        classMargin: classMargin,
        uncertaintyScore: uncertaintyScore,
        bleedHighConfidence: bleedHighConfidence,
        bleedLean: bleedLean,
        speechSupport: speechSupport,
        suppressPressure: suppressPressure,
        overlapTrust: overlapTrust
    };
}

function chooseDecisionState(signals, ctx) {
    ctx = ctx || {};
    var keepCoverage = clamp(parseNum(ctx.keepCoverage, 0), 0, 1);
    var keptSourceRatio = clamp(parseNum(ctx.keptSourceRatio, 0), 0, 1);
    var sourceSuppressedCoverage = clamp(parseNum(ctx.sourceSuppressedCoverage, 0), 0, 1);

    var decisionState = 'review';
    var stage = 'evidence_review';

    if (signals.bleedHighConfidence && signals.speechSupport < 0.80) {
        decisionState = 'suppress';
        stage = 'bleed_high_confidence';
    } else if (signals.keepLikelihood >= 0.63 &&
        signals.keepLikelihood >= (signals.suppressLikelihood + 0.07)) {
        decisionState = 'keep';
        stage = 'evidence_keep';
    } else if (signals.suppressLikelihood >= 0.65 &&
        signals.suppressLikelihood >= (signals.keepLikelihood + 0.07)) {
        decisionState = 'suppress';
        stage = 'evidence_suppress';
    }

    if (sourceSuppressedCoverage >= 0.70 && keepCoverage < 0.25 &&
        signals.suppressLikelihood >= 0.50) {
        decisionState = 'suppress';
        stage = 'overlap_resolve';
    }
    if (keepCoverage >= 0.84 && keptSourceRatio >= 0.78 &&
        signals.keepLikelihood >= 0.56 && !signals.bleedHighConfidence) {
        decisionState = 'keep';
        stage = 'final_kept';
    }

    return {
        decisionState: decisionState,
        stage: stage
    };
}

function computeUncertaintyCorridor(values, signals, params) {
    values = values || {};
    signals = signals || {};
    params = params || {};

    var decisionMargin = clamp(parseNum(signals.margin, 0), 0, 1);
    var classMargin = clamp(parseNum(values.classMargin, parseNum(signals.classMargin, 0)), 0, 1);
    var minDecisionMargin = clamp(parseNum(params.previewHardReviewDecisionMargin, 0.12), 0, 1);
    var minClassMargin = clamp(parseNum(params.previewHardReviewClassMargin, 0.16), 0, 1);
    var minCombinedMargin = clamp(parseNum(params.previewHardReviewCombinedMargin, 0.15), 0, 1);
    var combinedMargin = clamp(decisionMargin * 0.55 + classMargin * 0.45, 0, 1);
    var uncertaintyScore = clamp(parseNum(signals.uncertaintyScore, 0), 0, 1);

    var hardReview = (
        decisionMargin <= minDecisionMargin ||
        classMargin <= minClassMargin ||
        combinedMargin <= minCombinedMargin
    );

    return {
        hardReview: hardReview,
        decisionMargin: decisionMargin,
        classMargin: classMargin,
        combinedMargin: combinedMargin,
        uncertaintyScore: uncertaintyScore
    };
}

function applyUncertaintyGate(decisionState, stage, signals, corridor) {
    var gatedDecision = decisionState || 'review';
    var gatedStage = stage || 'evidence_review';

    if (!corridor.hardReview) {
        return {
            decisionState: gatedDecision,
            stage: gatedStage,
            uncertaintyBleedGate: false
        };
    }

    if (gatedDecision === 'keep' && signals.bleedLean) {
        return {
            decisionState: 'review',
            stage: 'uncertainty_bleed_gate',
            uncertaintyBleedGate: true
        };
    }

    if (gatedDecision !== 'filled_gap') {
        return {
            decisionState: 'review',
            stage: 'uncertainty_corridor',
            uncertaintyBleedGate: false
        };
    }

    return {
        decisionState: gatedDecision,
        stage: gatedStage,
        uncertaintyBleedGate: false
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
    var state = decision.decisionState || '';

    var maxBleed = clamp(parseNum(params.alwaysOpenFillAutoKeepBleedMaxConfidence, 0.76), 0, 1);
    var minSpeech = clamp(parseNum(params.alwaysOpenFillAutoKeepMinSpeechEvidence, 0.46), 0, 1);
    var minKeepLikelihood = clamp(parseNum(params.alwaysOpenFillAutoKeepMinKeepLikelihood, 0.60), 0, 1);
    var promoteSuppressed = !!params.alwaysOpenFillPromoteSuppressed;

    if (!promoteSuppressed && state === 'suppress') return false;
    if (bleedHighConfidence) return false;
    if (bleedConfidence >= maxBleed && speechEvidence < (minSpeech + 0.06)) return false;
    if (keepLikelihood < minKeepLikelihood && speechEvidence < minSpeech) return false;
    if (suppressLikelihood > (keepLikelihood + 0.08)) return false;

    return true;
}

function evidenceConfidence(primaryScore, margin, bias) {
    var norm = clamp(primaryScore * 0.78 + margin * 0.22 + (bias || 0), 0, 1);
    return clamp(Math.round(norm * 100), 0, 100);
}

function classifyType(metrics, params, options) {
    options = options || {};
    params = params || {};
    var minSpectral = isFiniteNumber(params.spectralMinConfidence) ? params.spectralMinConfidence : 0.18;
    var values = metrics.values || {};
    var spectral = clamp(parseNum(values.spectralConfidence, 0), 0, 1);
    var overlapPenalty = clamp(parseNum(values.overlapPenalty, 0), 0, 1);
    var overlapTrust = clamp(parseNum(values.overlapTrust, 0), 0, 1);
    var overlapPressure = clamp(overlapPenalty * overlapTrust, 0, 1);
    var decisionPenalty = clamp(parseNum(values.decisionPenalty, 0), 0, 1);
    var speechEvidence = clamp(parseNum(values.speechEvidence, 0), 0, 1);
    var laughterEvidence = clamp(parseNum(values.laughterEvidence, 0), 0, 1);
    var bleedEvidence = clamp(parseNum(values.bleedEvidence, 0), 0, 1);
    var noiseEvidence = clamp(parseNum(values.noiseEvidence, 0), 0, 1);
    var classMargin = clamp(parseNum(values.classMargin, 0), 0, 1);
    var voiceFrameRatio = clamp(parseNum(values.voiceFrameRatio, speechEvidence), 0, 1);
    var speakerMatchMedian = clamp(parseNum(values.speakerMatchMedian, parseNum(values.speakerLockScore, 0)), 0, 1);

    var label = 'unknown';
    var confidence = 35;
    var mixedSpeechLaughter = speechEvidence >= 0.42 &&
        laughterEvidence >= 0.42 &&
        Math.abs(speechEvidence - laughterEvidence) <= 0.14;
    var strongSpeechProfile = (
        speechEvidence >= 0.56 ||
        (spectral >= Math.max(minSpectral, 0.30) && voiceFrameRatio >= 0.50) ||
        speakerMatchMedian >= 0.62
    );
    var bleedDominance = (
        bleedEvidence >= Math.max(0.56, speechEvidence + 0.12) ||
        (overlapPressure >= 0.54 && bleedEvidence >= 0.46 && voiceFrameRatio < 0.48)
    );
    var moderateBleedPressure = (
        bleedEvidence >= 0.46 &&
        overlapPressure >= 0.34 &&
        speechEvidence < 0.50 &&
        voiceFrameRatio < 0.52
    );

    if (mixedSpeechLaughter) {
        label = 'mixed';
        confidence = evidenceConfidence(
            Math.min(speechEvidence, laughterEvidence),
            1 - Math.abs(speechEvidence - laughterEvidence),
            0.05
        );
    } else if (bleedDominance) {
        label = 'bleed';
        confidence = evidenceConfidence(Math.max(bleedEvidence, overlapPressure), classMargin, 0.03);
    } else if (laughterEvidence >= 0.50 && laughterEvidence >= speechEvidence + 0.06) {
        label = 'laughter';
        confidence = evidenceConfidence(laughterEvidence, classMargin, 0.02);
    } else if (spectral >= Math.max(minSpectral, 0.30) && strongSpeechProfile) {
        label = 'speech';
        confidence = evidenceConfidence(speechEvidence, classMargin, 0.08);
    } else if (speechEvidence >= 0.40 || spectral >= (minSpectral - 0.04) || voiceFrameRatio >= 0.46) {
        label = 'speech';
        confidence = evidenceConfidence(Math.max(speechEvidence, spectral, voiceFrameRatio), classMargin, 0.01);
    } else if (moderateBleedPressure) {
        label = 'bleed';
        confidence = evidenceConfidence(Math.max(bleedEvidence, overlapPressure), classMargin, -0.03);
    } else if (noiseEvidence >= 0.52 || decisionPenalty >= 0.62) {
        label = 'noise';
        confidence = evidenceConfidence(Math.max(noiseEvidence, 1 - decisionPenalty), classMargin, -0.05);
    } else {
        label = 'unknown';
        confidence = evidenceConfidence(Math.max(noiseEvidence, 1 - decisionPenalty), classMargin, -0.08);
    }

    if (options.alwaysOpenFill &&
        options.decisionState === 'filled_gap' &&
        label !== 'speech' &&
        label !== 'laughter' &&
        speechEvidence < 0.36 &&
        laughterEvidence < 0.32 &&
        bleedEvidence < 0.35) {
        label = 'silence_fill';
        confidence = evidenceConfidence(Math.max(1 - noiseEvidence, 0.35), classMargin, 0);
    }

    return {
        label: label,
        confidence: clamp(Math.round(confidence), 0, 100)
    };
}

function computeScore(durationSec, metrics, decision) {
    metrics = metrics || {};
    decision = decision || {};

    var values = metrics.values || {};
    var durationNorm = clamp(parseNum(durationSec, 0) / 2.2, 0, 1);
    var decisionPenalty = clamp(parseNum(values.decisionPenalty, 0), 0, 1);
    var classMargin = clamp(parseNum(values.classMargin, 0), 0, 1);
    var mergeHeterogeneity = clamp(parseNum(values.mergeHeterogeneity, 0), 0, 1);
    var overlapTrust = clamp(parseNum(values.overlapTrust, 0), 0, 1);
    var certainty = clamp(Math.max(
        parseNum(decision.keepLikelihood, 0),
        parseNum(decision.suppressLikelihood, 0),
        parseNum(decision.reviewLikelihood, 0)
    ), 0, 1);
    var margin = clamp(parseNum(decision.margin, 0), 0, 1);

    var qualityNorm = clamp(
        certainty * 0.48 +
        margin * 0.18 +
        classMargin * 0.14 +
        durationNorm * 0.09 +
        (1 - decisionPenalty) * 0.07 +
        overlapTrust * 0.02 +
        (1 - mergeHeterogeneity) * 0.02,
        0,
        1
    );

    if (decision.decisionState === 'review') qualityNorm = clamp(qualityNorm * 0.86, 0, 1);
    if (decision.decisionState === 'suppress' && decision.bleedHighConfidence) {
        qualityNorm = clamp(qualityNorm + 0.06, 0, 1);
    }
    if (decision.hardReviewCorridor) {
        qualityNorm = clamp(qualityNorm * 0.82, 0, 1);
    }

    var score = Math.round(qualityNorm * 100);
    var label = 'weak';
    if (score >= 70) label = 'strong';
    else if (score >= 45) label = 'borderline';

    return {
        score: score,
        label: label
    };
}

function buildReasons(decision, metrics, scoreInfo, typeInfo) {
    var out = [];
    var vals = metrics.values || {};
    decision = decision || {};
    var decisionState = decision.decisionState || 'review';

    if (decisionState === 'keep') out.push('Kept in final decision');
    if (decisionState === 'review') out.push('Evidence is inconclusive and needs review');
    if (decisionState === 'suppress') out.push('Suppressed by overlap/bleed pressure');
    if (decisionState === 'filled_gap') out.push('Continuity fill kept to avoid silent gaps');
    if (decisionState === 'uninteresting') out.push('Timeline gap marked as uninteresting');
    if (decision.hardReviewCorridor) {
        out.push(
            'Hard review corridor triggered (decision ' +
            Math.round(clamp(parseNum(decision.corridorDecisionMargin, 0), 0, 1) * 100) +
            '%, class ' +
            Math.round(clamp(parseNum(decision.corridorClassMargin, 0), 0, 1) * 100) +
            '%)'
        );
    }
    if (decision.uncertaintyBleedGate) {
        out.push('Uncertainty gate blocked keep+bleed; routed to review');
    }
    if (parseNum(vals.alwaysOpenFill, 0) >= 0.5 || decisionState === 'filled_gap') {
        out.push('Dominant speaker continuity fill (always-open safety)');
    }
    if (vals.mergedSegmentCount > 1) {
        out.push('Merged ' + vals.mergedSegmentCount + ' nearby snippets (max gap ' + Math.round(parseNum(vals.maxMergedGapMs, 0)) + ' ms)');
    }

    if (vals.peakOverThreshold >= 4) out.push('Peak is clearly above gate threshold');
    else if (vals.peakOverThreshold >= 0) out.push('Peak is just above threshold');
    else out.push('Peak stays below keep threshold');

    if (vals.spectralConfidence >= 0.45) out.push('High spectral speech confidence');
    else if (vals.spectralConfidence >= 0.25) out.push('Moderate spectral confidence');
    else out.push('Low spectral confidence');

    if (vals.overlapPenalty >= 0.55) out.push('Strong overlap/bleed pressure');
    else if (vals.overlapPenalty >= 0.25) out.push('Some overlap competition');
    if (vals.overlapTrust <= 0.30 && vals.overlapPenalty >= 0.20) {
        out.push('Overlap trust is low; bleed pressure was down-weighted');
    } else if (vals.overlapTrust >= 0.62 && vals.overlapPenalty >= 0.35) {
        out.push('Overlap trust is high; bleed evidence is reliable');
    }
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
    if (typeInfo.label === 'bleed') out.push('Pattern matches likely bleed');
    if (typeInfo.label === 'laughter') out.push('Segment pattern matches likely laughter');
    if (typeInfo.label === 'mixed') out.push('Mixed speech and laughter profile detected');
    out.push('Decision model keep ' + Math.round(clamp(parseNum(decision.keepLikelihood, 0), 0, 1) * 100) +
        '% vs suppress ' + Math.round(clamp(parseNum(decision.suppressLikelihood, 0), 0, 1) * 100) + '%');
    if (decision.bleedHighConfidence) {
        out.push('High bleed confidence safety gate is active');
    }
    if (parseNum(decision.margin, 1) < 0.12) {
        out.push('Decision is close; manual review recommended');
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

function evaluatePreviewDecision(ctx) {
    ctx = ctx || {};
    var values = ctx.metrics || {};
    var params = ctx.params || {};
    var alwaysOpenFill = !!ctx.alwaysOpenFill;
    var decisionPenalty = computeDecisionPenalty(values);
    var signals = computeDecisionSignals(values, ctx);
    var chosen = chooseDecisionState(signals, ctx);
    var corridor = computeUncertaintyCorridor(values, signals, params);
    var gated = applyUncertaintyGate(chosen.decisionState, chosen.stage, signals, corridor);
    var decisionState = gated.decisionState;
    var stage = gated.stage;

    var decision = {
        decisionState: decisionState,
        stage: stage,
        bleedHighConfidence: signals.bleedHighConfidence,
        uncertaintyBleedGate: gated.uncertaintyBleedGate,
        hardReviewCorridor: corridor.hardReview,
        corridorDecisionMargin: corridor.decisionMargin,
        corridorClassMargin: corridor.classMargin,
        corridorCombinedMargin: corridor.combinedMargin,
        uncertaintyScore: corridor.uncertaintyScore,
        keepLikelihood: signals.keepLikelihood,
        suppressLikelihood: signals.suppressLikelihood,
        reviewLikelihood: signals.reviewLikelihood,
        margin: signals.margin,
        decisionPenalty: decisionPenalty
    };

    if (alwaysOpenFill) {
        var keepFill = canAutoKeepAlwaysOpenFill(decision, values, params);
        if (keepFill && decisionState !== 'suppress') {
            decisionState = 'filled_gap';
            stage = 'always_open_fill';
        } else {
            decisionState = 'review';
            stage = 'always_open_fill_review';
        }
        decision.decisionState = decisionState;
        decision.stage = stage;
    }

    var metricsWrapper = {
        values: Object.assign({}, values, {
            decisionPenalty: round(decisionPenalty, 3),
            decisionMargin: round(corridor.decisionMargin, 3),
            uncertaintyScore: round(corridor.uncertaintyScore, 3),
            hardReviewCorridor: corridor.hardReview ? 1 : 0
        })
    };
    var scoreInfo = computeScore(parseNum(ctx.durationSec, 0), metricsWrapper, decision);
    var typeInfo = classifyType(metricsWrapper, params, {
        alwaysOpenFill: alwaysOpenFill,
        decisionState: decisionState
    });
    if (decisionState === 'review' && typeInfo.label === 'speech') {
        typeInfo.confidence = clamp(typeInfo.confidence - 8, 0, 100);
    }
    if (decisionState === 'suppress' && typeInfo.label === 'unknown') {
        typeInfo.label = signals.bleedHighConfidence ? 'bleed' : 'noise';
    }

    return {
        policyVersion: PREVIEW_POLICY_VERSION,
        decisionState: decisionState,
        stage: stage,
        bleedHighConfidence: signals.bleedHighConfidence,
        uncertaintyBleedGate: gated.uncertaintyBleedGate,
        hardReviewCorridor: corridor.hardReview,
        corridorDecisionMargin: corridor.decisionMargin,
        corridorClassMargin: corridor.classMargin,
        corridorCombinedMargin: corridor.combinedMargin,
        uncertaintyScore: corridor.uncertaintyScore,
        keepLikelihood: signals.keepLikelihood,
        suppressLikelihood: signals.suppressLikelihood,
        reviewLikelihood: signals.reviewLikelihood,
        margin: signals.margin,
        decisionPenalty: decisionPenalty,
        scoreInfo: scoreInfo,
        typeInfo: typeInfo,
        reasons: buildReasons(decision, metricsWrapper, scoreInfo, typeInfo)
    };
}

module.exports = {
    PREVIEW_POLICY_VERSION: PREVIEW_POLICY_VERSION,
    evaluatePreviewDecision: evaluatePreviewDecision,
    computeDecisionPenalty: computeDecisionPenalty,
    computeDecisionSignals: computeDecisionSignals,
    computeScore: computeScore,
    canAutoKeepAlwaysOpenFill: canAutoKeepAlwaysOpenFill,
    evidenceConfidence: evidenceConfidence,
    classifyType: classifyType,
    buildReasons: buildReasons
};
