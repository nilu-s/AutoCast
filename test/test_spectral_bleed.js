/**
 * AutoCast – Spectral Bleed Detection Tests
 *
 * Tests for:
 *   1. computeSpectralFingerprint: produces correct shape
 *   2. computeCrossTrackSimilarity: identical signal → ~1.0, different → lower
 *   3. spectral_bleed_safe policy: real overlap → both active
 *   4. spectral_bleed_safe policy: bleed scenario → quieter track ducked
 */

'use strict';

var path = require('path');
var spectralVad = require(path.join(__dirname, '..', 'node', 'spectral_vad'));
var overlapResolver = require(path.join(__dirname, '..', 'node', 'overlap_resolver'));
var rmsCalc = require(path.join(__dirname, '..', 'node', 'rms_calculator'));

// ── Helpers ──────────────────────────────────────────────────────────────────

var SAMPLE_RATE = 16000;
var FRAME_MS = 10;
var DURATION_SEC = 2;
var N = SAMPLE_RATE * DURATION_SEC;

/** Sine wave samples at a given frequency */
function sineWave(freq, amplitude, n) {
    var s = new Float32Array(n);
    for (var i = 0; i < n; i++) {
        s[i] = amplitude * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
    }
    return s;
}

/** Create a uniform RMS array */
function uniformRMS(value, frameCount) {
    var r = new Float64Array(frameCount);
    for (var i = 0; i < frameCount; i++) r[i] = value;
    return r;
}

// ── Unit: computeSpectralFingerprint ─────────────────────────────────────────

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

        // Check a middle frame (avoid edge cases)
        var midFrame = Math.floor(fp.frameCount / 2);
        var base = midFrame * fp.numBands;
        var sum = 0;
        for (var b = 0; b < fp.numBands; b++) sum += fp.bands[base + b];

        // Normalised: sum should be ~1 (within 1% tolerance)
        assert(Math.abs(sum - 1.0) < 0.01, 'Band sum should be ~1.0 (got ' + sum + ')');
    });
});

// ── Unit: computeCrossTrackSimilarity ─────────────────────────────────────────

describe('computeCrossTrackSimilarity', function () {
    it('identical signals should yield similarity near 1.0', function () {
        var samples = sineWave(1000, 0.5, N);
        var fp = spectralVad.computeSpectralFingerprint(samples, SAMPLE_RATE, FRAME_MS);

        var sim = spectralVad.computeCrossTrackSimilarity(fp, fp, 0, fp.frameCount);
        assert(sim >= 0.98, 'Identical signals should have similarity >= 0.98 (got ' + sim + ')');
    });

    it('scaled copy (bleed scenario) should yield high similarity', function () {
        var samples = sineWave(1000, 0.5, N);
        // Bleed = same signal, much quieter
        var bleed = new Float32Array(N);
        for (var i = 0; i < N; i++) bleed[i] = samples[i] * 0.2;

        var fpA = spectralVad.computeSpectralFingerprint(samples, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(bleed, SAMPLE_RATE, FRAME_MS);

        var sim = spectralVad.computeCrossTrackSimilarity(fpA, fpB, 0, fpA.frameCount);
        // Normalised fingerprints, so amplitude doesn't matter – shape should be ~identical
        assert(sim >= 0.95, 'Scaled copy (bleed) should have similarity >= 0.95 (got ' + sim + ')');
    });

    it('different frequencies should yield low similarity', function () {
        var samplesA = sineWave(500, 0.5, N);   // Speaker 1 – low voice
        var samplesB = sineWave(3000, 0.5, N);  // Speaker 2 – high voice

        var fpA = spectralVad.computeSpectralFingerprint(samplesA, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(samplesB, SAMPLE_RATE, FRAME_MS);

        var sim = spectralVad.computeCrossTrackSimilarity(fpA, fpB, 0, fpA.frameCount);
        assert(sim < 0.6, 'Different speakers should have similarity < 0.6 (got ' + sim + ')');
    });
});

// ── Integration: spectral_bleed_safe policy ───────────────────────────────────

describe('spectral_bleed_safe overlap policy', function () {
    var FRAME_COUNT = Math.floor(N / (SAMPLE_RATE * FRAME_MS / 1000));

    it('real simultaneous speech: both tracks should stay active', function () {
        // Two speakers with different frequency content both active at the same time
        var samplesA = sineWave(600, 0.5, N);   // Speaker 1
        var samplesB = sineWave(2500, 0.4, N);  // Speaker 2 – genuinely different spectrum

        var fpA = spectralVad.computeSpectralFingerprint(samplesA, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(samplesB, SAMPLE_RATE, FRAME_MS);

        var allSegments = [
            [{ start: 0, end: DURATION_SEC, trackIndex: 0 }],
            [{ start: 0, end: DURATION_SEC, trackIndex: 1 }]
        ];

        // A is slightly louder (8 dB), but B has a different spectrum
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

    it('audio bleed: quieter track that is a copy should be ducked', function () {
        // Speaker 1 speaks loud, and bleeds (quieter copy) into mic 2
        var primary = sineWave(1000, 0.5, N);
        var bleed = new Float32Array(N);
        for (var i = 0; i < N; i++) bleed[i] = primary[i] * 0.2; // -14 dB quieter

        var fpA = spectralVad.computeSpectralFingerprint(primary, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(bleed, SAMPLE_RATE, FRAME_MS);

        var allSegments = [
            [{ start: 0, end: DURATION_SEC, trackIndex: 0 }],
            [{ start: 0, end: DURATION_SEC, trackIndex: 1 }]
        ];

        var rmsA = uniformRMS(rmsCalc.dbToLinear(-18), FRAME_COUNT);
        var rmsB = uniformRMS(rmsCalc.dbToLinear(-32), FRAME_COUNT); // 14 dB quieter

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
        assert(result[1][0].state === 'ducked', 'Bleed track (same spectrum, much quieter) should be ducked');
    });

    it('should fall back to bleed_safe when no fingerprints provided', function () {
        var allSegments = [
            [{ start: 0, end: 5, trackIndex: 0 }],
            [{ start: 0, end: 5, trackIndex: 1 }]
        ];

        var rmsA = uniformRMS(0.5, 500);
        var rmsB = uniformRMS(0.1, 500); // >14 dB quieter → ducked under bleed_safe too

        var result = overlapResolver.resolveOverlaps(allSegments, [rmsA, rmsB], {
            policy: 'spectral_bleed_safe',
            frameDurationMs: FRAME_MS,
            overlapMarginDb: 6,
            bleedMarginDb: 8
            // fingerprints not provided → should fall back to bleed_safe
        });

        assert(result[0][0].state === 'active', 'Track A should be active');
        // Under bleed_safe (fallback), track B (>14 dB quieter) is ducked
        assert(result[1][0].state === 'ducked', 'Track B should be ducked via bleed_safe fallback');
    });
});
