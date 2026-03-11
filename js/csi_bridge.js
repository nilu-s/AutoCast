/**
 * AutoCast – CSInterface Bridge
 */

'use strict';

var AutoCastBridge = (function () {
    var csInterface = null;
    var isMockMode = false;
    var CUT_PROGRESS_EVENT = 'com.autocast.cutProgress';

    function init() {
        try {
            csInterface = new CSInterface();
            isMockMode = !!window.__AUTOCAST_MOCK_MODE__;
        } catch (e) {
            console.error('[Bridge] Failed to create CSInterface:', e);
            isMockMode = true;
        }

        if (isMockMode) {
            console.log('[Bridge] Running in MOCK mode (browser testing).');
        } else {
            console.log('[Bridge] Connected to Premiere Pro.');
        }

        return !isMockMode;
    }

    function callExtendScript(fnName, arg, callback) {
        var script;

        if (arg !== undefined && arg !== null) {
            var jsonArg = JSON.stringify(arg)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'");
            script = fnName + "('" + jsonArg + "')";
        } else {
            script = fnName + '()';
        }

        csInterface.evalScript(script, function (rawResult) {
            var parsed = null;
            try {
                parsed = JSON.parse(rawResult);
            } catch (e) {
                parsed = rawResult;
            }
            if (callback) callback(parsed);
        });
    }

    function ping(callback) {
        callExtendScript('autocast_ping', null, callback);
    }

    function getTrackInfo(callback) {
        callExtendScript('autocast_getTrackInfo', null, callback);
    }

    function applyKeyframes(keyframeData, callback) {
        callExtendScript('autocast_applyKeyframes', keyframeData, callback);
    }

    function applyCuts(cutData, callback) {
        callExtendScript('autocast_applyCuts', cutData, callback);
    }

    function captureTrackState(captureData, callback) {
        callExtendScript('autocast_captureTrackState', captureData, callback);
    }

    function restoreTrackState(restoreData, callback) {
        callExtendScript('autocast_restoreTrackState', restoreData, callback);
    }

    function applyGainNormalization(gainData, callback) {
        callExtendScript('autocast_applyGainNormalization', gainData, callback);
    }

    function removeKeyframes(trackIndices, callback) {
        callExtendScript('autocast_removeKeyframes', trackIndices, callback);
    }

    function addMarkers(markerData, callback) {
        callExtendScript('autocast_addMarkers', markerData, callback);
    }

    function addCutProgressListener(handler) {
        if (!csInterface || isMockMode) return;
        csInterface.addEventListener(CUT_PROGRESS_EVENT, handler);
    }

    function removeCutProgressListener(handler) {
        if (!csInterface || isMockMode) return;
        csInterface.removeEventListener(CUT_PROGRESS_EVENT, handler);
    }

    function getCutProgressEventName() {
        return CUT_PROGRESS_EVENT;
    }

    function getExtensionPath() {
        if (!csInterface) return '.';
        return csInterface.getSystemPath(SystemPath.EXTENSION);
    }

    function isInMockMode() {
        return isMockMode;
    }

    return {
        init: init,
        ping: ping,
        getTrackInfo: getTrackInfo,
        applyKeyframes: applyKeyframes,
        applyCuts: applyCuts,
        captureTrackState: captureTrackState,
        restoreTrackState: restoreTrackState,
        applyGainNormalization: applyGainNormalization,
        removeKeyframes: removeKeyframes,
        addMarkers: addMarkers,
        addCutProgressListener: addCutProgressListener,
        removeCutProgressListener: removeCutProgressListener,
        getCutProgressEventName: getCutProgressEventName,
        getExtensionPath: getExtensionPath,
        isInMockMode: isInMockMode
    };
})();