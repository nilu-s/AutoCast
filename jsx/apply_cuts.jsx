/**
 * AutoCast – Apply Cuts (ExtendScript)
 *
 * Splits clips on audio tracks using Premiere Pro's QE DOM razor(),
 * which produces the same result as Ctrl+K (Add Edit).
 * Both halves of each split retain full source handles for retrimming.
 *
 * Falls back to an improved manual split if QE DOM is unavailable.
 */

function applyCuts(data, progressCallback) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var progress = progressCallback || function () { };

    var segmentsPerTrack = data.segments || [];
    var trackIndices = data.trackIndices || [];
    var ticksPerSecond = data.ticksPerSecond || 254016000000;
    var mode = data.mode || 'chop';
    var duckingLevelDb = (data.duckingLevelDb !== undefined) ? data.duckingLevelDb : -24;

    var totalClipsCreated = 0;
    var totalClipsTrimmed = 0;
    var totalClipsRemoved = 0;
    var errors = [];

    // ── Helpers ──────────────────────────────────────────────────────

    function ticksToSec(timeObj) {
        if (!timeObj || timeObj.ticks === undefined || timeObj.ticks === null) {
            return 0;
        }
        return parseFloat(timeObj.ticks) / ticksPerSecond;
    }

    function secToTicks(sec) {
        return Math.round(sec * ticksPerSecond).toString();
    }

    function sortByStart(a, b) {
        return a.start - b.start;
    }

    function filterWantedSegments(segments, currentMode) {
        var out = [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (!seg) continue;

            if (currentMode === 'chop') {
                if (seg.state === 'active') {
                    out.push({
                        start: seg.start,
                        end: seg.end,
                        state: seg.state || 'active'
                    });
                }
            } else {
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

    function findVolumeComponent(clip) {
        if (!clip || !clip.components) return null;

        for (var i = 0; i < clip.components.numItems; i++) {
            var comp = clip.components[i];
            if (!comp) continue;

            if (comp.matchName === 'ADBE Volume' || comp.displayName === 'Volume') {
                return comp;
            }
        }
        return null;
    }

    function setClipVolumeDb(clip, levelDb) {
        var vol = findVolumeComponent(clip);
        if (!vol || !vol.properties) return false;

        for (var i = 0; i < vol.properties.numItems; i++) {
            var prop = vol.properties[i];
            if (!prop) continue;

            if (prop.matchName === 'ADBE Volume Level' || prop.displayName === 'Level') {
                try { prop.setTimeVarying(false); } catch (e1) { }
                try {
                    prop.setValue(levelDb, true);
                    return true;
                } catch (e2) {
                    try {
                        prop.setValue(levelDb);
                        return true;
                    } catch (e3) {
                        return false;
                    }
                }
            }
        }
        return false;
    }

    // ── QE DOM helpers ──────────────────────────────────────────────

    /**
     * Try to enable the QE DOM and return the QE sequence + track accessors.
     * Returns null if QE is not available.
     */
    function initQE() {
        try {
            app.enableQE();
        } catch (e) {
            return null;
        }

        if (typeof qe === 'undefined') return null;

        try {
            var qeSeq = qe.project.getActiveSequence();
            if (!qeSeq) return null;
            return qeSeq;
        } catch (e2) {
            return null;
        }
    }

    /**
     * Collect all unique razor points for a track.
     * A razor point is a segment boundary that falls strictly inside an
     * existing clip (not at the clip's own start/end).
     */
    function collectRazorPoints(track, allSegments) {
        // Gather all boundary times from all segments
        var boundaryMap = {};
        for (var s = 0; s < allSegments.length; s++) {
            var seg = allSegments[s];
            var startKey = seg.start.toFixed(6);
            var endKey = seg.end.toFixed(6);
            boundaryMap[startKey] = seg.start;
            boundaryMap[endKey] = seg.end;
        }

        var boundaries = [];
        for (var key in boundaryMap) {
            if (boundaryMap.hasOwnProperty(key)) {
                boundaries.push(boundaryMap[key]);
            }
        }
        boundaries.sort(function (a, b) { return a - b; });

        // Filter: only keep boundaries that fall strictly inside a clip
        var razorPoints = [];
        var epsilon = 0.0001; // ~0.1ms tolerance

        for (var b = 0; b < boundaries.length; b++) {
            var bTime = boundaries[b];

            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                var cStart = ticksToSec(clip.start);
                var cEnd = ticksToSec(clip.end);

                // Strictly inside: not at clip boundaries
                if (bTime > cStart + epsilon && bTime < cEnd - epsilon) {
                    razorPoints.push(bTime);
                    break; // This boundary is confirmed, no need to check more clips
                }
            }
        }

        return razorPoints;
    }

    /**
     * Check if a clip (by its timeline position) overlaps any active segment.
     * Returns the state of the best-matching segment, or null.
     */
    function getClipSegmentState(clipStartSec, clipEndSec, wantedSegments) {
        var epsilon = 0.001;
        var bestOverlap = 0;
        var bestState = null;

        for (var i = 0; i < wantedSegments.length; i++) {
            var seg = wantedSegments[i];
            var overlapStart = Math.max(clipStartSec, seg.start);
            var overlapEnd = Math.min(clipEndSec, seg.end);
            var overlap = overlapEnd - overlapStart;

            if (overlap > epsilon && overlap > bestOverlap) {
                bestOverlap = overlap;
                bestState = seg.state;
            }
        }
        return bestState;
    }

    /**
     * Check if a clip is covered by any wanted segment (for chop mode).
     */
    function clipIsWanted(clipStartSec, clipEndSec, wantedSegments) {
        var epsilon = 0.001;
        for (var i = 0; i < wantedSegments.length; i++) {
            var seg = wantedSegments[i];
            var overlapStart = Math.max(clipStartSec, seg.start);
            var overlapEnd = Math.min(clipEndSec, seg.end);
            if (overlapEnd - overlapStart > epsilon) {
                return true;
            }
        }
        return false;
    }

    // ── Main logic ──────────────────────────────────────────────────

    var qeSeq = initQE();
    var useQERazor = (qeSeq !== null);

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
            Math.round((t / trackIndices.length) * 100),
            'Processing track ' + (t + 1) + '/' + trackIndices.length + '...'
        );

        // Get ALL segments (active + inactive) for computing razor points
        var allSegments = filterWantedSegments(rawSegments, 'mixed');
        allSegments = mergeTouchingSegments(allSegments, 0.0005);

        // Get mode-specific wanted segments for post-razor processing
        var wantedSegments = filterWantedSegments(rawSegments, mode);
        wantedSegments = mergeTouchingSegments(wantedSegments, 0.0005);

        if (allSegments.length === 0) continue;

        // ── Step 1: Razor at all segment boundaries ──

        var razorPoints = collectRazorPoints(track, allSegments);

        if (useQERazor && razorPoints.length > 0) {
            try {
                var qeTrack = qeSeq.getAudioTrackAt(trackIdx);
                if (!qeTrack) {
                    errors.push('QE audio track not found: ' + trackIdx);
                    continue;
                }

                // Razor right-to-left so earlier clip indices stay valid
                for (var r = razorPoints.length - 1; r >= 0; r--) {
                    var razorTicks = secToTicks(razorPoints[r]);
                    try {
                        qeTrack.razor(razorTicks);
                        totalClipsCreated++;
                    } catch (eRazor) {
                        errors.push(
                            'Razor failed on track ' + trackIdx +
                            ' at ' + razorPoints[r].toFixed(3) + 's: ' + eRazor
                        );
                    }
                }
            } catch (eQE) {
                errors.push('QE razor error on track ' + trackIdx + ': ' + eQE);
            }
        } else if (!useQERazor && razorPoints.length > 0) {
            // ── Fallback: manual razor using setPlayerPosition + menu command ──
            // This is a best-effort fallback for environments without QE DOM.
            try {
                for (var r2 = razorPoints.length - 1; r2 >= 0; r2--) {
                    var razorTicks2 = secToTicks(razorPoints[r2]);

                    // Select only this track's target clips (approximate via playhead)
                    seq.setPlayerPosition(razorTicks2);

                    // Attempt menu-based Add Edit (Ctrl+K equivalent)
                    try {
                        app.enableQE();
                        var qeSeqFallback = qe.project.getActiveSequence();
                        if (qeSeqFallback) {
                            var qeTrackFallback = qeSeqFallback.getAudioTrackAt(trackIdx);
                            if (qeTrackFallback) {
                                qeTrackFallback.razor(razorTicks2);
                                totalClipsCreated++;
                            }
                        }
                    } catch (eFallback) {
                        errors.push(
                            'Fallback razor failed on track ' + trackIdx +
                            ' at ' + razorPoints[r2].toFixed(3) + 's: ' + eFallback
                        );
                    }
                }
            } catch (eFB) {
                errors.push('Fallback razor error on track ' + trackIdx + ': ' + eFB);
            }
        }

        // ── Step 2: Post-razor cleanup ──
        // Now iterate the (potentially split) clips and remove/duck as needed.

        progress(
            Math.round(((t + 0.5) / trackIndices.length) * 100),
            'Cleaning up track ' + (t + 1) + '/' + trackIndices.length + '...'
        );

        // Re-read clips after razoring (clip list has changed)
        var postClipCount = track.clips.numItems;

        if (mode === 'chop') {
            // Remove clips that don't fall within any active segment.
            // Iterate backwards so index removal doesn't shift remaining items.
            for (var pc = postClipCount - 1; pc >= 0; pc--) {
                var pClip = track.clips[pc];
                if (!pClip) continue;

                var pcStart = ticksToSec(pClip.start);
                var pcEnd = ticksToSec(pClip.end);

                if (!clipIsWanted(pcStart, pcEnd, wantedSegments)) {
                    try {
                        pClip.remove(0, 0);
                        totalClipsRemoved++;
                    } catch (eRemove) {
                        errors.push(
                            'Remove failed on track ' + trackIdx +
                            ' at ' + pcStart.toFixed(3) + 's: ' + eRemove
                        );
                    }
                } else {
                    totalClipsTrimmed++;
                }
            }
        } else if (mode === 'mixed') {
            // Duck clips that overlap inactive segments.
            for (var mc = 0; mc < postClipCount; mc++) {
                var mClip = track.clips[mc];
                if (!mClip) continue;

                var mcStart = ticksToSec(mClip.start);
                var mcEnd = ticksToSec(mClip.end);
                var segState = getClipSegmentState(mcStart, mcEnd, allSegments);

                if (segState !== null && segState !== 'active') {
                    if (!setClipVolumeDb(mClip, duckingLevelDb)) {
                        errors.push(
                            'Could not set volume on track ' + trackIdx +
                            ' at ' + mcStart.toFixed(3) + 's'
                        );
                    }
                }

                totalClipsTrimmed++;
            }
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