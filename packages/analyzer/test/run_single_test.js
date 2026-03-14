'use strict';

var path = require('path');

function setupGlobals(stats) {
    global.describe = function (name, fn) {
        console.log('\n--- ' + name + ' ---');
        fn();
    };

    global.it = function (name, fn) {
        stats.totalTests++;
        try {
            fn();
            stats.totalPassed++;
            console.log('  [PASS] ' + name);
        } catch (e) {
            stats.totalFailed++;
            console.log('  [FAIL] ' + name);
            console.log('    Error: ' + e.message);
        }
    };

    global.assert = function (condition, message) {
        if (!condition) throw new Error(message || 'Assertion failed');
    };

    global.assertApprox = function (actual, expected, tolerance, message) {
        var limit = typeof tolerance === 'number' ? tolerance : 0.01;
        if (Math.abs(actual - expected) > limit) {
            throw new Error((message || 'Value mismatch') + ': expected ' + expected + ' +/- ' + limit + ', got ' + actual);
        }
    };

    global.assertThrows = function (fn, message) {
        var threw = false;
        try {
            fn();
        } catch (e) {
            threw = true;
        }
        if (!threw) throw new Error(message || 'Expected function to throw');
    };
}

function runSingleTest(fileArg) {
    if (!fileArg) {
        throw new Error('Usage: node packages/analyzer/test/run_single_test.js <test-file-path>');
    }

    var abs = path.resolve(fileArg);
    var stats = { totalPassed: 0, totalFailed: 0, totalTests: 0 };
    setupGlobals(stats);

    require(abs);

    console.log('\n========================================');
    console.log(
        ' Results: ' +
        stats.totalPassed +
        '/' +
        stats.totalTests +
        ' passed' +
        (stats.totalFailed > 0 ? ', ' + stats.totalFailed + ' failed' : '')
    );
    console.log('========================================');

    if (stats.totalFailed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    runSingleTest(process.argv[2]);
}

module.exports = {
    runSingleTest: runSingleTest
};
