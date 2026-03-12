function applyCuts(data, progressCallback) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var progress = progressCallback || function () { };

    var segmentsPerTrack = data.segments || [];
    var trackIndices = data.trackIndices || [];
    var ticksPerSecond = data.ticksPerSecond || 254016000000;

    var totalClipsCreated = 0;
    var totalClipsTrimmed = 0;
    var totalClipsRemoved = 0;
    var errors = [];

    function ticksToSec(timeObj) {
        if (!timeObj || timeObj.ticks === undefined || timeObj.ticks === null) {
            return 0;
        }
        return parseFloat(timeObj.ticks) / ticksPerSecond;
    }

    function secToTicks(sec) {
        return Math.round(sec * ticksPerSecond).toString();
    }

    function cloneArrayOfTrackClips(track) {
        var out = [];
        for (var i = 0; i < track.clips.numItems; i++) {
            out.push(track.clips[i]);
        }
        return out;
    }

    function sortByStart(a, b) {
        return a.start - b.start;
    }

    function filterWantedSegments(segments) {
        var out = [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (!seg) continue;

            if (seg.state === 'active') {
                out.push({
                    start: seg.start,
                    end: seg.end,
                    state: seg.state || 'active'
                });
            }
        }
        out.sort(sortByStart);
        return out;
    }

    function mergeTouchingSegments(segments, epsilonSec) {
        if (!segments || segments.length === 0) return [];

        var merged = [segments[0]];
        for (var i = 1; i < segments.length; i++) {
            var prev = merged[merged.length - 1];
            var cur = segments[i];

            if (cur.start <= prev.end + epsilonSec && cur.state === prev.state) {
                if (cur.end > prev.end) {
                    prev.end = cur.end;
                }
            } else {
                merged.push({
                    start: cur.start,
                    end: cur.end,
                    state: cur.state
                });
            }
        }
        return merged;
    }

    function getOverlaps(clipStart, clipEnd, wantedSegments) {
        var overlaps = [];
        for (var i = 0; i < wantedSegments.length; i++) {
            var seg = wantedSegments[i];
            var start = Math.max(clipStart, seg.start);
            var end = Math.min(clipEnd, seg.end);

            if (start < end) {
                overlaps.push({
                    start: start,
                    end: end,
                    state: seg.state
                });
            }
        }
        return overlaps;
    }

    function insertAdditionalClip(track, projectItem, timelineStartSec, sourceInSec, timelineEndSec, state) {
        var insertAtTicks = secToTicks(timelineStartSec);

        // Pre-configure the project item so overwriteClip doesn't drop the entire raw file
        try {
            projectItem.setInPoint(secToTicks(sourceInSec), 4);
            projectItem.setOutPoint(secToTicks(sourceInSec + (timelineEndSec - timelineStartSec)), 4);
        } catch (eInOut) {}

        try {
            track.overwriteClip(projectItem, insertAtTicks);
        } catch (e) {
            return { error: 'overwriteClip failed: ' + e };
        }

        // Clean up project item In/Out points
        try {
            projectItem.clearInPoint();
            projectItem.clearOutPoint();
        } catch (eInOut) {}

        // We do not manually rewrite clip start/end here because
        // overwriteClip already places the trimmed snippet correctly and
        // keeps clip handles freely extendable in Premiere.

        return { success: true };
    }

    // Gesamtzahl der zu bearbeitenden Originalclips zählen
    var totalOriginalClips = 0;
    for (var tt = 0; tt < trackIndices.length; tt++) {
        var countTrack = seq.audioTracks[trackIndices[tt]];
        if (countTrack) {
            totalOriginalClips += countTrack.clips.numItems;
        }
    }

    var doneOriginalClips = 0;
    progress(0, 'Preparing cuts...');

    for (var t = 0; t < trackIndices.length; t++) {
        var trackIdx = trackIndices[t];
        var track = seq.audioTracks[trackIdx];
        var rawSegments = segmentsPerTrack[t] || [];

        if (!track) {
            errors.push('Audio track not found: ' + trackIdx);
            continue;
        }

        progress(
            totalOriginalClips > 0 ? Math.round((doneOriginalClips / totalOriginalClips) * 100) : 0,
            'Processing track ' + (t + 1) + '/' + trackIndices.length + '...'
        );

        var wantedSegments = filterWantedSegments(rawSegments);
        wantedSegments = mergeTouchingSegments(wantedSegments, 0.0005);

        var originalClips = cloneArrayOfTrackClips(track);

        for (var c = originalClips.length - 1; c >= 0; c--) {
            var clip = originalClips[c];

            if (!clip || !clip.projectItem) {
                doneOriginalClips++;
                continue;
            }

            var clipStartSec = ticksToSec(clip.start);
            var clipEndSec = ticksToSec(clip.end);
            var clipInPointSec = ticksToSec(clip.inPoint);

            var overlaps = getOverlaps(clipStartSec, clipEndSec, wantedSegments);

            if (overlaps.length === 0) {
                try {
                    clip.remove(0, 0);
                    totalClipsRemoved++;
                } catch (eRemove) {
                    errors.push('Remove failed on track ' + trackIdx + ': ' + eRemove);
                }
                doneOriginalClips++;
                progress(totalOriginalClips > 0 ? Math.round((doneOriginalClips / totalOriginalClips) * 100) : 100, 'Cutting clip...');
                continue;
            }

            // Save project item reference and remove the original clip completely
            var pItem = clip.projectItem;
            try {
                clip.remove(0, 0); // 0 = no ripple delete
                totalClipsRemoved++;
            } catch (eRemove) {
                errors.push('Could not remove original clip: ' + eRemove);
                continue; // Can't proceed if we can't delete the original
            }

            // Insert all snippets as fresh clips from the project bin
            for (var o = 0; o < overlaps.length; o++) {
                var ov = overlaps[o];
                var ovSourceInSec = clipInPointSec + (ov.start - clipStartSec);

                var insertResult = insertAdditionalClip(
                    track,
                    pItem,
                    ov.start,
                    ovSourceInSec,
                    ov.end,
                    ov.state
                );

                if (insertResult.error) {
                    errors.push('Insert failed on track ' + trackIdx + ' at ' + ov.start.toFixed(3) + 's: ' + insertResult.error);
                } else {
                    totalClipsCreated++;
                }
            }

            doneOriginalClips++;
            progress(totalOriginalClips > 0 ? Math.round((doneOriginalClips / totalOriginalClips) * 100) : 100, 'Cutting clip...');
        }
    }

    progress(100, 'Cutting complete.');

    return {
        success: errors.length === 0,
        clipsCreated: totalClipsCreated,
        clipsTrimmed: totalClipsTrimmed,
        clipsRemoved: totalClipsRemoved,
        errors: errors
    };
}
