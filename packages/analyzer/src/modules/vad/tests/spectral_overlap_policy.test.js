'use strict';

var spectralVad = require('../spectral_vad');
var overlapResolver = require('../../overlap/overlap_resolver');
var rmsCalc = require('../../energy/rms_calculator');

var SAMPLE_RATE = 16000;
var FRAME_MS = 10;
var DURATION_SEC = 2;
var N = SAMPLE_RATE * DURATION_SEC;
var FRAME_COUNT = Math.floor(N / (SAMPLE_RATE * FRAME_MS / 1000));

function sineWave(freq, amplitude, n) {
    var s = new Float32Array(n);
    for (var i = 0; i < n; i++) {
        s[i] = amplitude * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
    }
    return s;
}

function uniformRMS(value, frameCount) {
    var r = new Float64Array(frameCount);
    for (var i = 0; i < frameCount; i++) r[i] = value;
    return r;
}

describe('spectral_bleed_safe overlap policy', function () {
    it('real simultaneous speech: both tracks should stay active', function () {
        var samplesA = sineWave(600, 0.5, N);
        var samplesB = sineWave(2500, 0.4, N);
        var fpA = spectralVad.computeSpectralFingerprint(samplesA, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(samplesB, SAMPLE_RATE, FRAME_MS);

        var allSegments = [
            [{ start: 0, end: DURATION_SEC, trackIndex: 0 }],
            [{ start: 0, end: DURATION_SEC, trackIndex: 1 }]
        ];

        var rmsA = uniformRMS(rmsCalc.dbToLinear(-20), FRAME_COUNT);
        var rmsB = uniformRMS(rmsCalc.dbToLinear(-28), FRAME_COUNT);

        var result = overlapResolver.resolveOverlaps(allSegments, [rmsA, rmsB], {
            policy: 'spectral_bleed_safe',
            frameDurationMs: FRAME_MS,
            overlapMarginDb: 6,
            bleedMarginDb: 8,
            fingerprints: [fpA, fpB],
            bleedSimilarityThreshold: 0.82,
            overlapSimilarityThreshold: 0.60
        });

        assert(result[0][0].state === 'active', 'Track A should be active');
        assert(result[1][0].state === 'active', 'Track B (different speaker) should also stay active');
    });

    it('audio bleed: quieter track that is a copy should be suppressed', function () {
        var primary = sineWave(1000, 0.5, N);
        var bleed = new Float32Array(N);
        for (var i = 0; i < N; i++) bleed[i] = primary[i] * 0.2;

        var fpA = spectralVad.computeSpectralFingerprint(primary, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(bleed, SAMPLE_RATE, FRAME_MS);

        var allSegments = [
            [{ start: 0, end: DURATION_SEC, trackIndex: 0 }],
            [{ start: 0, end: DURATION_SEC, trackIndex: 1 }]
        ];

        var rmsA = uniformRMS(rmsCalc.dbToLinear(-18), FRAME_COUNT);
        var rmsB = uniformRMS(rmsCalc.dbToLinear(-32), FRAME_COUNT);

        var result = overlapResolver.resolveOverlaps(allSegments, [rmsA, rmsB], {
            policy: 'spectral_bleed_safe',
            frameDurationMs: FRAME_MS,
            overlapMarginDb: 6,
            bleedMarginDb: 8,
            fingerprints: [fpA, fpB],
            bleedSimilarityThreshold: 0.82,
            overlapSimilarityThreshold: 0.60
        });

        assert(result[0][0].state === 'active', 'Primary speaker track should be active');
        assert(result[1][0].state === 'suppressed', 'Bleed track should be suppressed');
    });

    it('should fall back to bleed_safe when no fingerprints provided', function () {
        var allSegments = [
            [{ start: 0, end: 5, trackIndex: 0 }],
            [{ start: 0, end: 5, trackIndex: 1 }]
        ];

        var rmsA = uniformRMS(0.5, 500);
        var rmsB = uniformRMS(0.1, 500);

        var result = overlapResolver.resolveOverlaps(allSegments, [rmsA, rmsB], {
            policy: 'spectral_bleed_safe',
            frameDurationMs: FRAME_MS,
            overlapMarginDb: 6,
            bleedMarginDb: 8
        });

        assert(result[0][0].state === 'active', 'Track A should be active');
        assert(result[1][0].state === 'suppressed', 'Track B should be suppressed via fallback');
    });
});
