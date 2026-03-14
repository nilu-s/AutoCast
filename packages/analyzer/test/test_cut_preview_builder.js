'use strict';

var cutPreviewBuilder = require('../src/modules/preview/cut_preview_builder');

function makeFilledArray(length, value) {
    var out = new Float32Array(length);
    for (var i = 0; i < length; i++) out[i] = value;
    return out;
}

function actionableItems(items) {
    var out = [];
    for (var i = 0; i < (items || []).length; i++) {
        var item = items[i];
        if (!item) continue;
        if (item.typeLabel === 'uninteresting_gap') continue;
        out.push(item);
    }
    return out;
}

describe('Cut Preview Builder', function () {
    it('should expose kept, near_miss and suppressed states with metrics', function () {
        var frameCount = 240;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[
                { start: 0.00, end: 0.50, trackIndex: 0, state: 'active' },
                { start: 0.70, end: 1.00, trackIndex: 0, state: 'suppressed' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            overlapSegments: [[
                { start: 0.00, end: 0.50, trackIndex: 0, state: 'active' },
                { start: 0.70, end: 1.00, trackIndex: 0, state: 'suppressed' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            finalSegments: [[
                { start: 0.00, end: 0.50, trackIndex: 0, state: 'active' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -50 }],
            totalDurationSec: 2.0,
            frameDurationMs: 10,
            rmsProfiles: [makeFilledArray(frameCount, 0.03)],
            spectralResults: [{ confidence: makeFilledArray(frameCount, 0.62) }],
            laughterResults: [{ confidence: makeFilledArray(frameCount, 0.10) }],
            gateSnapshots: [{ speakerDebug: { similarity: makeFilledArray(frameCount, 0.74) } }],
            params: {
                previewSegmentMergeEnabled: false,
                spectralMinConfidence: 0.18
            }
        });

        var actionable = actionableItems(result && result.items);
        assert(actionable.length === 3, 'Expected 3 actionable preview items');

        var kept = 0;
        var nearMiss = 0;
        var suppressed = 0;
        for (var i = 0; i < actionable.length; i++) {
            var item = actionable[i];
            if (item.state === 'kept') kept++;
            if (item.state === 'near_miss') nearMiss++;
            if (item.state === 'suppressed') suppressed++;
            assert(item.metrics && item.metrics.bleedConfidence !== undefined, 'Expected bleed metric');
            assert(item.metrics && item.metrics.laughterConfidence !== undefined, 'Expected laughter metric');
            assert(item.metrics && item.metrics.classMargin !== undefined, 'Expected class margin metric');
            assert(item.typeLabel && item.typeConfidence !== undefined, 'Expected type metadata');
            assert(item.decisionState, 'Expected normalized decision state');
            assert(item.contentClass, 'Expected normalized content class');
            assert(item.qualityBand, 'Expected normalized quality band');
            assert(item.hasOwnProperty('suppressionReason'), 'Expected suppression reason key');
            assert(item.modelOrigin, 'Expected normalized model origin');
            assert(item.evidenceMetrics && item.evidenceMetrics.speechEvidence !== undefined, 'Expected evidence metrics');
            assert(item.decision && item.decision.decisionState, 'Expected decision structure');
            assert(item.classification && item.classification.contentClass, 'Expected classification structure');
            assert(item.explainability && item.explainability.reasons, 'Expected explainability structure');
        }

        assert(kept === 1, 'Expected one kept item');
        assert(nearMiss === 1, 'Expected one near_miss item');
        assert(suppressed === 1, 'Expected one suppressed item');
    });

    it('should keep merged source snippets when each source part stays active', function () {
        var frameCount = 500;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[
                { start: 0.00, end: 0.40, trackIndex: 0, state: 'active' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            overlapSegments: [[
                { start: 0.00, end: 0.40, trackIndex: 0, state: 'active' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            finalSegments: [[
                { start: 0.00, end: 0.40, trackIndex: 0, state: 'active' },
                { start: 1.20, end: 1.60, trackIndex: 0, state: 'active' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -52 }],
            totalDurationSec: 2.0,
            frameDurationMs: 10,
            rmsProfiles: [makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: makeFilledArray(frameCount, 0.55) }],
            laughterResults: [{ confidence: makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [{ speakerDebug: { similarity: makeFilledArray(frameCount, 0.70) } }],
            params: {
                previewSegmentMergeEnabled: true,
                previewSegmentMergeGapMs: 1000,
                spectralMinConfidence: 0.18
            }
        });

        var actionable = actionableItems(result && result.items);
        assert(actionable.length === 1, 'Expected one merged actionable preview span');
        assert(actionable[0].state === 'kept', 'Merged span should stay kept');
        assert(actionable[0].metrics && actionable[0].metrics.mergedSegmentCount === 2, 'Expected merged segment count = 2');
        assert(actionable[0].metrics && actionable[0].metrics.keptSourceRatio >= 0.99, 'Expected kept source ratio close to 1');
    });

    it('should demote high bleed-confidence spans from kept to non-kept', function () {
        var frameCount = 300;
        var lowTrack = makeFilledArray(frameCount, 0.02);
        var loudTrack = makeFilledArray(frameCount, 0.20);
        var lowSpectral = makeFilledArray(frameCount, 0.12);
        var highSpectral = makeFilledArray(frameCount, 0.70);
        var lowSpeakerSim = makeFilledArray(frameCount, 0.10);
        var highSpeakerSim = makeFilledArray(frameCount, 0.82);

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
            spectralResults: [{ confidence: lowSpectral }, { confidence: highSpectral }],
            laughterResults: [{ confidence: makeFilledArray(frameCount, 0.05) }, { confidence: makeFilledArray(frameCount, 0.08) }],
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
        assert(track0.state !== 'kept', 'High bleed confidence should not remain kept');
        assert(track0.selected === false, 'Demoted segment should not be selected by default');
    });

    it('should add uncovered final continuity spans as kept items', function () {
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
            rmsProfiles: [makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: makeFilledArray(frameCount, 0.30) }],
            laughterResults: [{ confidence: makeFilledArray(frameCount, 0.05) }],
            gateSnapshots: [{ speakerDebug: { similarity: makeFilledArray(frameCount, 0.55) } }],
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
                assert(item.state === 'kept', 'Uncovered final continuity span should be kept');
                assert(item.selected === true, 'Uncovered final continuity span should be selected');
                break;
            }
        }
        assert(hasTailItem, 'Expected kept continuity item covering final uncovered tail');
    });

    it('should keep explicit always_open_fill origin visible in cut preview', function () {
        var frameCount = 500;
        var result = cutPreviewBuilder.buildCutPreview({
            sourceSegments: [[
                { start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }
            ]],
            overlapSegments: [[
                { start: 0.00, end: 1.00, trackIndex: 0, state: 'active' }
            ]],
            finalSegments: [[
                { start: 0.00, end: 1.00, trackIndex: 0, state: 'active', origin: 'analysis_active' },
                { start: 1.00, end: 2.00, trackIndex: 0, state: 'active', origin: 'always_open_fill' }
            ]],
            trackInfos: [{ name: 'Audio 1', path: 'a.wav', thresholdDb: -52 }],
            totalDurationSec: 2.4,
            frameDurationMs: 10,
            rmsProfiles: [makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: makeFilledArray(frameCount, 0.32) }],
            laughterResults: [{ confidence: makeFilledArray(frameCount, 0.05) }],
            gateSnapshots: [{ speakerDebug: { similarity: makeFilledArray(frameCount, 0.60) } }],
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
            assert(item.decisionState === 'filled_gap', 'Expected normalized decisionState for explicit fill');
            assert(item.modelOrigin === 'continuity_fill', 'Expected normalized continuity origin for explicit fill');
            assert(item.selected === true, 'Fill snippet should be selected by default');
            break;
        }
        assert(hasFill, 'Expected explicit fill segment in cut preview output');
    });

    it('should not auto-keep always_open_fill spans when bleed confidence is high', function () {
        var frameCount = 260;
        var lowTrack = makeFilledArray(frameCount, 0.02);
        var loudTrack = makeFilledArray(frameCount, 0.22);
        var lowSpectral = makeFilledArray(frameCount, 0.12);
        var highSpectral = makeFilledArray(frameCount, 0.72);
        var lowSpeaker = makeFilledArray(frameCount, 0.10);
        var highSpeaker = makeFilledArray(frameCount, 0.82);

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
            laughterResults: [{ confidence: makeFilledArray(frameCount, 0.06) }, { confidence: makeFilledArray(frameCount, 0.08) }],
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
            rmsProfiles: [makeFilledArray(frameCount, 0.02)],
            spectralResults: [{ confidence: makeFilledArray(frameCount, 0.45) }],
            laughterResults: [{ confidence: makeFilledArray(frameCount, 0.08) }],
            gateSnapshots: [{ speakerDebug: { similarity: makeFilledArray(frameCount, 0.70) } }],
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
