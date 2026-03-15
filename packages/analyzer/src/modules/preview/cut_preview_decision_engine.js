'use strict';

var modelHelpers = require('./cut_preview_model_helpers');
var snippetMetricsBuilder = require('./snippet_metrics_builder');

var parseNum = modelHelpers.parseNum;
var clamp = modelHelpers.clamp;
var isFiniteNumber = modelHelpers.isFiniteNumber;

function computeMetrics(ctx) {
    return snippetMetricsBuilder.buildEvidenceMetrics(ctx);
}

function computeOverlapStats(trackIndex, startFrame, endFrame, activeMaps, rmsProfiles) {
    return snippetMetricsBuilder.computeOverlapStats(trackIndex, startFrame, endFrame, activeMaps, rmsProfiles);
}

function computePostprocessPenalty(decisionState, metrics) {
    metrics = metrics || {};
    var relativeWeakness = clamp((0 - parseNum(metrics.peakOverThreshold, 0)) / 8, 0, 1);
    var meanWeakness = clamp((0 - parseNum(metrics.meanOverThreshold, 0)) / 8, 0, 1);
    var spectralWeakness = 1 - clamp(parseNum(metrics.spectralConfidence, 0), 0, 1);
    var overlapPenalty = clamp(parseNum(metrics.overlapPenalty, 0), 0, 1);
    var rawPeakWeakness = clamp((-54 - parseNum(metrics.rawPeakDbFs, -90)) / 20, 0, 1);
    var rawMeanWeakness = clamp((-58 - parseNum(metrics.rawMeanDbFs, -90)) / 20, 0, 1);

    if (decisionState === 'suppress') {
        return clamp(
            0.62 +
            overlapPenalty * 0.22 +
            rawPeakWeakness * 0.10 +
            rawMeanWeakness * 0.06,
            0,
            1
        );
    }
    if (decisionState === 'review') {
        return clamp(
            0.34 +
            relativeWeakness * 0.24 +
            meanWeakness * 0.16 +
            spectralWeakness * 0.10 +
            rawPeakWeakness * 0.10 +
            rawMeanWeakness * 0.06,
            0,
            1
        );
    }
    if (decisionState === 'uninteresting') {
        return 1;
    }
    return clamp(
        0.08 +
        overlapPenalty * 0.10 +
        relativeWeakness * 0.05 +
        rawPeakWeakness * 0.04,
        0,
        1
    );
}

function computeScore(decisionState, durationSec, metrics) {
    metrics = metrics || {};
    var values = metrics.values || {};
    var durationNorm = clamp(durationSec / 2.2, 0, 1);
    var peakNorm = clamp((parseNum(values.peakOverThreshold, 0) + 2.0) / 14.0, 0, 1);
    var meanNorm = clamp((parseNum(values.meanOverThreshold, 0) + 3.0) / 10.0, 0, 1);
    var spectralNorm = clamp(parseNum(values.spectralConfidence, 0), 0, 1);
    var speakerNorm = clamp(parseNum(values.speakerLockScore, 0), 0, 1);
    var overlapPenalty = clamp(parseNum(values.overlapPenalty, 0), 0, 1);
    var postprocessPenalty = parseNum(values.postprocessPenalty, NaN);

    if (!isFiniteNumber(postprocessPenalty)) {
        postprocessPenalty = computePostprocessPenalty(decisionState, {
            peakOverThreshold: parseNum(values.peakOverThreshold, 0),
            meanOverThreshold: parseNum(values.meanOverThreshold, 0),
            spectralConfidence: spectralNorm,
            overlapPenalty: overlapPenalty,
            rawPeakDbFs: parseNum(values.rawPeakDbFs, -90),
            rawMeanDbFs: parseNum(values.rawMeanDbFs, -90)
        });
    }
    postprocessPenalty = clamp(postprocessPenalty, 0, 1);

    var stateAdjust = 0;
    if (decisionState === 'keep') {
        stateAdjust = 0.10;
    } else if (decisionState === 'filled_gap') {
        stateAdjust = 0.06;
    } else if (decisionState === 'review') {
        stateAdjust = 0.02;
    } else if (decisionState === 'uninteresting') {
        stateAdjust = -0.18;
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
        return { decisionState: 'keep', stage: 'final_kept' };
    }
    if (sourceSuppressedCoverage >= 0.60 && keepCoverage < 0.25) {
        return { decisionState: 'suppress', stage: 'overlap_resolve' };
    }
    if (sourceActiveCoverage < 0.20 && sourceSuppressedCoverage >= 0.45) {
        return { decisionState: 'suppress', stage: 'overlap_resolve' };
    }
    return { decisionState: 'review', stage: 'postprocess_pruned' };
}

function applyDecisionPolicy(ctx) {
    var baseState = ctx.baseState || 'review';
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
    var classMargin = clamp(parseNum(values.classMargin, 0), 0, 1);
    var peakNorm = clamp((parseNum(values.peakOverThreshold, 0) + 2) / 12, 0, 1);
    var meanNorm = clamp((parseNum(values.meanOverThreshold, 0) + 2) / 9, 0, 1);
    var rawPeakNorm = clamp((parseNum(values.rawPeakDbFs, -90) + 62) / 20, 0, 1);
    var rawMeanNorm = clamp((parseNum(values.rawMeanDbFs, -90) + 66) / 20, 0, 1);
    var laughterDominance = clamp((laughterEvidence - speechEvidence + 0.15) / 0.5, 0, 1);
    var postprocessPenalty = computePostprocessPenalty(baseState, {
        peakOverThreshold: parseNum(values.peakOverThreshold, 0),
        meanOverThreshold: parseNum(values.meanOverThreshold, 0),
        spectralConfidence: spectralConfidence,
        overlapPenalty: overlapPenalty,
        rawPeakDbFs: parseNum(values.rawPeakDbFs, -90),
        rawMeanDbFs: parseNum(values.rawMeanDbFs, -90)
    });

    var speechSupport = clamp(
        speechEvidence * 0.30 +
        spectralConfidence * 0.13 +
        speakerLockScore * 0.13 +
        peakNorm * 0.11 +
        meanNorm * 0.10 +
        classMargin * 0.08 +
        rawPeakNorm * 0.09 +
        rawMeanNorm * 0.04 +
        (1 - noiseEvidence) * 0.08,
        0,
        1
    );
    var suppressPressure = clamp(
        bleedEvidence * 0.24 +
        overlapPenalty * 0.17 +
        postprocessPenalty * 0.16 +
        noiseEvidence * 0.10 +
        sourceSuppressedCoverage * 0.14 +
        (1 - sourceActiveCoverage) * 0.06 +
        laughterDominance * 0.07 +
        (1 - rawPeakNorm) * 0.04 +
        (1 - rawMeanNorm) * 0.02,
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
        nextState = 'suppress';
        nextStage = (baseState === 'suppress') ? baseStage : 'metrics_demoted_suppressed';
    } else if (keepLikelihood >= 0.66 && keepCoverage >= 0.22) {
        nextState = 'keep';
        nextStage = (baseState === 'keep') ? baseStage : 'metrics_promoted_keep';
    } else {
        nextState = 'review';
        if (baseState === 'review') nextStage = baseStage;
        else if (baseState === 'keep') nextStage = 'metrics_demoted_review';
        else nextStage = 'metrics_recovered_review';
    }

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
            if (nextState === 'keep') {
                nextState = 'review';
                nextStage = 'bleed_high_confidence_review';
            }
        } else {
            nextState = 'suppress';
            nextStage = 'bleed_high_confidence';
        }
    }

    if (baseState === 'keep' &&
        keepCoverage >= 0.82 &&
        keptSourceRatio >= 0.82 &&
        keepLikelihood >= 0.62 &&
        suppressLikelihood < 0.78 &&
        !bleedHighConfidence) {
        nextState = 'keep';
        nextStage = baseStage;
    }
    if (baseState === 'suppress' &&
        sourceSuppressedCoverage >= 0.68 &&
        keepCoverage < 0.25 &&
        keepLikelihood < 0.72) {
        nextState = 'suppress';
        nextStage = baseStage;
    }

    return {
        decisionState: nextState,
        stage: nextStage,
        baseDecisionState: baseState,
        bleedHighConfidence: bleedHighConfidence,
        keepLikelihood: keepLikelihood,
        suppressLikelihood: suppressLikelihood,
        margin: margin,
        postprocessPenalty: postprocessPenalty
    };
}

function decidePreviewState(ctx) {
    return applyDecisionPolicy(ctx);
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

function rankClassEvidence(scores) {
    return snippetMetricsBuilder.rankClassEvidence(scores);
}

function evidenceConfidence(primaryScore, margin, bias) {
    var norm = clamp(primaryScore * 0.78 + margin * 0.22 + (bias || 0), 0, 1);
    return clamp(Math.round(norm * 100), 0, 100);
}

function computeClassEvidence(ctx) {
    return snippetMetricsBuilder.computeClassEvidence(ctx);
}

function classifyType(decisionState, score, metrics, params) {
    params = params || {};
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
    if (decisionState === 'suppress' || decisionState === 'uninteresting') {
        if (decisionState === 'uninteresting') {
            label = 'noise';
            confidence = 95;
        } else if (evidence.bleed >= 0.48 || evidence.dominant === 'bleed') {
            label = 'bleed';
            confidence = evidenceConfidence(evidence.bleed, evidence.margin, 0.08);
        } else if (evidence.laughter >= 0.54 && evidence.laughter > evidence.speech + 0.08) {
            label = 'laughter';
            confidence = evidenceConfidence(evidence.laughter, evidence.margin, 0.02);
        } else if (noiseEvidence >= 0.56) {
            label = 'noise';
            confidence = evidenceConfidence(noiseEvidence, evidence.margin, 0.02);
        } else {
            label = 'unknown';
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
        label = 'mixed';
        confidence = evidenceConfidence(
            Math.min(evidence.speech, evidence.laughter),
            1 - Math.abs(evidence.speech - evidence.laughter),
            0.05
        );
    } else if (evidence.bleed >= 0.56 && (evidence.bleed >= evidence.speech + 0.10)) {
        label = 'bleed';
        confidence = evidenceConfidence(evidence.bleed, evidence.margin, 0.04);
    } else if (evidence.dominant === 'laughter' && evidence.laughter >= 0.46) {
        label = 'laughter';
        confidence = evidenceConfidence(evidence.laughter, evidence.margin, 0.02);
    } else if (overlapPenalty >= 0.5 || (evidence.dominant === 'bleed' && evidence.bleed >= 0.46)) {
        label = 'bleed';
        confidence = evidenceConfidence(Math.max(evidence.bleed, overlapPenalty), evidence.margin, -0.02);
    } else if (score >= 70 && spectral >= Math.max(minSpectral, 0.30) && evidence.speech >= 0.58) {
        label = 'speech';
        confidence = evidenceConfidence(evidence.speech, evidence.margin, 0.08);
    } else if (evidence.speech >= 0.40 || score >= 45 || spectral >= (minSpectral - 0.04)) {
        label = 'speech';
        confidence = evidenceConfidence(Math.max(evidence.speech, score / 100), evidence.margin, 0.01);
    } else if (noiseEvidence >= 0.52 || postPenalty >= 0.62) {
        label = 'noise';
        confidence = evidenceConfidence(Math.max(noiseEvidence, 1 - postPenalty), evidence.margin, -0.05);
    } else {
        label = 'unknown';
        confidence = evidenceConfidence(Math.max(noiseEvidence, 1 - postPenalty), evidence.margin, -0.08);
    }

    if (decisionState === 'review' && label === 'speech') {
        confidence = clamp(confidence - 8, 0, 100);
    }

    return {
        label: label,
        confidence: clamp(Math.round(confidence), 0, 100)
    };
}

function buildReasons(decisionState, metrics, scoreInfo, typeInfo, decision) {
    var out = [];
    var vals = metrics.values || {};

    if (decisionState === 'keep') out.push('Kept in final decision');
    if (decisionState === 'review') out.push('Marked for manual review');
    if (decisionState === 'suppress') out.push('Suppressed in overlap resolution');
    if (decisionState === 'filled_gap') out.push('Continuity fill kept to avoid silent gaps');
    if (decisionState === 'uninteresting') out.push('Timeline gap marked as uninteresting');
    if (parseNum(vals.alwaysOpenFill, 0) >= 0.5) {
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
    if (decision) {
        out.push('Decision model keep ' + Math.round(clamp(parseNum(decision.keepLikelihood, 0), 0, 1) * 100) +
            '% vs suppress ' + Math.round(clamp(parseNum(decision.suppressLikelihood, 0), 0, 1) * 100) + '%');
        if (decision.bleedHighConfidence) {
            out.push('High bleed confidence safety gate is active');
        }
        if (decision.baseDecisionState && decision.decisionState && decision.baseDecisionState !== decision.decisionState) {
            out.push('State adjusted by combined metrics (' + decision.baseDecisionState + ' -> ' + decision.decisionState + ')');
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

module.exports = {
    computeMetrics: computeMetrics,
    computeOverlapStats: computeOverlapStats,
    computePostprocessPenalty: computePostprocessPenalty,
    computeScore: computeScore,
    inferCoverageDecision: inferCoverageDecision,
    applyDecisionPolicy: applyDecisionPolicy,
    decidePreviewState: decidePreviewState,
    canAutoKeepAlwaysOpenFill: canAutoKeepAlwaysOpenFill,
    rankClassEvidence: rankClassEvidence,
    evidenceConfidence: evidenceConfidence,
    computeClassEvidence: computeClassEvidence,
    classifyType: classifyType,
    buildReasons: buildReasons
};
