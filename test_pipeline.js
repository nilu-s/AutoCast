#!/usr/bin/env node
'use strict';

var analyzer = require('./packages/analyzer/src/analyzer');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPaths = [
    path.join(testDir, '251024-MP-Antje-003a.wav'),
    path.join(testDir, '251024-MP-Antje-003b.wav'),
    path.join(testDir, '251024-MP-Antje-003c.wav')
];

console.log('Testing with tracks:');
trackPaths.forEach(function(p, i) {
    console.log('  [' + i + '] ' + path.basename(p));
});

var params = {
    debugMode: true,
    debugMaxFrames: 10000
};

console.log('\nRunning analysis...\n');

var startTime = Date.now();
var result = analyzer.analyze(trackPaths, params, function(progress, msg) {
    console.log('[' + progress + '%] ' + (msg || ''));
});

var duration = Date.now() - startTime;

console.log('\n=== RESULT ===');
console.log('Duration: ' + (duration/1000).toFixed(1) + 's');
console.log('Total duration: ' + result.totalDurationSec.toFixed(2) + 's');
console.log('\nTrack info:');
result.tracks.forEach(function(track, i) {
    console.log('  Track ' + i + ':');
    console.log('    - Segments: ' + (track.segmentCount || 0));
    console.log('    - Active: ' + (track.activePercent || 0).toFixed(1) + '%');
    console.log('    - Noise floor: ' + (track.noiseFloorDb || 0).toFixed(1) + ' dB');
    console.log('    - Threshold: ' + (track.thresholdDb || 0).toFixed(1) + ' dB');
});

console.log('\nSegments per track:');
result.segments.forEach(function(segs, i) {
    var active = segs.filter(function(s) { return s.state !== 'suppressed'; });
    console.log('  Track ' + i + ': ' + segs.length + ' total, ' + active.length + ' active');
    if (active.length > 0 && active.length <= 10) {
        active.forEach(function(s, j) {
            console.log('    [' + j + '] ' + s.start.toFixed(2) + 's - ' + s.end.toFixed(2) + 's');
        });
    }
});

console.log('\nCut preview items:');
if (result.cutPreview && result.cutPreview.items) {
    var keep = result.cutPreview.items.filter(function(i) { return i.decisionState === 'keep'; });
    var review = result.cutPreview.items.filter(function(i) { return i.decisionState === 'review'; });
    var suppress = result.cutPreview.items.filter(function(i) { return i.decisionState === 'suppress'; });
    console.log('  Total: ' + result.cutPreview.items.length);
    console.log('  Keep: ' + keep.length);
    console.log('  Review: ' + review.length);
    console.log('  Suppress: ' + suppress.length);
}
