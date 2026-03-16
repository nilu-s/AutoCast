#!/usr/bin/env node
'use strict';

var analyzerDefaults = require('./packages/analyzer/src/defaults/analyzer_defaults');
var analyzerParams = require('./packages/analyzer/src/core/utils/analyzer_params');
var analyzerPipeline = require('./packages/analyzer/src/core/pipeline/analyzer_pipeline');
var path = require('path');

var testDir = '/home/node/.openclaw/workspace/AutoCast/test_data_real/podcastExample';
var trackPaths = [
    path.join(testDir, '251024-MP-Antje-003a_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003b_30s.wav'),
    path.join(testDir, '251024-MP-Antje-003c_30s.wav')
];

console.log('=== Testing analyzer_pipeline.analyze directly ===\n');

var params = { useOptimizedPipeline: false };
var result = analyzerPipeline.analyze(trackPaths, params, function(p, msg) {
    console.log('[' + p + '%] ' + (msg || ''));
});

console.log('\n=== Result ===');
console.log('Type of result: ' + typeof result);
console.log('Has segments: ' + !!result.segments);
console.log('Has tracks: ' + !!result.tracks);

if (result.segments) {
    console.log('\nSegments:');
    result.segments.forEach(function(segs, i) {
        var active = segs.filter(function(s) { return s.state !== 'suppressed'; });
        console.log('  Track ' + i + ': ' + segs.length + ' total, ' + active.length + ' active');
    });
}

if (result.tracks) {
    console.log('\nTracks:');
    result.tracks.forEach(function(t, i) {
        console.log('  Track ' + i + ': segments=' + (t.segmentCount || 0) + 
                    ', active=' + (t.activePercent || 0).toFixed(1) + '%');
    });
}

if (result.cutPreview) {
    console.log('\nCut preview:');
    console.log('  Items: ' + (result.cutPreview.items ? result.cutPreview.items.length : 0));
}
