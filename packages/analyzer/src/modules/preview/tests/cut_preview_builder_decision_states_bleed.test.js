'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder Decision States - Bleed Demotion', function () {
    it('should demote high bleed-confidence spans from keep to non-keep', function () {
        var frameCount = 300;
        var lowTrack = previewUtils.makeFilledArray(frameCount, 0.02);
        var loudTrack = previewUtils.makeFilledArray(frameCount, 0.20);
        var lowSpectral = previewUtils.makeFilledArray(frameCount, 0.12);
        var highSpectral = previewUtils.makeFilledArray(frameCount, 0.70);
        var lowSpeakerSim = previewUtils.makeFilledArray(frameCount, 0.10);
        var highSpeakerSim = previewUtils.makeFilledArray(frameCount, 0.82);

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
                [{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }],
                [{ start: 0.00, end: 1.00, trackIndex: 1, state: 'active' }]
            ],
            trackInfos: [
                { name: 'Audio 1', path: 'a.wav', thresholdDb: -52 },
                { name: 'Audio 2', path: 'b.wav', thresholdDb: -52 }
            ],
            totalDurationSec: 1.2,
            frameDurationMs: 10,
            rmsProfiles: [lowTrack, loudTrack],
            rawRmsProfiles: [lowTrack, loudTrack],
            spectralResults: [{ confidence: lowSpectral }, { confidence: highSpectral }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.05) }, { confidence: previewUtils.makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [
                { speakerDebug: { similarity: lowSpeakerSim } },
                { speakerDebug: { similarity: highSpeakerSim } }
            ],
            params: {
                previewSegmentMergeEnabled: false,
                spectralMinConfidence: 0.18
            }
        });

        assert(result && result.items && result.items.length >= 2, 'Expected at least one item per track');

        var track0 = null;
        for (var i = 0; i < result.items.length; i++) {
            if (result.items[i].trackIndex === 0) {
                track0 = result.items[i];
                break;
            }
        }

        assert(track0, 'Expected preview item for track 0');
        assert(track0.metrics && track0.metrics.bleedConfidence >= 0.80, 'Expected high bleed confidence');
        assert(track0.decisionState !== 'keep', 'High bleed confidence should not remain keep');
        assert(track0.selected === false, 'Demoted segment should not be selected by default');
    });

    it('should not classify moderate overlap as bleed without strong evidence', function () {
        var frameCount = 300;
        var trackA = previewUtils.makeFilledArray(frameCount, 0.05);
        var trackB = previewUtils.makeFilledArray(frameCount, 0.06);
        var spectralA = previewUtils.makeFilledArray(frameCount, 0.66);
        var spectralB = previewUtils.makeFilledArray(frameCount, 0.64);
        var speakerA = previewUtils.makeFilledArray(frameCount, 0.74);
        var speakerB = previewUtils.makeFilledArray(frameCount, 0.70);

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
                [{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }],
                [{ start: 0.00, end: 1.00, trackIndex: 1, state: 'active' }]
            ],
            trackInfos: [
                { name: 'Audio 1', path: 'a.wav', thresholdDb: -52 },
                { name: 'Audio 2', path: 'b.wav', thresholdDb: -52 }
            ],
            totalDurationSec: 1.2,
            frameDurationMs: 10,
            rmsProfiles: [trackA, trackB],
            rawRmsProfiles: [trackA, trackB],
            spectralResults: [{ confidence: spectralA }, { confidence: spectralB }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.04) }, { confidence: previewUtils.makeFilledArray(frameCount, 0.05) }],
            gateSnapshots: [
                { speakerDebug: { similarity: speakerA } },
                { speakerDebug: { similarity: speakerB } }
            ],
            params: {
                previewSegmentMergeEnabled: false,
                independentTrackAnalysis: true,
                enableBleedHandling: false
            }
        });

        var track0 = null;
        for (var i = 0; i < result.items.length; i++) {
            if (result.items[i].trackIndex === 0) {
                track0 = result.items[i];
                break;
            }
        }

        assert(track0, 'Expected preview item for track 0');
        assert(track0.metrics.overlapPenalty > 0, 'Expected non-zero overlap pressure');
        assert(track0.metrics.overlapTrust < 0.45, 'Expected overlap trust down-weighting');
        assert(track0.contentState !== 'bleed', 'Moderate overlap alone should not dominate content state');
    });
});
