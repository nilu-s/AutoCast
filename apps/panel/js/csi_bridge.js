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

    function applyCuts(cutData, callback) {
        callExtendScript('autocast_applyCuts', cutData, callback);
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

    function resizePanel(width, height) {
        if (!csInterface || isMockMode) return false;
        try {
            var w = Math.max(320, Math.round(width || 0));
            var h = Math.max(260, Math.round(height || 0));
            var resized = false;

            // Official API (limited reliability for PPro docked panels).
            try {
                csInterface.resizeContent(w, h);
                resized = true;
            } catch (e1) { }

            // Best-effort CEP window APIs (host/version dependent).
            if (window.__adobe_cep__ && typeof window.__adobe_cep__.invokeSync === 'function') {
                try {
                    window.__adobe_cep__.invokeSync('setWindowSize', JSON.stringify({ width: w, height: h }));
                    resized = true;
                } catch (e2) { }
                try {
                    window.__adobe_cep__.invokeSync('setWindowBounds', JSON.stringify({ left: 40, top: 40, right: 40 + w, bottom: 40 + h }));
                    resized = true;
                } catch (e3) { }
            }

            return resized;
        } catch (e) {
            console.warn('[Bridge] resizePanel failed:', e);
            return false;
        }
    }

    return {
        init: init,
        ping: ping,
        getTrackInfo: getTrackInfo,
        applyCuts: applyCuts,
        addCutProgressListener: addCutProgressListener,
        removeCutProgressListener: removeCutProgressListener,
        getCutProgressEventName: getCutProgressEventName,
        getExtensionPath: getExtensionPath,
        isInMockMode: isInMockMode,
        resizePanel: resizePanel
    };
})();
