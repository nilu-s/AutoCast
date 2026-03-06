/**
 * AutoCast – ExtendScript Host
 *
 * Main entry point for all ExtendScript calls from the CEP Panel.
 * Premiere Pro runs this in its internal ExtendScript engine.
 */

//@include "get_track_info.jsx"
//@include "apply_keyframes.jsx"
//@include "apply_markers.jsx"
//@include "apply_cuts.jsx"

function autocast_ping() {
    return JSON.stringify({ status: 'ok', version: '2.1.0', host: 'Premiere Pro' });
}

function autocast_getTrackInfo() {
    try {
        return JSON.stringify(getTrackInfo());
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

function autocast_applyKeyframes(keyframeDataJson) {
    try {
        var data = JSON.parse(keyframeDataJson);
        var result = applyVolumeKeyframes(data);
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

function autocast_removeKeyframes(trackIndicesJson) {
    try {
        var indices = JSON.parse(trackIndicesJson);
        var result = removeVolumeKeyframes(indices);
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

function autocast_addMarkers(markerDataJson) {
    try {
        var data = JSON.parse(markerDataJson);
        var result = addSpeakerMarkers(data);
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}

function autocast_dispatchCutProgress(percent, message) {
    try {
        if (typeof ExternalObject !== 'undefined') {
            try {
                new ExternalObject('lib:PlugPlugExternalObject');
            } catch (loadErr) { }
        }

        if (typeof CSEvent !== 'undefined') {
            var eventObj = new CSEvent('com.autocast.cutProgress', 'APPLICATION');
            eventObj.data = JSON.stringify({
                percent: percent,
                message: message || ''
            });
            eventObj.dispatch();
        }
    } catch (e) { }
}

function autocast_applyCuts(segmentDataJson) {
    try {
        var data = JSON.parse(segmentDataJson);
        var result = applyCuts(data, function (percent, message) {
            autocast_dispatchCutProgress(percent, message);
        });
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: e.toString() });
    }
}