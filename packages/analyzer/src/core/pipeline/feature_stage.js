'use strict';

var spectralVad = require('../../modules/vad/spectral_vad');
var WavStreamReader = require('../../modules/io/wav_stream_reader').WavStreamReader;
var runtimeUtils = require('../utils/runtime_utils');

var DEFAULT_STREAM_CHUNK_SAMPLES = 65536;

function runFeatureStage(ctx) {
    ctx = ctx || {};

    var audioData = ctx.audioData || [];
    var effectiveOffsetsSec = ctx.effectiveOffsetsSec || [];
    var params = ctx.params || {};
    var progress = ctx.progress || function () { };

    var trackCount = audioData.length;
    var spectralResults = [];
    var fingerprintResults = [];
    var laughterResults = [];
    var i;

    if (params.useSpectralVAD || params.useLaughterDetection) {
        if (params.useSpectralVAD && params.useLaughterDetection) {
            progress(35, 'Running spectral + laughter analysis (streaming)...');
        } else if (params.useSpectralVAD) {
            progress(35, 'Running spectral analysis (streaming)...');
        } else {
            progress(35, 'Running laughter analysis...');
        }

        var totalSamples = 0;
        for (i = 0; i < trackCount; i++) {
            if (audioData[i] && audioData[i].path) {
                totalSamples += audioData[i].totalSamples || 0;
            }
        }
        if (totalSamples <= 0) totalSamples = 1;

        var processedSamples = 0;

        for (i = 0; i < trackCount; i++) {
            progress(
                35 + Math.round((processedSamples / totalSamples) * 10),
                'Feature stream for track ' + (i + 1) + '/' + trackCount
            );

            var track = audioData[i] || {};
            if (!track.path) {
                spectralResults.push(null);
                fingerprintResults.push(null);
                continue;
            }

            if (params.useSpectralVAD) {
                var features = computeTrackFeaturesStreaming(track, params, function (sampleCount) {
                    processedSamples += sampleCount;
                    progress(
                        35 + Math.round((processedSamples / totalSamples) * 10),
                        'Feature stream for track ' + (i + 1) + '/' + trackCount
                    );
                });

                var spectral = {
                    confidence: features.confidence,
                    spectralFlux: features.spectralFlux,
                    frameCount: features.frameCount
                };

                var fingerprint = {
                    bands: features.bands,
                    frameCount: features.frameCount,
                    numBands: features.numBands
                };

                spectral.confidence = runtimeUtils.applyOffsetToArray(
                    spectral.confidence,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );
                fingerprint = runtimeUtils.applyOffsetToFingerprint(
                    fingerprint,
                    effectiveOffsetsSec[i],
                    params.frameDurationMs
                );

                fingerprintResults.push(fingerprint);
                spectralResults.push(spectral);
            } else {
                spectralResults.push(null);
                fingerprintResults.push(null);
            }
        }
    }

    return {
        spectralResults: spectralResults,
        fingerprintResults: fingerprintResults,
        laughterResults: laughterResults
    };
}

function computeTrackFeaturesStreaming(track, params, onSamplesProcessed) {
    var reader = new WavStreamReader(track.path);
    var frameDurationMs = params.frameDurationMs || 10;
    var frameSize = Math.round((frameDurationMs / 1000) * track.sampleRate);
    var chunkSamples = track.streamChunkSamples || DEFAULT_STREAM_CHUNK_SAMPLES;

    if (frameSize <= 0) {
        return {
            confidence: new Float64Array(0),
            spectralFlux: new Float64Array(0),
            bands: new Float32Array(0),
            frameCount: 0,
            numBands: 8
        };
    }

    var carry = new Float32Array(0);
    var confidenceChunks = [];
    var fluxChunks = [];
    var fingerprintChunks = [];
    var totalFrames = 0;
    var totalBandLength = 0;
    var numBands = 8;

    try {
        reader.openSync();

        for (var chunk of reader.readChunksSync(chunkSamples)) {
            var combined = concatFloat32(carry, chunk.samples);
            var processLength = Math.floor(combined.length / frameSize) * frameSize;

            if (processLength > 0) {
                var processSamples = combined.subarray(0, processLength);

                var spectral = spectralVad.computeSpectralVAD(
                    processSamples,
                    track.sampleRate,
                    frameDurationMs
                );

                var fingerprint = spectralVad.computeSpectralFingerprint(
                    processSamples,
                    track.sampleRate,
                    frameDurationMs
                );

                if (spectral.confidence.length > 0) {
                    confidenceChunks.push(spectral.confidence);
                    fluxChunks.push(spectral.spectralFlux);
                    totalFrames += spectral.confidence.length;
                }

                if (fingerprint && fingerprint.bands && fingerprint.bands.length > 0) {
                    fingerprintChunks.push(fingerprint.bands);
                    totalBandLength += fingerprint.bands.length;
                    numBands = fingerprint.numBands || numBands;
                }
            }

            carry = combined.slice(processLength);

            if (onSamplesProcessed) onSamplesProcessed(chunk.sampleCount || chunk.samples.length || 0);
        }
    } finally {
        reader.close();
    }

    return {
        confidence: flattenFloat64Chunks(confidenceChunks, totalFrames),
        spectralFlux: flattenFloat64Chunks(fluxChunks, totalFrames),
        bands: flattenFloat32Chunks(fingerprintChunks, totalBandLength),
        frameCount: totalFrames,
        numBands: numBands
    };
}

function concatFloat32(a, b) {
    if (!a || a.length === 0) return b;
    if (!b || b.length === 0) return a;

    var out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
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

function flattenFloat32Chunks(chunks, totalLength) {
    if (!totalLength) return new Float32Array(0);

    var out = new Float32Array(totalLength);
    var write = 0;
    for (var i = 0; i < chunks.length; i++) {
        out.set(chunks[i], write);
        write += chunks[i].length;
    }
    return out;
}

module.exports = {
    runFeatureStage: runFeatureStage
};