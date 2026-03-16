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

// Test with useOptimizedPipeline = false to use standard VAD
console.log('=== Test 1: Standard VAD (useOptimizedPipeline: false) ===\n');
var result1 = analyzer.analyze(trackPaths, { 
    useOptimizedPipeline: false,
    debugMode: true 
}, function() {});

console.log('Track info:');
result1.tracks.forEach(function(track, i) {
    console.log('  Track ' + i + ': segments=' + (track.segmentCount || 0) + 
                ', active=' + (track.activePercent || 0).toFixed(1) + '%' +
                ', noiseFloor=' + (track.noiseFloorDb || 0).toFixed(1) + 'dB');
});

console.log('\nSegments per track:');
result1.segments.forEach(function(segs, i) {
    var active = segs.filter(function(s) { return s.state !== 'suppressed'; });
    console.log('  Track ' + i + ': ' + segs.length + ' total, ' + active.length + ' active');
});

console.log('\n=== Test 2: Optimized VAD (useOptimizedPipeline: true) ===\n');
var result2 = analyzer.analyze(trackPaths, { 
    useOptimizedPipeline: true,
    debugMode: true 
}, function() {});

console.log('Track info:');
result2.tracks.forEach(function(track, i) {
    console.log('  Track ' + i + ': segments=' + (track.segmentCount || 0) + 
                ', active=' + (track.activePercent || 0).toFixed(1) + '%' +
                ', noiseFloor=' + (track.noiseFloorDb || 0).toFixed(1) + 'dB');
});

console.log('\nSegments per track:');
result2.segments.forEach(function(segs, i) {
    var active = segs.filter(function(s) { return s.state !== 'suppressed'; });
    console.log('  Track ' + i + ': ' + segs.length + ' total, ' + active.length + ' active');
});
