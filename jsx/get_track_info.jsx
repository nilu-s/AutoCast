/**
 * AutoCast – Get Track Info (ExtendScript)
 * 
 * Reads the active Premiere Pro sequence and extracts audio track
 * information including clip media file paths.
 */

/**
 * Get information about audio tracks in the active sequence.
 * @returns {object} Track info with media paths for analysis
 */
function getTrackInfo() {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence. Please open a sequence first.' };
    }

    var result = {
        sequenceName: seq.name,
        sequenceId: seq.sequenceID,
        framerate: seq.getSettings().videoFrameRate.ticks,
        audioTrackCount: seq.audioTracks.numTracks,
        tracks: []
    };

    // Iterate audio tracks
    for (var t = 0; t < seq.audioTracks.numTracks; t++) {
        var track = seq.audioTracks[t];
        var trackInfo = {
            index: t,
            name: track.name || ('Audio ' + (t + 1)),
            muted: track.isMuted(),
            clips: []
        };

        // Iterate clips on this track
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var clipInfo = {
                name: clip.name,
                startTicks: clip.start.ticks,
                endTicks: clip.end.ticks,
                inPointTicks: clip.inPoint.ticks,
                outPointTicks: clip.outPoint.ticks,
                durationTicks: clip.duration.ticks,
                mediaPath: ''
            };

            // Get media file path
            try {
                if (clip.projectItem && clip.projectItem.getMediaPath) {
                    clipInfo.mediaPath = clip.projectItem.getMediaPath();
                }
            } catch (e) {
                clipInfo.mediaPath = '';
                clipInfo.mediaPathError = e.toString();
            }

            trackInfo.clips.push(clipInfo);
        }

        result.tracks.push(trackInfo);
    }

    return result;
}
