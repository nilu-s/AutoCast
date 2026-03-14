'use strict';

(function (root) {
    function pickBridge() {
        return root.AutoCastBridge || null;
    }

    root.AutoCastHostAdapter = {
        init: function () {
            var bridge = pickBridge();
            return bridge && typeof bridge.init === 'function' ? bridge.init() : false;
        },
        ping: function (callback) {
            var bridge = pickBridge();
            if (bridge && typeof bridge.ping === 'function') {
                bridge.ping(callback);
            }
        },
        getTrackInfo: function (callback) {
            var bridge = pickBridge();
            if (bridge && typeof bridge.getTrackInfo === 'function') {
                bridge.getTrackInfo(callback);
            }
        },
        applyCuts: function (cutData, callback) {
            var bridge = pickBridge();
            if (bridge && typeof bridge.applyCuts === 'function') {
                bridge.applyCuts(cutData, callback);
            }
        },
        addCutProgressListener: function (handler) {
            var bridge = pickBridge();
            if (bridge && typeof bridge.addCutProgressListener === 'function') {
                bridge.addCutProgressListener(handler);
            }
        },
        removeCutProgressListener: function (handler) {
            var bridge = pickBridge();
            if (bridge && typeof bridge.removeCutProgressListener === 'function') {
                bridge.removeCutProgressListener(handler);
            }
        },
        getCutProgressEventName: function () {
            var bridge = pickBridge();
            if (bridge && typeof bridge.getCutProgressEventName === 'function') {
                return bridge.getCutProgressEventName();
            }
            return 'com.autocast.cutProgress';
        },
        getExtensionPath: function () {
            var bridge = pickBridge();
            if (bridge && typeof bridge.getExtensionPath === 'function') {
                return bridge.getExtensionPath();
            }
            return '.';
        },
        isInMockMode: function () {
            var bridge = pickBridge();
            if (bridge && typeof bridge.isInMockMode === 'function') {
                return bridge.isInMockMode();
            }
            return true;
        },
        resizePanel: function (width, height) {
            var bridge = pickBridge();
            if (bridge && typeof bridge.resizePanel === 'function') {
                return bridge.resizePanel(width, height);
            }
            return false;
        }
    };
})(this);
