/**
 * AutoCast  Test WAV Generator
 * 
 * Generates synthetic WAV files that simulate podcast recordings:
 *   - Speaker A (loud, active 0-5s, silent 5-10s, active 10-15s)
 *   - Speaker B (silent 0-5s, active 5-10s, silent 10-15s)
 *   - Speaker C (silent 0-10s, active 10-15s with overlap on A)
 * 
 * Each track has slight "bleed" from other speakers to simulate same-room recording.
 * 
 * Usage: node packages/analyzer/test/generate_test_wav.js [outputDir]
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SAMPLE_RATE = 48000;
var BIT_DEPTH = 16;
var DURATION_SEC = 15;

/**
 * Generate a mono 16-bit PCM WAV file buffer.
 * @param {Float32Array} samples - Audio samples [-1, 1]
 * @param {number} sampleRate 
 * @returns {Buffer}
 */
function generateWavBuffer(samples, sampleRate) {
    var bytesPerSample = 2; // 16-bit
    var dataSize = samples.length * bytesPerSample;
    var fileSize = 44 + dataSize;

    var buffer = Buffer.alloc(fileSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);

    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);     // chunk size
    buffer.writeUInt16LE(1, 20);      // PCM format
    buffer.writeUInt16LE(1, 22);      // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
    buffer.writeUInt16LE(bytesPerSample, 32);              // block align
    buffer.writeUInt16LE(16, 34);                          // bits per sample

    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Write samples as 16-bit signed integers
    for (var i = 0; i < samples.length; i++) {
        var val = Math.max(-1, Math.min(1, samples[i]));
        var intVal = Math.round(val * 32767);
        buffer.writeInt16LE(intVal, 44 + i * 2);
    }

    return buffer;
}

/**
 * Generate a sine wave segment.
 * @param {number} freq - Frequency in Hz
 * @param {number} amplitude - 0 to 1
 * @param {number} durationSec 
 * @param {number} sampleRate 
 * @returns {Float32Array}
 */
function generateSine(freq, amplitude, durationSec, sampleRate) {
    var numSamples = Math.round(durationSec * sampleRate);
    var samples = new Float32Array(numSamples);
    for (var i = 0; i < numSamples; i++) {
        samples[i] = amplitude * Math.sin(2 * Math.PI * freq * i / sampleRate);
    }
    return samples;
}

/**
 * Generate white noise.
 * @param {number} amplitude 
 * @param {number} durationSec 
 * @param {number} sampleRate 
 * @returns {Float32Array}
 */
function generateNoise(amplitude, durationSec, sampleRate) {
    var numSamples = Math.round(durationSec * sampleRate);
    var samples = new Float32Array(numSamples);
    for (var i = 0; i < numSamples; i++) {
        samples[i] = amplitude * (Math.random() * 2 - 1);
    }
    return samples;
}

/**
 * Generate silence.
 */
function generateSilence(durationSec, sampleRate) {
    return new Float32Array(Math.round(durationSec * sampleRate));
}

/**
 * Mix (add) multiple sample arrays together.
 */
function mixSamples() {
    var arrays = Array.prototype.slice.call(arguments);
    var maxLen = 0;
    for (var i = 0; i < arrays.length; i++) {
        if (arrays[i].length > maxLen) maxLen = arrays[i].length;
    }

    var result = new Float32Array(maxLen);
    for (var i = 0; i < arrays.length; i++) {
        for (var s = 0; s < arrays[i].length; s++) {
            result[s] += arrays[i][s];
        }
    }

    // Clip to [-1, 1]
    for (var s = 0; s < result.length; s++) {
        result[s] = Math.max(-1, Math.min(1, result[s]));
    }

    return result;
}

/**
 * Concatenate sample arrays.
 */
function concatSamples() {
    var arrays = Array.prototype.slice.call(arguments);
    var totalLen = 0;
    for (var i = 0; i < arrays.length; i++) totalLen += arrays[i].length;

    var result = new Float32Array(totalLen);
    var offset = 0;
    for (var i = 0; i < arrays.length; i++) {
        result.set(arrays[i], offset);
        offset += arrays[i].length;
    }
    return result;
}

/**
 * Generate the set of test podcast WAV files.
 * 
 * Timeline layout (15 seconds):
 *   0-5s:   Speaker A talks (220Hz), B and C silent
 *   5-10s:  Speaker B talks (330Hz), A and C silent
 *   10-15s: Speaker A (220Hz) and C (440Hz) overlap
 * 
 * Each track has:
 *   - Full-level speech when active
 *   - Room noise floor (very low white noise)
 *   - Bleed from other speakers at -20dB (simulating same room)
 */
function generateTestFiles(outputDir) {
    outputDir = outputDir || path.join(__dirname, 'test_data');

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    var sr = SAMPLE_RATE;
    var roomNoise = 0.002; // Very quiet room tone
    var bleedLevel = 0.05; // -26dB bleed from other speakers
    var speechLevel = 0.7;

    // --- "Speech" signals per segment ---
    // Each speaker has a different frequency to make them distinguishable
    var speechA_seg1 = generateSine(220, speechLevel, 5, sr); // 0-5s
    var speechB_seg2 = generateSine(330, speechLevel, 5, sr); // 5-10s
    var speechA_seg3 = generateSine(220, speechLevel, 5, sr); // 10-15s
    var speechC_seg3 = generateSine(440, speechLevel * 0.8, 5, sr); // 10-15s overlap

    // --- Track A: Host ---
    // Active 0-5s, silent 5-10s, active 10-15s
    var trackA = concatSamples(
        speechA_seg1,
        generateSilence(5, sr),
        speechA_seg3
    );
    // Add room noise
    trackA = mixSamples(trackA, generateNoise(roomNoise, DURATION_SEC, sr));
    // Add bleed from B at 5-10s
    var bleedB = concatSamples(generateSilence(5, sr), generateSine(330, bleedLevel, 5, sr), generateSilence(5, sr));
    // Add bleed from C at 10-15s
    var bleedC = concatSamples(generateSilence(10, sr), generateSine(440, bleedLevel, 5, sr));
    trackA = mixSamples(trackA, bleedB, bleedC);

    // --- Track B: Guest 1 ---
    // Silent 0-5s, active 5-10s, silent 10-15s
    var trackB = concatSamples(
        generateSilence(5, sr),
        speechB_seg2,
        generateSilence(5, sr)
    );
    trackB = mixSamples(trackB, generateNoise(roomNoise, DURATION_SEC, sr));
    // Add bleed from A at 0-5s and 10-15s
    var bleedA1 = concatSamples(generateSine(220, bleedLevel, 5, sr), generateSilence(5, sr), generateSine(220, bleedLevel, 5, sr));
    trackB = mixSamples(trackB, bleedA1);

    // --- Track C: Guest 2 ---
    // Silent 0-10s, active 10-15s
    var trackC = concatSamples(
        generateSilence(10, sr),
        speechC_seg3
    );
    trackC = mixSamples(trackC, generateNoise(roomNoise, DURATION_SEC, sr));
    // Add bleed from A and B
    var bleedA2 = concatSamples(generateSine(220, bleedLevel, 5, sr), generateSilence(5, sr), generateSine(220, bleedLevel, 5, sr));
    var bleedB2 = concatSamples(generateSilence(5, sr), generateSine(330, bleedLevel, 5, sr), generateSilence(5, sr));
    trackC = mixSamples(trackC, bleedA2, bleedB2);

    // --- Write files ---
    var files = [
        { name: 'track_a_host.wav', data: trackA },
        { name: 'track_b_guest1.wav', data: trackB },
        { name: 'track_c_guest2.wav', data: trackC }
    ];

    for (var i = 0; i < files.length; i++) {
        var wavBuffer = generateWavBuffer(files[i].data, sr);
        var filePath = path.join(outputDir, files[i].name);
        fs.writeFileSync(filePath, wavBuffer);
        console.log('Generated: ' + filePath + ' (' + (wavBuffer.length / 1024).toFixed(0) + ' KB)');
    }

    console.log('\nTest data directory: ' + outputDir);
    console.log('Duration: ' + DURATION_SEC + 's per track');
    console.log('Sample rate: ' + SAMPLE_RATE + ' Hz');
    console.log('Layout:');
    console.log('  0-5s:   A speaks (220Hz)');
    console.log('  5-10s:  B speaks (330Hz)');
    console.log('  10-15s: A + C overlap (220Hz + 440Hz)');

    return outputDir;
}

// Export for use in tests
module.exports = {
    generateTestFiles: generateTestFiles,
    generateWavBuffer: generateWavBuffer,
    generateSine: generateSine,
    generateNoise: generateNoise,
    generateSilence: generateSilence,
    mixSamples: mixSamples,
    concatSamples: concatSamples
};

// CLI
if (require.main === module) {
    var outDir = process.argv[2] || undefined;
    generateTestFiles(outDir);
}


