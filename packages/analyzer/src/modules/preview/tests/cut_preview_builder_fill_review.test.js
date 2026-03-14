'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder - Fill Review under Bleed', function () {
    it('should not auto-keep always_open_fill spans when bleed confidence is high', function () {
        var frameCount = 260;
        var lowTrack = previewUtils.makeFilledArray(frameCount, 0.02);
        var loudTrack = previewUtils.makeFilledArray(frameCount, 0.22);
        var lowSpectral = previewUtils.makeFilledArray(frameCount, 0.12);
        var highSpectral = previewUtils.makeFilledArray(frameCount, 0.72);
        var lowSpeaker = previewUtils.makeFilledArray(frameCount, 0.10);
        var highSpeaker = previewUtils.makeFilledArray(frameCount, 0.82);

        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [
                [{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }],
                [{ start: 0.00, end: 1.00, trackIndex: 1, state: 'active' }]
            ],
            overlapSegments: [
                [{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }],
                [{ start: 0.00, end: 1.00, trackIndex: 1, state: 'active' }]
            ],
            finalSegments: [
                [{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active', origin: 'always_open_fill' }],
                [{ start: 0.00, end: 1.00, trackIndex: 1, state: 'active', origin: 'analysis_active' }]
            ],
            trackInfos: [
                { name: 'Audio 1', path: 'a.wav', thresholdDb: -52 },
                { name: 'Audio 2', path: 'b.wav', thresholdDb: -52 }
            ],
            totalDurationSec: 1.3,
            frameDurationMs: 10,
            rmsProfiles: [lowTrack, loudTrack],
            spectralResults: [{ confidence: lowSpectral }, { confidence: highSpectral }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.06) }, { confidence: previewUtils.makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [
                { speakerDebug: { similarity: lowSpeaker } },
                { speakerDebug: { similarity: highSpeaker } }
            ],
            params: {
                previewSegmentMergeEnabled: false,
                enforceAlwaysOneTrackOpen: true
            }
        });

        var fillItem = null;
        for (var i = 0; i < result.items.length; i++) {
            var item = result.items[i];
            if (item.trackIndex !== 0) continue;
            if (!item.alwaysOpenFill) continue;
            fillItem = item;
            break;
        }

        assert(fillItem, 'Expected always_open_fill preview item');
        assert(fillItem.metrics && fillItem.metrics.bleedConfidence >= 0.75, 'Expected high bleed confidence for fill item');
        assert(fillItem.state !== 'kept', 'High-bleed always_open_fill should not be auto-kept');
        assert(fillItem.selected === false, 'High-bleed always_open_fill should not be selected by default');
        assert(fillItem.decisionStage === 'always_open_fill_review', 'Expected explicit review stage for risky fill');
    });
});
