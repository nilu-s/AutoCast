/**
 * AutoCast – Quick Gain Scan (stdio worker)
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

const path = require('path');
const wavReader = require('./wav_reader');
const rmsCalc = require('./rms_calculator');
const gainNormalizer = require('./gain_normalizer');

let inputData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
    inputData += chunk;
});

process.stdin.on('end', () => {
    try {
        const msg = JSON.parse(inputData);
        const trackPaths = msg.trackPaths || [];
        const frameDurationMs = 10;

        if (trackPaths.length === 0) {
            throw new Error('No track paths provided.');
        }

        const progress = (pct, message) => {
            console.log(JSON.stringify({ type: 'progress', percent: pct, message }));
        };

        progress(5, 'Lese Audiodateien...');

        const rmsProfiles = [];
        const trackInfos = [];

        for (let i = 0; i < trackPaths.length; i++) {
            const pct = 5 + Math.round((i / trackPaths.length) * 70);
            const absPath = path.resolve(trackPaths[i]);
            progress(pct, 'Lese: ' + path.basename(absPath));

            const wav = wavReader.readWav(absPath);
            const rmsResult = rmsCalc.calculateRMS(wav.samples, wav.sampleRate, frameDurationMs);
            const noiseInfo = rmsCalc.estimateNoiseFloor(rmsResult.rms);

            rmsProfiles.push(rmsResult.rms);
            trackInfos.push({
                name: path.basename(absPath, path.extname(absPath)),
                noiseFloorDb: Math.round(noiseInfo.noiseFloorDb * 10) / 10
            });
        }

        progress(80, 'Berechne Gain-Anpassungen...');

        const gainInfo = gainNormalizer.computeGainMatching(rmsProfiles);

        for (let i = 0; i < trackInfos.length; i++) {
            trackInfos[i].gainAdjustDb = gainInfo.gainsDb[i];
        }

        progress(100, 'Fertig.');

        console.log(JSON.stringify({
            type: 'done',
            result: { tracks: trackInfos }
        }));

        process.exit(0);
    } catch (e) {
        console.log(JSON.stringify({ type: 'error', error: e.message }));
        process.exit(1);
    }
});
