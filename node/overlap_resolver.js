/**
 * AutoCast – Overlap Resolver
 * 
 * Resolves conflicts when multiple tracks are active simultaneously.
 * Supports policies: 'dominant_wins' and 'all_active'.
 */

'use strict';

var rmsCalc = require('./rms_calculator');

/**
 * Overlap resolution policies
 */
var OVERLAP_POLICIES = {
    /** Only the loudest track stays active; others are ducked */
    DOMINANT_WINS: 'dominant_wins',
    /** All tracks above threshold stay active */
    ALL_ACTIVE: 'all_active'
};

/**
 * Resolve overlaps between tracks and generate final ducking map.
 * 
 * @param {Array<Array<{start, end, trackIndex}>>} allSegments - Segments per track
 * @param {Array<Float64Array>} rmsProfiles - RMS arrays per track
 * @param {object} params
 * @param {string} params.policy - 'dominant_wins' or 'all_active'
 * @param {number} params.frameDurationMs - Frame duration in ms
 * @param {number} params.overlapMarginDb - For dominant_wins: if a track is within this many dB of the dominant, keep it active too
 * @returns {Array<Array<{start, end, trackIndex, state}>>} Final segments per track with state: 'active'|'ducked'|'silence'
 */
function resolveOverlaps(allSegments, rmsProfiles, params) {
    var policy = (params && params.policy) || OVERLAP_POLICIES.DOMINANT_WINS;
    var frameDurationMs = (params && params.frameDurationMs) || 10;
    var overlapMarginDb = (params && params.overlapMarginDb) || 6;
    var frameDurSec = frameDurationMs / 1000;
    var trackCount = allSegments.length;

    // --- 1. Build unified timeline of all events ---
    var allEvents = [];
    for (var t = 0; t < trackCount; t++) {
        for (var s = 0; s < allSegments[t].length; s++) {
            var seg = allSegments[t][s];
            allEvents.push({ time: seg.start, type: 'start', trackIndex: t, segIndex: s });
            allEvents.push({ time: seg.end, type: 'end', trackIndex: t, segIndex: s });
        }
    }
    allEvents.sort(function (a, b) {
        return a.time - b.time || (a.type === 'start' ? -1 : 1);
    });

    // --- 2. Scan timeline and resolve overlaps ---
    // For each segment in each track, determine if it should be active or ducked
    var segmentStates = [];
    for (var t = 0; t < trackCount; t++) {
        segmentStates[t] = [];
        for (var s = 0; s < allSegments[t].length; s++) {
            segmentStates[t][s] = 'active'; // Default: active
        }
    }

    if (policy === OVERLAP_POLICIES.ALL_ACTIVE) {
        // All active: just return segments as-is with 'active' state
        return formatOutput(allSegments, segmentStates);
    }

    // --- Dominant wins policy ---
    // For overlapping regions, compare RMS and duck the quieter track(s)

    // Build active set at each event boundary
    var activeSet = {}; // trackIndex -> segIndex

    for (var e = 0; e < allEvents.length; e++) {
        var evt = allEvents[e];

        if (evt.type === 'start') {
            activeSet[evt.trackIndex] = evt.segIndex;
        } else {
            delete activeSet[evt.trackIndex];
        }

        // Check for overlaps in current active set
        var activeTracks = Object.keys(activeSet);
        if (activeTracks.length > 1) {
            // Multiple tracks active – determine dominant
            // Get average RMS in the overlap region
            var nextTime = (e + 1 < allEvents.length) ? allEvents[e + 1].time : evt.time + 0.1;
            var overlapStart = evt.time;
            var overlapEnd = nextTime;

            var rmsValues = {};
            for (var a = 0; a < activeTracks.length; a++) {
                var tIdx = parseInt(activeTracks[a]);
                rmsValues[tIdx] = getAverageRMS(rmsProfiles[tIdx], overlapStart, overlapEnd, frameDurSec);
            }

            // Find dominant track (highest RMS)
            var dominantTrack = -1;
            var maxRms = -1;
            for (var tIdx in rmsValues) {
                if (rmsValues[tIdx] > maxRms) {
                    maxRms = rmsValues[tIdx];
                    dominantTrack = parseInt(tIdx);
                }
            }

            // Duck tracks that are significantly quieter than dominant
            var dominantDb = rmsCalc.linearToDb(maxRms);
            for (var tIdx in rmsValues) {
                var tIdxInt = parseInt(tIdx);
                if (tIdxInt === dominantTrack) continue;

                var trackDb = rmsCalc.linearToDb(rmsValues[tIdxInt]);
                if (dominantDb - trackDb > overlapMarginDb) {
                    // This track is quieter by more than the margin - duck it
                    segmentStates[tIdxInt][activeSet[tIdxInt]] = 'ducked';
                }
                // If within margin: both stay 'active' (listener can hear both)
            }
        }
    }

    return formatOutput(allSegments, segmentStates);
}

/**
 * Generate the final ducking map for keyframe generation.
 * Creates a per-track array of regions with associated gain values.
 * 
 * @param {Array<Array<{start, end, trackIndex}>>} allSegments 
 * @param {number} totalDurationSec - Total timeline duration
 * @param {Array<Array<string>>} segmentStates - 'active'|'ducked' per segment
 * @param {object} params
 * @param {number} params.duckingLevelDb - Gain for ducked regions (e.g. -24)
 * @param {number} params.rampMs - Crossfade ramp duration in ms
 * @returns {Array<Array<{time: number, gainDb: number}>>} Keyframe data per track
 */
function generateDuckingMap(allSegments, totalDurationSec, segmentStates, params) {
    var duckingLevelDb = (params && params.duckingLevelDb !== undefined) ? params.duckingLevelDb : -24;
    var rampMs = (params && params.rampMs !== undefined) ? params.rampMs : 30;
    var rampSec = rampMs / 1000;
    var trackCount = allSegments.length;

    var keyframesPerTrack = [];

    for (var t = 0; t < trackCount; t++) {
        var keyframes = [];
        var segments = allSegments[t];
        var states = segmentStates ? segmentStates[t] : null;

        if (segments.length === 0) {
            // No activity on this track – duck everything
            keyframes.push({ time: 0, gainDb: duckingLevelDb });
            keyframes.push({ time: totalDurationSec, gainDb: duckingLevelDb });
            keyframesPerTrack.push(keyframes);
            continue;
        }

        // Start ducked
        if (segments[0].start > rampSec) {
            keyframes.push({ time: 0, gainDb: duckingLevelDb });
        }

        for (var s = 0; s < segments.length; s++) {
            var seg = segments[s];
            var isActive = !states || states[s] === 'active';
            var targetDb = isActive ? 0 : duckingLevelDb;

            if (isActive) {
                // Ramp up before segment start
                var rampUpStart = Math.max(0, seg.start - rampSec);
                keyframes.push({ time: rampUpStart, gainDb: duckingLevelDb });
                keyframes.push({ time: seg.start, gainDb: 0 });

                // Ramp down after segment end
                keyframes.push({ time: seg.end, gainDb: 0 });
                var rampDownEnd = Math.min(totalDurationSec, seg.end + rampSec);
                keyframes.push({ time: rampDownEnd, gainDb: duckingLevelDb });
            } else {
                // Ducked segment – stays at ducking level
                keyframes.push({ time: seg.start, gainDb: duckingLevelDb });
                keyframes.push({ time: seg.end, gainDb: duckingLevelDb });
            }
        }

        // End ducked (if last segment doesn't reach the end)
        var lastSeg = segments[segments.length - 1];
        if (lastSeg.end + rampSec < totalDurationSec) {
            keyframes.push({ time: totalDurationSec, gainDb: duckingLevelDb });
        }

        // Remove duplicate timestamps (keep last)
        keyframes = deduplicateKeyframes(keyframes);

        keyframesPerTrack.push(keyframes);
    }

    return keyframesPerTrack;
}

/**
 * Get average RMS in a time region.
 */
function getAverageRMS(rmsArray, startSec, endSec, frameDurSec) {
    var startFrame = Math.floor(startSec / frameDurSec);
    var endFrame = Math.min(Math.ceil(endSec / frameDurSec), rmsArray.length);

    if (startFrame >= endFrame) return 0;

    var sum = 0;
    for (var i = startFrame; i < endFrame; i++) {
        sum += rmsArray[i];
    }
    return sum / (endFrame - startFrame);
}

/**
 * Format the overlap resolution output.
 */
function formatOutput(allSegments, segmentStates) {
    var result = [];
    for (var t = 0; t < allSegments.length; t++) {
        var trackResult = [];
        for (var s = 0; s < allSegments[t].length; s++) {
            trackResult.push({
                start: allSegments[t][s].start,
                end: allSegments[t][s].end,
                trackIndex: t,
                state: segmentStates[t][s]
            });
        }
        result.push(trackResult);
    }
    return result;
}

/**
 * Remove keyframes with duplicate timestamps (keep the last one).
 */
function deduplicateKeyframes(keyframes) {
    if (keyframes.length < 2) return keyframes;

    var result = [keyframes[0]];
    for (var i = 1; i < keyframes.length; i++) {
        if (Math.abs(keyframes[i].time - result[result.length - 1].time) < 0.0001) {
            // Same time: replace previous
            result[result.length - 1] = keyframes[i];
        } else {
            result.push(keyframes[i]);
        }
    }
    return result;
}

module.exports = {
    resolveOverlaps: resolveOverlaps,
    generateDuckingMap: generateDuckingMap,
    OVERLAP_POLICIES: OVERLAP_POLICIES
};
