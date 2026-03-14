'use strict';

(function (root) {
    function parseNum(value, fallback) {
        var num = parseFloat(value);
        return isFinite(num) ? num : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function parseCutProgressEvent(evt) {
        try {
            var payload = evt && evt.data ? JSON.parse(evt.data) : null;
            if (!payload) return null;
            return {
                percent: clamp(parseInt(payload.percent, 10) || 0, 0, 100),
                message: payload.message || 'Cutting clips...'
            };
        } catch (e) {
            return null;
        }
    }

    function buildBridgeApplyPayload(applyPayload, ticksPerSecond) {
        return {
            segments: applyPayload && applyPayload.segments ? applyPayload.segments : [],
            fillSegments: applyPayload && applyPayload.fillSegments ? applyPayload.fillSegments : [],
            trackIndices: applyPayload && applyPayload.trackIndices ? applyPayload.trackIndices : [],
            ticksPerSecond: ticksPerSecond
        };
    }

    function buildSuccessStatusText(result) {
        var trimmed = parseNum(result && result.clipsTrimmed, 0) || 0;
        var created = parseNum(result && result.clipsCreated, 0) || 0;
        var removed = parseNum(result && result.clipsRemoved, 0) || 0;
        var fillMarkers = parseNum(result && result.fillMarkersCreated, 0) || 0;

        return 'Clips cut successfully (' +
            trimmed + ' trimmed, ' +
            created + ' created, ' +
            removed + ' removed' +
            (fillMarkers ? ', ' + fillMarkers + ' fill markers' : '') +
            ')';
    }

    function extractErrorMessage(result) {
        if (typeof result === 'string') {
            return 'ExtendScript Crash: ' + result;
        }
        if (result && result.error) {
            return result.error;
        }
        if (result && result.errors && result.errors.length) {
            var message = result.errors[0];
            if (result.errors.length > 1) {
                message += ' (+' + (result.errors.length - 1) + ' more)';
            }
            return message;
        }
        return 'Cut error';
    }

    root.AutoCastPanelApplyEditsFeature = {
        parseCutProgressEvent: parseCutProgressEvent,
        buildBridgeApplyPayload: buildBridgeApplyPayload,
        buildSuccessStatusText: buildSuccessStatusText,
        extractErrorMessage: extractErrorMessage
    };
})(this);
