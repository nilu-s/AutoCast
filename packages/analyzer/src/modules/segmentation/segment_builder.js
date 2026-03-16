/**
 * AutoCast – Segment Builder
 * 
 * Converts per-frame gate arrays into time-based segments.
 * Applies minimum segment length and gap merging (debouncing).
 */

'use strict';

/**
 * Default segment building parameters
 */
var SEGMENT_DEFAULTS = {
    /** Minimum segment duration in ms. Shorter segments are discarded. */
    minSegmentMs: 260,
    /** Minimum gap between segments in ms. Closer gaps are merged. */
    minGapMs: 180,
    /** Frame duration in ms (must match RMS calculator) */
    frameDurationMs: 10
};

/**
 * Convert a gate array (0/1 per frame) into time segments.
 * @param {Uint8Array} gateArray - 1=active per frame
 * @param {number} trackIndex - Track identifier
 * @param {object} [params] - Override defaults
 * @returns {Array<{start: number, end: number, trackIndex: number, durationMs: number}>}
 */
function buildSegments(gateArray, trackIndex, params) {
    params = mergeDefaults(params, SEGMENT_DEFAULTS);

    var frameDurSec = params.frameDurationMs / 1000;
    var rawSegments = [];
    var inSegment = false;
    var segStart = 0;

    // --- 1. Extract raw segments from gate array ---
    for (var i = 0; i < gateArray.length; i++) {
        if (gateArray[i] && !inSegment) {
            segStart = i;
            inSegment = true;
        } else if (!gateArray[i] && inSegment) {
            rawSegments.push({
                startFrame: segStart,
                endFrame: i,
                start: segStart * frameDurSec,
                end: i * frameDurSec,
                trackIndex: trackIndex
            });
            inSegment = false;
        }
    }

    // Close final segment if still open
    if (inSegment) {
        rawSegments.push({
            startFrame: segStart,
            endFrame: gateArray.length,
            start: segStart * frameDurSec,
            end: gateArray.length * frameDurSec,
            trackIndex: trackIndex
        });
    }

    // --- 2. Merge close gaps (debounce) ---
    var minGapSec = params.minGapMs / 1000;
    var merged = mergeCloseSegments(rawSegments, minGapSec);

    // --- 3. Remove segments shorter than minimum ---
    var minSegSec = params.minSegmentMs / 1000;
    var filtered = [];
    for (var j = 0; j < merged.length; j++) {
        var dur = merged[j].end - merged[j].start;
        if (dur >= minSegSec) {
            merged[j].durationMs = Math.round(dur * 1000);
            filtered.push(merged[j]);
        }
    }

    return filtered;
}

/**
 * Merge segments that are separated by less than minGapSec.
 */
function mergeCloseSegments(segments, minGapSec) {
    if (segments.length < 2) return segments;

    var result = [segments[0]];

    for (var i = 1; i < segments.length; i++) {
        var prev = result[result.length - 1];
        var curr = segments[i];
        var gap = curr.start - prev.end;

        if (gap < minGapSec) {
            // Merge: extend prev to cover curr
            prev.end = curr.end;
            prev.endFrame = curr.endFrame;
        } else {
            result.push(curr);
        }
    }

    return result;
}

/**
 * Compute total active time and percentage from segments.
 * @param {Array} segments 
 * @param {number} totalDurationSec 
 * @returns {{ totalActiveSec: number, activePercent: number, segmentCount: number }}
 */
function computeStats(segments, totalDurationSec) {
    var totalActive = 0;
    for (var i = 0; i < segments.length; i++) {
        totalActive += segments[i].end - segments[i].start;
    }
    return {
        totalActiveSec: Math.round(totalActive * 100) / 100,
        activePercent: totalDurationSec > 0 ? Math.round((totalActive / totalDurationSec) * 100) : 0,
        segmentCount: segments.length
    };
}

function mergeDefaults(userParams, defaults) {
    var result = {};
    for (var key in defaults) {
        if (defaults.hasOwnProperty(key)) {
            result[key] = (userParams && userParams[key] !== undefined) ? userParams[key] : defaults[key];
        }
    }
    return result;
}

module.exports = {
    buildSegments: buildSegments,
    computeStats: computeStats,
    SEGMENT_DEFAULTS: SEGMENT_DEFAULTS
};
