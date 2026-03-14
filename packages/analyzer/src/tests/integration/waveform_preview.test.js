'use strict';

var path = require('path');
var analyzer = require(path.join(__dirname, '..', '..', 'analyzer'));

describe('Waveform preview output', function () {
    it('should keep waveform.timeStep finite when first track is disabled', function () {
        var trackA = path.join(__dirname, '..', '..', '..', 'test', 'test_data', 'track_a_host.wav');

        var result = analyzer.analyze(
            [null, trackA],
            {
                useSpectralVAD: false,
                useLaughterDetection: false,
                autoGain: false,
                enableBleedHandling: false,
                enablePrimaryTrackGapFill: false,
                enablePreTriggerCleanup: false,
                enableSameTrackGapMerge: false,
                enableDominantTrackStickiness: false,
                enableCrossTrackHandoverSmoothing: false,
                enableLowSignificancePrune: false,
                enablePeakAnchorKeep: false,
                enableResidualSnippetPrune: false,
                enableFinalPeakGate: false,
                enforceAlwaysOneTrackOpen: false
            }
        );

        assert(result && result.waveform, 'Analyzer should return waveform metadata.');
        assert(isFinite(result.waveform.timeStep), 'waveform.timeStep must be finite.');
        assert(result.waveform.timeStep >= 0, 'waveform.timeStep must be non-negative.');
    });
});
