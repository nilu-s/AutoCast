/**
 * AutoCast - Streaming WAV File Reader
 *
 * Parses WAV files (PCM 16-bit, 24-bit, 32-bit int/float) in chunks.
 * Supports mono and stereo (stereo is downmixed to mono).
 */

'use strict';

var fs = require('fs');
var fsp = fs.promises;
var path = require('path');

var DEFAULT_CHUNK_SAMPLES = 65536;

class WavStreamReader {
    constructor(filePath) {
        this.filePath = path.resolve(filePath);
        this.fileHandle = null; // fs.promises.FileHandle (async mode)
        this.fd = null; // number (sync mode)

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
        await this.closeAsync();
        this.fileHandle = await fsp.open(this.filePath, 'r');
        this.fd = this.fileHandle.fd;
        await this._parseHeaderAsync();
        this.currentSampleOffset = 0;
    }

    openSync() {
        this.close();
        this.fd = fs.openSync(this.filePath, 'r');
        this.fileHandle = null;
        this._parseHeaderSync();
        this.currentSampleOffset = 0;
    }

    async _parseHeaderAsync() {
        var header = Buffer.alloc(12);
        var headerRead = await this.fileHandle.read(header, 0, 12, 0);
        if (headerRead.bytesRead < 12) {
            throw new Error('Invalid WAV header (too short): ' + this.filePath);
        }
        this._validateRiffHeader(header);

        var chunks = await this._scanChunksAsync();
        await this._applyChunkMetadataAsync(chunks.fmtChunk, chunks.dataChunk);
    }

    _parseHeaderSync() {
        var header = Buffer.alloc(12);
        var headerRead = fs.readSync(this.fd, header, 0, 12, 0);
        if (headerRead < 12) {
            throw new Error('Invalid WAV header (too short): ' + this.filePath);
        }
        this._validateRiffHeader(header);

        var chunks = this._scanChunksSync();
        this._applyChunkMetadataSync(chunks.fmtChunk, chunks.dataChunk);
    }

    _validateRiffHeader(headerBuf) {
        var riff = headerBuf.toString('ascii', 0, 4);
        if (riff !== 'RIFF') {
            throw new Error('Not a valid WAV file (expected RIFF, got "' + riff + '"): ' + this.filePath);
        }

        var wave = headerBuf.toString('ascii', 8, 12);
        if (wave !== 'WAVE') {
            throw new Error('Not a valid WAV file (expected WAVE, got "' + wave + '"): ' + this.filePath);
        }
    }

    async _scanChunksAsync() {
        var fmtChunk = null;
        var dataChunk = null;
        var offset = 12;
        var header = Buffer.alloc(8);

        while (!fmtChunk || !dataChunk) {
            var result = await this.fileHandle.read(header, 0, 8, offset);
            if (result.bytesRead < 8) break;

            var chunkId = header.toString('ascii', 0, 4);
            var chunkSize = header.readUInt32LE(4);
            var chunkDataOffset = offset + 8;

            if (chunkId === 'fmt ') {
                fmtChunk = { offset: chunkDataOffset, size: chunkSize };
            } else if (chunkId === 'data') {
                dataChunk = { offset: chunkDataOffset, size: chunkSize };
            }

            offset += 8 + chunkSize + (chunkSize % 2);
        }

        return { fmtChunk: fmtChunk, dataChunk: dataChunk };
    }

    _scanChunksSync() {
        var fmtChunk = null;
        var dataChunk = null;
        var offset = 12;
        var header = Buffer.alloc(8);

        while (!fmtChunk || !dataChunk) {
            var bytesRead = fs.readSync(this.fd, header, 0, 8, offset);
            if (bytesRead < 8) break;

            var chunkId = header.toString('ascii', 0, 4);
            var chunkSize = header.readUInt32LE(4);
            var chunkDataOffset = offset + 8;

            if (chunkId === 'fmt ') {
                fmtChunk = { offset: chunkDataOffset, size: chunkSize };
            } else if (chunkId === 'data') {
                dataChunk = { offset: chunkDataOffset, size: chunkSize };
            }

            offset += 8 + chunkSize + (chunkSize % 2);
        }

        return { fmtChunk: fmtChunk, dataChunk: dataChunk };
    }

    async _applyChunkMetadataAsync(fmtChunk, dataChunk) {
        if (!fmtChunk) throw new Error('No fmt chunk found in: ' + this.filePath);
        if (!dataChunk) throw new Error('No data chunk found in: ' + this.filePath);

        var fmtBuf = await this._readExactAsync(fmtChunk.size, fmtChunk.offset);
        this._parseFmtChunk(fmtBuf);

        this.dataOffset = dataChunk.offset;
        this.dataSize = dataChunk.size;
        this.bytesPerSample = (this.bitDepth / 8) * this.channels;

        if (!this.bytesPerSample || this.bytesPerSample < 1) {
            throw new Error('Invalid WAV format: bytesPerSample=' + this.bytesPerSample + ' for ' + this.filePath);
        }

        this.totalSamples = Math.floor(this.dataSize / this.bytesPerSample);
    }

    _applyChunkMetadataSync(fmtChunk, dataChunk) {
        if (!fmtChunk) throw new Error('No fmt chunk found in: ' + this.filePath);
        if (!dataChunk) throw new Error('No data chunk found in: ' + this.filePath);

        var fmtBuf = this._readExactSync(fmtChunk.size, fmtChunk.offset);
        this._parseFmtChunk(fmtBuf);

        this.dataOffset = dataChunk.offset;
        this.dataSize = dataChunk.size;
        this.bytesPerSample = (this.bitDepth / 8) * this.channels;

        if (!this.bytesPerSample || this.bytesPerSample < 1) {
            throw new Error('Invalid WAV format: bytesPerSample=' + this.bytesPerSample + ' for ' + this.filePath);
        }

        this.totalSamples = Math.floor(this.dataSize / this.bytesPerSample);
    }

    _parseFmtChunk(fmtBuf) {
        if (fmtBuf.length < 16) {
            throw new Error('Invalid fmt chunk (too short): ' + this.filePath);
        }

        this.audioFormat = fmtBuf.readUInt16LE(0);
        this.channels = fmtBuf.readUInt16LE(2);
        this.sampleRate = fmtBuf.readUInt32LE(4);
        this.bitDepth = fmtBuf.readUInt16LE(14);

        if (this.audioFormat !== 1 && this.audioFormat !== 3) {
            throw new Error('Unsupported audio format (' + this.audioFormat + '). Only PCM (1) and IEEE Float (3) are supported.');
        }
    }

    async _readExactAsync(size, offset) {
        var buf = Buffer.alloc(size);
        var result = await this.fileHandle.read(buf, 0, size, offset);
        if (result.bytesRead < size) {
            throw new Error('Unexpected EOF while reading WAV chunk in: ' + this.filePath);
        }
        return buf;
    }

    _readExactSync(size, offset) {
        var buf = Buffer.alloc(size);
        var bytesRead = fs.readSync(this.fd, buf, 0, size, offset);
        if (bytesRead < size) {
            throw new Error('Unexpected EOF while reading WAV chunk in: ' + this.filePath);
        }
        return buf;
    }

    async *readChunks(samplesPerChunk) {
        if (!this.fileHandle) {
            throw new Error('Reader not opened in async mode. Call open() first.');
        }

        samplesPerChunk = samplesPerChunk || DEFAULT_CHUNK_SAMPLES;
        this._ensureReadBuffer(samplesPerChunk * this.bytesPerSample);

        while (this.currentSampleOffset < this.totalSamples) {
            var samplesToRead = Math.min(samplesPerChunk, this.totalSamples - this.currentSampleOffset);
            var bytesToRead = samplesToRead * this.bytesPerSample;
            var fileOffset = this.dataOffset + (this.currentSampleOffset * this.bytesPerSample);
            var readResult = await this.fileHandle.read(this.readBuffer, 0, bytesToRead, fileOffset);

            if (readResult.bytesRead <= 0) break;

            var validBytes = readResult.bytesRead - (readResult.bytesRead % this.bytesPerSample);
            if (validBytes <= 0) break;

            var samples = this._decodeSamples(this.readBuffer, validBytes);
            var start = this.currentSampleOffset;
            this.currentSampleOffset += samples.length;

            yield {
                samples: samples,
                sampleOffset: start,
                sampleCount: samples.length
            };
        }
    }

    *readChunksSync(samplesPerChunk) {
        if (this.fd === null || this.fd === undefined) {
            throw new Error('Reader not opened in sync mode. Call openSync() first.');
        }

        samplesPerChunk = samplesPerChunk || DEFAULT_CHUNK_SAMPLES;
        this._ensureReadBuffer(samplesPerChunk * this.bytesPerSample);

        while (this.currentSampleOffset < this.totalSamples) {
            var samplesToRead = Math.min(samplesPerChunk, this.totalSamples - this.currentSampleOffset);
            var bytesToRead = samplesToRead * this.bytesPerSample;
            var fileOffset = this.dataOffset + (this.currentSampleOffset * this.bytesPerSample);
            var bytesRead = fs.readSync(this.fd, this.readBuffer, 0, bytesToRead, fileOffset);

            if (bytesRead <= 0) break;

            var validBytes = bytesRead - (bytesRead % this.bytesPerSample);
            if (validBytes <= 0) break;

            var samples = this._decodeSamples(this.readBuffer, validBytes);
            var start = this.currentSampleOffset;
            this.currentSampleOffset += samples.length;

            yield {
                samples: samples,
                sampleOffset: start,
                sampleCount: samples.length
            };
        }
    }

    _ensureReadBuffer(minBytes) {
        if (!this.readBuffer || this.readBuffer.length < minBytes) {
            this.readBuffer = Buffer.alloc(minBytes);
        }
    }

    _decodeSamples(buffer, byteLength) {
        var numRawSamples = byteLength / (this.bitDepth / 8);
        var rawSamples;
        var i;

        if (this.audioFormat === 3 && this.bitDepth === 32) {
            rawSamples = new Float32Array(numRawSamples);
            for (i = 0; i < numRawSamples; i++) {
                rawSamples[i] = buffer.readFloatLE(i * 4);
            }
        } else if (this.audioFormat === 1 && this.bitDepth === 16) {
            rawSamples = new Float32Array(numRawSamples);
            for (i = 0; i < numRawSamples; i++) {
                rawSamples[i] = buffer.readInt16LE(i * 2) / 32768.0;
            }
        } else if (this.audioFormat === 1 && this.bitDepth === 24) {
            rawSamples = new Float32Array(numRawSamples);
            for (i = 0; i < numRawSamples; i++) {
                var b0 = buffer[i * 3];
                var b1 = buffer[i * 3 + 1];
                var b2 = buffer[i * 3 + 2];
                var val = b0 | (b1 << 8) | (b2 << 16);
                if (val & 0x800000) val |= 0xFF000000;
                rawSamples[i] = val / 8388608.0;
            }
        } else if (this.audioFormat === 1 && this.bitDepth === 32) {
            rawSamples = new Float32Array(numRawSamples);
            for (i = 0; i < numRawSamples; i++) {
                rawSamples[i] = buffer.readInt32LE(i * 4) / 2147483648.0;
            }
        } else {
            throw new Error('Unsupported bit depth: ' + this.bitDepth + '-bit (format ' + this.audioFormat + ')');
        }

        if (this.channels === 1) return rawSamples;

        var monoLength = Math.floor(rawSamples.length / this.channels);
        var mono = new Float32Array(monoLength);
        if (this.channels === 2) {
            for (i = 0; i < monoLength; i++) {
                mono[i] = (rawSamples[i * 2] + rawSamples[i * 2 + 1]) * 0.5;
            }
            return mono;
        }

        for (i = 0; i < monoLength; i++) {
            mono[i] = rawSamples[i * this.channels];
        }
        return mono;
    }

    get durationSec() {
        if (!this.sampleRate) return 0;
        return this.totalSamples / this.sampleRate;
    }

    close() {
        if (this.fileHandle) {
            try {
                this.fileHandle.close();
            } catch (e) {
                // ignore close errors in best-effort sync close
            }
            this.fileHandle = null;
        }

        if (this.fd !== null && this.fd !== undefined) {
            try {
                fs.closeSync(this.fd);
            } catch (e2) {
                // ignore close errors
            }
            this.fd = null;
        }

        this.readBuffer = null;
    }

    async closeAsync() {
        if (this.fileHandle) {
            await this.fileHandle.close();
            this.fileHandle = null;
        } else if (this.fd !== null && this.fd !== undefined) {
            fs.closeSync(this.fd);
        }

        this.fd = null;
        this.readBuffer = null;
    }
}

module.exports = { WavStreamReader: WavStreamReader };