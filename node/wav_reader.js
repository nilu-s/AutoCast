/**
 * AutoCast – WAV File Reader
 * 
 * Parses WAV files (PCM 16-bit, 24-bit, 32-bit float) and returns
 * normalized Float32Array samples. No external dependencies.
 * 
 * Supports: mono and stereo (stereo is downmixed to mono).
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Read and parse a WAV file.
 * @param {string} filePath - Absolute path to WAV file
 * @returns {{ sampleRate: number, channels: number, bitDepth: number, samples: Float32Array, durationSec: number }}
 */
function readWav(filePath) {
    const buffer = fs.readFileSync(filePath);
    
    // --- Parse RIFF header ---
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') {
        throw new Error(`Not a valid WAV file (expected RIFF, got "${riff}"): ${filePath}`);
    }
    
    const wave = buffer.toString('ascii', 8, 12);
    if (wave !== 'WAVE') {
        throw new Error(`Not a valid WAV file (expected WAVE, got "${wave}"): ${filePath}`);
    }

    // --- Find chunks (fmt, data) ---
    let fmtChunk = null;
    let dataChunk = null;
    let offset = 12;
    
    while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        
        if (chunkId === 'fmt ') {
            fmtChunk = { offset: offset + 8, size: chunkSize };
        } else if (chunkId === 'data') {
            dataChunk = { offset: offset + 8, size: chunkSize };
        }
        
        // Move to next chunk (chunks are word-aligned)
        offset += 8 + chunkSize;
        if (chunkSize % 2 !== 0) offset += 1; // padding byte
    }
    
    if (!fmtChunk) throw new Error(`No fmt chunk found in: ${filePath}`);
    if (!dataChunk) throw new Error(`No data chunk found in: ${filePath}`);
    
    // --- Parse fmt chunk ---
    const audioFormat = buffer.readUInt16LE(fmtChunk.offset);
    const numChannels = buffer.readUInt16LE(fmtChunk.offset + 2);
    const sampleRate = buffer.readUInt32LE(fmtChunk.offset + 4);
    // byteRate = fmtChunk.offset + 8 (skip)
    // blockAlign = fmtChunk.offset + 12 (skip)
    const bitsPerSample = buffer.readUInt16LE(fmtChunk.offset + 14);
    
    // Format 1 = PCM integer, Format 3 = IEEE float
    if (audioFormat !== 1 && audioFormat !== 3) {
        throw new Error(`Unsupported audio format (${audioFormat}). Only PCM (1) and IEEE Float (3) are supported.`);
    }
    
    // --- Extract samples ---
    const dataBuffer = buffer.slice(dataChunk.offset, dataChunk.offset + dataChunk.size);
    let rawSamples;
    
    if (audioFormat === 3 && bitsPerSample === 32) {
        // 32-bit float
        rawSamples = new Float32Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.length / 4);
    } else if (audioFormat === 1 && bitsPerSample === 16) {
        // 16-bit PCM -> normalize to [-1, 1]
        const numSamples = dataBuffer.length / 2;
        rawSamples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            rawSamples[i] = dataBuffer.readInt16LE(i * 2) / 32768.0;
        }
    } else if (audioFormat === 1 && bitsPerSample === 24) {
        // 24-bit PCM -> normalize to [-1, 1]
        const numSamples = dataBuffer.length / 3;
        rawSamples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const b0 = dataBuffer[i * 3];
            const b1 = dataBuffer[i * 3 + 1];
            const b2 = dataBuffer[i * 3 + 2];
            // Sign-extend 24-bit to 32-bit
            let val = (b0 | (b1 << 8) | (b2 << 16));
            if (val & 0x800000) val |= 0xFF000000; // sign extension
            rawSamples[i] = val / 8388608.0;
        }
    } else if (audioFormat === 1 && bitsPerSample === 32) {
        // 32-bit PCM integer -> normalize
        const numSamples = dataBuffer.length / 4;
        rawSamples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            rawSamples[i] = dataBuffer.readInt32LE(i * 4) / 2147483648.0;
        }
    } else {
        throw new Error(`Unsupported bit depth: ${bitsPerSample}-bit (format ${audioFormat})`);
    }
    
    // --- Stereo -> Mono downmix ---
    let monoSamples;
    if (numChannels === 1) {
        monoSamples = rawSamples;
    } else if (numChannels === 2) {
        const monoLength = Math.floor(rawSamples.length / 2);
        monoSamples = new Float32Array(monoLength);
        for (let i = 0; i < monoLength; i++) {
            monoSamples[i] = (rawSamples[i * 2] + rawSamples[i * 2 + 1]) * 0.5;
        }
    } else {
        // Multi-channel: take first channel
        const monoLength = Math.floor(rawSamples.length / numChannels);
        monoSamples = new Float32Array(monoLength);
        for (let i = 0; i < monoLength; i++) {
            monoSamples[i] = rawSamples[i * numChannels];
        }
    }
    
    const durationSec = monoSamples.length / sampleRate;
    
    return {
        sampleRate: sampleRate,
        channels: numChannels,
        bitDepth: bitsPerSample,
        samples: monoSamples,
        durationSec: durationSec
    };
}

/**
 * Quick check if tracks are time-aligned (same duration within tolerance).
 * @param {Array<{durationSec: number}>} trackInfos 
 * @param {number} toleranceSec - Max allowed difference (default 0.5s)
 * @returns {{ aligned: boolean, maxDriftSec: number, warning: string|null }}
 */
function checkAlignment(trackInfos, toleranceSec) {
    toleranceSec = toleranceSec || 0.5;
    
    if (trackInfos.length < 2) {
        return { aligned: true, maxDriftSec: 0, warning: null };
    }
    
    const durations = trackInfos.map(function(t) { return t.durationSec; });
    const minDur = Math.min.apply(null, durations);
    const maxDur = Math.max.apply(null, durations);
    var maxDrift = maxDur - minDur;
    
    if (maxDrift > toleranceSec) {
        return {
            aligned: false,
            maxDriftSec: maxDrift,
            warning: 'Tracks differ by ' + maxDrift.toFixed(2) + 's. They may not be synchronized.'
        };
    }
    
    return { aligned: true, maxDriftSec: maxDrift, warning: null };
}

module.exports = { readWav: readWav, checkAlignment: checkAlignment };
