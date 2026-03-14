'use strict';

var path = require('path');

var SUITE_ORDER = ['unit', 'integration', 'e2e'];

function printHeader() {
    console.log('========================================');
    console.log(' AutoCast Test Suite');
    console.log('========================================');
}

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
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
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
        if (!threw) {
            throw new Error(message || 'Expected function to throw');
        }
    };
}

function normalizeMode(mode) {
    if (!mode || mode === 'all') {
        return 'all';
    }

    var lower = String(mode).toLowerCase();
    if (SUITE_ORDER.indexOf(lower) === -1) {
        throw new Error('Unknown test suite "' + mode + '". Expected one of: all, ' + SUITE_ORDER.join(', '));
    }
    return lower;
}

function loadManifest(suiteName) {
    var manifestPath = path.join(__dirname, suiteName, 'suite_manifest.js');
    var manifest = require(manifestPath);
    if (!Array.isArray(manifest)) {
        throw new Error('Invalid suite manifest: ' + manifestPath + ' (expected array)');
    }
    return manifest;
}

function printSummary(stats) {
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
}

function run(mode) {
    var selectedMode = normalizeMode(mode);
    var suites = selectedMode === 'all' ? SUITE_ORDER.slice() : [selectedMode];
    var loaded = {};
    var stats = {
        totalPassed: 0,
        totalFailed: 0,
        totalTests: 0
    };

    setupGlobals(stats);
    printHeader();

    for (var si = 0; si < suites.length; si++) {
        var suiteName = suites[si];
        var files;
        try {
            files = loadManifest(suiteName);
        } catch (e) {
            console.log('\n[FAIL] Failed to load suite "' + suiteName + '"');
            console.log('  ' + e.message);
            stats.totalFailed++;
            continue;
        }

        console.log('\n=== Suite: ' + suiteName + ' ===');

        for (var i = 0; i < files.length; i++) {
            var rel = files[i];
            var abs = path.join(__dirname, rel);
            var key = abs.toLowerCase();
            if (loaded[key]) {
                continue;
            }
            loaded[key] = true;

            try {
                require(abs);
            } catch (e2) {
                console.log('\n[FAIL] Failed to load: ' + rel);
                console.log('  ' + e2.message);
                if (e2.stack) {
                    console.log('  ' + e2.stack.split('\n').slice(1, 3).join('\n  '));
                }
                stats.totalFailed++;
            }
        }
    }

    printSummary(stats);

    if (stats.totalFailed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    run(process.argv[2] || 'all');
}

module.exports = {
    run: run
};
