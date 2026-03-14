/**
 * AutoCast - Quick Gain Scan (stdio worker)
 *
 * Lightweight alternative to the full analyzer:
 * Only computes RMS profiles and gain matching per track.
 * Skips VAD, spectral analysis, segment building, overlap resolution
 * and waveform preview.
 *
 * Used on plugin startup to quickly set per-track sensitivity presets
 * without running the full analysis pipeline.
 *
 * Input  (stdin, JSON): { trackPaths: string[] }
 * Output (stdout, JSON lines):
 *   { type: 'progress', percent, message }
 *   { type: 'done', result: { tracks: [{ name, gainAdjustDb, noiseFloorDb }] } }
 *   { type: 'error', error: string }
 */

'use strict';

var path = require('path');
var wavReader = require('./modules/io/wav_reader');
var rmsCalc = require('./modules/energy/rms_calculator');
var gainNormalizer = require('./modules/energy/gain_normalizer');
var stdioJsonWorker = require('./interfaces/worker/stdio_json_worker');
var analyzerContracts = require('./core/contracts/analyzer_contracts');

function runQuickGainScan(trackPaths, progress) {
    var paths = trackPaths || [];
    var frameDurationMs = 10;
    var progressCb = progress || function () { };

    if (paths.length === 0) {
        throw new Error('No track paths provided.');
    }

    progressCb(5, 'Lese Audiodateien...');

    var rmsProfiles = [];
    var trackInfos = [];

    for (var i = 0; i < paths.length; i++) {
        var pct = 5 + Math.round((i / paths.length) * 70);
        var absPath = path.resolve(paths[i]);
        progressCb(pct, 'Lese: ' + path.basename(absPath));

        var wav = wavReader.readWav(absPath);
        var rmsResult = rmsCalc.calculateRMS(wav.samples, wav.sampleRate, frameDurationMs);
        var noiseInfo = rmsCalc.estimateNoiseFloor(rmsResult.rms);

        rmsProfiles.push(rmsResult.rms);
        trackInfos.push({
            name: path.basename(absPath, path.extname(absPath)),
            noiseFloorDb: Math.round(noiseInfo.noiseFloorDb * 10) / 10
        });
    }

    progressCb(80, 'Berechne Gain-Anpassungen...');

    var gainInfo = gainNormalizer.computeGainMatching(rmsProfiles);
    for (i = 0; i < trackInfos.length; i++) {
        trackInfos[i].gainAdjustDb = gainInfo.gainsDb[i];
    }

    progressCb(100, 'Fertig.');
    return { tracks: trackInfos };
}

if (require.main === module) {
    stdioJsonWorker.runJsonWorker(function (msg, progress) {
        var request = analyzerContracts.validateQuickGainScanRequest(msg);
        var result = runQuickGainScan(request.trackPaths, progress);
        analyzerContracts.assertQuickGainScanResult(result);
        return analyzerContracts.withContract(result, 'quick_gain_scan_result');
    });
}

module.exports = {
    runQuickGainScan: runQuickGainScan
};
