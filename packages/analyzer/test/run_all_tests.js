/**
 * AutoCast â€“ Test Runner
 * 
 * Runs all tests and reports results.
 * Usage: node packages/analyzer/test/run_all_tests.js
 */

'use strict';

var path = require('path');
var testFiles = [
    'test_wav_reader.js',
    'test_rms.js',
    'test_segmentation.js',
    'test_overlap.js',
    'test_e2e.js',
    'test_spectral_bleed.js'
];

// Simple test framework
var totalPassed = 0;
var totalFailed = 0;
var totalTests = 0;
var currentSuite = '';

global.describe = function (name, fn) {
    currentSuite = name;
    console.log('\nâ”â”â” ' + name + ' â”â”â”');
    fn();
};

global.it = function (name, fn) {
    totalTests++;
    try {
        fn();
        totalPassed++;
        console.log('  âœ“ ' + name);
    } catch (e) {
        totalFailed++;
        console.log('  âœ— ' + name);
        console.log('    Error: ' + e.message);
    }
};

global.assert = function (condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
};

global.assertApprox = function (actual, expected, tolerance, message) {
    tolerance = tolerance || 0.01;
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error((message || 'Value mismatch') + ': expected ' + expected + ' Â± ' + tolerance + ', got ' + actual);
    }
};

global.assertThrows = function (fn, message) {
    var threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error(message || 'Expected function to throw');
};

// Run all tests
console.log('â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
console.log('â•‘   AutoCast Test Suite              â•‘');
console.log('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');

for (var i = 0; i < testFiles.length; i++) {
    try {
        require(path.join(__dirname, testFiles[i]));
    } catch (e) {
        console.log('\nâœ— FAILED TO LOAD: ' + testFiles[i]);
        console.log('  ' + e.message);
        if (e.stack) console.log('  ' + e.stack.split('\n').slice(1, 3).join('\n  '));
        totalFailed++;
    }
}

// Summary
console.log('\nâ•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
console.log('â•‘   Results: ' + totalPassed + '/' + totalTests + ' passed' +
    (totalFailed > 0 ? ', ' + totalFailed + ' FAILED' : '') +
    '              â•‘'.substring(0, 23 - String(totalPassed).length - String(totalTests).length));
console.log('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');

if (totalFailed > 0) {
    process.exit(1);
}

