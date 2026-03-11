/**
 * AutoCast – Undo Cuts
 *
 * Provides snapshot/restore for undoing applyCuts.
 *
 * captureTrackState(trackIndices)
 *   → Serialises every clip on each track to JSON.
 *
 * restoreTrackState(snapshot)
 *   → Clears all clips on the affected tracks, then re-inserts
 *     them from the snapshot using overwriteClip().
 */

function captureTrackState(data) {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: 'No active sequence.' });

    var trackIndices = data.trackIndices || [];
    var ticksPerSecond = data.ticksPerSecond || 254016000000;

    function ticksToSec(timeObj) {
        if (!timeObj || timeObj.ticks === undefined) return 0;
        return parseFloat(timeObj.ticks) / ticksPerSecond;
    }

    var snapshot = [];

    for (var t = 0; t < trackIndices.length; t++) {
        var trackIdx = trackIndices[t];
        var track = seq.audioTracks[trackIdx];
        if (!track) {
            snapshot.push({ trackIndex: trackIdx, clips: [] });
            continue;
        }

        var clips = [];
        for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (!clip || !clip.projectItem) continue;

            // Try to get a stable identifier for the project item.
            // nodeId is unique per project item in modern Premiere versions.
            var nodeId = '';
            try { nodeId = clip.projectItem.nodeId; } catch (e) { }

            // mediaPath as fallback identifier
            var mediaPath = '';
            try { mediaPath = clip.projectItem.getMediaPath(); } catch (e) { }

            clips.push({
                nodeId: nodeId,
                mediaPath: mediaPath,
                timelineStartSec: ticksToSec(clip.start),
                timelineEndSec: ticksToSec(clip.end),
                sourceInSec: ticksToSec(clip.inPoint)
            });
        }

        snapshot.push({ trackIndex: trackIdx, clips: clips });
    }

    return JSON.stringify({ success: true, snapshot: snapshot });
}

function restoreTrackState(data) {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ error: 'No active sequence.' });

    var snapshot = data.snapshot || [];
    var ticksPerSecond = data.ticksPerSecond || 254016000000;

    function secToTicks(sec) {
        return Math.round(sec * ticksPerSecond).toString();
    }

    // Build a lookup: nodeId/mediaPath → projectItem
    // We scan the entire project bin.
    function findProjectItem(nodeId, mediaPath) {
        var root = app.project.rootItem;
        return searchBin(root, nodeId, mediaPath);
    }

    function searchBin(binItem, nodeId, mediaPath) {
        if (!binItem || !binItem.children) return null;
        for (var i = 0; i < binItem.children.numItems; i++) {
            var child = binItem.children[i];
            if (!child) continue;

            // Is it a clip ProjectItem?
            if (child.type === ProjectItemType.CLIP || child.type === 1) {
                var childNode = '';
                var childPath = '';
                try { childNode = child.nodeId; } catch (e) { }
                try { childPath = child.getMediaPath(); } catch (e) { }

                if ((nodeId && childNode === nodeId) ||
                    (mediaPath && childPath === mediaPath)) {
                    return child;
                }
            }

            // Recurse into bins
            var found = searchBin(child, nodeId, mediaPath);
            if (found) return found;
        }
        return null;
    }

    var errors = [];
    var restored = 0;

    for (var t = 0; t < snapshot.length; t++) {
        var entry = snapshot[t];
        var trackIdx = entry.trackIndex;
        var track = seq.audioTracks[trackIdx];

        if (!track) {
            errors.push('Track not found: ' + trackIdx);
            continue;
        }

        // Step 1: Remove all current clips on this track (reverse order to avoid index shift)
        var currentCount = track.clips.numItems;
        for (var c = currentCount - 1; c >= 0; c--) {
            try {
                track.clips[c].remove(0, 0);
            } catch (eRm) {
                errors.push('Remove failed on track ' + trackIdx + ': ' + eRm);
            }
        }

        // Step 2: Re-insert all clips from snapshot
        var clips = entry.clips || [];
        for (var k = 0; k < clips.length; k++) {
            var clipData = clips[k];
            var pItem = findProjectItem(clipData.nodeId, clipData.mediaPath);

            if (!pItem) {
                errors.push('Project item not found: ' + (clipData.mediaPath || clipData.nodeId));
                continue;
            }

            var durationSec = clipData.timelineEndSec - clipData.timelineStartSec;

            try {
                pItem.setInPoint(secToTicks(clipData.sourceInSec), 4);
                pItem.setOutPoint(secToTicks(clipData.sourceInSec + durationSec), 4);
            } catch (eInOut) { }

            try {
                track.overwriteClip(pItem, secToTicks(clipData.timelineStartSec));
                restored++;
            } catch (eInsert) {
                errors.push('Restore insert failed at ' + clipData.timelineStartSec.toFixed(3) + 's: ' + eInsert);
            }

            try { pItem.clearInPoint(); } catch (e) { }
            try { pItem.clearOutPoint(); } catch (e) { }
        }
    }

    return JSON.stringify({
        success: errors.length === 0,
        restored: restored,
        errors: errors
    });
}
