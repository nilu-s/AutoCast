'use strict';

var path = require('path');
var wavReader = require('../../modules/io/wav_reader');
var WavStreamReader = require('../../modules/io/wav_stream_reader').WavStreamReader;
var runtimeUtils = require('../utils/runtime_utils');

var DEFAULT_STREAM_CHUNK_SAMPLES = 65536;

function runReadTracksStage(ctx) {
    ctx = ctx || {};

    var trackPaths = ctx.trackPaths || [];
    var params = ctx.params || {};
    var progress = ctx.progress || function () { };

    var trackCount = trackPaths.length;
    if (trackCount === 0) {
        throw new Error('No tracks provided for analysis.');
    }

    progress(5, 'Reading audio file metadata...');

    var trackInfos = [];
    var audioData = [];
    var i;
    var streamChunkSamples = Math.max(1024, params.streamChunkSizeSamples || DEFAULT_STREAM_CHUNK_SAMPLES);

    for (i = 0; i < trackCount; i++) {
        var p = trackPaths[i];
        if (!p) {
            trackInfos.push({
                path: null,
                name: 'Unused Track ' + (i + 1),
                durationSec: 0,
                sampleRate: 48000,
                channels: 1,
                bitDepth: 16
            });
            audioData.push({
                path: null,
                sampleRate: 48000,
                channels: 1,
                bitDepth: 16,
                durationSec: 0,
                totalSamples: 0,
                samples: new Float32Array(0),
                streamChunkSamples: streamChunkSamples
            });
            continue;
        }

        var absPath = path.resolve(p);
        progress(5 + Math.round((i / trackCount) * 10), 'Reading header: ' + path.basename(absPath));

        var streamReader = new WavStreamReader(absPath);
        try {
            streamReader.openSync();

            trackInfos.push({
                path: absPath,
                name: path.basename(absPath, path.extname(absPath)),
                durationSec: streamReader.durationSec,
                sampleRate: streamReader.sampleRate,
                channels: streamReader.channels,
                bitDepth: streamReader.bitDepth
            });

            audioData.push({
                path: absPath,
                sampleRate: streamReader.sampleRate,
                channels: streamReader.channels,
                bitDepth: streamReader.bitDepth,
                durationSec: streamReader.durationSec,
                totalSamples: streamReader.totalSamples,
                samples: null,
                streamChunkSamples: streamChunkSamples
            });
        } finally {
            streamReader.close();
        }
    }

    progress(15, 'Checking track alignment...');
    var alignment = wavReader.checkAlignment(trackInfos, params.alignmentToleranceSec);

    var totalDurationSec = Infinity;
    var validTrackCount = 0;
    var effectiveOffsetsSec = [];

    for (i = 0; i < trackInfos.length; i++) {
        var offsetSec = runtimeUtils.getTrackOffsetSec(params.trackOffsets, i);
        effectiveOffsetsSec.push(offsetSec);

        if (!isNaN(offsetSec) && offsetSec !== 0) {
            trackInfos[i].durationSec += offsetSec;
            if (trackInfos[i].durationSec < 0) trackInfos[i].durationSec = 0;
        }

        if (trackInfos[i].path && trackInfos[i].durationSec < totalDurationSec) {
            totalDurationSec = trackInfos[i].durationSec;
            validTrackCount++;
        }
    }

    if (validTrackCount === 0) {
        totalDurationSec = 0;
    }

    alignment.appliedOffsetsSec = effectiveOffsetsSec.slice();

    return {
        trackCount: trackCount,
        trackInfos: trackInfos,
        audioData: audioData,
        alignment: alignment,
        totalDurationSec: totalDurationSec,
        effectiveOffsetsSec: effectiveOffsetsSec
    };
}

module.exports = {
    runReadTracksStage: runReadTracksStage
};