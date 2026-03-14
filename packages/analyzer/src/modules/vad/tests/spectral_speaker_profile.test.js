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
