/**
 * AutoCast – CSInterface Bridge
 * 
 * Wrapper around Adobe's CSInterface for communication between
 * the Panel (HTML/JS) and ExtendScript (JSX).
 * Falls back to mock if CSInterface is not available.
 */

'use strict';

var AutoCastBridge = (function () {
    var csInterface = null;
    var isMockMode = false;

    /**
     * Initialize the bridge.
     * @returns {boolean} true if connected to Premiere, false if mock mode
     */
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

    /**
     * Call an ExtendScript function.
     * @param {string} fnName - Function name in host.jsx
     * @param {*} [arg] - Argument (will be JSON.stringify'd)
     * @param {function} callback - function(result) 
     */
    function callExtendScript(fnName, arg, callback) {
        var script;
        if (arg !== undefined && arg !== null) {
            var jsonArg = JSON.stringify(arg).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

    /**
     * Ping ExtendScript to verify connection.
     */
    function ping(callback) {
        callExtendScript('autocast_ping', null, callback);
    }

    /**
     * Get track info from active sequence.
     */
    function getTrackInfo(callback) {
        callExtendScript('autocast_getTrackInfo', null, callback);
    }

    /**
     * Apply volume keyframes.
     * @param {object} keyframeData - { keyframes, trackIndices, ticksPerSecond }
     */
    function applyKeyframes(keyframeData, callback) {
        callExtendScript('autocast_applyKeyframes', keyframeData, callback);
    }

    /**
     * Remove keyframes (reset).
     * @param {Array<number>} trackIndices
     */
    function removeKeyframes(trackIndices, callback) {
        callExtendScript('autocast_removeKeyframes', trackIndices, callback);
    }

    /**
     * Add speaker markers.
     * @param {object} markerData - { segments, trackNames, ticksPerSecond }
     */
    function addMarkers(markerData, callback) {
        callExtendScript('autocast_addMarkers', markerData, callback);
    }

    /**
     * Get extension folder path (for locating Node.js modules).
     */
    function getExtensionPath() {
        if (!csInterface) return '.';
        return csInterface.getSystemPath(SystemPath.EXTENSION);
    }

    /**
     * Check if running in mock/browser mode.
     */
    function isInMockMode() {
        return isMockMode;
    }

    return {
        init: init,
        ping: ping,
        getTrackInfo: getTrackInfo,
        applyKeyframes: applyKeyframes,
        removeKeyframes: removeKeyframes,
        addMarkers: addMarkers,
        getExtensionPath: getExtensionPath,
        isInMockMode: isInMockMode
    };
})();
