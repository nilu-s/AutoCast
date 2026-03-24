/**
 * AutoCast – Streaming WAV File Reader
 * 
 * Parses WAV files (PCM 16-bit, 24-bit, 32-bit float) in chunks.
 * No external dependencies. Supports mono and stereo (stereo downmixed to mono).
 * 
 * Usage:
 *   const reader = new WavStreamReader(filePath);
 *   await reader.open();
 *   for await (const chunk of reader.readChunks(chunkSizeSamples)) {
 *     // chunk.samples: Float32Array
 *     // chunk.sampleOffset: number
 *   }
 *   reader.close();
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

class WavStreamReader {
    constructor(filePath) {
        this.filePath = path.resolve(filePath);
        this.fileHandle = null;
        this.sampleRate = 0;
        this.channels = 0;
        this.bitDepth = 0;
        this.audioFormat = 0;
        this.dataOffset = 0;
        this.dataSize = 0;
        this.bytesPerSample = 0;
        this.totalSamples = 0;
        this.currentSampleOffset = 0;
        this.readBuffer = null;
    }

    async open() {
        this.fileHandle = await fs.open(this.filePath, 'r');
        
        // Read RIFF header (first 12 bytes)
        const headerBuf = Buffer.alloc(12);
        await this.fileHandle.read(headerBuf, 0, 12, 0);
        
        const riff = headerBuf.toString('ascii', 0, 4);
        if (riff !== 'RIFF') {
            throw new Error(`Not a valid WAV file (expected RIFF, got "${riff}"): ${this.filePath}`);
        }
        
        const wave = headerBuf.toString('ascii', 8, 12);
        if (wave !== 'WAVE') {
            throw new Error(`Not a valid WAV file (expected WAVE, got "${wave}"): ${this.filePath}`);
        }

        // Find chunks by reading header section
        const fmtChunk = await this._findChunk('fmt ');
        const dataChunk = await this._findChunk('data');
        
        if (!fmtChunk) throw new Error(`No fmt chunk found in: ${this.filePath}`);
        if (!dataChunk) throw new Error(`No data chunk found in: ${this.filePath}`);

        // Parse fmt chunk
        const fmtBuf = Buffer.alloc(fmtChunk.size);
        await this.fileHandle.read(fmtBuf, 0, fmtChunk.size, fmtChunk.offset);
        
        this.audioFormat = fmtBuf.readUInt16LE(0);
        this.channels = fmtBuf.readUInt16LE(2);
        this.sampleRate = fmtBuf.readUInt32LE(4);
        this.bitDepth = fmtBuf.readUInt16LE(14);
        
        if (this.audioFormat !== 1 && this.audioFormat !== 3) {
            throw new Error(`Unsupported audio format (${this.audioFormat}). Only PCM (1) and IEEE Float (3) are supported.`);
        }
        
        this.dataOffset = dataChunk.offset;
        this.dataSize = dataChunk.size;
        this.bytesPerSample = (this.bitDepth / 8) * this.channels;
        this.totalSamples = Math.floor(this.dataSize / this.bytesPerSample);
        
        // Pre-allocate read buffer for efficiency
        this.readBuffer = Buffer.alloc(65536 * this.bytesPerSample);
    }

    async *_findChunk(chunkId) {
        // Scan file for chunk - we read in larger blocks for efficiency
        const scanBuf = Buffer.alloc(4096);
        let offset = 12; // Start after RIFF header
        
        while (offset < this.dataSize + 1024) { // reasonable upper bound
            const { bytesRead } = await this.fileHandle.read(scanBuf, 0, 4096, offset);
            if (bytesRead < 8) break;
            
            let localOffset = 0;
            while (localOffset < bytesRead - 8) {
                const id = scanBuf.toString('ascii', localOffset, localOffset + 4);
                const size = scanBuf.readUInt32LE(localOffset + 4);
                
                if (id === chunkId) {
                    return { offset: offset + localOffset + 8, size: size };
                }
                
                localOffset += 8 + size;
                if (size % 2 !== 0) localOffset += 1; // padding
            }
            
            offset += bytesRead;
        }
        
        return null;
    }

    async *readChunks(samplesPerChunk) {
        if (!this.fileHandle) throw new Error('Reader not opened. Call open() first.');
        
        samplesPerChunk = samplesPerChunk || 65536;
        const bytesPerChunk = samplesPerChunk * this.bytesPerSample;
        
        let remainingSamples = this.totalSamples - this.currentSampleOffset;
        
        while (remainingSamples > 0) {
            const samplesToRead = Math.min(samplesPerChunk, remainingSamples);
            const bytesToRead = samplesToRead * this.bytesPerSample;
            
            const fileOffset = this.dataOffset + (this.currentSampleOffset * this.bytesPerSample);
            const { bytesRead } = await this.fileHandle.read(
                this.readBuffer, 0, bytesToRead, fileOffset
            );
            
            if (bytesRead === 0) break;
            
            const samples = this._decodeSamples(this.readBuffer, bytesRead);
            
            yield {
                samples: samples,
                sampleOffset: this.currentSampleOffset,
                sampleCount: samples.length
            };
            
            this.currentSampleOffset += samples.length;
            remainingSamples = this.totalSamples - this.currentSampleOffset;
        }
    }

    _decodeSamples(buffer, byteLength) {
        const numRawSamples = byteLength / (this.bitDepth / 8);
        let rawSamples;
        
        if (this.audioFormat === 3 && this.bitDepth === 32) {
            // 32-bit float
            rawSamples = new Float32Array(buffer.buffer, buffer.byteOffset, numRawSamples);
        } else if (this.audioFormat === 1 && this.bitDepth === 16) {
            // 16-bit PCM
            const num = byteLength / 2;
            rawSamples = new Float32Array(num);
            for (let i = 0; i < num; i++) {
                rawSamples[i] = buffer.readInt16LE(i * 2) / 32768.0;
            }
        } else if (this.audioFormat === 1 && this.bitDepth === 24) {
            // 24-bit PCM
            const num = byteLength / 3;
            rawSamples = new Float32Array(num);
            for (let i = 0; i < num; i++) {
                const b0 = buffer[i * 3];
                const b1 = buffer[i * 3 + 1];
                const b2 = buffer[i * 3 + 2];
                let val = (b0 | (b1 << 8) | (b2 << 16));
                if (val & 0x800000) val |= 0xFF000000;
                rawSamples[i] = val / 8388608.0;
            }
        } else if (this.audioFormat === 1 && this.bitDepth === 32) {
            // 32-bit PCM integer
            const num = byteLength / 4;
            rawSamples = new Float32Array(num);
            for (let i = 0; i < num; i++) {
                rawSamples[i] = buffer.readInt32LE(i * 4) / 2147483648.0;
            }
        } else {
            throw new Error(`Unsupported bit depth: ${this.bitDepth}-bit (format ${this.audioFormat})`);
        }
        
        // Stereo -> Mono downmix
        if (this.channels === 1) {
            return rawSamples;
        } else if (this.channels === 2) {
            const monoLength = Math.floor(rawSamples.length / 2);
            const mono = new Float32Array(monoLength);
            for (let i = 0; i < monoLength; i++) {
                mono[i] = (rawSamples[i * 2] + rawSamples[i * 2 + 1]) * 0.5;
            }
            return mono;
        } else {
            // Multi-channel: take first channel
            const monoLength = Math.floor(rawSamples.length / this.channels);
            const mono = new Float32Array(monoLength);
            for (let i = 0; i < monoLength; i++) {
                mono[i] = rawSamples[i * this.channels];
            }
            return mono;
        }
    }

    get durationSec() {
        return this.totalSamples / this.sampleRate;
    }

    close() {
        if (this.fileHandle) {
            this.fileHandle.close();
            this.fileHandle = null;
        }
    }
}

module.exports = { WavStreamReader };
