'use strict';

/**
 * Loudness Latch Module
 * 
 * Implements a state-machine-based loudness gate that opens when loudness exceeds
 * a threshold and stays open based on cumulative activity within a sliding window.
 * 
 * States:
 * - CLOSED: Gate is closed, no speech detected
 * - OPEN_CANDIDATE: Potential speech detected, waiting for min duration
 * - LATCHED_OPEN: Gate is open, speech confirmed
 */

var State = {
    CLOSED: 0,
    OPEN_CANDIDATE: 1,
    LATCHED_OPEN: 2
};

/**
 * Apply loudness latch to VAD results
 * @param {Array} vadResults - Frame-wise VAD results (0/1)
 * @param {Array} rmsProfiles - Per-frame RMS values in dB
 * @param {Object} params - Configuration parameters
 * @returns {Array} - Modified VAD results
 */
function applyLoudnessLatch(vadResults, rmsProfiles, params) {
    if (!params.enableLoudnessLatch) {
        return vadResults;
    }

    // Frame duration in ms (default 20ms)
    var frameDurationMs = params.frameDurationMs || 20;
    
    // Calculate number of frames for timing parameters
    var openMinFrames = Math.ceil(params.loudnessLatchOpenMinDurationMs / frameDurationMs);
    var closeConfirmFrames = Math.ceil(params.loudnessLatchCloseConfirmMs / frameDurationMs);
    var windowFrames = Math.ceil(params.loudnessLatchWindowMs / frameDurationMs);
    
    // Result array
    var result = new Array(vadResults.length);
    
    // State machine variables
    var currentState = State.CLOSED;
    var openCandidateStart = -1;
    var closeConfirmStart = -1;
    
    // Window tracking for cumulative activity (Phase 22)
    var windowActivity = []; // Array of frame indices where gate was open
    var windowStartIdx = 0; // Start index of current sliding window
    
    // Process each frame
    for (var i = 0; i < vadResults.length; i++) {
        var rmsDb = rmsProfiles[i] !== undefined ? rmsProfiles[i] : -100;
        var currentTimeMs = i * frameDurationMs;
        
        // State machine implementation
        switch (currentState) {
            case State.CLOSED:
                // Check if we should transition to OPEN_CANDIDATE
                if (rmsDb >= params.loudnessLatchOpenThresholdDb) {
                    currentState = State.OPEN_CANDIDATE;
                    openCandidateStart = i;
                }
                result[i] = 0; // Gate closed
                break;
                
            case State.OPEN_CANDIDATE:
                // Check if loudness drops below keep threshold (cancel candidate)
                // Use keepThresholdDb for hysteresis - once candidate, can drop to keep level
                if (rmsDb < params.loudnessLatchKeepThresholdDb) {
                    currentState = State.CLOSED;
                    openCandidateStart = -1;
                    result[i] = 0;
                } else {
                    // Check if min duration reached (Phase 21: threshold logic)
                    var candidateDuration = (i - openCandidateStart + 1) * frameDurationMs;
                    if (candidateDuration >= params.loudnessLatchOpenMinDurationMs) {
                        currentState = State.LATCHED_OPEN;
                        openCandidateStart = -1;
                    }
                    result[i] = 0; // Still candidate, gate closed
                }
                break;
                
            case State.LATCHED_OPEN:
                // Check if we should start close confirmation (Phase 21: threshold logic)
                // Use keepThresholdDb (lower than open) for hysteresis
                if (rmsDb < params.loudnessLatchKeepThresholdDb) {
                    if (closeConfirmStart === -1) {
                        closeConfirmStart = i;
                    }
                    // Check if close confirmation time reached (Phase 23)
                    var closeDuration = (i - closeConfirmStart + 1) * frameDurationMs;
                    if (closeDuration >= params.loudnessLatchCloseConfirmMs) {
                        // Phase 22: Check window coverage before closing
                        // Calculate cumulative active time in sliding window
                        var windowStartTime = currentTimeMs - params.loudnessLatchWindowMs;
                        var cumulativeActiveMs = 0;
                        var framesInWindow = 0;
                        
                        // Count active frames within the sliding window
                        for (var j = 0; j < windowActivity.length; j++) {
                            var activeTime = windowActivity[j] * frameDurationMs;
                            if (activeTime >= windowStartTime) {
                                cumulativeActiveMs += frameDurationMs;
                                framesInWindow++;
                            }
                        }
                        
                        // Calculate coverage percentage
                        var coveragePercent = (cumulativeActiveMs / params.loudnessLatchWindowMs) * 100;
                        
                        // Only close if coverage is below minimum OR cumulative active time is below minimum
                        if (coveragePercent < params.loudnessLatchMinCoveragePercent ||
                            cumulativeActiveMs < params.loudnessLatchMinCumulativeActiveMs) {
                            currentState = State.CLOSED;
                            closeConfirmStart = -1;
                            result[i] = 0;
                        } else {
                            // Keep gate open - sufficient activity in window
                            result[i] = 1;
                            windowActivity.push(i);
                        }
                    } else {
                        // Still in confirmation period, keep gate open
                        result[i] = 1;
                        windowActivity.push(i);
                    }
                } else {
                    // Loudness above keep threshold, reset close confirmation
                    closeConfirmStart = -1;
                    result[i] = 1;
                    windowActivity.push(i);
                }
                
                // Clean up old window activity entries (sliding window)
                var windowCutoff = i - windowFrames;
                while (windowActivity.length > 0 && windowActivity[0] <= windowCutoff) {
                    windowActivity.shift();
                }
                break;
        }
    }
    
    return result;
}

module.exports = {
    applyLoudnessLatch: applyLoudnessLatch,
    State: State
};