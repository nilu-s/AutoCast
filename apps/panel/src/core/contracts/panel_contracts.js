'use strict';

(function (root) {
    var PANEL_CONTRACT_VERSION = 'autocast.panel.v1';

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function normalizeTrackPaths(trackPaths) {
        var input = Array.isArray(trackPaths) ? trackPaths : [];
        var out = [];
        for (var i = 0; i < input.length; i++) {
            var p = input[i];
            if (p === null || p === undefined || p === '') {
                out.push(null);
                continue;
            }
            out.push(String(p));
        }
        return out;
    }

    function validateAnalyzeRequest(trackPaths, params) {
        var normalized = normalizeTrackPaths(trackPaths);
        if (normalized.length === 0) {
            return { ok: false, message: 'trackPaths missing.' };
        }
        return {
            ok: true,
            value: {
                trackPaths: normalized,
                params: isObject(params) ? params : {}
            }
        };
    }

    function validateQuickGainRequest(trackPaths) {
        var normalized = normalizeTrackPaths(trackPaths);
        var hasValidPath = false;
        for (var i = 0; i < normalized.length; i++) {
            if (normalized[i]) {
                hasValidPath = true;
                break;
            }
        }
        if (!hasValidPath) {
            return { ok: false, message: 'quick gain scan requires at least one valid path.' };
        }
        return { ok: true, value: normalized };
    }

    function validateAnalyzeResult(result) {
        if (!isObject(result)) return { ok: false, message: 'Analyze result must be an object.' };
        if (!Array.isArray(result.tracks)) return { ok: false, message: 'Analyze result missing tracks array.' };
        if (!Array.isArray(result.segments)) return { ok: false, message: 'Analyze result missing segments array.' };
        if (!isObject(result.alignment)) return { ok: false, message: 'Analyze result missing alignment object.' };
        if (!isObject(result.waveform)) return { ok: false, message: 'Analyze result missing waveform object.' };
        return { ok: true, value: result };
    }

    function validateQuickGainResult(result) {
        if (!isObject(result)) return { ok: false, message: 'Quick gain result must be an object.' };
        if (!Array.isArray(result.tracks)) return { ok: false, message: 'Quick gain result missing tracks array.' };
        return { ok: true, value: result };
    }

    function validateGetTrackInfoResult(result) {
        if (!isObject(result)) return { ok: false, message: 'Track info result must be an object.' };
        if (result.error) return { ok: true, value: result };
        if (!Array.isArray(result.tracks)) return { ok: false, message: 'Track info missing tracks array.' };
        if (!isFiniteNumber(result.ticksPerSecond)) {
            result.ticksPerSecond = 254016000000;
        }
        return { ok: true, value: result };
    }

    function validateApplyCutsPayload(payload) {
        if (!isObject(payload)) return { ok: false, message: 'Apply payload must be an object.' };
        if (!Array.isArray(payload.trackIndices)) return { ok: false, message: 'Apply payload missing trackIndices.' };
        if (!Array.isArray(payload.segments)) return { ok: false, message: 'Apply payload missing segments.' };
        if (!Array.isArray(payload.fillSegments)) return { ok: false, message: 'Apply payload missing fillSegments.' };
        return { ok: true, value: payload };
    }

    function validateApplyCutsResult(result) {
        if (!isObject(result)) return { ok: false, message: 'Apply result must be an object.' };
        if (result.error) return { ok: true, value: result };
        if (typeof result.success !== 'boolean') return { ok: false, message: 'Apply result missing success flag.' };
        return { ok: true, value: result };
    }

    root.AutoCastPanelContracts = {
        PANEL_CONTRACT_VERSION: PANEL_CONTRACT_VERSION,
        normalizeTrackPaths: normalizeTrackPaths,
        validateAnalyzeRequest: validateAnalyzeRequest,
        validateQuickGainRequest: validateQuickGainRequest,
        validateAnalyzeResult: validateAnalyzeResult,
        validateQuickGainResult: validateQuickGainResult,
        validateGetTrackInfoResult: validateGetTrackInfoResult,
        validateApplyCutsPayload: validateApplyCutsPayload,
        validateApplyCutsResult: validateApplyCutsResult
    };
})(this);
