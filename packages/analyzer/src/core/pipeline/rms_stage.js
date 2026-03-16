'use strict';

var rmsCalc = require('../../modules/energy/rms_calculator');
var gainNormalizer = require('../../modules/energy/gain_normalizer');
var runtimeUtils = require('../utils/runtime_utils');
var preprocess = require('../../modules/preprocess/audio_preprocess');

function runRmsStage(ctx) {
    ctx = ctx || {};

    var audioData = ctx.audioData || [];
    var effectiveOffsetsSec = ctx.effectiveOffsetsSec || [];
    var params = ctx.params || {};
    var progress = ctx.progress || function () { };
    var trackInfos = ctx.trackInfos || [];

    var trackCount = audioData.length;
    var rmsProfiles = [];
    var rawRmsProfiles = [];
    var i;

    progress(20, 'Calculating audio energy...');

    for (i = 0; i < trackCount; i++) {
        progress(20 + Math.round((i / trackCount) * 10), 'RMS for track ' + (i + 1) + '/' + trackCount);

        var samples = audioData[i].samples;
        if (params.enablePreprocess) {
            samples = preprocess.preprocess(samples, audioData[i].sampleRate, {
                noiseGate: false
            });
        }

        var rmsResult = rmsCalc.calculateRMS(
            samples,
            audioData[i].sampleRate,
            params.frameDurationMs
        );

        var rmsArr = runtimeUtils.applyOffsetToArray(rmsResult.rms, effectiveOffsetsSec[i], params.frameDurationMs);
        rmsProfiles.push(rmsArr);
        rawRmsProfiles.push(rmsArr);
    }

    var gainInfo = null;
    if (params.autoGain) {
        progress(32, 'Matching track volumes...');
        gainInfo = gainNormalizer.computeGainMatching(rmsProfiles);
        rmsProfiles = gainNormalizer.applyGainToRMS(rmsProfiles, gainInfo.gains);

        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) {
                trackInfos[i].gainAdjustDb = gainInfo.gainsDb[i];
            }
        }
    }

    return {
        rmsProfiles: rmsProfiles,
        rawRmsProfiles: rawRmsProfiles,
        gainInfo: gainInfo
    };
}

module.exports = {
    runRmsStage: runRmsStage
};
