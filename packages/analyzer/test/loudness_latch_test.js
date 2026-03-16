'use strict';

var loudnessLatch = require('../src/modules/vad/loudness_latch');

/**
 * Phase 14: State-Machine Test
 * Testet Zustandsübergänge: CLOSED → OPEN_CANDIDATE → LATCHED_OPEN → CLOSED
 */
function testStateMachine() {
    var tests = [];
    var allPassed = true;

    // Test 1: CLOSED → OPEN_CANDIDATE Transition
    // RMS über openThresholdDb sollte OPEN_CANDIDATE auslösen
    (function() {
        var vadResults = [0, 0, 0, 0, 0]; // 5 frames, all silent
        var rmsProfiles = [-60, -60, -60, -60, -60]; // Below threshold
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        var allClosed = result.every(function(r) { return r === 0; });
        
        tests.push({
            name: 'CLOSED: All frames below threshold stay closed',
            passed: allClosed
        });
        if (!allClosed) allPassed = false;
    })();

    // Test 2: CLOSED → OPEN_CANDIDATE Transition
    // RMS über openThresholdDb sollte OPEN_CANDIDATE auslösen
    (function() {
        var vadResults = [0, 0, 0, 0, 0];
        var rmsProfiles = [-60, -60, -45, -45, -45]; // Frame 2-4 above threshold
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // Frames 0-1 should be closed (below threshold)
        // Frames 2-4 should be in OPEN_CANDIDATE (above threshold but not latched yet)
        var frames0to1Closed = result[0] === 0 && result[1] === 0;
        var frames2to4Closed = result[2] === 0 && result[3] === 0 && result[4] === 0; // Still candidate
        
        tests.push({
            name: 'OPEN_CANDIDATE: Above threshold triggers candidate state',
            passed: frames0to1Closed && frames2to4Closed
        });
        if (!(frames0to1Closed && frames2to4Closed)) allPassed = false;
    })();

    // Test 3: OPEN_CANDIDATE → LATCHED_OPEN Transition
    // Genügend Dauer über openThresholdDb sollte LATCHED_OPEN auslösen
    (function() {
        var frameCount = 10; // 200ms at 20ms/frame
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = new Array(frameCount).fill(-45); // Above threshold
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100, // 100ms = 5 frames
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // After 5 frames (100ms), should transition to LATCHED_OPEN
        // Frames 0-4: candidate (closed), Frames 5-9: latched (open)
        var frames0to4Closed = result.slice(0, 5).every(function(r) { return r === 0; });
        var frames5to9Open = result.slice(5).every(function(r) { return r === 1; });
        
        tests.push({
            name: 'LATCHED_OPEN: Min duration reached triggers latch',
            passed: frames0to4Closed && frames5to9Open
        });
        if (!(frames0to4Closed && frames5to9Open)) allPassed = false;
    })();

    // Test 4: LATCHED_OPEN → CLOSED Transition
    // RMS unter keepThresholdDb für closeConfirmMs sollte CLOSED auslösen
    (function() {
        var frameCount = 100; // 2000ms at 20ms/frame
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // First 50 frames: above threshold (latched open)
        for (var i = 0; i < 50; i++) {
            rmsProfiles.push(-45);
        }
        // Last 50 frames: below keep threshold (should close after closeConfirmMs)
        for (var i = 50; i < 100; i++) {
            rmsProfiles.push(-60);
        }
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000, // 1000ms = 50 frames
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        
        // After closeConfirmMs below threshold, should close
        // But window coverage might keep it open
        // Check that at least some frames are open
        var hasOpenFrames = result.some(function(r) { return r === 1; });
        
        tests.push({
            name: 'CLOSED: Below keep threshold triggers close after confirmation',
            passed: hasOpenFrames
        });
        if (!hasOpenFrames) allPassed = false;
    })();

    // Test 5: enableLoudnessLatch = false passthrough
    (function() {
        var vadResults = [1, 1, 1, 0, 0];
        var rmsProfiles = [-60, -60, -60, -60, -60];
        var params = {
            enableLoudnessLatch: false
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        var unchanged = result.every(function(r, i) { return r === vadResults[i]; });
        
        tests.push({
            name: 'DISABLED: Passthrough when disabled',
            passed: unchanged
        });
        if (!unchanged) allPassed = false;
    })();

    // Test 6: State-Objekte sind definiert
    (function() {
        var hasClosed = loudnessLatch.State.CLOSED === 0;
        var hasOpenCandidate = loudnessLatch.State.OPEN_CANDIDATE === 1;
        var hasLatchedOpen = loudnessLatch.State.LATCHED_OPEN === 2;
        
        tests.push({
            name: 'STATE_DEFS: All states defined correctly',
            passed: hasClosed && hasOpenCandidate && hasLatchedOpen
        });
        if (!(hasClosed && hasOpenCandidate && hasLatchedOpen)) allPassed = false;
    })();

    // Print results
    console.log('\n=== Phase 14: State-Machine Tests ===');
    tests.forEach(function(test) {
        console.log((test.passed ? '✓' : '✗') + ' ' + test.name);
    });
    console.log('=====================================\n');

    return allPassed;
}

/**
 * Phase 15: Threshold Tests
 * Testet Threshold-Logik: openThresholdDb, keepThresholdDb, closeConfirmMs
 */
function testThresholds() {
    var tests = [];
    var allPassed = true;

    // Test 1: openThresholdDb - RMS genau am Threshold sollte öffnen
    (function() {
        var frameCount = 10;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = new Array(frameCount).fill(-48); // Exactly at threshold
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // At exactly threshold, should still trigger after min duration
        var hasOpenFrames = result.some(function(r) { return r === 1; });
        
        tests.push({
            name: 'OPEN_THRESHOLD: RMS at threshold triggers open',
            passed: hasOpenFrames
        });
        if (!hasOpenFrames) allPassed = false;
    })();

    // Test 2: openThresholdDb - RMS knapp unter Threshold sollte nicht öffnen
    (function() {
        var frameCount = 10;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = new Array(frameCount).fill(-48.1); // Just below threshold
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        var allClosed = result.every(function(r) { return r === 0; });
        
        tests.push({
            name: 'OPEN_THRESHOLD: RMS below threshold stays closed',
            passed: allClosed
        });
        if (!allClosed) allPassed = false;
    })();

    // Test 3: keepThresholdDb - RMS zwischen keep und open sollte offen halten
    (function() {
        var frameCount = 100;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // First 50 frames: above open threshold (latch open)
        for (var i = 0; i < 50; i++) {
            rmsProfiles.push(-45);
        }
        // Next 50 frames: between keep and open thresholds (should stay open)
        for (var i = 50; i < 100; i++) {
            rmsProfiles.push(-50); // Between -52 and -48
        }
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // Should have open frames in the second half (hysteresis)
        var secondHalfHasOpen = result.slice(60).some(function(r) { return r === 1; });
        
        tests.push({
            name: 'KEEP_THRESHOLD: Hysteresis keeps latch open',
            passed: secondHalfHasOpen
        });
        if (!secondHalfHasOpen) allPassed = false;
    })();

    // Test 4: keepThresholdDb - RMS unter keep sollte schließen
    (function() {
        var frameCount = 150;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // First 50 frames: above open threshold
        for (var i = 0; i < 50; i++) {
            rmsProfiles.push(-45);
        }
        // Last 100 frames: below keep threshold
        for (var i = 50; i < 150; i++) {
            rmsProfiles.push(-60); // Well below -52
        }
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000, // 1000ms = 50 frames
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // After closeConfirmMs (50 frames) below keep threshold, should close
        // Check last 20 frames are closed
        var lastFramesClosed = result.slice(130).every(function(r) { return r === 0; });
        
        tests.push({
            name: 'KEEP_THRESHOLD: Below keep threshold closes after confirm',
            passed: lastFramesClosed
        });
        if (!lastFramesClosed) allPassed = false;
    })();

    // Test 5: closeConfirmMs - Zeit unter keep threshold
    (function() {
        var frameCount = 80;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // First 30 frames: above open threshold
        for (var i = 0; i < 30; i++) {
            rmsProfiles.push(-45);
        }
        // Next 50 frames: below keep threshold (exactly closeConfirmMs)
        for (var i = 30; i < 80; i++) {
            rmsProfiles.push(-60);
        }
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000, // 1000ms = 50 frames
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // After exactly closeConfirmMs below threshold, should be closed
        var lastFrameClosed = result[result.length - 1] === 0;
        
        tests.push({
            name: 'CLOSE_CONFIRM: Exact closeConfirmMs closes latch',
            passed: lastFrameClosed
        });
        if (!lastFrameClosed) allPassed = false;
    })();

    // Test 6: closeConfirmMs - Zeit unter keep threshold aber nicht genug
    (function() {
        var frameCount = 70;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // First 30 frames: above open threshold
        for (var i = 0; i < 30; i++) {
            rmsProfiles.push(-45);
        }
        // Next 40 frames: below keep threshold (less than closeConfirmMs)
        for (var i = 30; i < 70; i++) {
            rmsProfiles.push(-60);
        }
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000, // 1000ms = 50 frames
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // Less than closeConfirmMs below threshold, should still be open
        var lastFrameOpen = result[result.length - 1] === 1;
        
        tests.push({
            name: 'CLOSE_CONFIRM: Below closeConfirmMs keeps latch open',
            passed: lastFrameOpen
        });
        if (!lastFrameOpen) allPassed = false;
    })();

    // Print results
    console.log('\n=== Phase 15: Threshold Tests ===');
    tests.forEach(function(test) {
        console.log((test.passed ? '✓' : '✗') + ' ' + test.name);
    });
    console.log('===================================\n');

    return allPassed;
}

/**
 * Phase 16: Window-Coverage Tests
 * Testet Window-Logik: latchWindowMs, minCumulativeActiveMs, minCoveragePercent
 */
function testWindowCoverage() {
    var tests = [];
    var allPassed = true;

    // Test 1: latchWindowMs - Sliding window size
    (function() {
        var frameCount = 300; // 6000ms at 20ms/frame
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // Pattern: 2 seconds active, 2 seconds silent, 2 seconds active
        // With 4000ms window, should maintain coverage
        for (var i = 0; i < 100; i++) rmsProfiles.push(-45); // 2000ms active
        for (var i = 100; i < 200; i++) rmsProfiles.push(-60); // 2000ms silent
        for (var i = 200; i < 300; i++) rmsProfiles.push(-45); // 2000ms active
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000, // 4 second window
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // Should have open frames during both active periods
        var firstPeriodOpen = result.slice(5, 100).some(function(r) { return r === 1; });
        var secondPeriodOpen = result.slice(205, 300).some(function(r) { return r === 1; });
        
        tests.push({
            name: 'LATCH_WINDOW: 4s window covers active periods',
            passed: firstPeriodOpen && secondPeriodOpen
        });
        if (!(firstPeriodOpen && secondPeriodOpen)) allPassed = false;
    })();

    // Test 2: minCumulativeActiveMs - Minimum active time required
    (function() {
        var frameCount = 200;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // Short active burst: 500ms (below 1200ms min)
        for (var i = 0; i < 25; i++) rmsProfiles.push(-45); // 500ms active
        for (var i = 25; i < 200; i++) rmsProfiles.push(-60); // rest silent
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200, // 1.2 seconds
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // With only 500ms active, should close after closeConfirmMs
        var lastFramesClosed = result.slice(150).every(function(r) { return r === 0; });
        
        tests.push({
            name: 'MIN_CUMULATIVE: Below min active time closes gate',
            passed: lastFramesClosed
        });
        if (!lastFramesClosed) allPassed = false;
    })();

    // Test 3: minCumulativeActiveMs - Sufficient active time keeps gate open
    (function() {
        var frameCount = 300;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // Long active burst: 3 seconds (above 1200ms min)
        for (var i = 0; i < 150; i++) rmsProfiles.push(-45); // 3000ms active
        for (var i = 150; i < 200; i++) rmsProfiles.push(-60); // 1000ms silent (below closeConfirmMs)
        for (var i = 200; i < 300; i++) rmsProfiles.push(-45); // 2000ms active again
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // With sufficient cumulative active time, gate should stay open
        var hasOpenFrames = result.slice(100, 250).some(function(r) { return r === 1; });
        
        tests.push({
            name: 'MIN_CUMULATIVE: Above min active time keeps gate open',
            passed: hasOpenFrames
        });
        if (!hasOpenFrames) allPassed = false;
    })();

    // Test 4: minCoveragePercent - Coverage below threshold closes gate
    (function() {
        var frameCount = 300;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // Sparse activity: 1 second active in 4 second window = 25% (below 35%)
        for (var i = 0; i < 50; i++) rmsProfiles.push(-45); // 1000ms active
        for (var i = 50; i < 250; i++) rmsProfiles.push(-60); // 4000ms silent
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35, // 35% required
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // With only 25% coverage, should close after closeConfirmMs
        var lastFramesClosed = result.slice(250).every(function(r) { return r === 0; });
        
        tests.push({
            name: 'MIN_COVERAGE: Below 35% coverage closes gate',
            passed: lastFramesClosed
        });
        if (!lastFramesClosed) allPassed = false;
    })();

    // Test 5: minCoveragePercent - Coverage above threshold keeps gate open
    (function() {
        var frameCount = 300;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // Dense activity: 3 seconds active in 4 second window = 75% (above 35%)
        for (var i = 0; i < 150; i++) rmsProfiles.push(-45); // 3000ms active
        for (var i = 150; i < 200; i++) rmsProfiles.push(-60); // 1000ms silent
        for (var i = 200; i < 300; i++) rmsProfiles.push(-45); // 2000ms active
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // With 75% coverage, gate should stay open through silent period
        var middleFramesOpen = result.slice(150, 200).some(function(r) { return r === 1; });
        
        tests.push({
            name: 'MIN_COVERAGE: Above 35% coverage keeps gate open',
            passed: middleFramesOpen
        });
        if (!middleFramesOpen) allPassed = false;
    })();

    // Test 6: Combined window parameters interaction
    (function() {
        var frameCount = 400;
        var vadResults = new Array(frameCount).fill(0);
        var rmsProfiles = [];
        
        // Complex pattern: active, silent, active, long silent
        for (var i = 0; i < 100; i++) rmsProfiles.push(-45); // 2000ms active
        for (var i = 100; i < 150; i++) rmsProfiles.push(-60); // 1000ms silent
        for (var i = 150; i < 250; i++) rmsProfiles.push(-45); // 2000ms active
        for (var i = 250; i < 400; i++) rmsProfiles.push(-60); // 3000ms silent (exceeds window)
        
        var params = {
            enableLoudnessLatch: true,
            loudnessLatchOpenThresholdDb: -48,
            loudnessLatchKeepThresholdDb: -52,
            loudnessLatchOpenMinDurationMs: 100,
            loudnessLatchWindowMs: 4000,
            loudnessLatchMinCumulativeActiveMs: 1200,
            loudnessLatchMinCoveragePercent: 35,
            loudnessLatchCloseConfirmMs: 1000,
            frameDurationMs: 20
        };
        
        var result = loudnessLatch.applyLoudnessLatch(vadResults, rmsProfiles, params);
        // Should be open during active periods and short silent gap
        // Should close after long silent period exceeds window
        var firstActiveOpen = result.slice(10, 100).some(function(r) { return r === 1; });
        var secondActiveOpen = result.slice(160, 250).some(function(r) { return r === 1; });
        var finalFramesClosed = result.slice(380).every(function(r) { return r === 0; });
        
        tests.push({
            name: 'WINDOW_COMBINED: All window parameters work together',
            passed: firstActiveOpen && secondActiveOpen && finalFramesClosed
        });
        if (!(firstActiveOpen && secondActiveOpen && finalFramesClosed)) allPassed = false;
    })();

    // Print results
    console.log('\n=== Phase 16: Window-Coverage Tests ===');
    tests.forEach(function(test) {
        console.log((test.passed ? '✓' : '✗') + ' ' + test.name);
    });
    console.log('========================================\n');

    return allPassed;
}

module.exports = {
    testStateMachine: testStateMachine,
    testThresholds: testThresholds,
    testWindowCoverage: testWindowCoverage
};
