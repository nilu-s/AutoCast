/**
 * AutoCast - Cross-track handover smoothing tests
 */

'use strict';

var path = require('path');
var post = require(path.join(__dirname, '..', 'src', 'analyzer_postprocess'));
var rmsCalc = require(path.join(__dirname, '..', 'src', 'rms_calculator'));

describe('Cross-track handover smoothing', function () {
    it('should trim long weak overlap lead for incoming track', function () {
        var resolvedSegments = [
            [{ start: 0.0, end: 10.0, trackIndex: 0, state: 'active', durationMs: 10000 }],
            [{ start: 8.0, end: 12.0, trackIndex: 1, state: 'active', durationMs: 4000 }]
        ];

        var rmsProfiles = [
            createDbRmsArray(-26, 1400),
            createDbRmsArray(-50, 1400)
        ];

        // Incoming track has a weak first 260 ms and then gets stronger.
        fillDbRange(rmsProfiles[1], 8.00, 8.26, -66);
        fillDbRange(rmsProfiles[1], 8.26, 12.00, -50);

        var vadResults = [
            { thresholdDb: -60 },
            { thresholdDb: -60 }
        ];

        var out = post.smoothCrossTrackHandovers(
            resolvedSegments,
            rmsProfiles,
            vadResults,
            {
                frameDurationMs: 10,
                maxStartDelayMs: 3000,
                leadMs: 220,
                weakOnsetProbeMs: 260,
                maxWeakOverlapLeadMs: 700,
                onsetPeakMinDb: 2.0,
                onsetMeanMinDb: 0.3,
                minSegmentMs: 120
            }
        );

        assert(out[1].length === 1, 'Incoming track should still have one segment');
        assertApprox(out[1][0].start, 9.30, 0.03, 'Weak long overlap lead should be trimmed near otherEnd - 700ms');
        assertApprox(out[1][0].end, 12.00, 0.001, 'Segment end should stay unchanged');
    });

    it('should keep early overlap when incoming onset is already strong', function () {
        var resolvedSegments = [
            [{ start: 0.0, end: 10.0, trackIndex: 0, state: 'active', durationMs: 10000 }],
            [{ start: 8.0, end: 12.0, trackIndex: 1, state: 'active', durationMs: 4000 }]
        ];

        var rmsProfiles = [
            createDbRmsArray(-26, 1400),
            createDbRmsArray(-48, 1400)
        ];

        // Strong onset right from segment start.
        fillDbRange(rmsProfiles[1], 8.00, 8.30, -48);
        fillDbRange(rmsProfiles[1], 8.30, 12.00, -50);

        var vadResults = [
            { thresholdDb: -60 },
            { thresholdDb: -60 }
        ];

        var out = post.smoothCrossTrackHandovers(
            resolvedSegments,
            rmsProfiles,
            vadResults,
            {
                frameDurationMs: 10,
                maxStartDelayMs: 3000,
                leadMs: 220,
                weakOnsetProbeMs: 260,
                maxWeakOverlapLeadMs: 700,
                onsetPeakMinDb: 2.0,
                onsetMeanMinDb: 0.3,
                minSegmentMs: 120
            }
        );

        assert(out[1].length === 1, 'Incoming track should still have one segment');
        assertApprox(out[1][0].start, 8.00, 0.001, 'Strong onset should not be delayed');
        assertApprox(out[1][0].end, 12.00, 0.001, 'Segment end should stay unchanged');
    });
});

function createDbRmsArray(db, length) {
    var arr = new Float64Array(length);
    var v = rmsCalc.dbToLinear(db);
    for (var i = 0; i < length; i++) arr[i] = v;
    return arr;
}

function fillDbRange(arr, startSec, endSec, db) {
    var start = Math.max(0, Math.floor(startSec * 100));
    var end = Math.min(arr.length, Math.ceil(endSec * 100));
    var v = rmsCalc.dbToLinear(db);
    for (var i = start; i < end; i++) arr[i] = v;
}

