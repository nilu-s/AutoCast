/**
 * AutoCast – Apply Gain Normalization (ExtendScript)
 *
 * Applies a dB gain offset to all clips on specified audio tracks in Premiere Pro.
 * Used to compensate for quiet tracks so that soft speakers are heard clearly
 * without touching the original media files.
 *
 * gainAdjustments is an array of { trackIndex, gainDb } objects.
 * A positive gainDb boosts the track; negative attenuates.
 */

function applyGainNormalization(data) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var adjustments = data.gainAdjustments || [];
    var errors = [];
    var applied = 0;
    var skipped = 0;

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

    for (var a = 0; a < adjustments.length; a++) {
        var adj = adjustments[a];
        var trackIdx = adj.trackIndex;
        var gainDb = adj.gainDb;

        // Skip tracks that need no adjustment (within 0.5dB tolerance)
        if (Math.abs(gainDb) < 0.5) {
            skipped++;
            continue;
        }

        var track = seq.audioTracks[trackIdx];
        if (!track) {
            errors.push('Track not found: ' + trackIdx);
            continue;
        }

        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (!clip) continue;

            var ok = setClipVolumeDb(clip, gainDb);
            if (ok) {
                applied++;
            } else {
                errors.push('Could not set volume on track ' + trackIdx + ', clip ' + c);
            }
        }
    }

    return {
        success: errors.length === 0,
        applied: applied,
        skipped: skipped,
        errors: errors
    };
}
