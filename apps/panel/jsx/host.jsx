/**
 * AutoCast – ExtendScript Host
 *
 * Main entry point for all ExtendScript calls from the CEP Panel.
 * Premiere Pro runs this in its internal ExtendScript engine.
 */

//@include "get_track_info.jsx"
//@include "apply_cuts.jsx"

function autocast_ping() {
    return JSON.stringify({ status: 'ok', version: '2.2.0', host: 'Premiere Pro' });
}

function autocast_getTrackInfo() {
    try {
        var str = JSON.stringify(getTrackInfo());
        return str;
    } catch (e) {
        var errStr = JSON.stringify({ error: e.toString() });
        return errStr;
    }
}

function autocast_dispatchCutProgress(percent, message) {
    try {
        if (typeof ExternalObject !== 'undefined') {
            try {
                new ExternalObject('lib:PlugPlugExternalObject');
            } catch (loadErr) { }
        }

        if (typeof CSXSEvent !== 'undefined') {
            var eventObj = new CSXSEvent();
            eventObj.type = 'com.autocast.cutProgress';
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
        var str = JSON.stringify(result);
        return str;
    } catch (e) {
        var errStr = JSON.stringify({ error: e.toString() });
        return errStr;
    }
}

