/**
 * AutoCast – Apply Volume Keyframes (ExtendScript)
 * 
 * Generates volume automation keyframes on audio clips in Premiere Pro.
 * This creates the ducking effect: active speaker at 0dB, others at -XdB.
 */

/**
 * Apply volume keyframes to audio tracks.
 * 
 * @param {object} data - Keyframe data from analyzer
 * @param {Array<Array<{time: number, gainDb: number}>>} data.keyframes - Per-track keyframe arrays
 * @param {Array<number>} data.trackIndices - Which Premiere tracks to apply to
 * @param {number} data.ticksPerSecond - Premiere ticks per second (254016000000)
 * @returns {object} Result with counts
 */
function applyVolumeKeyframes(data) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var keyframesPerTrack = data.keyframes;
    var trackIndices = data.trackIndices;
    var ticksPerSecond = data.ticksPerSecond || 254016000000;

    var totalKeyframesSet = 0;
    var trackResults = [];

    // Disable UI updates for performance
    app.enableQE();

    for (var t = 0; t < trackIndices.length; t++) {
        var trackIdx = trackIndices[t];
        var trackKeyframes = keyframesPerTrack[t];
        var track = seq.audioTracks[trackIdx];

        if (!track) {
            trackResults.push({ trackIndex: trackIdx, error: 'Track not found', keyframesSet: 0 });
            continue;
        }

        var keyframesSet = 0;

        // Apply keyframes to each clip on this track
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var clipStartSec = ticksToSeconds(clip.start.ticks, ticksPerSecond);
            var clipEndSec = ticksToSeconds(clip.end.ticks, ticksPerSecond);

            // Find the Volume component
            var volumeComponent = null;
            for (var comp = 0; comp < clip.components.numItems; comp++) {
                if (clip.components[comp].displayName === 'Volume') {
                    volumeComponent = clip.components[comp];
                    break;
                }
            }

            if (!volumeComponent) {
                continue; // Skip if no Volume component found
            }

            // Find the Level property
            var levelProperty = null;
            for (var prop = 0; prop < volumeComponent.properties.numItems; prop++) {
                if (volumeComponent.properties[prop].displayName === 'Level') {
                    levelProperty = volumeComponent.properties[prop];
                    break;
                }
            }

            if (!levelProperty) {
                continue;
            }

            // Enable keyframing
            levelProperty.setTimeVarying(true);

            // Apply keyframes that fall within this clip's time range
            for (var k = 0; k < trackKeyframes.length; k++) {
                var kf = trackKeyframes[k];
                var kfTimeSec = kf.time;

                // Only apply keyframes within clip boundaries
                if (kfTimeSec >= clipStartSec && kfTimeSec <= clipEndSec) {
                    // Convert to clip-relative time in ticks
                    var clipRelativeTimeTicks = secondsToTicks(kfTimeSec - clipStartSec, ticksPerSecond);

                    // Add clip in-point offset
                    var absoluteTimeTicks = clip.inPoint.ticks + clipRelativeTimeTicks;

                    // Convert dB to Premiere's internal gain value
                    // Premiere uses a linear scale where 1.0 = 0dB
                    var gainLinear = dbToGain(kf.gainDb);

                    try {
                        levelProperty.addKey(absoluteTimeTicks);
                        levelProperty.setValueAtKey(absoluteTimeTicks, gainLinear);
                        keyframesSet++;
                    } catch (e) {
                        // Silently skip failed keyframes
                    }
                }
            }
        }

        totalKeyframesSet += keyframesSet;
        trackResults.push({
            trackIndex: trackIdx,
            trackName: track.name,
            keyframesSet: keyframesSet
        });
    }

    return {
        success: true,
        totalKeyframesSet: totalKeyframesSet,
        tracks: trackResults
    };
}

/**
 * Remove all keyframes from Volume property on specified tracks (reset).
 * @param {Array<number>} trackIndices 
 * @returns {object} Result
 */
function removeVolumeKeyframes(trackIndices) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var totalRemoved = 0;

    for (var t = 0; t < trackIndices.length; t++) {
        var trackIdx = trackIndices[t];
        var track = seq.audioTracks[trackIdx];
        if (!track) continue;

        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];

            // Find Volume > Level
            var volumeComponent = null;
            for (var comp = 0; comp < clip.components.numItems; comp++) {
                if (clip.components[comp].displayName === 'Volume') {
                    volumeComponent = clip.components[comp];
                    break;
                }
            }
            if (!volumeComponent) continue;

            var levelProperty = null;
            for (var prop = 0; prop < volumeComponent.properties.numItems; prop++) {
                if (volumeComponent.properties[prop].displayName === 'Level') {
                    levelProperty = volumeComponent.properties[prop];
                    break;
                }
            }
            if (!levelProperty) continue;

            // Disable keyframing (removes all keyframes, resets to static value)
            levelProperty.setTimeVarying(false);
            // Set back to 0 dB (gain = 1.0)
            levelProperty.setValue(1.0);
            totalRemoved++;
        }
    }

    return { success: true, clipsReset: totalRemoved };
}

// --- Utility functions ---

function ticksToSeconds(ticks, ticksPerSecond) {
    return parseFloat(ticks) / ticksPerSecond;
}

function secondsToTicks(seconds, ticksPerSecond) {
    return Math.round(seconds * ticksPerSecond).toString();
}

/**
 * Convert dB to linear gain factor.
 * Premiere Pro uses linear gain where 1.0 = 0dB.
 */
function dbToGain(db) {
    if (db <= -100) return 0;
    return Math.pow(10, db / 20);
}
