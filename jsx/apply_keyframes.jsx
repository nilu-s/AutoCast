/**
 * AutoCast – Apply Cuts (ExtendScript)
 *
 * Rebuilds audio tracks from active/inactive segments.
 * In "chop" mode, only active segments are kept.
 * In "mixed" mode, inactive segments are also inserted and attenuated.
 */

function applyCuts(data) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var segmentsPerTrack = data.segments || [];
    var trackIndices = data.trackIndices || [];
    var ticksPerSecond = data.ticksPerSecond || 254016000000;
    var mode = data.mode || 'chop'; // 'chop' or 'mixed'
    var duckingLevelDb = (data.duckingLevelDb !== undefined) ? data.duckingLevelDb : -24;

    var totalClipsCreated = 0;
    var errors = [];

    app.enableQE();

    function ticksToSec(timeObj) {
        if (!timeObj || timeObj.ticks === undefined || timeObj.ticks === null) {
            return 0;
        }
        return parseFloat(timeObj.ticks) / ticksPerSecond;
    }

    function makeTimeFromSeconds(sec) {
        if (typeof Time !== 'undefined') {
            var t = new Time();
            t.seconds = sec;
            return t;
        }
        return Math.round(sec * ticksPerSecond).toString();
    }

    function nearlyEqual(a, b, eps) {
        return Math.abs(a - b) <= eps;
    }

    function collectClipRefs(track) {
        var refs = [];
        for (var i = 0; i < track.clips.numItems; i++) {
            refs.push(track.clips[i]);
        }
        return refs;
    }

    function isKnownClip(candidate, knownRefs) {
        for (var i = 0; i < knownRefs.length; i++) {
            if (candidate === knownRefs[i]) {
                return true;
            }
        }
        return false;
    }

    function findInsertedClip(track, knownRefs, projectItem, expectedStartSec) {
        var best = null;
        var bestDelta = 999999;

        for (var i = 0; i < track.clips.numItems; i++) {
            var clip = track.clips[i];
            if (isKnownClip(clip, knownRefs)) {
                continue;
            }

            if (clip.projectItem !== projectItem) {
                continue;
            }

            var startSec = ticksToSec(clip.start);
            var delta = Math.abs(startSec - expectedStartSec);

            if (delta < bestDelta) {
                best = clip;
                bestDelta = delta;
            }
        }

        if (best && bestDelta < 0.02) {
            return best;
        }

        // Fallback: full scan by project item + nearest start
        best = null;
        bestDelta = 999999;

        for (var j = 0; j < track.clips.numItems; j++) {
            var clip2 = track.clips[j];
            if (clip2.projectItem !== projectItem) {
                continue;
            }

            var startSec2 = ticksToSec(clip2.start);
            var delta2 = Math.abs(startSec2 - expectedStartSec);

            if (delta2 < bestDelta) {
                best = clip2;
                bestDelta = delta2;
            }
        }

        if (best && bestDelta < 0.02) {
            return best;
        }

        return null;
    }

    function setClipVolumeDb(clip, levelDb) {
        if (!clip || !clip.components) {
            return false;
        }

        var volumeComponent = null;
        var levelProperty = null;

        for (var c = 0; c < clip.components.numItems; c++) {
            var comp = clip.components[c];
            if (comp && comp.displayName === 'Volume') {
                volumeComponent = comp;
                break;
            }
        }

        if (!volumeComponent || !volumeComponent.properties) {
            return false;
        }

        for (var p = 0; p < volumeComponent.properties.numItems; p++) {
            var prop = volumeComponent.properties[p];
            if (prop && prop.displayName === 'Level') {
                levelProperty = prop;
                break;
            }
        }

        if (!levelProperty) {
            return false;
        }

        try {
            levelProperty.setTimeVarying(false);
        } catch (e1) { }

        try {
            // Premiere expects dB here, not linear gain.
            levelProperty.setValue(levelDb, true);
            return true;
        } catch (e2) {
            try {
                levelProperty.setValue(levelDb);
                return true;
            } catch (e3) {
                return false;
            }
        }
    }

    for (var t = 0; t < trackIndices.length; t++) {
        var trackIdx = trackIndices[t];
        var trackSegments = segmentsPerTrack[t] || [];
        var track = seq.audioTracks[trackIdx];

        if (!track) {
            errors.push('Audio track not found: ' + trackIdx);
            continue;
        }

        // Original clips snapshot
        var originalClips = [];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];

            if (!clip || !clip.projectItem) {
                continue;
            }

            originalClips.push({
                projectItem: clip.projectItem,
                startSec: ticksToSec(clip.start),
                endSec: ticksToSec(clip.end),
                inPointSec: ticksToSec(clip.inPoint),
                outPointSec: ticksToSec(clip.outPoint)
            });
        }

        // Remove old clips from the track
        for (var r = track.clips.numItems - 1; r >= 0; r--) {
            try {
                track.clips[r].remove(0, 0);
            } catch (removeErr) {
                errors.push('Remove failed on track ' + trackIdx + ', clip ' + r + ': ' + removeErr);
            }
        }

        // Rebuild from segments
        for (var oc = 0; oc < originalClips.length; oc++) {
            var oClip = originalClips[oc];

            for (var s = 0; s < trackSegments.length; s++) {
                var seg = trackSegments[s];
                if (!seg) {
                    continue;
                }

                if (mode === 'chop' && seg.state !== 'active') {
                    continue;
                }

                var intersectStart = Math.max(seg.start, oClip.startSec);
                var intersectEnd = Math.min(seg.end, oClip.endSec);

                if (!(intersectStart < intersectEnd)) {
                    continue;
                }

                var newClipInPointSec = oClip.inPointSec + (intersectStart - oClip.startSec);
                var newClipDurationSec = intersectEnd - intersectStart;
                var newClipOutPointSec = newClipInPointSec + newClipDurationSec;

                // Safety clamp to original source range if available
                if (oClip.outPointSec > oClip.inPointSec && newClipOutPointSec > oClip.outPointSec) {
                    newClipOutPointSec = oClip.outPointSec;
                    newClipDurationSec = newClipOutPointSec - newClipInPointSec;
                    intersectEnd = intersectStart + newClipDurationSec;
                }

                if (!(newClipInPointSec < newClipOutPointSec)) {
                    continue;
                }

                try {
                    var beforeRefs = collectClipRefs(track);

                    // Insert at timeline position
                    track.overwriteClip(oClip.projectItem, makeTimeFromSeconds(intersectStart));

                    var newClip = findInsertedClip(track, beforeRefs, oClip.projectItem, intersectStart);
                    if (!newClip) {
                        errors.push(
                            'Inserted clip not found on track ' + trackIdx +
                            ' at ' + intersectStart.toFixed(3) + 's'
                        );
                        continue;
                    }

                    // Trim source in
                    try {
                        newClip.inPoint = makeTimeFromSeconds(newClipInPointSec);
                    } catch (eIn) {
                        errors.push(
                            'Setting inPoint failed on track ' + trackIdx +
                            ' at ' + intersectStart.toFixed(3) + 's: ' + eIn
                        );
                    }

                    // Set timeline end
                    try {
                        newClip.end = makeTimeFromSeconds(intersectEnd);
                    } catch (eEnd) {
                        errors.push(
                            'Setting end failed on track ' + trackIdx +
                            ' at ' + intersectStart.toFixed(3) + 's: ' + eEnd
                        );
                    }

                    // In mixed mode, attenuate inactive segments
                    if (mode === 'mixed' && seg.state !== 'active') {
                        var volumeOk = setClipVolumeDb(newClip, duckingLevelDb);
                        if (!volumeOk) {
                            errors.push(
                                'Could not set clip volume on track ' + trackIdx +
                                ' at ' + intersectStart.toFixed(3) + 's'
                            );
                        }
                    }

                    totalClipsCreated++;
                } catch (insertErr) {
                    errors.push(
                        'Insert failed on track ' + trackIdx +
                        ', original clip ' + oc +
                        ', segment ' + s + ': ' + insertErr
                    );
                }
            }
        }
    }

    return {
        success: errors.length === 0,
        clipsCreated: totalClipsCreated,
        errors: errors
    };
}