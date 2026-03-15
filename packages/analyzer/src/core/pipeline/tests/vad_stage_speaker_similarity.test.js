'use strict';

var vadStage = require('../vad_stage');
var spectralVad = require('../../../modules/vad/spectral_vad');

function sineWave(sampleRate, seconds, frequency, amplitude) {
    var n = Math.floor(sampleRate * seconds);
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
        out[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
    }
    return out;
}

describe('VAD Stage Speaker Similarity', function () {
    it('should expose speakerSimilarity even when debugMode is disabled', function () {
        var sampleRate = 16000;
        var frameDurationMs = 10;
        var samples = sineWave(sampleRate, 1.2, 700, 0.6);
        var fingerprint = spectralVad.computeSpectralFingerprint(samples, sampleRate, frameDurationMs);
        var frameCount = fingerprint.frameCount;
        var rms = new Float32Array(frameCount);
        var spectralConf = new Float32Array(frameCount);
        for (var i = 0; i < frameCount; i++) {
            rms[i] = 0.05;
            spectralConf[i] = 0.8;
        }

        var result = vadStage.runVadStage({
            params: {
                thresholdAboveFloorDb: 0,
                absoluteThresholdDb: -70,
                attackFrames: 1,
                releaseFrames: 2,
                holdFrames: 2,
                closeConfirmMs: 0,
                closeConfirmDynamic: false,
                closeConfirmMinMs: 0,
                closeConfirmMaxMs: 0,
                closeConfirmDynamicSlopeDb: 10,
                rmsSmoothing: 1,
                hysteresisDb: 0,
                frameDurationMs: frameDurationMs,
                adaptiveNoiseFloor: false,
                localNoiseWindowMs: 500,
                noiseFloorUpdateMs: 500,
                localNoisePercentile: 0.15,
                maxAdaptiveFloorRiseDb: 0,
                localNoiseSampleStride: 1,
                enableHardSilenceCut: false,
                useSpectralVAD: true,
                primarySpeakerLock: true,
                speakerProfileMinConfidence: 0.35,
                speakerProfileMinFrames: 8,
                speakerMatchThreshold: 0.45,
                speakerMatchSoftMargin: 0.10,
                speakerMatchHoldFrames: 2,
                useLaughterDetection: false,
                enableBleedHandling: false,
                enableInSpeechDropoutHeal: false,
                enableLaughterContinuityRecovery: false,
                enableLaughterBurstReinforce: false,
                enforceAlwaysOneTrackOpen: false,
                debugMode: false
            },
            trackCount: 1,
            trackInfos: [{}],
            rmsProfiles: [rms],
            spectralResults: [{ confidence: spectralConf }],
            fingerprintResults: [fingerprint],
            laughterResults: [null],
            progress: function () { }
        });

        assert(result && result.gateSnapshots && result.gateSnapshots.length === 1, 'Expected one gate snapshot');
        assert(result.gateSnapshots[0].speakerDebug === null, 'Expected no speaker debug payload in non-debug mode');
        assert(result.gateSnapshots[0].speakerSimilarity, 'Expected speakerSimilarity channel');
        assert(result.gateSnapshots[0].speakerSimilarity.length > 0, 'Expected non-empty speakerSimilarity');
    });
});
