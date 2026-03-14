'use strict';

var spectralVad = require('../spectral_vad');

var SAMPLE_RATE = 16000;
var FRAME_MS = 10;
var DURATION_SEC = 2;
var N = SAMPLE_RATE * DURATION_SEC;

function sineWave(freq, amplitude, n) {
    var s = new Float32Array(n);
    for (var i = 0; i < n; i++) {
        s[i] = amplitude * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
    }
    return s;
}

describe('computeSpectralFingerprint', function () {
    it('should return the correct shape', function () {
        var samples = sineWave(1000, 0.5, N);
        var fp = spectralVad.computeSpectralFingerprint(samples, SAMPLE_RATE, FRAME_MS);

        assert(fp && typeof fp === 'object', 'Result should be an object');
        assert(fp.numBands === 8, 'Should have 8 bands');
        assert(fp.frameCount > 0, 'Should have frames');
        assert(fp.bands instanceof Float32Array, 'bands should be Float32Array');
        assert(fp.bands.length === fp.frameCount * fp.numBands, 'bands length should match frameCount * numBands');
    });

    it('normalised band vectors should (roughly) sum to 1', function () {
        var samples = sineWave(800, 0.3, N);
        var fp = spectralVad.computeSpectralFingerprint(samples, SAMPLE_RATE, FRAME_MS);

        var midFrame = Math.floor(fp.frameCount / 2);
        var base = midFrame * fp.numBands;
        var sum = 0;
        for (var b = 0; b < fp.numBands; b++) sum += fp.bands[base + b];

        assert(Math.abs(sum - 1.0) < 0.01, 'Band sum should be ~1.0 (got ' + sum + ')');
    });
});

describe('computeCrossTrackSimilarity', function () {
    it('identical signals should yield similarity near 1.0', function () {
        var samples = sineWave(1000, 0.5, N);
        var fp = spectralVad.computeSpectralFingerprint(samples, SAMPLE_RATE, FRAME_MS);

        var sim = spectralVad.computeCrossTrackSimilarity(fp, fp, 0, fp.frameCount);
        assert(sim >= 0.98, 'Identical signals should have similarity >= 0.98 (got ' + sim + ')');
    });

    it('scaled copy (bleed scenario) should yield high similarity', function () {
        var samples = sineWave(1000, 0.5, N);
        var bleed = new Float32Array(N);
        for (var i = 0; i < N; i++) bleed[i] = samples[i] * 0.2;

        var fpA = spectralVad.computeSpectralFingerprint(samples, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(bleed, SAMPLE_RATE, FRAME_MS);

        var sim = spectralVad.computeCrossTrackSimilarity(fpA, fpB, 0, fpA.frameCount);
        assert(sim >= 0.95, 'Scaled copy (bleed) should have similarity >= 0.95 (got ' + sim + ')');
    });

    it('different frequencies should yield low similarity', function () {
        var samplesA = sineWave(500, 0.5, N);
        var samplesB = sineWave(3000, 0.5, N);

        var fpA = spectralVad.computeSpectralFingerprint(samplesA, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(samplesB, SAMPLE_RATE, FRAME_MS);

        var sim = spectralVad.computeCrossTrackSimilarity(fpA, fpB, 0, fpA.frameCount);
        assert(sim < 0.6, 'Different speakers should have similarity < 0.6 (got ' + sim + ')');
    });
});
