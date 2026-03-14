/**
 * AutoCast  RMS Calculator Tests
 */

'use strict';

var path = require('path');
var rmsCalc = require(path.join(__dirname, '..', 'src', 'modules', 'energy', 'rms_calculator'));
var genWav = require(path.join(__dirname, 'generate_test_wav'));

describe('RMS Calculator', function () {

    it('should compute correct RMS for a sine wave', function () {
        // RMS of a sine wave with amplitude A = A / sqrt(2)
        var amplitude = 0.8;
        var expectedRms = amplitude / Math.sqrt(2); // ~0.566

        var samples = genWav.generateSine(440, amplitude, 1.0, 48000);
        var result = rmsCalc.calculateRMS(samples, 48000, 10);

        // Check that average RMS is close to expected
        var sum = 0;
        for (var i = 0; i < result.rms.length; i++) {
            sum += result.rms[i];
        }
        var avgRms = sum / result.rms.length;

        assertApprox(avgRms, expectedRms, 0.02, 'Average RMS should match theoretical value');
    });

    it('should return ~0 RMS for silence', function () {
        var samples = genWav.generateSilence(1.0, 48000);
        var result = rmsCalc.calculateRMS(samples, 48000, 10);

        for (var i = 0; i < result.rms.length; i++) {
            assert(result.rms[i] < 0.0001, 'RMS of silence should be ~0');
        }
    });

    it('should produce correct frame count', function () {
        var samples = genWav.generateSine(440, 0.5, 1.0, 48000);
        var result = rmsCalc.calculateRMS(samples, 48000, 10);

        // 1 second / 10ms = 100 frames
        assert(result.frameCount === 100, 'Should have 100 frames for 1s at 10ms');
        assert(result.rms.length === 100, 'RMS array should have 100 entries');
        assert(result.peak.length === 100, 'Peak array should have 100 entries');
    });

    it('should convert linear to dB correctly', function () {
        assertApprox(rmsCalc.linearToDb(1.0), 0, 0.01, '1.0 should be 0 dBFS');
        assertApprox(rmsCalc.linearToDb(0.5), -6.02, 0.1, '0.5 should be ~-6 dBFS');
        assertApprox(rmsCalc.linearToDb(0.1), -20, 0.1, '0.1 should be ~-20 dBFS');
        assert(rmsCalc.linearToDb(0) === -Infinity, '0 should be -Infinity dBFS');
    });

    it('should convert dB to linear correctly', function () {
        assertApprox(rmsCalc.dbToLinear(0), 1.0, 0.01);
        assertApprox(rmsCalc.dbToLinear(-6), 0.501, 0.01);
        assertApprox(rmsCalc.dbToLinear(-20), 0.1, 0.01);
        assert(rmsCalc.dbToLinear(-200) === 0, '-200dB should be 0');
    });

    it('should smooth RMS values', function () {
        var rms = new Float64Array([0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
        var smoothed = rmsCalc.smoothRMS(rms, 3);

        // After smoothing, spikes should be lower
        assert(smoothed[2] < 1.0, 'Peak should be reduced after smoothing');
        // Neighbors should be raised
        assert(smoothed[1] > 0, 'Neighbor should be raised by smoothing');
    });

    it('should estimate noise floor correctly', function () {
        // Create a signal: mostly quiet with some loud parts
        var samples = new Float32Array(48000);
        // 0-0.5s: quiet (0.01 amplitude noise)
        for (var i = 0; i < 24000; i++) {
            samples[i] = 0.01 * (Math.random() * 2 - 1);
        }
        // 0.5-1s: loud (0.5 amplitude sine)
        for (var i = 24000; i < 48000; i++) {
            samples[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 48000);
        }

        var rmsResult = rmsCalc.calculateRMS(samples, 48000, 10);
        var noiseInfo = rmsCalc.estimateNoiseFloor(rmsResult.rms);

        // Noise floor should be close to the quiet part's RMS
        assert(noiseInfo.noiseFloorDb < -30, 'Noise floor should be < -30 dBFS');
        assert(noiseInfo.dynamicRangeDb > 10, 'Dynamic range should be > 10 dB');
    });
});


