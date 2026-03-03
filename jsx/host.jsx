/**
 * AutoCast – ExtendScript Host
 * 
 * Main entry point for all ExtendScript calls from the CEP Panel.
 * Premiere Pro runs this in its internal ExtendScript engine.
 * 
 * Functions are called via CSInterface.evalScript('functionName(args)')
 */

// Include sub-modules
//@include "get_track_info.jsx"
//@include "apply_keyframes.jsx"
//@include "apply_markers.jsx"

/**
 * Heartbeat – verify ExtendScript is running.
 */
function autocast_ping() {
    return JSON.stringify({ status: 'ok', version: '2.0.0', host: 'Premiere Pro' });
}

/**
 * Get info about the active sequence and its audio tracks.
 * Called before analysis to determine which WAV files to process.
 */
function autocast_getTrackInfo() {
    try {
        return JSON.stringify(getTrackInfo());
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Apply volume ducking keyframes to tracks.
 * @param {string} keyframeDataJson - JSON string of keyframe data from analyzer
 */
function autocast_applyKeyframes(keyframeDataJson) {
    try {
        var data = JSON.parse(keyframeDataJson);
        var result = applyVolumeKeyframes(data);
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Remove all AutoCast-generated keyframes (reset).
 * @param {string} trackIndicesJson - JSON array of track indices to reset
 */
function autocast_removeKeyframes(trackIndicesJson) {
    try {
        var indices = JSON.parse(trackIndicesJson);
        var result = removeVolumeKeyframes(indices);
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

/**
 * Add sequence markers at speaker change points.
 * @param {string} markerDataJson - JSON string of marker data
 */
function autocast_addMarkers(markerDataJson) {
    try {
        var data = JSON.parse(markerDataJson);
        var result = addSpeakerMarkers(data);
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}
