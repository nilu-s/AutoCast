'use strict';

var path = require('path');
var laughterDetector = require('../laughter_detector');
var laughterUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'laughter_test_utils'));

describe('Laughter Detector Confidence', function () {
    it('should assign higher confidence to pulsed laughter-like noise than steady voiced tone', function () {
        var laughterLike = laughterUtils.pulsedNoise(2.0, 4.5, 0.18, 42);
        var speechLike = laughterUtils.steadySine(2.0, 220, 0.18);

        var laughResult = laughterDetector.computeLaughterConfidence(
            laughterLike,
            laughterUtils.SAMPLE_RATE,
            laughterUtils.FRAME_MS
        );
        var speechResult = laughterDetector.computeLaughterConfidence(
            speechLike,
            laughterUtils.SAMPLE_RATE,
            laughterUtils.FRAME_MS
        );

        var laughMean = laughterUtils.meanRange(laughResult.confidence, 15, laughResult.confidence.length - 15);
        var speechMean = laughterUtils.meanRange(speechResult.confidence, 15, speechResult.confidence.length - 15);

        assert(laughMean > 0.20, 'Laughter-like signal should have meaningful confidence');
        assert(
            laughMean > speechMean + 0.10,
            'Laughter-like signal should score above steady voiced tone (' + laughMean + ' vs ' + speechMean + ')'
        );
    });

    it('should keep confidence near zero on silence', function () {
        var silence = new Float32Array(Math.round(2.0 * laughterUtils.SAMPLE_RATE));
        var result = laughterDetector.computeLaughterConfidence(
            silence,
            laughterUtils.SAMPLE_RATE,
            laughterUtils.FRAME_MS
        );

        var mean = laughterUtils.meanRange(result.confidence, 0, result.confidence.length);
        assert(mean < 0.08, 'Silence should stay near zero confidence');
    });

    it('should suppress impulsive knock-like transients compared to laughter-like bursts', function () {
        var laughterLike = laughterUtils.pulsedNoise(2.0, 4.2, 0.20, 7);
        var knocks = laughterUtils.knockTrain(2.0, 180, 0.95);

        var laughResult = laughterDetector.computeLaughterConfidence(
            laughterLike,
            laughterUtils.SAMPLE_RATE,
            laughterUtils.FRAME_MS
        );
        var knockResult = laughterDetector.computeLaughterConfidence(
            knocks,
            laughterUtils.SAMPLE_RATE,
            laughterUtils.FRAME_MS
        );

        var laughMean = laughterUtils.meanRange(laughResult.confidence, 15, laughResult.confidence.length - 15);
        var knockMean = laughterUtils.meanRange(knockResult.confidence, 15, knockResult.confidence.length - 15);

        assert(laughMean > 0.22, 'Laughter-like signal should stay detectable');
        assert(knockMean < 0.18, 'Impulsive knocks should have low laughter confidence');
        assert(
            laughMean > knockMean + 0.10,
            'Laughter-like signal should score clearly above knock transients (' + laughMean + ' vs ' + knockMean + ')'
        );
    });
});
