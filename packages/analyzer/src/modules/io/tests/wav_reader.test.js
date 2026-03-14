/**
 * AutoCast  WAV Reader Tests
 */

'use strict';

var path = require('path');
var wavReader = require('../wav_reader');
var genWav = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'generate_test_wav'));

describe('WAV Reader', function () {

    it('should parse a valid 16-bit mono WAV', function () {
        var samples = genWav.generateSine(440, 0.5, 1.0, 48000);
        var buffer = genWav.generateWavBuffer(samples, 48000);

        // Write to temp file
        var fs = require('fs');
        var tmpPath = path.join(__dirname, 'tmp_test.wav');
        fs.writeFileSync(tmpPath, buffer);

        var result = wavReader.readWav(tmpPath);

        assert(result.sampleRate === 48000, 'Sample rate should be 48000');
        assert(result.bitDepth === 16, 'Bit depth should be 16');
        assert(result.channels === 1, 'Should be mono');
        assertApprox(result.durationSec, 1.0, 0.01, 'Duration should be ~1.0s');
        assert(result.samples.length === 48000, 'Should have 48000 samples');

        // Verify samples are in [-1, 1] range
        var maxVal = 0;
        for (var i = 0; i < result.samples.length; i++) {
            var abs = Math.abs(result.samples[i]);
            if (abs > maxVal) maxVal = abs;
        }
        assert(maxVal > 0.4, 'Max amplitude should be > 0.4');
        assert(maxVal <= 1.0, 'Max amplitude should be <= 1.0');

        // Cleanup
        fs.unlinkSync(tmpPath);
    });

    it('should handle silence (all zeros)', function () {
        var samples = genWav.generateSilence(0.5, 48000);
        var buffer = genWav.generateWavBuffer(samples, 48000);

        var fs = require('fs');
        var tmpPath = path.join(__dirname, 'tmp_silence.wav');
        fs.writeFileSync(tmpPath, buffer);

        var result = wavReader.readWav(tmpPath);

        assertApprox(result.durationSec, 0.5, 0.01);

        // All samples should be ~0
        var maxVal = 0;
        for (var i = 0; i < result.samples.length; i++) {
            var abs = Math.abs(result.samples[i]);
            if (abs > maxVal) maxVal = abs;
        }
        assert(maxVal < 0.001, 'Silence should have near-zero amplitude');

        fs.unlinkSync(tmpPath);
    });

    it('should throw on invalid file', function () {
        var fs = require('fs');
        var tmpPath = path.join(__dirname, 'tmp_bad.wav');
        fs.writeFileSync(tmpPath, 'not a wav file');

        assertThrows(function () {
            wavReader.readWav(tmpPath);
        }, 'Should throw on invalid WAV');

        fs.unlinkSync(tmpPath);
    });

    it('should check track alignment', function () {
        var tracks = [
            { durationSec: 60.0 },
            { durationSec: 60.1 },
            { durationSec: 60.05 }
        ];

        var result = wavReader.checkAlignment(tracks, 0.5);
        assert(result.aligned === true, 'Tracks within tolerance should be aligned');
        assertApprox(result.maxDriftSec, 0.1, 0.01);
    });

    it('should warn on misaligned tracks', function () {
        var tracks = [
            { durationSec: 60.0 },
            { durationSec: 63.0 }
        ];

        var result = wavReader.checkAlignment(tracks, 0.5);
        assert(result.aligned === false, 'Tracks > 0.5s apart should be misaligned');
        assert(result.warning !== null, 'Should have warning message');
    });
});


