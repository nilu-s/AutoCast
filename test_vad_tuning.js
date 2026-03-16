#!/usr/bin/env node
'use strict';

var analyzer = require('./packages/analyzer/src/analyzer');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPaths = [
    path.join(testDir, '251024-MP-Antje-003a_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003b_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003c_30s.wav')
];

console.log('=== VAD Tuning Test ===\n');

// Test verschiedener Konfigurationen
var configs = [
    {
        name: 'Aktuell (Defaults)',
        params: {}
    },
    {
        name: 'Höherer Threshold',
        params: {
            thresholdAboveFloorDb: 9,
            absoluteThresholdDb: -50
        }
    },
    {
        name: 'Höherer Threshold + Kein Hard Cut',
        params: {
            thresholdAboveFloorDb: 9,
            absoluteThresholdDb: -50,
            enableHardSilenceCut: false
        }
    },
    {
        name: 'Konservativ',
        params: {
            thresholdAboveFloorDb: 12,
            absoluteThresholdDb: -45,
            enableHardSilenceCut: false,
            minSegmentMs: 400,
            minGapMs: 300
        }
    }
];

configs.forEach(function(cfg) {
    console.log('\n--- ' + cfg.name + ' ---');
    
    var result = analyzer.analyze(trackPaths, cfg.params, function() {});
    
    console.log('Track info:');
    result.tracks.forEach(function(track, i) {
        console.log('  Track ' + i + ': ' + (track.segmentCount || 0) + ' segments, ' + 
                    (track.activePercent || 0).toFixed(1) + '% active, ' +
                    'noiseFloor=' + (track.noiseFloorDb || 0).toFixed(1) + 'dB');
    });
    
    console.log('Segments:');
    result.segments.forEach(function(segs, i) {
        var active = segs.filter(function(s) { return s.state !== 'suppressed'; });
        console.log('  Track ' + i + ': ' + active.length + ' active segments');
        if (active.length > 0 && active.length <= 8) {
            active.forEach(function(s, j) {
                var dur = (s.end - s.start).toFixed(1);
                console.log('    [' + j + '] ' + s.start.toFixed(2) + 's - ' + s.end.toFixed(2) + 's (' + dur + 's)');
            });
        }
    });
    
    if (result.cutPreview && result.cutPreview.items) {
        var keep = result.cutPreview.items.filter(function(i) { return i.decisionState === 'keep'; });
        var review = result.cutPreview.items.filter(function(i) { return i.decisionState === 'review'; });
        console.log('Cut preview: ' + keep.length + ' keep, ' + review.length + ' review');
    }
});
