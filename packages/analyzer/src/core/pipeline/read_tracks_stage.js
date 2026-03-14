'use strict';

var path = require('path');
var wavReader = require('../../modules/io/wav_reader');
var runtimeUtils = require('../utils/runtime_utils');

function runReadTracksStage(ctx) {
    ctx = ctx || {};

    var trackPaths = ctx.trackPaths || [];
    var params = ctx.params || {};
    var progress = ctx.progress || function () { };

    var trackCount = trackPaths.length;
    if (trackCount === 0) {
        throw new Error('No tracks provided for analysis.');
    }

    progress(5, 'Reading audio files...');

    var trackInfos = [];
    var audioData = [];
    var i;

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
                sampleRate: 48000,
                channels: 1,
                bitDepth: 16,
                samples: new Float32Array(0),
                durationSec: 0
            });
            continue;
        }

        var absPath = path.resolve(p);
        progress(5 + Math.round((i / trackCount) * 10), 'Reading: ' + path.basename(absPath));

        var wav = wavReader.readWav(absPath);
        trackInfos.push({
            path: absPath,
            name: path.basename(absPath, path.extname(absPath)),
            durationSec: wav.durationSec,
            sampleRate: wav.sampleRate,
            channels: wav.channels,
            bitDepth: wav.bitDepth
        });
        audioData.push(wav);
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
