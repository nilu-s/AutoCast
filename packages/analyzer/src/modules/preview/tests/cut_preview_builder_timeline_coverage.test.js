'use strict';

var path = require('path');
var cutPreviewBuilder = require('../cut_preview_builder');
var previewUtils = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'cut_preview_test_utils'));

describe('Cut Preview Builder - Timeline Coverage', function () {
    it('should provide full timeline state coverage and uninteresting gap snippets', function () {
        var frameCount = 400;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[
                { start: 0.20, end: 0.60, trackIndex: 0, state: 'active' },
                { start: 1.40, end: 1.90, trackIndex: 0, state: 'active' }
            ]],
            overlapSegments: [[
                { start: 0.20, end: 0.60, trackIndex: 0, state: 'active' },
                { start: 1.40, end: 1.90, trackIndex: 0, state: 'active' }
            ]],
            finalSegments: [[
                { start: 0.20, end: 0.60, trackIndex: 0, state: 'active' },
                { start: 1.40, end: 1.90, trackIndex: 0, state: 'active' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -52 }],
            totalDurationSec: 3.0,
            frameDurationMs: 10,
            rmsProfiles: [previewUtils.makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.45) }],
            laughterResults: [{ confidence: previewUtils.makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [{ speakerDebug: { similarity: previewUtils.makeFilledArray(frameCount, 0.70) } }],
            params: {
                previewSegmentMergeEnabled: false
            }
        });

        assert(result && result.stateTimelineByTrack && result.stateTimelineByTrack.length === 1, 'Expected one track state timeline');
        var timeline = result.stateTimelineByTrack[0];
        assert(timeline && timeline.length >= 3, 'Expected multiple timeline state segments');
        assertApprox(timeline[0].start, 0, 0.0001, 'Timeline should start at 0');
        assertApprox(timeline[timeline.length - 1].end, 3.0, 0.0001, 'Timeline should cover full duration');

        var hasUninterestingState = false;
        for (var i = 0; i < timeline.length; i++) {
            if (timeline[i].state === 'uninteresting') {
                hasUninterestingState = true;
                break;
            }
        }
        assert(hasUninterestingState, 'Expected uninteresting state spans in timeline');

        var gapItemCount = 0;
        for (i = 0; i < result.items.length; i++) {
            var item = result.items[i];
            if (item.typeLabel !== 'uninteresting_gap') continue;
            gapItemCount++;
            assert(item.state === 'suppressed', 'Uninteresting gap should be suppressed state');
            assert(item.selected === false, 'Uninteresting gap should not be selected');
            assert(item.selectable === false, 'Uninteresting gap should not be selectable');
            assert(item.origin === 'timeline_gap', 'Uninteresting gap should have timeline gap origin');
        }

        assert(gapItemCount >= 1, 'Expected at least one uninteresting gap snippet');
        assert(result.summary && result.summary.uninterestingCount >= 1, 'Summary should count uninteresting snippets');
    });
});
