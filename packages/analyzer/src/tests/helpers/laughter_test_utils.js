'use strict';

var SAMPLE_RATE = 16000;
var FRAME_MS = 10;

function seededRandom(seed) {
    var x = seed >>> 0;
    return function () {
        x = (1664525 * x + 1013904223) >>> 0;
        return x / 4294967296;
    };
}

function pulsedNoise(durationSec, pulseHz, amplitude, seed) {
    var n = Math.round(durationSec * SAMPLE_RATE);
    var out = new Float32Array(n);
    var rnd = seededRandom(seed || 1);
    for (var i = 0; i < n; i++) {
        var t = i / SAMPLE_RATE;
        var pulse = Math.max(0, Math.sin(2 * Math.PI * pulseHz * t));
        var env = 0.22 + 0.78 * pulse;
        var noise = (rnd() * 2 - 1) * amplitude;
        out[i] = noise * env;
    }
    return out;
}

function steadySine(durationSec, freqHz, amplitude) {
    var n = Math.round(durationSec * SAMPLE_RATE);
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
        var t = i / SAMPLE_RATE;
        out[i] = Math.sin(2 * Math.PI * freqHz * t) * amplitude;
    }
    return out;
}

function knockTrain(durationSec, intervalMs, amplitude) {
    var n = Math.round(durationSec * SAMPLE_RATE);
    var out = new Float32Array(n);
    var step = Math.max(1, Math.round((intervalMs / 1000) * SAMPLE_RATE));

    for (var i = 0; i < n; i += step) {
        out[i] = amplitude;
        if (i + 1 < n) out[i + 1] = amplitude * 0.45;
        if (i + 2 < n) out[i + 2] = amplitude * 0.18;
    }
    return out;
}

function meanRange(arr, start, end) {
    var s = Math.max(0, start);
    var e = Math.min(arr.length, end);
    if (e <= s) return 0;
    var sum = 0;
    var count = 0;
    for (var i = s; i < e; i++) {
        sum += arr[i];
        count++;
    }
    return count > 0 ? (sum / count) : 0;
}

module.exports = {
    SAMPLE_RATE: SAMPLE_RATE,
    FRAME_MS: FRAME_MS,
    pulsedNoise: pulsedNoise,
    steadySine: steadySine,
    knockTrain: knockTrain,
    meanRange: meanRange
};
