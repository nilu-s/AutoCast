'use strict';

var readTracksStage = require('../read_tracks_stage');
var overlapStage = require('../overlap_stage');
var finalizeStage = require('../finalize_stage');

describe('Pipeline Stages', function () {
    it('read_tracks_stage should reject empty track list', function () {
        assertThrows(function () {
            readTracksStage.runReadTracksStage({
                trackPaths: [],
                params: {},
                progress: function () { }
            });
        }, 'Expected empty track list to throw');
    });

    it('read_tracks_stage should keep null track placeholders', function () {
        var result = readTracksStage.runReadTracksStage({
            trackPaths: [null, null],
            params: {},
            progress: function () { }
        });

        assert(result.trackCount === 2, 'Expected two tracks');
        assert(result.trackInfos.length === 2, 'Expected two track infos');
        assert(result.trackInfos[0].path === null, 'Expected null path placeholder');
        assert(result.totalDurationSec === 0, 'Expected total duration 0 for all-null tracks');
    });

    it('overlap_stage should keep all segments active in independent mode', function () {
        var overlap = overlapStage.runOverlapStage({
            params: {
                independentTrackAnalysis: true
            },
            bleedEnabled: true,
            allSegments: [
                [{ start: 0, end: 1, trackIndex: 0 }],
                [{ start: 0.5, end: 1.5, trackIndex: 1 }]
            ],
            rmsProfiles: [new Float32Array(0), new Float32Array(0)],
            fingerprintResults: []
        });

        assert(Array.isArray(overlap.resolvedSegments), 'Expected resolved segments array');
        assert(overlap.resolvedSegments[0][0].state === 'active', 'Expected active state on track 0');
        assert(overlap.resolvedSegments[1][0].state === 'active', 'Expected active state on track 1');
        assert(Array.isArray(overlap.overlapResolvedSegments), 'Expected overlap snapshot array');
    });

    it('finalize_stage should require raw RMS profiles for preview evidence', function () {
        assertThrows(function () {
            finalizeStage.runFinalizeStage({
                params: { frameDurationMs: 10 },
                totalDurationSec: 1.0,
                trackInfos: [{ name: 'A', thresholdDb: -50 }],
                resolvedSegments: [[{ start: 0, end: 0.5, trackIndex: 0, state: 'active' }]],
                allSegments: [[{ start: 0, end: 0.5, trackIndex: 0, state: 'active' }]],
                overlapResolvedSegments: [[{ start: 0, end: 0.5, trackIndex: 0, state: 'active' }]],
                rmsProfiles: [new Float32Array(100)],
                rawRmsProfiles: [],
                spectralResults: [{ confidence: new Float32Array(100) }],
                laughterResults: [{ confidence: new Float32Array(100) }],
                gateSnapshots: [{}],
                progress: function () { }
            });
        }, 'Expected finalize stage to reject missing raw RMS profiles');
    });
});
