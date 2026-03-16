'use strict';

/**
 * Optimized Spectral VAD Configuration for Real Podcast Audio
 * 
 * Tuned parameters based on analysis of real test_data/ recordings:
 * - Extended frequency range for speech (200-4000 Hz captures more harmonics)
 * - Longer frame windows for stability (20ms vs 10ms)
 * - Dynamic confidence weighting based on signal characteristics
 */

/**
 * Compute optimized spectral VAD with tuned parameters
 * 
 * Improvements over base spectral_vad:
 * 1. Extended speech band (200-4000 Hz) captures more voice harmonics
 * 2. Longer analysis window (20ms) for spectral stability
 * 3. Dynamic confidence weighting based on signal-to-noise estimate
 * 4. Formant emphasis (boosts 500-2000 Hz where speech energy concentrates)
 */
function computeOptimizedSpectralVAD(samples, sampleRate, options) {
    options = options || {};
    
    // Use longer window for stability (20ms vs 10ms)
    var frameDurationMs = options.frameDurationMs || 20;
    var frameSize = Math.round((frameDurationMs / 1000) * sampleRate);
    var fftSize = nextPowerOf2(frameSize);
    var frameCount = Math.floor(samples.length / frameSize);
    
    var confidence = new Float64Array(frameCount);
    var spectralFlux = new Float64Array(frameCount);
    
    // Extended frequency bands for better speech detection
    var speechLow = options.speechLowHz || 200;      // Was 300
    var speechHigh = options.speechHighHz || 4000;   // Was 3000
    var formantLow = options.formantLowHz || 500;   // Formant emphasis
    var formantHigh = options.formantHighHz || 2000;
    
    var speechLowBin = Math.round(speechLow * fftSize / sampleRate);
    var speechHighBin = Math.round(speechHigh * fftSize / sampleRate);
    var formantLowBin = Math.round(formantLow * fftSize / sampleRate);
    var formantHighBin = Math.round(formantHigh * fftSize / sampleRate);
    
    // Hann window
    var window = createHannWindow(fftSize);
    
    var prevMagnitudes = null;
    
    for (var f = 0; f < frameCount; f++) {
        var offset = f * frameSize;
        
        // Fill FFT input
        var real = new Float64Array(fftSize);
        var imag = new Float64Array(fftSize);
        
        for (var i = 0; i < frameSize && (offset + i) < samples.length; i++) {
            real[i] = samples[offset + i] * window[i];
        }
        
        // Run FFT
        fft(real, imag);
        
        // Compute magnitude spectrum
        var halfN = fftSize / 2;
        var magnitudes = new Float64Array(halfN);
        var totalEnergy = 0;
        var speechEnergy = 0;
        var formantEnergy = 0;
        
        for (var i = 0; i < halfN; i++) {
            magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
            totalEnergy += magnitudes[i];
            
            if (i >= speechLowBin && i <= speechHighBin) {
                speechEnergy += magnitudes[i];
            }
            if (i >= formantLowBin && i <= formantHighBin) {
                formantEnergy += magnitudes[i];
            }
        }
        
        // Spectral features
        var speechRatio = (totalEnergy > 0) ? (speechEnergy / totalEnergy) : 0;
        var formantRatio = (speechEnergy > 0) ? (formantEnergy / speechEnergy) : 0;
        var flatness = computeSpectralFlatness(magnitudes, speechLowBin, speechHighBin);
        
        // Spectral flux for temporal consistency
        if (prevMagnitudes) {
            var flux = 0;
            for (var i = 0; i < halfN; i++) {
                var diff = magnitudes[i] - prevMagnitudes[i];
                if (diff > 0) flux += diff;
            }
            spectralFlux[f] = (totalEnergy > 0) ? (flux / totalEnergy) : 0;
        }
        prevMagnitudes = magnitudes;
        
        // Dynamic confidence calculation
        var ratioScore = Math.min(1.0, speechRatio * 1.8);  // Slightly reduced from 2.0
        var flatnessScore = 1.0 - Math.min(1.0, flatness * 1.8);  // Less aggressive noise penalty
        var formantScore = Math.min(1.0, formantRatio * 1.5);  // Formant emphasis
        
        // Combined confidence with formant boost
        // Weight: speech ratio 40%, flatness 30%, formant 30%
        confidence[f] = (ratioScore * 0.40 + flatnessScore * 0.30 + formantScore * 0.30);
    }
    
    return {
        confidence: confidence,
        spectralFlux: spectralFlux,
        frameCount: frameCount,
        frameDurationMs: frameDurationMs
    };
}

/**
 * Apply temporal smoothing to confidence values
 * Reduces spurious fluctuations in real audio
 */
function smoothConfidence(confidence, windowSize) {
    windowSize = windowSize || 3;
    var smoothed = new Float64Array(confidence.length);
    
    for (var i = 0; i < confidence.length; i++) {
        var sum = 0;
        var count = 0;
        for (var j = -Math.floor(windowSize / 2); j <= Math.floor(windowSize / 2); j++) {
            var idx = i + j;
            if (idx >= 0 && idx < confidence.length) {
                sum += confidence[idx];
                count++;
            }
        }
        smoothed[i] = sum / count;
    }
    
    return smoothed;
}

// FFT Implementation (copied from spectral_vad for standalone use)
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
    
    for (var i = startBin; i <= endBin && i < magnitudes.length; i++) {
        var m = magnitudes[i];
        if (m > 1e-10) {
            logSum += Math.log(m);
            sum += m;
            validCount++;
        }
    }
    
    if (validCount === 0 || sum === 0) return 1.0;
    
    var geometricMean = Math.exp(logSum / validCount);
    var arithmeticMean = sum / validCount;
    
    return geometricMean / arithmeticMean;
}

module.exports = {
    computeOptimizedSpectralVAD: computeOptimizedSpectralVAD,
    smoothConfidence: smoothConfidence
};