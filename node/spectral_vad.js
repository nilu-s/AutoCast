/**
 * AutoCast – Spectral VAD (FFT-based Voice Activity Detection)
 * 
 * Enhances the basic RMS-based VAD with frequency analysis.
 * Uses a simple FFT to compute spectral features that distinguish
 * speech (300-3000 Hz energy concentration) from noise
 * (broadband, clicks, keyboard, etc.)
 * 
 * Zero dependencies – uses a radix-2 DIT FFT implementation.
 */

'use strict';

/**
 * Compute spectral speech confidence for each frame.
 * Returns a per-frame confidence score [0, 1] where 1 = likely speech.
 * 
 * @param {Float32Array} samples - Audio samples
 * @param {number} sampleRate
 * @param {number} frameDurationMs
 * @returns {{ confidence: Float64Array, spectralFlux: Float64Array, frameCount: number }}
 */
function computeSpectralVAD(samples, sampleRate, frameDurationMs) {
    frameDurationMs = frameDurationMs || 10;

    var frameSize = Math.round((frameDurationMs / 1000) * sampleRate);
    // Round up to nearest power of 2 for FFT
    var fftSize = nextPowerOf2(frameSize);
    var frameCount = Math.floor(samples.length / frameSize);

    var confidence = new Float64Array(frameCount);
    var spectralFlux = new Float64Array(frameCount);

    // Frequency band definitions (Hz)
    var speechLow = 300;
    var speechHigh = 3000;
    var speechLowBin = Math.round(speechLow * fftSize / sampleRate);
    var speechHighBin = Math.round(speechHigh * fftSize / sampleRate);

    // Hann window
    var window = createHannWindow(fftSize);

    var prevMagnitudes = null;

    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;

        // Fill FFT input (zero-padded if frameSize < fftSize)
        var real = new Float64Array(fftSize);
        var imag = new Float64Array(fftSize);

        for (var i = 0; i < frameSize && (offset + i) < samples.length; i++) {
            real[i] = samples[offset + i] * window[i];
        }

        // Run FFT
        fft(real, imag);

        // Compute magnitude spectrum (only positive frequencies)
        var halfN = fftSize / 2;
        var magnitudes = new Float64Array(halfN);
        var totalEnergy = 0;
        var speechEnergy = 0;

        for (var i = 0; i < halfN; i++) {
            magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
            totalEnergy += magnitudes[i];

            if (i >= speechLowBin && i <= speechHighBin) {
                speechEnergy += magnitudes[i];
            }
        }

        // Spectral ratio: speech band energy / total energy
        var speechRatio = (totalEnergy > 0) ? (speechEnergy / totalEnergy) : 0;

        // Spectral flatness (Wiener entropy): geometric mean / arithmetic mean
        // Low flatness = tonal (speech), high = noise-like
        var flatness = computeSpectralFlatness(magnitudes, speechLowBin, speechHighBin);

        // Spectral flux: change from previous frame
        if (prevMagnitudes) {
            var flux = 0;
            for (var i = 0; i < halfN; i++) {
                var diff = magnitudes[i] - prevMagnitudes[i];
                if (diff > 0) flux += diff;
            }
            spectralFlux[f] = (totalEnergy > 0) ? (flux / totalEnergy) : 0;
        }
        prevMagnitudes = magnitudes;

        // Combine features into confidence score:
        // - High speech ratio → likely speech
        // - Low spectral flatness → tonal content (speech-like), not broadband noise
        //
        // Weight change versus v1:
        //   flatnessScore weight: 0.4 → 0.5  (penalise broadband noise/bleed more)
        //   ratioScore scale:     2.5 → 2.0  (avoid over-inflating ratio on noisy frames)
        var ratioScore = Math.min(1.0, speechRatio * 2.0); // Scale: typical speech ~0.4-0.6
        var flatnessScore = 1.0 - Math.min(1.0, flatness * 2.0); // Invert: low flatness = speech

        confidence[f] = (ratioScore * 0.5 + flatnessScore * 0.5);
    }

    return {
        confidence: confidence,
        spectralFlux: spectralFlux,
        frameCount: frameCount
    };
}

/**
 * Combine RMS VAD and spectral VAD into a refined gate signal.
 * 
 * @param {Uint8Array} rmsGate - Binary gate from RMS VAD
 * @param {Float64Array} spectralConf - Spectral confidence per frame
 * @param {number} minConfidence - Only keep frames where spectral confidence > this
 * @returns {Uint8Array} Refined gate
 */
function refineGateWithSpectral(rmsGate, spectralConf, minConfidence) {
    minConfidence = minConfidence || 0.3;
    var len = Math.min(rmsGate.length, spectralConf.length);
    var refined = new Uint8Array(len);

    for (var i = 0; i < len; i++) {
        // Keep gate open only if BOTH RMS and spectral agree
        refined[i] = (rmsGate[i] && spectralConf[i] >= minConfidence) ? 1 : 0;
    }

    return refined;
}

// ============================
// FFT Implementation (Radix-2)
// ============================

/**
 * In-place radix-2 Cooley-Tukey FFT.
 * @param {Float64Array} real 
 * @param {Float64Array} imag 
 */
function fft(real, imag) {
    var n = real.length;

    // Bit reversal
    for (var i = 1, j = 0; i < n; i++) {
        var bit = n >> 1;
        while (j & bit) {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;

        if (i < j) {
            var tmp = real[i]; real[i] = real[j]; real[j] = tmp;
            tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
        }
    }

    // FFT butterfly
    for (var size = 2; size <= n; size *= 2) {
        var halfSize = size / 2;
        var angle = -2 * Math.PI / size;

        var wReal = Math.cos(angle);
        var wImag = Math.sin(angle);

        for (var i = 0; i < n; i += size) {
            var curReal = 1, curImag = 0;

            for (var j = 0; j < halfSize; j++) {
                var uReal = real[i + j];
                var uImag = imag[i + j];
                var vReal = real[i + j + halfSize] * curReal - imag[i + j + halfSize] * curImag;
                var vImag = real[i + j + halfSize] * curImag + imag[i + j + halfSize] * curReal;

                real[i + j] = uReal + vReal;
                imag[i + j] = uImag + vImag;
                real[i + j + halfSize] = uReal - vReal;
                imag[i + j + halfSize] = uImag - vImag;

                var newCurReal = curReal * wReal - curImag * wImag;
                curImag = curReal * wImag + curImag * wReal;
                curReal = newCurReal;
            }
        }
    }
}

function nextPowerOf2(n) {
    var p = 1;
    while (p < n) p *= 2;
    return p;
}

function createHannWindow(size) {
    var window = new Float64Array(size);
    for (var i = 0; i < size; i++) {
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    }
    return window;
}

function computeSpectralFlatness(magnitudes, startBin, endBin) {
    var count = endBin - startBin + 1;
    if (count <= 0) return 1.0;

    var logSum = 0;
    var sum = 0;
    var validCount = 0;

    for (var i = startBin; i <= endBin; i++) {
        if (magnitudes[i] > 1e-10) {
            logSum += Math.log(magnitudes[i]);
            sum += magnitudes[i];
            validCount++;
        }
    }

    if (validCount === 0 || sum === 0) return 1.0;

    var geoMean = Math.exp(logSum / validCount);
    var ariMean = sum / validCount;

    return geoMean / ariMean;
}

/**
 * Compute compact spectral fingerprint per frame.
 *
 * Returns a Float32Array of shape [frameCount * NUM_BANDS] where each
 * NUM_BANDS-length slice is a normalised log-spaced band energy vector
 * representing the spectral "character" of the audio in that frame.
 *
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {number} frameDurationMs
 * @returns {{ bands: Float32Array, frameCount: number, numBands: number }}
 */
function computeSpectralFingerprint(samples, sampleRate, frameDurationMs) {
    frameDurationMs = frameDurationMs || 10;

    var frameSize = Math.round((frameDurationMs / 1000) * sampleRate);
    var fftSize = nextPowerOf2(frameSize);
    var frameCount = Math.floor(samples.length / frameSize);

    // 8 log-spaced bands from 100 Hz to 8000 Hz
    var NUM_BANDS = 8;
    var freqLow = 100;
    var freqHigh = 8000;

    // Precompute band edges (linear frequency bins)
    var bandEdges = [];
    for (var b = 0; b <= NUM_BANDS; b++) {
        var t = b / NUM_BANDS;
        var freq = freqLow * Math.pow(freqHigh / freqLow, t);
        bandEdges.push(Math.round(freq * fftSize / sampleRate));
    }

    var hannWindow = createHannWindow(fftSize);
    var result = new Float32Array(frameCount * NUM_BANDS);

    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;

        var real = new Float64Array(fftSize);
        var imag = new Float64Array(fftSize);

        for (var i = 0; i < frameSize && (offset + i) < samples.length; i++) {
            real[i] = samples[offset + i] * hannWindow[i];
        }

        fft(real, imag);

        var halfN = fftSize / 2;

        // Compute energy per band
        var bandBase = f * NUM_BANDS;
        var totalEnergy = 0;
        for (var bd = 0; bd < NUM_BANDS; bd++) {
            var lo = Math.max(0, bandEdges[bd]);
            var hi = Math.min(halfN - 1, bandEdges[bd + 1]);
            var bandEnergy = 0;
            for (var k = lo; k <= hi; k++) {
                var mag = real[k] * real[k] + imag[k] * imag[k];
                bandEnergy += mag;
            }
            result[bandBase + bd] = bandEnergy;
            totalEnergy += bandEnergy;
        }

        // Normalise so the vector sums to 1 (spectral shape, not loudness)
        if (totalEnergy > 1e-20) {
            for (var bd2 = 0; bd2 < NUM_BANDS; bd2++) {
                result[bandBase + bd2] /= totalEnergy;
            }
        }
    }

    return { bands: result, frameCount: frameCount, numBands: NUM_BANDS };
}

/**
 * Compute the average cosine similarity between two spectral fingerprints
 * over a time window [startFrame, endFrame).
 *
 * Returns a score in [0, 1]:
 *   ~1.0  → nearly identical spectral shape (likely bleed/echo)
 *   ~0.0  → completely different spectral shape (different speaker)
 *
 * @param {{ bands: Float32Array, frameCount: number, numBands: number }} fpA
 * @param {{ bands: Float32Array, frameCount: number, numBands: number }} fpB
 * @param {number} startFrame
 * @param {number} endFrame
 * @returns {number}
 */
function computeCrossTrackSimilarity(fpA, fpB, startFrame, endFrame) {
    var numBands = fpA.numBands;
    if (!numBands || numBands !== fpB.numBands) return 0;

    var clampedStart = Math.max(0, startFrame);
    var clampedEnd = Math.min(Math.min(fpA.frameCount, fpB.frameCount), endFrame);

    if (clampedEnd <= clampedStart) return 0;

    var sumSim = 0;
    var frameCount = 0;

    for (var f = clampedStart; f < clampedEnd; f++) {
        var baseA = f * numBands;
        var baseB = f * numBands;

        var dot = 0, normA = 0, normB = 0;
        for (var b = 0; b < numBands; b++) {
            var a = fpA.bands[baseA + b];
            var bv = fpB.bands[baseB + b];
            dot += a * bv;
            normA += a * a;
            normB += bv * bv;
        }

        var denom = Math.sqrt(normA * normB);
        if (denom > 1e-20) {
            sumSim += dot / denom;
        }
        frameCount++;
    }

    return frameCount > 0 ? sumSim / frameCount : 0;
}

module.exports = {
    computeSpectralVAD: computeSpectralVAD,
    refineGateWithSpectral: refineGateWithSpectral,
    computeSpectralFingerprint: computeSpectralFingerprint,
    computeCrossTrackSimilarity: computeCrossTrackSimilarity,
    fft: fft
};
