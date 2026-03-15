'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder - Continuity Fill', function () {
    it('should add uncovered final continuity spans as keep items', function () {
        var frameCount = 900;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[
                { start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }
            ]],
            overlapSegments: [[
                { start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }
            ]],
            finalSegments: [[
                { start: 0.00, end: 7.00, trackIndex: 0, state: 'active' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -52 }],
            totalDurationSec: 8.0,
            frameDurationMs: 10,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.30) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.05) }],
            gateSnapshots: [{ speakerDebug: { similarity: previewUtils.makeFilledArray(frameCount, 0.55) } }],
            params: {
                previewSegmentMergeEnabled: false,
                enforceAlwaysOneTrackOpen: true
            }
        });

        assert(result && result.items && result.items.length >= 2, 'Expected source + uncovered final span items');

        var hasTailItem = false;
        for (var i = 0; i < result.items.length; i++) {
            var item = result.items[i];
            if (item.trackIndex !== 0) continue;
            if (item.end >= 6.8 && item.start <= 1.2) {
                hasTailItem = true;
                assert(item.decisionState === 'keep', 'Uncovered final continuity span should be keep');
                assert(item.selected === true, 'Uncovered final continuity span should be selected');
                break;
            }
        }
        assert(hasTailItem, 'Expected keep continuity item covering final uncovered tail');
    });

    it('should keep explicit always_open_fill origin visible in cut preview', function () {
        var frameCount = 500;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }]],
            overlapSegments: [[{ start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }]],
            finalSegments: [[
                { start: 0.00, end: 1.00, trackIndex: 0, state: 'active', origin: 'analysis_active' },
                { start: 1.00, end: 2.00, trackIndex: 0, state: 'active', origin: 'always_open_fill' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -52 }],
            totalDurationSec: 2.4,
            frameDurationMs: 10,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.32) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.05) }],
            gateSnapshots: [{ speakerDebug: { similarity: previewUtils.makeFilledArray(frameCount, 0.60) } }],
            params: {
                previewSegmentMergeEnabled: false,
                enforceAlwaysOneTrackOpen: true
            }
        });

        assert(result && result.items && result.items.length >= 2, 'Expected at least two preview items');
        var hasFill = false;
        for (var i = 0; i < result.items.length; i++) {
            var item = result.items[i];
            if (item.start > 1.01 || item.end < 1.99) continue;
            if (!item.alwaysOpenFill) continue;
            hasFill = true;
            assert(item.origin === 'always_open_fill', 'Expected explicit fill origin on preview item');
            assert(item.decisionStage === 'always_open_fill', 'Expected explicit fill decision stage');
            assert(item.decisionState === 'filled_gap', 'Expected decisionState for explicit fill');
            assert(item.selected === true, 'Fill snippet should be selected by default');
            break;
        }
        assert(hasFill, 'Expected explicit fill segment in cut preview output');
    });
});
