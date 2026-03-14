'use strict';

var spectralVad = require('../../modules/vad/spectral_vad');
var laughterDetector = require('../../modules/vad/laughter_detector');
var runtimeUtils = require('../utils/runtime_utils');

function runFeatureStage(ctx) {
    ctx = ctx || {};

    var audioData = ctx.audioData || [];
    var effectiveOffsetsSec = ctx.effectiveOffsetsSec || [];
    var params = ctx.params || {};
    var progress = ctx.progress || function () { };

    var trackCount = audioData.length;
    var spectralResults = [];
    var fingerprintResults = [];
    var laughterResults = [];
    var i;

    if (params.useSpectralVAD || params.useLaughterDetection) {
        if (params.useSpectralVAD && params.useLaughterDetection) {
            progress(35, 'Running spectral + laughter analysis...');
        } else if (params.useSpectralVAD) {
            progress(35, 'Running spectral analysis...');
        } else {
            progress(35, 'Running laughter analysis...');
        }

        for (i = 0; i < trackCount; i++) {
            progress(35 + Math.round((i / trackCount) * 10), 'Feature pass for track ' + (i + 1) + '/' + trackCount);

            if (params.useSpectralVAD) {
                var spectral = spectralVad.computeSpectralVAD(
                    audioData[i].samples,
                    audioData[i].sampleRate,
                    params.frameDurationMs
                );

                var fingerprint = spectralVad.computeSpectralFingerprint(
                    audioData[i].samples,
                    audioData[i].sampleRate,
                    params.frameDurationMs
                );

                spectral.confidence = runtimeUtils.applyOffsetToArray(
                    spectral.confidence,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );
                fingerprint = runtimeUtils.applyOffsetToFingerprint(
                    fingerprint,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );

                fingerprintResults.push(fingerprint);
                spectralResults.push(spectral);
            } else {
                spectralResults.push(null);
                fingerprintResults.push(null);
            }

            if (params.useLaughterDetection) {
                var laughter = laughterDetector.computeLaughterConfidence(
                    audioData[i].samples,
                    audioData[i].sampleRate,
                    params.frameDurationMs,
                    {
                        minEnergyAboveFloorDb: params.laughterMinEnergyAboveFloorDb,
                        absoluteFloorDb: params.laughterAbsoluteFloorDb,
                        zcrMin: params.laughterZcrMin,
                        zcrMax: params.laughterZcrMax,
                        modulationWindowMs: params.laughterModulationWindowMs,
                        continuityWindowMs: params.laughterContinuityWindowMs,
                        crestMin: params.laughterCrestMin,
                        crestMax: params.laughterCrestMax,
                        spreadMin: params.laughterSpreadMin,
                        spreadMax: params.laughterSpreadMax,
                        sampleSpreadPeakRatio: params.laughterSampleSpreadPeakRatio,
                        impulseCrestMin: params.laughterImpulseCrestMin,
                        impulseCrestMax: params.laughterImpulseCrestMax,
                        transientRiseDb: params.laughterTransientRiseDb,
                        transientFallDb: params.laughterTransientFallDb,
                        energyWeight: params.laughterEnergyWeight,
                        zcrWeight: params.laughterZcrWeight,
                        modulationWeight: params.laughterModulationWeight,
                        crestWeight: params.laughterCrestWeight,
                        spreadWeight: params.laughterSpreadWeight,
                        continuityWeight: params.laughterContinuityWeight,
                        transientPenaltyWeight: params.laughterTransientPenaltyWeight
                    }
                );

                laughter.confidence = runtimeUtils.applyOffsetToArray(
                    laughter.confidence,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );
                if (laughter.transientPenalty) {
                    laughter.transientPenalty = runtimeUtils.applyOffsetToArray(
                        laughter.transientPenalty,
                        effectiveOffsetsSec[i],
                        params.frameDurationMs
                    );
                }
                laughterResults.push(laughter);
            } else {
                laughterResults.push(null);
            }
        }
    }

    return {
        spectralResults: spectralResults,
        fingerprintResults: fingerprintResults,
        laughterResults: laughterResults
    };
}

module.exports = {
    runFeatureStage: runFeatureStage
};
