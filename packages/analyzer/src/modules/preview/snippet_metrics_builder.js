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
var SNIPPET_METRICS_VERSION = 'preview-metrics.v2';

function buildEvidenceMetrics(ctx) {
    ctx = ctx || {};
    var trackIndex = Math.max(0, parseInt(ctx.trackIndex, 10) || 0);
    var frameDurSec = Math.max(1e-6, parseNum(ctx.frameDurSec, 0.01));
    var startFrame = Math.max(0, Math.floor(parseNum(ctx.start, 0) / frameDurSec));
    var endFrame = Math.max(startFrame + 1, Math.ceil(parseNum(ctx.end, 0) / frameDurSec));

    var rmsProfiles = Array.isArray(ctx.rmsProfiles) ? ctx.rmsProfiles : [];
    var rawRmsProfiles = Array.isArray(ctx.rawRmsProfiles) ? ctx.rawRmsProfiles : [];
    var spectralResults = Array.isArray(ctx.spectralResults) ? ctx.spectralResults : [];
    var laughterResults = Array.isArray(ctx.laughterResults) ? ctx.laughterResults : [];
    var gateSnapshots = Array.isArray(ctx.gateSnapshots) ? ctx.gateSnapshots : [];

    var rmsTrack = rmsProfiles[trackIndex] || [];
    var rawRmsTrack = rawRmsProfiles[trackIndex];
    if (!rawRmsTrack || typeof rawRmsTrack.length !== 'number') rawRmsTrack = [];
    var spectralTrack = (spectralResults[trackIndex] && spectralResults[trackIndex].confidence)
        ? spectralResults[trackIndex].confidence
        : null;
    var laughterTrack = (laughterResults[trackIndex] && laughterResults[trackIndex].confidence)
        ? laughterResults[trackIndex].confidence
        : null;
    var speakerSimilarity = getSpeakerSimilarityTrack(gateSnapshots[trackIndex]);

    var meanLin = averageRange(rmsTrack, startFrame, endFrame, 0);
    var peakLin = maxRange(rmsTrack, startFrame, endFrame, 0);
    var rawMeanLin = averageRange(rawRmsTrack, startFrame, endFrame, 0);
    var rawPeakLin = maxRange(rawRmsTrack, startFrame, endFrame, 0);
    var meanDb = rmsCalc.linearToDb(Math.max(meanLin, 1e-12));
    var peakDb = rmsCalc.linearToDb(Math.max(peakLin, 1e-12));
    var rawMeanDb = rmsCalc.linearToDb(Math.max(rawMeanLin, 1e-12));
    var rawPeakDb = rmsCalc.linearToDb(Math.max(rawPeakLin, 1e-12));
    var thresholdDb = isFiniteNumber(ctx.thresholdDb) ? ctx.thresholdDb : -60;

    var spectralConfidence = clamp(averageRange(spectralTrack, startFrame, endFrame, 0), 0, 1);
    var laughterConfidence = clamp(averageRange(laughterTrack, startFrame, endFrame, 0), 0, 1);
    var laughterPeakConfidence = clamp(maxRange(laughterTrack, startFrame, endFrame, laughterConfidence), 0, 1);
    var speakerLockScore = clamp(averageRange(speakerSimilarity, startFrame, endFrame, spectralConfidence), 0, 1);
    var mergedSegmentCount = Math.max(1, Math.round(parseNum(ctx.mergedSegmentCount, 1)));
    var maxMergedGapSec = Math.max(0, parseNum(ctx.maxMergedGapSec, 0));
    var snippetWindowStats = computeSnippetWindowStats({
        startFrame: startFrame,
        endFrame: endFrame,
        spectralTrack: spectralTrack,
        speakerSimilarity: speakerSimilarity,
        activeMap: ctx.overlapActiveMaps && ctx.overlapActiveMaps[trackIndex],
        mergedSegmentCount: mergedSegmentCount,
        maxMergedGapSec: maxMergedGapSec,
        durationSec: Math.max(0, parseNum(ctx.end, 0) - parseNum(ctx.start, 0)),
        speakerFallback: speakerLockScore
    });

    var overlapStats = computeOverlapStats(
        trackIndex,
        startFrame,
        endFrame,
        ctx.overlapActiveMaps,
        rmsProfiles
    );
    var overlapTrust = computeOverlapTrust({
        overlapPenalty: overlapStats.penalty,
        overlapRatio: overlapStats.overlapRatio,
        strongerRatio: overlapStats.strongerRatio,
        spectralConfidence: spectralConfidence,
        speakerLockScore: speakerLockScore,
        voiceFrameRatio: snippetWindowStats.voiceFrameRatio,
        inSnippetDropoutRatio: snippetWindowStats.inSnippetDropoutRatio,
        params: ctx.params || {}
    });

    var classEvidence = computeClassEvidence({
        peakOverThreshold: peakDb - thresholdDb,
        meanOverThreshold: meanDb - thresholdDb,
        spectralConfidence: spectralConfidence,
        laughterConfidence: laughterConfidence,
        laughterPeakConfidence: laughterPeakConfidence,
        speakerLockScore: speakerLockScore,
        speakerMatchP10: snippetWindowStats.speakerMatchP10,
        speakerMatchMedian: snippetWindowStats.speakerMatchMedian,
        voiceFrameRatio: snippetWindowStats.voiceFrameRatio,
        inSnippetDropoutRatio: snippetWindowStats.inSnippetDropoutRatio,
        mergeHeterogeneity: snippetWindowStats.mergeHeterogeneity,
        overlapPenalty: overlapStats.penalty,
        overlapTrust: overlapTrust,
        overlapRatio: overlapStats.overlapRatio,
        strongerRatio: overlapStats.strongerRatio,
        rawPeakDbFs: rawPeakDb,
        rawMeanDbFs: rawMeanDb
    });
    var bleedConfidence = clamp(
        classEvidence.bleed * 0.68 +
        overlapTrust * 0.12 +
        clamp(overlapStats.strongerRatio, 0, 1) * 0.22 +
        clamp(overlapStats.overlapRatio, 0, 1) * 0.08,
        0,
        1
    );

    return {
        values: {
            meanOverThreshold: round(meanDb - thresholdDb, 2),
            peakOverThreshold: round(peakDb - thresholdDb, 2),
            rawMeanDbFs: round(rawMeanDb, 2),
            rawPeakDbFs: round(rawPeakDb, 2),
            spectralConfidence: round(spectralConfidence, 3),
            laughterConfidence: round(laughterConfidence, 3),
            overlapPenalty: round(overlapStats.penalty, 3),
            overlapTrust: round(overlapTrust, 3),
            speakerLockScore: round(speakerLockScore, 3),
            speakerMatchP10: round(snippetWindowStats.speakerMatchP10, 3),
            speakerMatchMedian: round(snippetWindowStats.speakerMatchMedian, 3),
            voiceFrameRatio: round(snippetWindowStats.voiceFrameRatio, 3),
            inSnippetDropoutRatio: round(snippetWindowStats.inSnippetDropoutRatio, 3),
            mergeHeterogeneity: round(snippetWindowStats.mergeHeterogeneity, 3),
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

function computeSnippetWindowStats(ctx) {
    ctx = ctx || {};
    var startFrame = Math.max(0, parseInt(ctx.startFrame, 10) || 0);
    var endFrame = Math.max(startFrame + 1, parseInt(ctx.endFrame, 10) || (startFrame + 1));
    var spectralTrack = ctx.spectralTrack;
    var speakerSimilarity = ctx.speakerSimilarity;
    var activeMap = ctx.activeMap;
    var frameCount = Math.max(1, endFrame - startFrame);
    var voiceFrames = 0;
    var activeFrames = 0;
    var speakerSamples = [];

    for (var f = startFrame; f < endFrame; f++) {
        var spectral = clamp(parseNum(getFrameValue(spectralTrack, f, 0), 0), 0, 1);
        var speaker = clamp(parseNum(getFrameValue(speakerSimilarity, f, spectral), spectral), 0, 1);
        if ((spectral >= 0.44) || (speaker >= 0.56)) {
            voiceFrames++;
        }
        if (getFrameValue(activeMap, f, 0) > 0) activeFrames++;
        speakerSamples.push(speaker);
    }

    var speakerMatchP10 = computePercentile(speakerSamples, 0.10, parseNum(ctx.speakerFallback, 0));
    var speakerMatchMedian = computePercentile(speakerSamples, 0.50, parseNum(ctx.speakerFallback, 0));
    var voiceFrameRatio = clamp(voiceFrames / frameCount, 0, 1);
    var inSnippetDropoutRatio = clamp(1 - (activeFrames / frameCount), 0, 1);
    var mergedSegmentCount = Math.max(1, Math.round(parseNum(ctx.mergedSegmentCount, 1)));
    var maxMergedGapSec = Math.max(0, parseNum(ctx.maxMergedGapSec, 0));
    var durationSec = Math.max(1e-6, parseNum(ctx.durationSec, frameCount * 0.01));
    var mergeDensity = clamp((mergedSegmentCount - 1) / 4, 0, 1);
    var gapDensity = clamp(maxMergedGapSec / Math.max(durationSec * 0.8, 0.05), 0, 1);
    var mergeHeterogeneity = clamp(
        mergeDensity * 0.42 +
        gapDensity * 0.24 +
        inSnippetDropoutRatio * 0.20 +
        (1 - voiceFrameRatio) * 0.14,
        0,
        1
    );

    return {
        voiceFrameRatio: voiceFrameRatio,
        inSnippetDropoutRatio: inSnippetDropoutRatio,
        speakerMatchP10: speakerMatchP10,
        speakerMatchMedian: speakerMatchMedian,
        mergeHeterogeneity: mergeHeterogeneity
    };
}

function getSpeakerSimilarityTrack(snapshot) {
    if (!snapshot) return null;
    if (snapshot.speakerSimilarity) return snapshot.speakerSimilarity;
    if (snapshot.speakerDebug && snapshot.speakerDebug.similarity) return snapshot.speakerDebug.similarity;
    return null;
}

function computeOverlapStats(trackIndex, startFrame, endFrame, activeMaps, rmsProfiles) {
    activeMaps = Array.isArray(activeMaps) ? activeMaps : [];
    rmsProfiles = Array.isArray(rmsProfiles) ? rmsProfiles : [];
    if (!activeMaps[trackIndex]) {
        return {
            overlapRatio: 0,
            strongerRatio: 0,
            penalty: 0,
            dominantTrackIndex: -1
        };
    }

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

function computePercentile(values, p, fallback) {
    var samples = [];
    for (var i = 0; i < (values || []).length; i++) {
        var v = values[i];
        if (!isFiniteNumber(v)) continue;
        samples.push(clamp(v, 0, 1));
    }
    if (!samples.length) return clamp(parseNum(fallback, 0), 0, 1);
    samples.sort(function (a, b) { return a - b; });
    var rank = clamp(parseNum(p, 0), 0, 1) * (samples.length - 1);
    var lo = Math.floor(rank);
    var hi = Math.ceil(rank);
    if (lo === hi) return samples[lo];
    var w = rank - lo;
    return clamp(samples[lo] * (1 - w) + samples[hi] * w, 0, 1);
}

function computeOverlapTrust(ctx) {
    ctx = ctx || {};
    var overlapPenalty = clamp(parseNum(ctx.overlapPenalty, 0), 0, 1);
    var overlapRatio = clamp(parseNum(ctx.overlapRatio, 0), 0, 1);
    var strongerRatio = clamp(parseNum(ctx.strongerRatio, 0), 0, 1);
    var spectralConfidence = clamp(parseNum(ctx.spectralConfidence, 0), 0, 1);
    var speakerLockScore = clamp(parseNum(ctx.speakerLockScore, 0), 0, 1);
    var voiceFrameRatio = clamp(parseNum(ctx.voiceFrameRatio, 0), 0, 1);
    var inSnippetDropoutRatio = clamp(parseNum(ctx.inSnippetDropoutRatio, 0), 0, 1);
    var params = ctx.params || {};

    var trust = clamp(
        overlapPenalty * 0.40 +
        strongerRatio * 0.25 +
        overlapRatio * 0.20 +
        (1 - speakerLockScore) * 0.10 +
        (1 - voiceFrameRatio) * 0.05,
        0,
        1
    );

    if (params.independentTrackAnalysis !== false) trust *= 0.84;
    if (params.enableBleedHandling === false) trust *= 0.72;
    if (overlapRatio < 0.20) trust *= 0.78;
    if (spectralConfidence >= 0.56 && speakerLockScore >= 0.62) trust *= 0.70;
    if (inSnippetDropoutRatio >= 0.30) trust *= 0.88;

    return clamp(trust, 0, 1);
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

function computeClassEvidence(ctx) {
    ctx = ctx || {};
    var peakNorm = clamp((parseNum(ctx.peakOverThreshold, 0) + 1.5) / 12, 0, 1);
    var meanNorm = clamp((parseNum(ctx.meanOverThreshold, 0) + 2.0) / 9, 0, 1);
    var rawPeakNorm = clamp((parseNum(ctx.rawPeakDbFs, -90) + 62) / 20, 0, 1);
    var rawMeanNorm = clamp((parseNum(ctx.rawMeanDbFs, -90) + 66) / 20, 0, 1);
    var energyNorm = clamp(peakNorm * 0.45 + meanNorm * 0.25 + rawPeakNorm * 0.20 + rawMeanNorm * 0.10, 0, 1);
    var spectral = clamp(parseNum(ctx.spectralConfidence, 0), 0, 1);
    var laughter = clamp(parseNum(ctx.laughterConfidence, 0), 0, 1);
    var laughterPeak = clamp(parseNum(ctx.laughterPeakConfidence, 0), 0, 1);
    var speaker = clamp(parseNum(ctx.speakerLockScore, 0), 0, 1);
    var speakerMatchP10 = clamp(parseNum(ctx.speakerMatchP10, speaker), 0, 1);
    var speakerMatchMedian = clamp(parseNum(ctx.speakerMatchMedian, speaker), 0, 1);
    var voiceFrameRatio = clamp(parseNum(ctx.voiceFrameRatio, spectral), 0, 1);
    var inSnippetDropoutRatio = clamp(parseNum(ctx.inSnippetDropoutRatio, 0), 0, 1);
    var mergeHeterogeneity = clamp(parseNum(ctx.mergeHeterogeneity, 0), 0, 1);
    var overlapPenalty = clamp(parseNum(ctx.overlapPenalty, 0), 0, 1);
    var overlapTrust = clamp(parseNum(ctx.overlapTrust, 0), 0, 1);
    var overlapRatio = clamp(parseNum(ctx.overlapRatio, 0), 0, 1);
    var strongerRatio = clamp(parseNum(ctx.strongerRatio, 0), 0, 1);
    var contextualOverlap = clamp(overlapPenalty * overlapTrust, 0, 1);
    var contextualStronger = clamp(strongerRatio * overlapTrust, 0, 1);

    var speechScore = clamp(
        spectral * 0.30 +
        speaker * 0.14 +
        speakerMatchMedian * 0.11 +
        voiceFrameRatio * 0.12 +
        energyNorm * 0.24 +
        rawPeakNorm * 0.05 +
        (1 - contextualOverlap) * 0.04,
        0,
        1
    );
    var laughterScore = clamp(
        laughter * 0.48 +
        laughterPeak * 0.20 +
        energyNorm * 0.16 +
        (1 - speaker) * 0.08 +
        (1 - contextualOverlap) * 0.08,
        0,
        1
    );
    var bleedScore = clamp(
        contextualOverlap * 0.36 +
        contextualStronger * 0.24 +
        overlapRatio * overlapTrust * 0.14 +
        (1 - speakerMatchMedian) * 0.10 +
        (1 - speakerMatchP10) * 0.06 +
        (1 - spectral) * 0.05 +
        inSnippetDropoutRatio * 0.06 +
        mergeHeterogeneity * 0.05,
        0,
        1
    );
    var noiseScore = clamp(
        (1 - spectral) * 0.30 +
        clamp((0 - parseNum(ctx.meanOverThreshold, 0)) / 8, 0, 1) * 0.18 +
        clamp((0 - parseNum(ctx.peakOverThreshold, 0)) / 8, 0, 1) * 0.12 +
        (1 - energyNorm) * 0.18 +
        (1 - rawPeakNorm) * 0.12 +
        (1 - rawMeanNorm) * 0.10 +
        mergeHeterogeneity * 0.10,
        0,
        1
    );

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

module.exports = {
    SNIPPET_METRICS_VERSION: SNIPPET_METRICS_VERSION,
    buildEvidenceMetrics: buildEvidenceMetrics,
    computeOverlapStats: computeOverlapStats,
    computeOverlapTrust: computeOverlapTrust,
    rankClassEvidence: rankClassEvidence,
    computeClassEvidence: computeClassEvidence
};
