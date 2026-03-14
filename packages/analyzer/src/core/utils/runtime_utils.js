'use strict';

function clampNumber(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function getTrackOffsetSec(trackOffsets, trackIndex) {
    if (!trackOffsets || trackOffsets[trackIndex] === undefined) return 0;
    var offset = parseFloat(trackOffsets[trackIndex]);
    return isNaN(offset) ? 0 : offset;
}

function applyOffsetToArray(arr, offsetSec, frameDurationMs) {
    if (!arr || arr.length === 0) return arr;
    if (!offsetSec) return arr;

    var frameDurSec = frameDurationMs / 1000;
    var padFrames = Math.round(offsetSec / frameDurSec);
    if (padFrames === 0) return arr;

    var Ctor = arr.constructor || Float64Array;

    if (padFrames > 0) {
        var padded = new Ctor(arr.length + padFrames);
        padded.set(arr, padFrames);
        return padded;
    }

    var trimFrames = Math.abs(padFrames);
    if (trimFrames >= arr.length) {
        return new Ctor(0);
    }

    return arr.slice(trimFrames);
}

function applyOffsetToFingerprint(fp, offsetSec, frameDurationMs) {
    if (!fp || !fp.bands || !fp.numBands) return fp;
    if (!offsetSec) return fp;

    var frameDurSec = frameDurationMs / 1000;
    var padFrames = Math.round(offsetSec / frameDurSec);
    if (padFrames === 0) return fp;

    var numBands = fp.numBands;

    if (padFrames > 0) {
        var outBands = new Float32Array((fp.frameCount + padFrames) * numBands);
        outBands.set(fp.bands, padFrames * numBands);
        return {
            bands: outBands,
            frameCount: fp.frameCount + padFrames,
            numBands: numBands
        };
    }

    var trim = Math.abs(padFrames);
    if (trim >= fp.frameCount) {
        return {
            bands: new Float32Array(0),
            frameCount: 0,
            numBands: numBands
        };
    }

    return {
        bands: fp.bands.slice(trim * numBands),
        frameCount: fp.frameCount - trim,
        numBands: numBands
    };
}

function cloneUint8Array(arr) {
    var out = new Uint8Array(arr.length);
    out.set(arr);
    return out;
}

function getFrameValue(arr, frameIndex, fallback) {
    if (!arr || frameIndex < 0 || frameIndex >= arr.length) return fallback;
    return arr[frameIndex];
}

function roundNumber(v, digits) {
    if (!isFinite(v)) return v;
    var factor = Math.pow(10, digits || 0);
    return Math.round(v * factor) / factor;
}

module.exports = {
    clampNumber: clampNumber,
    getTrackOffsetSec: getTrackOffsetSec,
    applyOffsetToArray: applyOffsetToArray,
    applyOffsetToFingerprint: applyOffsetToFingerprint,
    cloneUint8Array: cloneUint8Array,
    getFrameValue: getFrameValue,
    roundNumber: roundNumber
};
