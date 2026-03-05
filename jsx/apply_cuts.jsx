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
                        track.overwriteClip(oClip.projectItem, newTime);

                        // Find the newly inserted clip (approximate start time)
                        var newClip = null;
                        for (var ic = 0; ic < track.clips.numItems; ic++) {
                            var icStart = parseFloat(track.clips[ic].start.ticks) / ticksPerSecond;
                            if (Math.abs(icStart - intersectStart) < 0.05) {
                                newClip = track.clips[ic];
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
                                var volumeComponent = null;
                                for (var comp = 0; comp < newClip.components.numItems; comp++) {
                                    if (newClip.components[comp].displayName === 'Volume') {
                                        volumeComponent = newClip.components[comp];
                                        break;
                                    }
                                }
                                if (volumeComponent) {
                                    var levelProperty = null;
                                    for (var prop = 0; prop < volumeComponent.properties.numItems; prop++) {
                                        if (volumeComponent.properties[prop].displayName === 'Level') {
                                            levelProperty = volumeComponent.properties[prop];
                                            break;
                                        }
                                    }
                                    if (levelProperty) {
                                        levelProperty.setTimeVarying(false);
                                        var gainLinear = duckingLevelDb <= -100 ? 0 : Math.pow(10, duckingLevelDb / 20);
                                        levelProperty.setValue(gainLinear);
                                    }
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
