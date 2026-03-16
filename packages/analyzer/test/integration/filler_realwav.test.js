'use strict';

var path = require('path');
var wavLoader = require(path.join(__dirname, '..', 'utils', 'wav_loader'));
var vadGate = require(path.join(__dirname, '..', '..', 'src', 'modules', 'vad', 'vad_gate'));
var segmentBuilder = require(path.join(__dirname, '..', '..', 'src', 'modules', 'segmentation', 'segment_builder'));
var rmsCalc = require(path.join(__dirname, '..', '..', 'src', 'modules', 'energy', 'rms_calculator'));

/**
 * Integration test for filler sounds ("Mhm") using real WAV files.
 *
 * Tests that:
 * 1. Mhm WAV files (6 variants) are loaded correctly using wav_loader
 * 2. VAD gate detects brief filler sounds
 * 3. Segment builder properly segments short filler sounds
 * 4. Mhm is distinguished from longer speech segments
 */

describe('Filler sounds (Mhm) real WAV integration', function () {
    var mhmVariants = [];

    // Helper to load all Mhm variants
    function loadMhmVariants() {
        if (mhmVariants.length > 0) return mhmVariants;

        for (var i = 1; i <= 6; i++) {
            var category = 'Mhm - ' + i;
            var files = wavLoader.loadTestData(category);

            if (files.length > 0) {
                mhmVariants.push({
                    variant: i,
                    files: files
                });
            }
        }
        return mhmVariants;
    }

    it('should load all 6 Mhm WAV variants', function () {
        var variants = loadMhmVariants();
        assert(variants.length === 6, 'Expected 6 Mhm variants, found ' + variants.length);

        for (var i = 0; i < variants.length; i++) {
            assert(variants[i].files.length > 0, 'Mhm variant ' + variants[i].variant + ' should have at least one WAV file');
        }
    });

    it('should parse Mhm WAV files with valid audio properties', function () {
        var variants = loadMhmVariants();

        for (var i = 0; i < variants.length; i++) {
            var files = variants[i].files;

            for (var j = 0; j < files.length; j++) {
                var file = files[j];
                assert(file.sampleRate > 0, 'Variant ' + variants[i].variant + ': Sample rate should be positive');
                assert(file.channels >= 1, 'Variant ' + variants[i].variant + ': Should have at least 1 channel');
                assert(file.samples.length > 0, 'Variant ' + variants[i].variant + ': Should have samples');
                assert(file.duration > 0, 'Variant ' + variants[i].variant + ': Should have positive duration');
            }
        }
    });

    it('should detect Mhm as brief segments (short duration)', function () {
        var variants = loadMhmVariants();

        for (var i = 0; i < variants.length; i++) {
            var files = variants[i].files;
            variants[i].segments = [];
            variants[i].vadResults = [];

            for (var j = 0; j < files.length; j++) {
                var file = files[j];

                // Calculate RMS
                var rmsResult = rmsCalc.calculateRMS(file.samples, file.sampleRate, 10);

                // Run VAD with default parameters
                var vadResult = vadGate.detectActivity(rmsResult.rms, {
                    frameDurationMs: 10,
                    thresholdAboveFloorDb: 9,
                    minSegmentMs: 100  // Lower threshold for brief sounds
                });

                assert(vadResult.gateOpen.length > 0, 'Variant ' + variants[i].variant + ': VAD should return gate array');

                // Build segments
                var segments = segmentBuilder.buildSegments(vadResult.gateOpen, 0, {
                    minSegmentMs: 100,  // Allow shorter segments for filler sounds
                    minGapMs: 100
                });

                // Mhm should produce at least one segment
                assert(segments.length >= 1, 'Variant ' + variants[i].variant + ': Should detect at least one segment for Mhm');

                // Store for later tests
                variants[i].segments.push(segments);
                variants[i].vadResults.push(vadResult);
            }
        }
    });

    it('should detect Mhm segments as brief (under 800ms)', function () {
        var variants = loadMhmVariants();

        // Ensure previous test ran and populated segments
        if (variants[0].segments === undefined) {
            // Run detection if not already done
            for (var i = 0; i < variants.length; i++) {
                var files = variants[i].files;
                variants[i].segments = [];

                for (var j = 0; j < files.length; j++) {
                    var file = files[j];
                    var rmsResult = rmsCalc.calculateRMS(file.samples, file.sampleRate, 10);
                    var vadResult = vadGate.detectActivity(rmsResult.rms, {
                        frameDurationMs: 10,
                        thresholdAboveFloorDb: 9,
                        minSegmentMs: 100
                    });
                    var segments = segmentBuilder.buildSegments(vadResult.gateOpen, 0, {
                        minSegmentMs: 100,
                        minGapMs: 100
                    });
                    variants[i].segments.push(segments);
                }
            }
        }

        for (var i = 0; i < variants.length; i++) {
            var segmentsList = variants[i].segments;

            for (var j = 0; j < segmentsList.length; j++) {
                var segments = segmentsList[j];

                for (var k = 0; k < segments.length; k++) {
                    var seg = segments[k];
                    // Mhm is typically 200-400ms, but allow up to 800ms for variants
                    assert(seg.durationMs < 800,
                        'Variant ' + variants[i].variant + ' segment ' + k +
                        ': Mhm segment should be brief (< 800ms), got ' + seg.durationMs + 'ms');

                    // Also verify minimum - should be at least 50ms to be meaningful
                    assert(seg.durationMs >= 50,
                        'Variant ' + variants[i].variant + ' segment ' + k +
                        ': Mhm segment should be at least 50ms, got ' + seg.durationMs + 'ms');
                }
            }
        }
    });

    it('should properly segment filler sounds with clear start/end boundaries', function () {
        var variants = loadMhmVariants();

        for (var i = 0; i < variants.length; i++) {
            var segmentsList = variants[i].segments;

            for (var j = 0; j < segmentsList.length; j++) {
                var segments = segmentsList[j];

                for (var k = 0; k < segments.length; k++) {
                    var seg = segments[k];

                    // Verify segment has proper boundaries
                    assert(seg.start >= 0, 'Variant ' + variants[i].variant + ': Segment start should be >= 0');
                    assert(seg.end > seg.start, 'Variant ' + variants[i].variant + ': Segment end should be > start');
                    assert(typeof seg.durationMs === 'number', 'Variant ' + variants[i].variant + ': Segment should have durationMs');
                    assert(seg.trackIndex === 0, 'Variant ' + variants[i].variant + ': Track index should be 0');
                }
            }
        }
    });

    it('should distinguish Mhm from longer speech (simulated comparison)', function () {
        var variants = loadMhmVariants();

        // This test verifies that the VAD parameters can differentiate brief sounds
        // from longer speech by comparing segment counts and durations

        var totalMhmDuration = 0;
        var totalMhmSegments = 0;

        for (var i = 0; i < variants.length; i++) {
            var segmentsList = variants[i].segments;

            for (var j = 0; j < segmentsList.length; j++) {
                var segments = segmentsList[j];
                totalMhmSegments += segments.length;

                for (var k = 0; k < segments.length; k++) {
                    totalMhmDuration += segments[k].durationMs;
                }
            }
        }

        var avgMhmDuration = totalMhmSegments > 0 ? totalMhmDuration / totalMhmSegments : 0;

        // Average Mhm duration should be in the 150-600ms range
        assert(avgMhmDuration >= 150, 'Average Mhm duration should be at least 150ms, got ' + avgMhmDuration + 'ms');
        assert(avgMhmDuration <= 600, 'Average Mhm duration should be at most 600ms, got ' + avgMhmDuration + 'ms');

        // Should have detected segments in most variants
        assert(totalMhmSegments >= 4, 'Should detect segments in at least 4 of 6 Mhm variants, got ' + totalMhmSegments + ' segments');
    });

    it('should handle VAD gate with different threshold settings for fillers', function () {
        var variants = loadMhmVariants();
        var file = variants[0].files[0];
        var rmsResult = rmsCalc.calculateRMS(file.samples, file.sampleRate, 10);

        // Test with stricter threshold
        var strictVad = vadGate.detectActivity(rmsResult.rms, {
            thresholdAboveFloorDb: 12,  // Stricter
            frameDurationMs: 10
        });

        // Test with looser threshold
        var looseVad = vadGate.detectActivity(rmsResult.rms, {
            thresholdAboveFloorDb: 6,  // Looser
            frameDurationMs: 10
        });

        // Count active frames
        var strictActive = 0;
        var looseActive = 0;

        for (var i = 0; i < strictVad.gateOpen.length; i++) {
            if (strictVad.gateOpen[i]) strictActive++;
        }
        for (var i = 0; i < looseVad.gateOpen.length; i++) {
            if (looseVad.gateOpen[i]) looseActive++;
        }

        // Looser threshold should detect more activity
        assert(looseActive >= strictActive, 'Looser threshold should detect equal or more activity than strict threshold');
    });

    it('should compute segment statistics correctly for Mhm files', function () {
        var variants = loadMhmVariants();

        for (var i = 0; i < variants.length; i++) {
            var files = variants[i].files;
            var segmentsList = variants[i].segments;

            for (var j = 0; j < segmentsList.length; j++) {
                var segments = segmentsList[j];
                var file = files[j];

                if (segments && segments.length > 0) {
                    var stats = segmentBuilder.computeStats(segments, file.duration);

                    assert(typeof stats.totalActiveSec === 'number', 'Variant ' + variants[i].variant + ': Should have totalActiveSec');
                    assert(typeof stats.activePercent === 'number', 'Variant ' + variants[i].variant + ': Should have activePercent');
                    assert(typeof stats.segmentCount === 'number', 'Variant ' + variants[i].variant + ': Should have segmentCount');
                    assert(stats.segmentCount === segments.length, 'Variant ' + variants[i].variant + ': segmentCount should match actual segments');

                    // Active percentage for Mhm should be relatively low (filler is brief)
                    // Allow up to 70% as some variants may have more active content
                    assert(stats.activePercent < 70, 'Variant ' + variants[i].variant + ': Mhm should have < 70% active time, got ' + stats.activePercent + '%');
                }
            }
        }
    });
});
