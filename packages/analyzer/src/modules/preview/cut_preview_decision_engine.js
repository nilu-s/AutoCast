'use strict';

var rmsCalc = require('../energy/rms_calculator');
var modelHelpers = require('./cut_preview_model_helpers');

var parseNum = modelHelpers.parseNum;
var clamp = modelHelpers.clamp;
var round = modelHelpers.round;
var isFiniteNumber = modelHelpers.isFiniteNumber;
var averageRange = modelHelpers.averageRange;
var maxRange = modelHelpers.maxRange;
var getFrameValue = modelHelpers.getFrameValue;

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


module.exports = {
    computeMetrics: computeMetrics,
    computeOverlapStats: computeOverlapStats,
    computePostprocessPenalty: computePostprocessPenalty,
    computeScore: computeScore,
    inferCoverageDecision: inferCoverageDecision,
    decidePreviewState: decidePreviewState,
    canAutoKeepAlwaysOpenFill: canAutoKeepAlwaysOpenFill,
    rankClassEvidence: rankClassEvidence,
    evidenceConfidence: evidenceConfidence,
    computeClassEvidence: computeClassEvidence,
    classifyType: classifyType,
    buildReasons: buildReasons
};


