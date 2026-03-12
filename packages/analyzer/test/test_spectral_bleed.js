/**
 * AutoCast Ã¢â‚¬â€œ Spectral Bleed Detection Tests
 *
 * Tests for:
 *   1. computeSpectralFingerprint: produces correct shape
 *   2. computeCrossTrackSimilarity: identical signal Ã¢â€ â€™ ~1.0, different Ã¢â€ â€™ lower
 *   3. spectral_bleed_safe policy: real overlap Ã¢â€ â€™ both active
 *   4. spectral_bleed_safe policy: bleed scenario Ã¢â€ â€™ quieter track suppressed
 */

'use strict';

var path = require('path');
var spectralVad = require(path.join(__dirname, '..', 'src', 'spectral_vad'));
var overlapResolver = require(path.join(__dirname, '..', 'src', 'overlap_resolver'));
var rmsCalc = require(path.join(__dirname, '..', 'src', 'rms_calculator'));

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

// Ã¢â€â‚¬Ã¢â€â‚¬ Unit: computeSpectralFingerprint Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

// Ã¢â€â‚¬Ã¢â€â‚¬ Unit: computeCrossTrackSimilarity Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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
        // Normalised fingerprints, so amplitude doesn't matter Ã¢â‚¬â€œ shape should be ~identical
        assert(sim >= 0.95, 'Scaled copy (bleed) should have similarity >= 0.95 (got ' + sim + ')');
    });

    it('different frequencies should yield low similarity', function () {
        var samplesA = sineWave(500, 0.5, N);   // Speaker 1 Ã¢â‚¬â€œ low voice
        var samplesB = sineWave(3000, 0.5, N);  // Speaker 2 Ã¢â‚¬â€œ high voice

        var fpA = spectralVad.computeSpectralFingerprint(samplesA, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(samplesB, SAMPLE_RATE, FRAME_MS);

        var sim = spectralVad.computeCrossTrackSimilarity(fpA, fpB, 0, fpA.frameCount);
        assert(sim < 0.6, 'Different speakers should have similarity < 0.6 (got ' + sim + ')');
    });
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Integration: spectral_bleed_safe policy Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

describe('spectral_bleed_safe overlap policy', function () {
    var FRAME_COUNT = Math.floor(N / (SAMPLE_RATE * FRAME_MS / 1000));

    it('real simultaneous speech: both tracks should stay active', function () {
        // Two speakers with different frequency content both active at the same time
        var samplesA = sineWave(600, 0.5, N);   // Speaker 1
        var samplesB = sineWave(2500, 0.4, N);  // Speaker 2 Ã¢â‚¬â€œ genuinely different spectrum

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

    it('audio bleed: quieter track that is a copy should be suppressed', function () {
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
        assert(result[1][0].state === 'suppressed', 'Bleed track (same spectrum, much quieter) should be suppressed');
    });

    it('should fall back to bleed_safe when no fingerprints provided', function () {
        var allSegments = [
            [{ start: 0, end: 5, trackIndex: 0 }],
            [{ start: 0, end: 5, trackIndex: 1 }]
        ];

        var rmsA = uniformRMS(0.5, 500);
        var rmsB = uniformRMS(0.1, 500); // >14 dB quieter Ã¢â€ â€™ suppressed under bleed_safe too

        var result = overlapResolver.resolveOverlaps(allSegments, [rmsA, rmsB], {
            policy: 'spectral_bleed_safe',
            frameDurationMs: FRAME_MS,
            overlapMarginDb: 6,
            bleedMarginDb: 8
            // fingerprints not provided Ã¢â€ â€™ should fall back to bleed_safe
        });

        assert(result[0][0].state === 'active', 'Track A should be active');
        // Under bleed_safe (fallback), track B (>14 dB quieter) is suppressed
        assert(result[1][0].state === 'suppressed', 'Track B should be suppressed via bleed_safe fallback');
    });
});

describe('refineGateWithSpectral soft fusion', function () {
    it('should tolerate brief spectral-confidence dips inside speech', function () {
        var rmsGate = new Uint8Array(20);
        for (var i = 0; i < rmsGate.length; i++) rmsGate[i] = 1;

        var conf = new Float64Array(20);
        for (var c = 0; c < conf.length; c++) conf[c] = 0.52;
        conf[8] = 0.28;
        conf[9] = 0.27;
        conf[10] = 0.30;

        var out = spectralVad.refineGateWithSpectral(rmsGate, conf, 0.35, {
            softMargin: 0.12,
            openScore: 0.60,
            closeScore: 0.45,
            rmsWeight: 0.5,
            holdFrames: 2
        });

        var kept = 0;
        for (var k = 7; k <= 11; k++) if (out[k]) kept++;
        assert(kept >= 3, 'Brief confidence dips should not fully break speech continuity');
    });

    it('should still reject very low-confidence frames', function () {
        var rmsGate = new Uint8Array(12);
        for (var i = 0; i < rmsGate.length; i++) rmsGate[i] = 1;

        var conf = new Float64Array(12);
        for (var c = 0; c < conf.length; c++) conf[c] = 0.5;
        conf[5] = 0.05;
        conf[6] = 0.04;
        conf[7] = 0.05;

        var out = spectralVad.refineGateWithSpectral(rmsGate, conf, 0.35, {
            softMargin: 0.12,
            openScore: 0.60,
            closeScore: 0.45,
            rmsWeight: 0.5,
            holdFrames: 1
        });

        var dropped = 0;
        for (var d = 5; d <= 7; d++) if (!out[d]) dropped++;
        assert(dropped >= 2, 'Very low-confidence region should still be suppressed');
    });
});

describe('speaker profile lock', function () {
    it('should keep frames close to the learned speaker profile', function () {
        var samples = sineWave(700, 0.5, N);
        var fp = spectralVad.computeSpectralFingerprint(samples, SAMPLE_RATE, FRAME_MS);
        var conf = new Float64Array(fp.frameCount);
        var gate = new Uint8Array(fp.frameCount);
        for (var i = 0; i < fp.frameCount; i++) {
            conf[i] = 0.8;
            gate[i] = 1;
        }

        var profile = spectralVad.buildSpeakerProfile(fp, gate, conf, {
            minConfidence: 0.4,
            minFrames: 20
        });
        assert(profile && profile.frameCount >= 20, 'Expected a valid speaker profile');

        var filtered = spectralVad.applySpeakerProfileGate(gate, fp, profile, {
            threshold: 0.7,
            holdFrames: 2
        });

        var kept = 0;
        for (var k = 0; k < filtered.length; k++) if (filtered[k]) kept++;
        assert(kept >= filtered.length * 0.9, 'Most frames should remain active for same speaker');
    });

    it('should reject frames that do not match the speaker profile', function () {
        var samplesA = sineWave(500, 0.5, N);
        var samplesB = sineWave(2800, 0.5, N);
        var fpA = spectralVad.computeSpectralFingerprint(samplesA, SAMPLE_RATE, FRAME_MS);
        var fpB = spectralVad.computeSpectralFingerprint(samplesB, SAMPLE_RATE, FRAME_MS);

        var conf = new Float64Array(fpA.frameCount);
        var gate = new Uint8Array(fpA.frameCount);
        for (var i = 0; i < fpA.frameCount; i++) {
            conf[i] = 0.8;
            gate[i] = 1;
        }

        var profile = spectralVad.buildSpeakerProfile(fpA, gate, conf, {
            minConfidence: 0.4,
            minFrames: 20
        });
        assert(profile, 'Expected a profile from speaker A');

        var filtered = spectralVad.applySpeakerProfileGate(gate, fpB, profile, {
            threshold: 0.72,
            holdFrames: 2
        });

        var kept = 0;
        for (var k = 0; k < filtered.length; k++) if (filtered[k]) kept++;
        assert(kept <= filtered.length * 0.35, 'Different speaker frames should mostly be rejected');
    });
});


