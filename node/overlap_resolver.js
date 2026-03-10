/**
 * AutoCast – Overlap Resolver
 *
 * Resolves conflicts when multiple tracks are active simultaneously.
 * Supports:
 *   - 'dominant_wins'
 *   - 'all_active'
 *   - 'bleed_safe'
 */

'use strict';

var rmsCalc = require('./rms_calculator');

var OVERLAP_POLICIES = {
    DOMINANT_WINS: 'dominant_wins',
    ALL_ACTIVE: 'all_active',
    BLEED_SAFE: 'bleed_safe',
    ALWAYS_ACTIVE_WITH_GAPS: 'always_active_with_gaps'
};

/**
 * Resolve overlaps between tracks and generate final track states.
 *
 * @param {Array<Array>} allSegments
 * @param {Array<Float32Array>} rmsProfiles
 * @param {object} params
 * @param {string} params.policy
 * @param {number} params.frameDurationMs
 * @param {number} params.overlapMarginDb
 * @param {number} params.bleedMarginDb
 * @returns {Array<Array>}
 */
function resolveOverlaps(allSegments, rmsProfiles, params) {
    var policy = (params && params.policy) || OVERLAP_POLICIES.BLEED_SAFE;
    var frameDurationMs = (params && params.frameDurationMs) || 10;
    var overlapMarginDb = (params && params.overlapMarginDb !== undefined) ? params.overlapMarginDb : 6;
    var bleedMarginDb = (params && params.bleedMarginDb !== undefined) ? params.bleedMarginDb : 8;
    var frameDurSec = frameDurationMs / 1000;
    var trackCount = allSegments.length;

    var segmentStates = [];
    var segmentScores = [];
    var allEvents = [];
    var t, s;

    for (t = 0; t < trackCount; t++) {
        segmentStates[t] = [];
        segmentScores[t] = [];
        for (s = 0; s < allSegments[t].length; s++) {
            segmentStates[t][s] = 'active';
            segmentScores[t][s] = 0;
            allEvents.push({ time: allSegments[t][s].start, type: 'start', trackIndex: t, segIndex: s });
            allEvents.push({ time: allSegments[t][s].end, type: 'end', trackIndex: t, segIndex: s });
        }
    }

    allEvents.sort(function (a, b) {
        if (Math.abs(a.time - b.time) > 0.0000001) {
            return a.time - b.time;
        }
        return a.type === 'start' ? -1 : 1;
    });

    if (policy === OVERLAP_POLICIES.ALL_ACTIVE || policy === OVERLAP_POLICIES.ALWAYS_ACTIVE_WITH_GAPS) {
        var formatted = formatOutput(allSegments, segmentStates);
        if (policy === OVERLAP_POLICIES.ALWAYS_ACTIVE_WITH_GAPS) {
            return fillGaps(formatted, trackCount);
        }
        return formatted;
    }

    var activeSet = {};

    for (var e = 0; e < allEvents.length; e++) {
        var evt = allEvents[e];

        if (evt.type === 'start') {
            activeSet[evt.trackIndex] = evt.segIndex;
        } else {
            delete activeSet[evt.trackIndex];
        }

        if (e + 1 >= allEvents.length) {
            continue;
        }

        var regionStart = evt.time;
        var regionEnd = allEvents[e + 1].time;

        if (!(regionEnd > regionStart)) {
            continue;
        }

        var activeTracks = [];
        for (var key in activeSet) {
            if (activeSet.hasOwnProperty(key)) {
                activeTracks.push(parseInt(key, 10));
            }
        }

        if (activeTracks.length <= 1) {
            continue;
        }

        var energies = {};
        var dominantTrack = -1;
        var dominantEnergy = -1;

        for (var i = 0; i < activeTracks.length; i++) {
            t = activeTracks[i];
            energies[t] = getAverageRMS(rmsProfiles[t], regionStart, regionEnd, frameDurSec);

            if (energies[t] > dominantEnergy) {
                dominantEnergy = energies[t];
                dominantTrack = t;
            }
        }

        var dominantDb = rmsCalc.linearToDb(dominantEnergy);

        if (policy === OVERLAP_POLICIES.DOMINANT_WINS) {
            for (i = 0; i < activeTracks.length; i++) {
                t = activeTracks[i];
                if (t !== dominantTrack) {
                    segmentScores[t][activeSet[t]] += (regionEnd - regionStart);
                }
            }
            continue;
        }

        if (policy === OVERLAP_POLICIES.BLEED_SAFE) {
            for (i = 0; i < activeTracks.length; i++) {
                t = activeTracks[i];
                if (t === dominantTrack) {
                    continue;
                }

                var trackDb = rmsCalc.linearToDb(energies[t]);
                var dbDiff = dominantDb - trackDb;

                if (dbDiff > bleedMarginDb) {
                    segmentScores[t][activeSet[t]] += (regionEnd - regionStart);
                } else if (dbDiff > overlapMarginDb) {
                    segmentScores[t][activeSet[t]] += (regionEnd - regionStart) * 0.5;
                }
            }
        }
    }

    for (t = 0; t < trackCount; t++) {
        for (s = 0; s < allSegments[t].length; s++) {
            var segDur = Math.max(0, allSegments[t][s].end - allSegments[t][s].start);
            if (segDur <= 0) {
                segmentStates[t][s] = 'ducked';
                continue;
            }

            if (segmentScores[t][s] >= segDur * 0.5) {
                segmentStates[t][s] = 'ducked';
            } else {
                segmentStates[t][s] = 'active';
            }
        }
    }

    return formatOutput(allSegments, segmentStates);
}

/**
 * Generate the final ducking map for keyframe generation.
 * Accepts either:
 *   - resolved segments with seg.state
 *   - or raw segments + explicit segmentStates
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
            keyframes.push({ time: 0, gainDb: duckingLevelDb });
            keyframes.push({ time: totalDurationSec, gainDb: duckingLevelDb });
            keyframesPerTrack.push(keyframes);
            continue;
        }

        if (segments[0].start > rampSec) {
            keyframes.push({ time: 0, gainDb: duckingLevelDb });
        }

        for (var s = 0; s < segments.length; s++) {
            var seg = segments[s];
            var isActive;

            if (states) {
                isActive = states[s] === 'active';
            } else {
                isActive = seg.state === 'active';
            }

            if (isActive) {
                var rampUpStart = Math.max(0, seg.start - rampSec);
                keyframes.push({ time: rampUpStart, gainDb: duckingLevelDb });
                keyframes.push({ time: seg.start, gainDb: 0 });

                keyframes.push({ time: seg.end, gainDb: 0 });
                var rampDownEnd = Math.min(totalDurationSec, seg.end + rampSec);
                keyframes.push({ time: rampDownEnd, gainDb: duckingLevelDb });
            } else {
                keyframes.push({ time: seg.start, gainDb: duckingLevelDb });
                keyframes.push({ time: seg.end, gainDb: duckingLevelDb });
            }
        }

        var lastSeg = segments[segments.length - 1];
        if (lastSeg.end + rampSec < totalDurationSec) {
            keyframes.push({ time: totalDurationSec, gainDb: duckingLevelDb });
        }

        keyframes = deduplicateKeyframes(keyframes);
        keyframesPerTrack.push(keyframes);
    }

    return keyframesPerTrack;
}

/**
 * Get average RMS in a time region.
 */
function getAverageRMS(rmsArray, startSec, endSec, frameDurSec) {
    var startFrame = Math.max(0, Math.floor(startSec / frameDurSec));
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
            result[result.length - 1] = keyframes[i];
        } else {
            result.push(keyframes[i]);
        }
    }
    return result;
}

/**
 * Fill gaps where no track is active by assigning the gap to the last active track.
 */
function fillGaps(formattedSegments, trackCount) {
    var activeEvents = [];
    for (var t = 0; t < trackCount; t++) {
        for (var s = 0; s < formattedSegments[t].length; s++) {
            var seg = formattedSegments[t][s];
            if (seg.state === 'active') {
                activeEvents.push({ time: seg.start, type: 'start', trackIndex: t });
                activeEvents.push({ time: seg.end, type: 'end', trackIndex: t });
            }
        }
    }

    activeEvents.sort(function (a, b) {
        if (Math.abs(a.time - b.time) > 0.0000001) return a.time - b.time;
        return a.type === 'start' ? -1 : 1;
    });

    var activeCount = 0;
    var lastActiveTrack = 0;
    var gapStart = 0;
    var additionalSegments = [];
    for (var i = 0; i < trackCount; i++) additionalSegments[i] = [];

    for (var e = 0; e < activeEvents.length; e++) {
        var evt = activeEvents[e];

        if (activeCount === 0 && evt.time > gapStart + 0.001) {
            additionalSegments[lastActiveTrack].push({
                start: gapStart,
                end: evt.time,
                trackIndex: lastActiveTrack,
                state: 'active'
            });
        }

        if (evt.type === 'start') {
            activeCount++;
            lastActiveTrack = evt.trackIndex;
        } else {
            activeCount--;
            if (activeCount === 0) {
                gapStart = evt.time;
                lastActiveTrack = evt.trackIndex;
            }
        }
    }

    var result = [];
    for (var tr = 0; tr < trackCount; tr++) {
        var merged = formattedSegments[tr].concat(additionalSegments[tr]);
        merged.sort(function (a, b) { return a.start - b.start; });

        var cleanTrack = [];
        if (merged.length > 0) {
            var curr = merged[0];
            for (var m = 1; m < merged.length; m++) {
                var next = merged[m];
                if (next.state === curr.state && Math.abs(curr.end - next.start) < 0.001) {
                    curr.end = next.end;
                } else {
                    cleanTrack.push(curr);
                    curr = next;
                }
            }
            cleanTrack.push(curr);
        }
        result.push(cleanTrack);
    }
    return result;
}

module.exports = {
    resolveOverlaps: resolveOverlaps,
    generateDuckingMap: generateDuckingMap,
    OVERLAP_POLICIES: OVERLAP_POLICIES
};