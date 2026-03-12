/**
 * AutoCast – Apply Markers (ExtendScript)
 * 
 * Adds sequence markers at speaker change points for visual reference.
 * Color-coded per track for easy identification.
 */

// Marker colors (Premiere marker color indices)
var MARKER_COLORS = [
    0, // Green
    1, // Red  
    2, // Purple
    3, // Orange
    4, // Yellow
    5, // White
    6, // Blue
    7  // Cyan
];

/**
 * Add sequence markers at speaker change points.
 * @param {object} data
 * @param {Array<Array<{start, end, trackIndex}>>} data.segments - Segments per track
 * @param {Array<string>} data.trackNames - Names for each track
 * @param {number} data.ticksPerSecond - Premiere ticks per second
 * @returns {object} Result with marker count
 */
function addSpeakerMarkers(data) {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var segments = data.segments;
    var trackNames = data.trackNames || [];
    var ticksPerSecond = data.ticksPerSecond || 254016000000;
    var markers = seq.markers;
    var markersAdded = 0;

    for (var t = 0; t < segments.length; t++) {
        var trackName = trackNames[t] || ('Track ' + (t + 1));
        var colorIdx = MARKER_COLORS[t % MARKER_COLORS.length];

        for (var s = 0; s < segments[t].length; s++) {
            var seg = segments[t][s];
            var startTicks = secondsToTicksM(seg.start, ticksPerSecond);

            try {
                var marker = markers.createMarker(parseFloat(startTicks));
                marker.name = trackName + ' speaks';
                marker.comments = 'AutoCast: ' + trackName + ' active ' +
                    seg.start.toFixed(2) + 's - ' + seg.end.toFixed(2) + 's' +
                    (seg.state ? ' (' + seg.state + ')' : '');
                marker.setColorByIndex(colorIdx);

                // Set marker duration to span the segment
                var durationTicks = secondsToTicksM(seg.end - seg.start, ticksPerSecond);
                marker.end = parseFloat(startTicks) + parseFloat(durationTicks);

                markersAdded++;
            } catch (e) {
                // Skip markers that fail (e.g., duplicate positions)
            }
        }
    }

    return { success: true, markersAdded: markersAdded };
}

/**
 * Remove all AutoCast markers from the sequence.
 * Identifies them by the 'AutoCast:' prefix in comments.
 */
function removeAutocastMarkers() {
    var seq = app.project.activeSequence;
    if (!seq) {
        return { error: 'No active sequence.' };
    }

    var markers = seq.markers;
    var toRemove = [];

    // Collect markers to remove (can't remove during iteration)
    var marker = markers.getFirstMarker();
    while (marker) {
        if (marker.comments && marker.comments.indexOf('AutoCast:') === 0) {
            toRemove.push(marker);
        }
        marker = markers.getNextMarker(marker);
    }

    // Remove collected markers
    for (var i = 0; i < toRemove.length; i++) {
        markers.deleteMarker(toRemove[i]);
    }

    return { success: true, markersRemoved: toRemove.length };
}

function secondsToTicksM(seconds, ticksPerSecond) {
    return Math.round(seconds * ticksPerSecond).toString();
}
