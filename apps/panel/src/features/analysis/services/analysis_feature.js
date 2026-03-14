'use strict';

(function (root) {
    function cloneFlatObject(obj) {
        var out = {};
        if (!obj) return out;
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                out[key] = obj[key];
            }
        }
        return out;
    }

    function getDebugMode(win) {
        var debugMode = false;
        try {
            debugMode = (win && win.__AUTOCAST_DEBUG__ === true) ||
                (win && win.localStorage && win.localStorage.getItem('autocast.debug') === '1');
        } catch (e) { }
        return debugMode;
    }

    function getPerTrackSensitivity(perTrackSensitivity, trackCount, globalThreshold) {
        var hasPerTrack = false;
        var map = perTrackSensitivity || {};

        for (var key in map) {
            if (Object.prototype.hasOwnProperty.call(map, key)) {
                hasPerTrack = true;
                break;
            }
        }

        if (!hasPerTrack) return null;

        var arr = [];
        for (var i = 0; i < trackCount; i++) {
            arr.push(map[i] !== undefined ? map[i] : globalThreshold);
        }
        return arr;
    }

    function buildAnalyzerParams(input) {
        input = input || {};
        var params = cloneFlatObject(input.defaults || {});
        params.thresholdAboveFloorDb = parseInt(input.thresholdValue, 10);
        params.finalMinPeakDbFs = parseFloat(input.minPeakValue);
        params.perTrackThresholdDb = input.perTrackThresholdDb || null;
        params.debugMode = !!input.debugMode;
        return params;
    }

    function collectTrackPaths(tracks) {
        var out = {
            trackPaths: [],
            firstError: '',
            hasValid: false
        };
        var list = Array.isArray(tracks) ? tracks : [];

        for (var i = 0; i < list.length; i++) {
            var track = list[i] || {};
            var p = track.path;

            if (track.selected !== false) {
                if (p && p.charAt(0) !== '[') {
                    out.trackPaths.push(p);
                } else {
                    out.trackPaths.push(null);
                    if (p && !out.firstError) out.firstError = p;
                }
            } else {
                out.trackPaths.push(null);
            }
        }

        for (i = 0; i < out.trackPaths.length; i++) {
            if (out.trackPaths[i]) {
                out.hasValid = true;
                break;
            }
        }

        return out;
    }

    function buildAutoSensitivityMap(input) {
        input = input || {};
        var scanResult = input.scanResult || {};
        var trackPaths = Array.isArray(input.trackPaths) ? input.trackPaths : [];
        var trackCount = parseInt(input.trackCount, 10) || 0;
        var globalThreshold = parseInt(input.globalThreshold, 10);
        if (!isFinite(globalThreshold)) globalThreshold = 0;

        var tracks = Array.isArray(scanResult.tracks) ? scanResult.tracks : [];
        var out = {};
        var validIndex = 0;

        for (var ti = 0; ti < trackCount; ti++) {
            if (!trackPaths[ti]) continue;
            var gainDb = (tracks[validIndex] && tracks[validIndex].gainAdjustDb) || 0;
            var recommended = Math.round(globalThreshold - gainDb * 0.25);
            recommended = Math.max(-8, Math.min(8, recommended));
            out[ti] = recommended;
            validIndex++;
        }

        return out;
    }

    root.AutoCastPanelAnalysisFeature = {
        getDebugMode: getDebugMode,
        getPerTrackSensitivity: getPerTrackSensitivity,
        buildAnalyzerParams: buildAnalyzerParams,
        collectTrackPaths: collectTrackPaths,
        buildAutoSensitivityMap: buildAutoSensitivityMap
    };
})(this);
