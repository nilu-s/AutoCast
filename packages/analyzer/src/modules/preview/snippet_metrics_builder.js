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
    var rawRmsTrack = rawRmsProfiles[trackIndex] || rmsTrack;
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

    var overlapStats = computeOverlapStats(
        trackIndex,
        startFrame,
        endFrame,
        ctx.overlapActiveMaps,
        rmsProfiles
    );
    var mergedSegmentCount = Math.max(1, Math.round(parseNum(ctx.mergedSegmentCount, 1)));
    var maxMergedGapSec = Math.max(0, parseNum(ctx.maxMergedGapSec, 0));

    var classEvidence = computeClassEvidence({
        peakOverThreshold: peakDb - thresholdDb,
        meanOverThreshold: meanDb - thresholdDb,
        spectralConfidence: spectralConfidence,
        laughterConfidence: laughterConfidence,
        laughterPeakConfidence: laughterPeakConfidence,
        speakerLockScore: speakerLockScore,
        overlapPenalty: overlapStats.penalty,
        overlapRatio: overlapStats.overlapRatio,
        strongerRatio: overlapStats.strongerRatio,
        rawPeakDbFs: rawPeakDb,
        rawMeanDbFs: rawMeanDb
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
            rawMeanDbFs: round(rawMeanDb, 2),
            rawPeakDbFs: round(rawPeakDb, 2),
            spectralConfidence: round(spectralConfidence, 3),
            laughterConfidence: round(laughterConfidence, 3),
            overlapPenalty: round(overlapStats.penalty, 3),
            speakerLockScore: round(speakerLockScore, 3),
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
    var overlapPenalty = clamp(parseNum(ctx.overlapPenalty, 0), 0, 1);
    var overlapRatio = clamp(parseNum(ctx.overlapRatio, 0), 0, 1);
    var strongerRatio = clamp(parseNum(ctx.strongerRatio, 0), 0, 1);

    var speechScore = clamp(
        spectral * 0.36 +
        speaker * 0.20 +
        energyNorm * 0.28 +
        rawPeakNorm * 0.08 +
        (1 - overlapPenalty) * 0.08,
        0,
        1
    );
    var laughterScore = clamp(
        laughter * 0.48 +
        laughterPeak * 0.20 +
        energyNorm * 0.16 +
        (1 - speaker) * 0.08 +
        (1 - overlapPenalty) * 0.08,
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
        (1 - spectral) * 0.30 +
        clamp((0 - parseNum(ctx.meanOverThreshold, 0)) / 8, 0, 1) * 0.18 +
        clamp((0 - parseNum(ctx.peakOverThreshold, 0)) / 8, 0, 1) * 0.12 +
        (1 - energyNorm) * 0.18 +
        (1 - rawPeakNorm) * 0.12 +
        (1 - rawMeanNorm) * 0.10,
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
    buildEvidenceMetrics: buildEvidenceMetrics,
    computeOverlapStats: computeOverlapStats,
    rankClassEvidence: rankClassEvidence,
    computeClassEvidence: computeClassEvidence
};
