#!/usr/bin/env node
'use strict';

var path = require('path');
var analyzer = require('./packages/analyzer/src/analyzer');

var testDataDir = path.join(__dirname, 'packages/analyzer/test/test_data');
var tracks = [
    path.join(testDataDir, 'track_a_host.wav'),
    path.join(testDataDir, 'track_b_guest1.wav'),
    path.join(testDataDir, 'track_c_guest2.wav')
];

console.log('Testing E2E mode test...\n');

var result = analyzer.analyze(tracks, {
    independentTrackAnalysis: true,
    snippetPadBeforeMs: 700,
    snippetPadAfterMs: 700,
    crossTrackTailTrimInIndependentMode: false,
    enableBleedHandling: false,
    minSegmentMs: 180,
    postOverlapMinSegmentMs: 120
});

console.log('Track B segments:');
var trackBSegs = result.segments[1];
console.log('  Count: ' + trackBSegs.length);
if (trackBSegs.length > 0) {
    console.log('  First segment:');
    console.log('    Start: ' + trackBSegs[0].start.toFixed(2) + 's');
    console.log('    End: ' + trackBSegs[0].end.toFixed(2) + 's');
    console.log('    State: ' + trackBSegs[0].state);
    console.log('');
    console.log('  Assertions:');
    console.log('    start <= 4.7: ' + (trackBSegs[0].start <= 4.7) + ' (actual: ' + trackBSegs[0].start.toFixed(2) + ')');
    console.log('    end >= 10.3: ' + (trackBSegs[0].end >= 10.3) + ' (actual: ' + trackBSegs[0].end.toFixed(2) + ')');
}
