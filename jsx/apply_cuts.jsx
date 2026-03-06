/**
 * AutoCast – Apply Cuts (ExtendScript)
 * 
 * Replaces volume ducking by physically chopping the audio clips
 * on the timeline, removing silence.
 */

function applyCuts(data) {
    var seq = app.project.activeSequence;
    if (!seq) return { error: 'No active sequence.' };

    var segmentsPerTrack = data.segments;
    var trackIndices = data.trackIndices;
    var ticksPerSecond = data.ticksPerSecond || 254016000000;
    var mode = data.mode || 'chop'; // 'chop' or 'mixed'
    var duckingLevelDb = data.duckingLevelDb !== undefined ? data.duckingLevelDb : -24;

    var totalClipsCreated = 0;

    app.enableQE(); // Enhance performance

    for (var t = 0; t < trackIndices.length; t++) {
        var trackIdx = trackIndices[t];
        var trackSegments = segmentsPerTrack[t];
        var track = seq.audioTracks[trackIdx];
        if (!track) continue;

        // 1. Gather original clips data
        var originalClips = [];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (clip.projectItem) {
                originalClips.push({
                    projectItem: clip.projectItem,
                    startSec: parseFloat(clip.start.ticks) / ticksPerSecond,
                    endSec: parseFloat(clip.end.ticks) / ticksPerSecond,
                    inPointSec: parseFloat(clip.inPoint.ticks) / ticksPerSecond
                });
            }
        }

        // 2. Remove all existing clips from track
        // Iterating backwards is necessary when removing items
        for (var c = track.clips.numItems - 1; c >= 0; c--) {
            try {
                // remove(0,0) removes the clip leaving a gap (no ripple delete)
                track.clips[c].remove(0, 0);
            } catch (e) {
                // Ignore remove errors
            }
        }

        // Cache for Volume effect component indexes
        var cachedVolumeCompIdx = -1;
        var cachedLevelPropIdx = -1;

        // 3. Rebuild track using active segments
        for (var c = 0; c < originalClips.length; c++) {
            var oClip = originalClips[c];

            for (var s = 0; s < trackSegments.length; s++) {
                var seg = trackSegments[s];

                // For chop mode, we only care about active segments. For mixed, we insert all.
                if (mode === 'chop' && seg.state !== 'active') continue;

                var intersectStart = Math.max(seg.start, oClip.startSec);
                var intersectEnd = Math.min(seg.end, oClip.endSec);

                // If the segment overlaps the clip's valid duration
                if (intersectStart < intersectEnd) {

                    var clipInPointSec = oClip.inPointSec + (intersectStart - oClip.startSec);

                    var newTime;
                    if (typeof Time !== 'undefined') {
                        newTime = new Time();
                        newTime.seconds = intersectStart;
                    } else {
                        // Fallback if Time constructor fails
                        newTime = Math.round(intersectStart * ticksPerSecond).toString();
                    }

                    try {
                        // The newly inserted clip gets appended at the end of the `track.clips` collection
                        var numItemsBefore = track.clips.numItems;
                        track.overwriteClip(oClip.projectItem, newTime);
                        var numItemsAfter = track.clips.numItems;

                        // Find the newly inserted clip (approximate start time)
                        var newClip = null;

                        // Optimized Lookup: O(1) or O(small constant)
                        // It's highly likely the newly inserted clip is at the very end of the clips array
                        // However, just to be safe, we check the last few items
                        var searchStartIdx = Math.max(0, numItemsAfter - 5);
                        for (var ic = numItemsAfter - 1; ic >= searchStartIdx; ic--) {
                            var icStart = parseFloat(track.clips[ic].start.ticks) / ticksPerSecond;
                            if (Math.abs(icStart - intersectStart) < 0.05) {
                                newClip = track.clips[ic];
                                break;
                            }
                        }

                        if (newClip) {
                            if (typeof Time !== 'undefined') {
                                var tIn = new Time();
                                tIn.seconds = clipInPointSec;
                                newClip.inPoint = tIn;

                                var tEnd = new Time();
                                tEnd.seconds = intersectEnd;
                                newClip.end = tEnd;
                            } else {
                                newClip.inPoint = Math.round(clipInPointSec * ticksPerSecond).toString();
                                newClip.end = Math.round(intersectEnd * ticksPerSecond).toString();
                            }

                            // If mixed mode and segment is inactive, lower the volume
                            if (mode === 'mixed' && seg.state !== 'active') {
                                // Fast path component lookup
                                var volCompIdxSearch = -1;
                                var lvlPropIdxSearch = -1;

                                if (cachedVolumeCompIdx !== -1 && newClip.components.numItems > cachedVolumeCompIdx) {
                                    if (newClip.components[cachedVolumeCompIdx].displayName === 'Volume') {
                                        volCompIdxSearch = cachedVolumeCompIdx;

                                        if (cachedLevelPropIdx !== -1 && newClip.components[cachedVolumeCompIdx].properties.numItems > cachedLevelPropIdx) {
                                            if (newClip.components[cachedVolumeCompIdx].properties[cachedLevelPropIdx].displayName === 'Level') {
                                                lvlPropIdxSearch = cachedLevelPropIdx;
                                            }
                                        }
                                    }
                                }

                                // Slow Path: If cache miss, fully iterate properties
                                if (volCompIdxSearch === -1) {
                                    for (var comp = 0; comp < newClip.components.numItems; comp++) {
                                        if (newClip.components[comp].displayName === 'Volume') {
                                            volCompIdxSearch = comp;
                                            cachedVolumeCompIdx = comp; // update cache
                                            break;
                                        }
                                    }
                                }

                                if (volCompIdxSearch !== -1 && lvlPropIdxSearch === -1) {
                                    var volumeComponentX = newClip.components[volCompIdxSearch];
                                    for (var prop = 0; prop < volumeComponentX.properties.numItems; prop++) {
                                        if (volumeComponentX.properties[prop].displayName === 'Level') {
                                            lvlPropIdxSearch = prop;
                                            cachedLevelPropIdx = prop; // update cache
                                            break;
                                        }
                                    }
                                }

                                if (volCompIdxSearch !== -1 && lvlPropIdxSearch !== -1) {
                                    var levelProperty = newClip.components[volCompIdxSearch].properties[lvlPropIdxSearch];
                                    levelProperty.setTimeVarying(false);
                                    var gainLinear = duckingLevelDb <= -100 ? 0 : Math.pow(10, duckingLevelDb / 20);
                                    levelProperty.setValue(gainLinear);
                                }
                            }

                            totalClipsCreated++;
                        }
                    } catch (e) {
                        // Ignore insertion errors to prevent sequence abort
                    }
                }
            }
        }
    }

    return { success: true, clipsCreated: totalClipsCreated };
}
