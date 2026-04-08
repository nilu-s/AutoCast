/**
 * Regression Test: Segment Isolation
 * Ensures fine-grained segments remain visible and cutPreview doesn't replace them
 */
'use strict';

var assert = require('assert');
var analyzerDefaults = require('../../defaults/analyzer_defaults');
var cutPreviewBuilder = require('../../modules/preview/cut_preview_builder');

function testPreviewDoesNotOverMerge() {
    // Test that previewSegmentMergeGapMs is reasonably small
    var defaults = analyzerDefaults.ANALYSIS_DEFAULTS;
    
    assert(
        defaults.previewSegmentMergeGapMs <= 500,
        'previewSegmentMergeGapMs should be <= 500ms to prevent over-merging, got: ' + defaults.previewSegmentMergeGapMs
    );
    
    assert(
        defaults.sameTrackGapMergeMaxMs <= 800,
        'sameTrackGapMergeMaxMs should be <= 800ms to preserve individual segments, got: ' + defaults.sameTrackGapMergeMaxMs
    );
    
    console.log('[PASS] Merge thresholds are within safe limits');
    return true;
}

function testSegmentsVsPreviewIsolation() {
    // Simulate analysis result with multiple fine segments
    var mockResult = {
        totalDurationSec: 10.0,
        tracks: [{ trackIndex: 0, name: 'Track 1' }],
        // 3 distinct segments with gaps between them
        segments: [
            [{ start: 0.5, end: 1.2, trackIndex: 0, state: 'active' }],
            [{ start: 2.0, end: 3.5, trackIndex: 0, state: 'active' }],
            [{ start: 5.0, end: 6.0, trackIndex: 0, state: 'active' }]
        ]
    };
    
    var params = {
        previewSegmentMergeEnabled: true,
        previewSegmentMergeGapMs: 250,
        frameDurationMs: 10,
        enforceAlwaysOneTrackOpen: true
    };
    
    var preview = cutPreviewBuilder.buildCutPreview({
        sourceSegments: mockResult.segments,
        overlapSegments: mockResult.segments,
        finalSegments: mockResult.segments,
        trackInfos: mockResult.tracks,
        totalDurationSec: mockResult.totalDurationSec,
        frameDurationMs: params.frameDurationMs,
        rmsProfiles: [[0.1, 0.2, 0.3]],
        rawRmsProfiles: [[0.1, 0.2, 0.3]],
        spectralResults: [],
        laughterResults: [],
        gateSnapshots: [],
        params: params
    });
    
    // Count non-uninteresting items (actual speech segments)
    var meaningfulItems = preview.items.filter(function(item) {
        return item.decisionState !== 'uninteresting' && item.origin !== 'timeline_gap';
    });
    
    // With 250ms merge gap, 3 separate segments should remain separate
    // (they have 800ms and 1500ms gaps between them)
    assert(
        meaningfulItems.length >= 3,
        'Expected at least 3 separate preview items for 3 source segments, got: ' + meaningfulItems.length
    );
    
    // Verify no single item covers the entire range
    var maxItemDuration = Math.max.apply(null, meaningfulItems.map(function(i) { return i.end - i.start; }));
    assert(
        maxItemDuration < 5.0,
        'No single item should span >5 seconds, largest was: ' + maxItemDuration
    );
    
    console.log('[PASS] Segments remain isolated in preview (items: ' + meaningfulItems.length + ')');
    return true;
}

function runAll() {
    console.log('\n=== Segment Isolation Regression Tests ===\n');
    var passed = 0;
    var failed = 0;
    
    try {
        testPreviewDoesNotOverMerge();
        passed++;
    } catch (e) {
        console.error('[FAIL] testPreviewDoesNotOverMerge:', e.message);
        failed++;
    }
    
    try {
        testSegmentsVsPreviewIsolation();
        passed++;
    } catch (e) {
        console.error('[FAIL] testSegmentsVsPreviewIsolation:', e.message);
        failed++;
    }
    
    console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
    return failed === 0;
}

module.exports = { runAll: runAll };

if (require.main === module) {
    runAll();
}
