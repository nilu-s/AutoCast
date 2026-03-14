'use strict';

var ANALYZER_CONTRACT_VERSION = 'autocast.analyzer.v1';

function ensureObject(value, fallback) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return fallback || {};
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
        if (typeof p !== 'string') {
            throw new Error('Invalid trackPaths[' + i + ']: expected string or null.');
        }
        out.push(p);
    }
    return out;
}

function validateAnalyzeRequest(msg) {
    var payload = ensureObject(msg, {});
    var trackPaths = normalizeTrackPaths(payload.trackPaths);
    if (trackPaths.length === 0) {
        throw new Error('Invalid analyze request: trackPaths must contain at least one entry.');
    }
    return {
        trackPaths: trackPaths,
        params: ensureObject(payload.params, {})
    };
}

function validateQuickGainScanRequest(msg) {
    var payload = ensureObject(msg, {});
    var trackPaths = normalizeTrackPaths(payload.trackPaths);
    var nonNullCount = 0;
    for (var i = 0; i < trackPaths.length; i++) {
        if (trackPaths[i]) nonNullCount++;
    }
    if (nonNullCount === 0) {
        throw new Error('Invalid quickGainScan request: at least one valid path is required.');
    }
    return {
        trackPaths: trackPaths
    };
}

function assertAnalyzeResult(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('Invalid analyze result: expected object.');
    }
    if (!Array.isArray(result.tracks)) {
        throw new Error('Invalid analyze result: tracks must be an array.');
    }
    if (!Array.isArray(result.segments)) {
        throw new Error('Invalid analyze result: segments must be an array.');
    }
    if (!result.alignment || typeof result.alignment !== 'object') {
        throw new Error('Invalid analyze result: alignment object missing.');
    }
    if (!result.waveform || typeof result.waveform !== 'object') {
        throw new Error('Invalid analyze result: waveform object missing.');
    }
}

function assertQuickGainScanResult(result) {
    if (!result || typeof result !== 'object') {
        throw new Error('Invalid quickGainScan result: expected object.');
    }
    if (!Array.isArray(result.tracks)) {
        throw new Error('Invalid quickGainScan result: tracks must be an array.');
    }
}

function withContract(result, kind) {
    var out = ensureObject(result, {});
    out.contract = {
        name: kind,
        version: ANALYZER_CONTRACT_VERSION
    };
    return out;
}

module.exports = {
    ANALYZER_CONTRACT_VERSION: ANALYZER_CONTRACT_VERSION,
    normalizeTrackPaths: normalizeTrackPaths,
    validateAnalyzeRequest: validateAnalyzeRequest,
    validateQuickGainScanRequest: validateQuickGainScanRequest,
    assertAnalyzeResult: assertAnalyzeResult,
    assertQuickGainScanResult: assertQuickGainScanResult,
    withContract: withContract
};
