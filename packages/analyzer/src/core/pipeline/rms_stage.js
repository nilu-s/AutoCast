'use strict';

var rmsCalc = require('../../modules/energy/rms_calculator');
var gainNormalizer = require('../../modules/energy/gain_normalizer');
var runtimeUtils = require('../utils/runtime_utils');
var WavStreamReader = require('../../modules/io/wav_stream_reader').WavStreamReader;

var DEFAULT_STREAM_CHUNK_SAMPLES = 65536;
var PREPROCESS_HIGHPASS_CUTOFF_HZ = 80;
var PREPROCESS_TARGET_PEAK = 0.5;

function runRmsStage(ctx) {
    ctx = ctx || {};

    var audioData = ctx.audioData || [];
    var effectiveOffsetsSec = ctx.effectiveOffsetsSec || [];
    var params = ctx.params || {};
    var progress = ctx.progress || function () { };
    var trackInfos = ctx.trackInfos || [];

    var trackCount = audioData.length;
    var rmsProfiles = [];
    var rawRmsProfiles = [];
    var i;

    progress(20, 'Calculating audio energy (streaming)...');

    var preprocessPasses = params.enablePreprocess ? 2 : 1;
    var totalWorkSamples = 0;
    for (i = 0; i < trackCount; i++) {
        if (audioData[i] && audioData[i].path) {
            totalWorkSamples += (audioData[i].totalSamples || 0) * preprocessPasses;
        }
    }
    if (totalWorkSamples <= 0) totalWorkSamples = 1;

    var processedWorkSamples = 0;

    for (i = 0; i < trackCount; i++) {
        var track = audioData[i] || {};

        if (!track.path) {
            rmsProfiles.push(new Float64Array(0));
            rawRmsProfiles.push(new Float64Array(0));
            continue;
        }

        progress(
            20 + Math.round((processedWorkSamples / totalWorkSamples) * 10),
            'RMS stream for track ' + (i + 1) + '/' + trackCount
        );

        var rmsTrack = computeTrackRmsStreaming(track, params, function (sampleCount) {
            processedWorkSamples += sampleCount;
            progress(
                20 + Math.round((processedWorkSamples / totalWorkSamples) * 10),
                'RMS stream for track ' + (i + 1) + '/' + trackCount
            );
        });

        var rmsArr = runtimeUtils.applyOffsetToArray(
            rmsTrack,
            effectiveOffsetsSec[i],
            params.frameDurationMs
        );

        rmsProfiles.push(rmsArr);
        rawRmsProfiles.push(rmsArr);
    }

    var gainInfo = null;
    if (params.autoGain) {
        progress(32, 'Matching track volumes...');
        gainInfo = gainNormalizer.computeGainMatching(rmsProfiles);
        rmsProfiles = gainNormalizer.applyGainToRMS(rmsProfiles, gainInfo.gains);

        for (i = 0; i < trackCount; i++) {
            if (trackInfos[i]) {
                trackInfos[i].gainAdjustDb = gainInfo.gainsDb[i];
            }
        }
    }

    return {
        rmsProfiles: rmsProfiles,
        rawRmsProfiles: rawRmsProfiles,
        gainInfo: gainInfo
    };
}

function computeTrackRmsStreaming(track, params, onSamplesProcessed) {
    if (params.enablePreprocess) {
        return computeTrackRmsWithPreprocessStreaming(track, params, onSamplesProcessed);
    }
    return computeTrackRmsRawStreaming(track, params, onSamplesProcessed);
}

function computeTrackRmsRawStreaming(track, params, onSamplesProcessed) {
    var reader = new WavStreamReader(track.path);
    var frameDurationMs = params.frameDurationMs || 10;
    var chunkSamples = track.streamChunkSamples || DEFAULT_STREAM_CHUNK_SAMPLES;
    var state = rmsCalc.createRMSStreamingState(track.sampleRate, frameDurationMs);
    var rmsChunks = [];
    var totalFrames = 0;

    try {
        reader.openSync();

        for (var chunk of reader.readChunksSync(chunkSamples)) {
            var rmsResult = rmsCalc.calculateRMSStreaming(
                chunk.samples,
                track.sampleRate,
                frameDurationMs,
                state
            );
            state = rmsResult.newState;

            if (rmsResult.rmsChunk.length > 0) {
                rmsChunks.push(rmsResult.rmsChunk);
                totalFrames += rmsResult.rmsChunk.length;
            }

            if (onSamplesProcessed) onSamplesProcessed(chunk.sampleCount || chunk.samples.length || 0);
        }
    } finally {
        reader.close();
    }

    return flattenFloat64Chunks(rmsChunks, totalFrames);
}

function computeTrackRmsWithPreprocessStreaming(track, params, onSamplesProcessed) {
    var frameDurationMs = params.frameDurationMs || 10;
    var chunkSamples = track.streamChunkSamples || DEFAULT_STREAM_CHUNK_SAMPLES;

    // Pass 1: compute max peak of high-pass filtered stream (for normalize gain)
    var gain = computePreprocessGain(track, chunkSamples, onSamplesProcessed);

    // Pass 2: stream high-pass + normalize and compute RMS
    var reader = new WavStreamReader(track.path);
    var hpState = createHighPassState(track.sampleRate, PREPROCESS_HIGHPASS_CUTOFF_HZ);
    var rmsState = rmsCalc.createRMSStreamingState(track.sampleRate, frameDurationMs);
    var rmsChunks = [];
    var totalFrames = 0;

    try {
        reader.openSync();

        for (var chunk of reader.readChunksSync(chunkSamples)) {
            var filtered = applyHighPassChunk(chunk.samples, hpState);
            var normalized = applyGainChunk(filtered, gain);

            var rmsResult = rmsCalc.calculateRMSStreaming(
                normalized,
                track.sampleRate,
                frameDurationMs,
                rmsState
            );
            rmsState = rmsResult.newState;

            if (rmsResult.rmsChunk.length > 0) {
                rmsChunks.push(rmsResult.rmsChunk);
                totalFrames += rmsResult.rmsChunk.length;
            }

            if (onSamplesProcessed) onSamplesProcessed(chunk.sampleCount || chunk.samples.length || 0);
        }
    } finally {
        reader.close();
    }

    return flattenFloat64Chunks(rmsChunks, totalFrames);
}

function computePreprocessGain(track, chunkSamples, onSamplesProcessed) {
    var reader = new WavStreamReader(track.path);
    var hpState = createHighPassState(track.sampleRate, PREPROCESS_HIGHPASS_CUTOFF_HZ);
    var maxAbs = 0;

    try {
        reader.openSync();

        for (var chunk of reader.readChunksSync(chunkSamples)) {
            var filtered = applyHighPassChunk(chunk.samples, hpState);
            var chunkPeak = peakAbs(filtered);
            if (chunkPeak > maxAbs) maxAbs = chunkPeak;

            if (onSamplesProcessed) onSamplesProcessed(chunk.sampleCount || chunk.samples.length || 0);
        }
    } finally {
        reader.close();
    }

    if (maxAbs === 0) return 1;
    return PREPROCESS_TARGET_PEAK / maxAbs;
}

function createHighPassState(sampleRate, cutoffHz) {
    var rc = 1.0 / (2.0 * Math.PI * cutoffHz);
    var dt = 1.0 / sampleRate;
    var alpha = rc / (rc + dt);

    return {
        alpha: alpha,
        hasPrev: false,
        prevInput: 0,
        prevFiltered: 0
    };
}

function applyHighPassChunk(samples, state) {
    var out = new Float32Array(samples.length);

    for (var i = 0; i < samples.length; i++) {
        var x = samples[i];
        var y;

        if (!state.hasPrev) {
            y = Math.fround(x);
            state.hasPrev = true;
        } else {
            y = Math.fround(state.alpha * (state.prevFiltered + x - state.prevInput));
        }

        out[i] = y;
        state.prevInput = x;
        state.prevFiltered = y;
    }

    return out;
}

function applyGainChunk(samples, gain) {
    if (gain === 1) return samples;

    var out = new Float32Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
        out[i] = Math.fround(samples[i] * gain);
    }
    return out;
}

function peakAbs(samples) {
    var max = 0;
    for (var i = 0; i < samples.length; i++) {
        var abs = Math.abs(samples[i]);
        if (abs > max) max = abs;
    }
    return max;
}

function flattenFloat64Chunks(chunks, totalLength) {
    if (!totalLength) return new Float64Array(0);

    var out = new Float64Array(totalLength);
    var write = 0;

    for (var i = 0; i < chunks.length; i++) {
        out.set(chunks[i], write);
        write += chunks[i].length;
    }

    return out;
}

module.exports = {
    runRmsStage: runRmsStage
};