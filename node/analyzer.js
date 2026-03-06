/**
 * AutoCast – Main Analyzer v2.1
 *
 * Orchestrates the full analysis pipeline:
 *   WAV → RMS → Auto-Gain → VAD (RMS + Spectral) → Segments → Overlap → Adaptive Crossfades → Ducking Map
 *
 * v2.1 changes:
 *   - Bleed-safe overlap resolution as default
 *   - Adaptive keyframes now use resolved segments directly
 *   - Shared overlap logic for keyframes and cutting
 */

'use strict';

var path = require('path');
var fs = require('fs');
var wavReader = require('./wav_reader');
var rmsCalc = require('./rms_calculator');
var vadGate = require('./vad_gate');
var segmentBuilder = require('./segment_builder');
var overlapResolver = require('./overlap_resolver');
var gainNormalizer = require('./gain_normalizer');
var spectralVad = require('./spectral_vad');

/**
 * Default analysis parameters (all user-configurable)
 */
var ANALYSIS_DEFAULTS = {
    // RMS
    frameDurationMs: 10,
    rmsSmoothing: 5,

    // VAD / Gate
    thresholdAboveFloorDb: 12,
    absoluteThresholdDb: -50,
    attackFrames: 2,
    releaseFrames: 5,
    holdFrames: 30,

    // Per-track sensitivity overrides (array, one per track, or null for global)
    perTrackThresholdDb: null,

    // Segments
    minSegmentMs: 300,
    minGapMs: 250,

    // Overlap
    overlapPolicy: 'bleed_safe',
    overlapMarginDb: 6,
    bleedMarginDb: 8,

    // Ducking output
    duckingLevelDb: -24,
    rampMs: 30,

    // Auto-gain matching
    autoGain: true,

    // Spectral VAD refinement
    useSpectralVAD: true,
    spectralMinConfidence: 0.3,

    // Adaptive crossfades
    adaptiveCrossfade: true,
    crossfadeMinMs: 15,
    crossfadeMaxMs: 150,

    // Alignment check
    alignmentToleranceSec: 0.5,

    // Waveform preview
    waveformResolution: 500
};

/**
 * Run the full analysis pipeline.
 *
 * @param {Array<string>} trackPaths - Absolute paths to WAV files (one per speaker)
 * @param {object} [userParams] - Override any defaults
 * @param {function} [progressCallback] - function(percent, message)
 * @returns {object}
 */
function analyze(trackPaths, userParams, progressCallback) {
    var params = mergeDefaults(userParams, ANALYSIS_DEFAULTS);
    var progress = progressCallback || function () { };

    var trackCount = trackPaths.length;
    if (trackCount === 0) {
        throw new Error('No tracks provided for analysis.');
    }

    progress(5, 'Reading audio files...');

    var trackInfos = [];
    var audioData = [];

    for (var i = 0; i < trackCount; i++) {
        var absPath = path.resolve(trackPaths[i]);
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
    for (i = 0; i < trackInfos.length; i++) {
        var offsetSec = 0;
        if (params.trackOffsets && params.trackOffsets[i] !== undefined) {
            offsetSec = parseFloat(params.trackOffsets[i]);
            if (!isNaN(offsetSec)) {
                trackInfos[i].durationSec += offsetSec;
                if (trackInfos[i].durationSec < 0) trackInfos[i].durationSec = 0;
            }
        }

        if (trackInfos[i].durationSec < totalDurationSec) {
            totalDurationSec = trackInfos[i].durationSec;
        }
    }

    progress(20, 'Calculating audio energy...');

    var rmsProfiles = [];
    var rawRmsProfiles = [];

    for (i = 0; i < trackCount; i++) {
        progress(20 + Math.round((i / trackCount) * 10), 'RMS for track ' + (i + 1) + '/' + trackCount);

        var rmsResult = rmsCalc.calculateRMS(
            audioData[i].samples,
            audioData[i].sampleRate,
            params.frameDurationMs
        );

        var rmsArr = rmsResult.rms;

        if (params.trackOffsets && params.trackOffsets[i] !== undefined) {
            offsetSec = parseFloat(params.trackOffsets[i]);
            if (!isNaN(offsetSec) && offsetSec !== 0) {
                var padFrames = Math.round(offsetSec / (params.frameDurationMs / 1000));

                if (padFrames > 0) {
                    var padded = new Float32Array(rmsArr.length + padFrames);
                    padded.set(rmsArr, padFrames);
                    rmsArr = padded;
                } else if (padFrames < 0) {
                    var trimFrames = Math.abs(padFrames);
                    if (trimFrames < rmsArr.length) {
                        rmsArr = rmsArr.slice(trimFrames);
                    } else {
                        rmsArr = new Float32Array(0);
                    }
                }
            }
        }

        rmsProfiles.push(rmsArr);
        rawRmsProfiles.push(rmsArr);
    }

    var gainInfo = null;
    if (params.autoGain) {
        progress(32, 'Matching track volumes...');
        gainInfo = gainNormalizer.computeGainMatching(rmsProfiles);
        rmsProfiles = gainNormalizer.applyGainToRMS(rmsProfiles, gainInfo.gains);

        for (i = 0; i < trackCount; i++) {
            trackInfos[i].gainAdjustDb = gainInfo.gainsDb[i];
        }
    }

    var spectralResults = [];
    if (params.useSpectralVAD) {
        progress(35, 'Running spectral analysis...');
        for (i = 0; i < trackCount; i++) {
            progress(35 + Math.round((i / trackCount) * 10), 'FFT for track ' + (i + 1) + '/' + trackCount);
            var spectral = spectralVad.computeSpectralVAD(
                audioData[i].samples,
                audioData[i].sampleRate,
                params.frameDurationMs
            );

            if (params.trackOffsets && params.trackOffsets[i] !== undefined) {
                offsetSec = parseFloat(params.trackOffsets[i]);
                if (!isNaN(offsetSec) && offsetSec !== 0) {
                    padFrames = Math.round(offsetSec / (params.frameDurationMs / 1000));

                    if (padFrames > 0) {
                        var paddedConf = new Float32Array(spectral.confidence.length + padFrames);
                        paddedConf.set(spectral.confidence, padFrames);
                        spectral.confidence = paddedConf;
                    } else if (padFrames < 0) {
                        trimFrames = Math.abs(padFrames);
                        if (trimFrames < spectral.confidence.length) {
                            spectral.confidence = spectral.confidence.slice(trimFrames);
                        } else {
                            spectral.confidence = new Float32Array(0);
                        }
                    }
                }
            }

            spectralResults.push(spectral);
        }
    }

    audioData = null;

    progress(50, 'Detecting voice activity...');

    var vadResults = [];
    var allSegments = [];

    for (i = 0; i < trackCount; i++) {
        progress(50 + Math.round((i / trackCount) * 15), 'VAD for track ' + (i + 1) + '/' + trackCount);

        var trackThreshold = params.thresholdAboveFloorDb;
        if (params.perTrackThresholdDb && params.perTrackThresholdDb[i] !== undefined) {
            trackThreshold = params.perTrackThresholdDb[i];
        }

        var vadResult = vadGate.detectActivity(rmsProfiles[i], {
            thresholdAboveFloorDb: trackThreshold,
            absoluteThresholdDb: params.absoluteThresholdDb,
            attackFrames: params.attackFrames,
            releaseFrames: params.releaseFrames,
            holdFrames: params.holdFrames,
            smoothingWindow: params.rmsSmoothing
        });

        if (params.useSpectralVAD && spectralResults[i]) {
            vadResult.gateOpen = spectralVad.refineGateWithSpectral(
                vadResult.gateOpen,
                spectralResults[i].confidence,
                params.spectralMinConfidence
            );
        }

        vadResults.push(vadResult);

        var segments = segmentBuilder.buildSegments(vadResult.gateOpen, i, {
            minSegmentMs: params.minSegmentMs,
            minGapMs: params.minGapMs,
            frameDurationMs: params.frameDurationMs
        });
        allSegments.push(segments);

        var stats = segmentBuilder.computeStats(segments, totalDurationSec);
        trackInfos[i].noiseFloorDb = Math.round(vadResult.noiseFloorDb * 10) / 10;
        trackInfos[i].thresholdDb = Math.round(vadResult.thresholdDb * 10) / 10;
        trackInfos[i].segmentCount = stats.segmentCount;
        trackInfos[i].activePercent = stats.activePercent;
        trackInfos[i].totalActiveSec = stats.totalActiveSec;
    }

    progress(70, 'Resolving overlaps...');

    var resolvedSegments = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
        policy: params.overlapPolicy,
        frameDurationMs: params.frameDurationMs,
        overlapMarginDb: params.overlapMarginDb,
        bleedMarginDb: params.bleedMarginDb
    });

    progress(80, 'Generating ducking map...');

    var keyframes;
    if (params.adaptiveCrossfade) {
        keyframes = generateAdaptiveKeyframes(
            resolvedSegments,
            totalDurationSec,
            rmsProfiles,
            params
        );
    } else {
        keyframes = overlapResolver.generateDuckingMap(
            resolvedSegments,
            totalDurationSec,
            null,
            {
                duckingLevelDb: params.duckingLevelDb,
                rampMs: params.rampMs
            }
        );
    }

    progress(90, 'Building waveform preview...');
    var waveform = generateWaveformPreview(rawRmsProfiles, totalDurationSec, params);

    progress(95, 'Finalizing...');

    var result = {
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        tracks: trackInfos,
        segments: resolvedSegments,
        keyframes: keyframes,
        waveform: waveform,
        alignment: alignment,
        gainMatching: gainInfo,
        params: params
    };

    progress(100, 'Analysis complete.');

    return result;
}

/**
 * Generate adaptive crossfade keyframes.
 * Uses resolved segments directly, reading seg.state.
 */
function generateAdaptiveKeyframes(resolvedSegments, totalDurationSec, rmsProfiles, params) {
    var duckingLevelDb = params.duckingLevelDb || -24;
    var minRamp = (params.crossfadeMinMs || 15) / 1000;
    var maxRamp = (params.crossfadeMaxMs || 150) / 1000;
    var frameDurSec = (params.frameDurationMs || 10) / 1000;
    var trackCount = resolvedSegments.length;

    var keyframesPerTrack = [];

    for (var t = 0; t < trackCount; t++) {
        var keyframes = [];
        var segments = resolvedSegments[t];

        if (segments.length === 0) {
            keyframes.push({ time: 0, gainDb: duckingLevelDb });
            keyframes.push({ time: totalDurationSec, gainDb: duckingLevelDb });
            keyframesPerTrack.push(keyframes);
            continue;
        }

        if (segments[0].start > minRamp) {
            keyframes.push({ time: 0, gainDb: duckingLevelDb });
        }

        for (var s = 0; s < segments.length; s++) {
            var seg = segments[s];
            var isActive = seg.state === 'active';

            var rampIn = computeAdaptiveRamp(rmsProfiles[t], seg.start, frameDurSec, minRamp, maxRamp, 'in');
            var rampOut = computeAdaptiveRamp(rmsProfiles[t], seg.end, frameDurSec, minRamp, maxRamp, 'out');

            if (isActive) {
                var rampUpStart = Math.max(0, seg.start - rampIn);
                keyframes.push({ time: rampUpStart, gainDb: duckingLevelDb });
                keyframes.push({ time: seg.start, gainDb: 0 });

                keyframes.push({ time: seg.end, gainDb: 0 });
                var rampDownEnd = Math.min(totalDurationSec, seg.end + rampOut);
                keyframes.push({ time: rampDownEnd, gainDb: duckingLevelDb });
            } else {
                keyframes.push({ time: seg.start, gainDb: duckingLevelDb });
                keyframes.push({ time: seg.end, gainDb: duckingLevelDb });
            }
        }

        var lastSeg = segments[segments.length - 1];
        if (lastSeg.end + minRamp < totalDurationSec) {
            keyframes.push({ time: totalDurationSec, gainDb: duckingLevelDb });
        }

        keyframes = deduplicateKeyframes(keyframes);
        keyframesPerTrack.push(keyframes);
    }

    return keyframesPerTrack;
}

/**
 * Compute adaptive ramp duration based on surrounding RMS.
 */
function computeAdaptiveRamp(rmsProfile, timeSec, frameDurSec, minRamp, maxRamp, direction) {
    var frameIdx = Math.round(timeSec / frameDurSec);
    var lookAhead = 10;

    var sum = 0;
    var count = 0;

    if (direction === 'in') {
        for (var i = Math.max(0, frameIdx - lookAhead); i < frameIdx; i++) {
            if (i < rmsProfile.length) {
                sum += rmsProfile[i];
                count++;
            }
        }
    } else {
        for (i = frameIdx; i < Math.min(rmsProfile.length, frameIdx + lookAhead); i++) {
            sum += rmsProfile[i];
            count++;
        }
    }

    if (count === 0) return minRamp;

    var avgRms = sum / count;
    var rmsDb = rmsCalc.linearToDb(avgRms);

    var t = Math.max(0, Math.min(1, (rmsDb + 60) / 50));
    return maxRamp - t * (maxRamp - minRamp);
}

/**
 * Generate downsampled waveform data for visual preview in the Panel UI.
 */
function generateWaveformPreview(rmsProfiles, totalDurationSec, params) {
    var resolution = params.waveformResolution || 500;
    var trackCount = rmsProfiles.length;
    var waveform = [];

    for (var t = 0; t < trackCount; t++) {
        var rms = rmsProfiles[t];
        var frameCount = rms.length;
        var step = Math.max(1, Math.floor(frameCount / resolution));
        var points = [];

        for (var i = 0; i < frameCount; i += step) {
            var maxRms = 0;
            for (var j = i; j < Math.min(i + step, frameCount); j++) {
                if (rms[j] > maxRms) maxRms = rms[j];
            }
            points.push(Math.round(maxRms * 10000) / 10000);
        }

        waveform.push(points);
    }

    return {
        pointsPerTrack: waveform,
        timeStep: totalDurationSec / (waveform[0] ? waveform[0].length : 1),
        totalDurationSec: totalDurationSec
    };
}

/**
 * Save analysis results to JSON file.
 */
function saveAnalysis(result, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
}

/**
 * Load previously saved analysis results.
 */
function loadAnalysis(filePath) {
    var json = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(json);
}

function deduplicateKeyframes(keyframes) {
    if (keyframes.length < 2) return keyframes;
    var result = [keyframes[0]];
    for (var i = 1; i < keyframes.length; i++) {
        if (Math.abs(keyframes[i].time - result[result.length - 1].time) < 0.0001) {
            result[result.length - 1] = keyframes[i];
        } else {
            result.push(keyframes[i]);
        }
    }
    return result;
}

function mergeDefaults(userParams, defaults) {
    var result = {};
    for (var key in defaults) {
        if (defaults.hasOwnProperty(key)) {
            result[key] = (userParams && userParams[key] !== undefined) ? userParams[key] : defaults[key];
        }
    }
    return result;
}

// =====================
// CLI Mode
// =====================
if (require.main === module) {
    var args = process.argv.slice(2);

    if (args.length === 0 || args.indexOf('--help') !== -1) {
        console.log('AutoCast Analyzer v2.1 CLI');
        console.log('Usage: node analyzer.js --tracks file1.wav file2.wav [--output result.json] [--params params.json]');
        console.log('');
        console.log('Options:');
        console.log('  --tracks    WAV files to analyze (one per speaker)');
        console.log('  --output    Output JSON file (default: stdout)');
        console.log('  --params    JSON file with parameter overrides');
        console.log('  --no-fft    Disable spectral VAD (faster, less accurate)');
        console.log('  --no-gain   Disable auto-gain matching');
        console.log('  --help      Show this help');
        process.exit(0);
    }

    var tracks = [];
    var outputPath = null;
    var paramsPath = null;
    var mode = null;
    var cliOverrides = {};

    for (var i = 0; i < args.length; i++) {
        if (args[i] === '--tracks') {
            mode = 'tracks';
        } else if (args[i] === '--output') {
            mode = 'output';
        } else if (args[i] === '--params') {
            mode = 'params';
        } else if (args[i] === '--no-fft') {
            cliOverrides.useSpectralVAD = false;
            mode = null;
        } else if (args[i] === '--no-gain') {
            cliOverrides.autoGain = false;
            mode = null;
        } else if (mode === 'tracks') {
            tracks.push(args[i]);
        } else if (mode === 'output') {
            outputPath = args[i];
            mode = null;
        } else if (mode === 'params') {
            paramsPath = args[i];
            mode = null;
        }
    }

    if (tracks.length === 0) {
        console.error('Error: No track files specified. Use --tracks file1.wav file2.wav');
        process.exit(1);
    }

    var cliParams = {};
    if (paramsPath) {
        try {
            cliParams = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
        } catch (e) {
            console.error('Error reading params file:', e.message);
            process.exit(1);
        }
    }

    for (var key in cliOverrides) {
        cliParams[key] = cliOverrides[key];
    }

    console.error('AutoCast Analyzer v2.1 – analyzing ' + tracks.length + ' track(s)...');

    try {
        var result = analyze(tracks, cliParams, function (pct, msg) {
            process.stderr.write('\r[' + pct + '%] ' + msg + '                    ');
        });

        process.stderr.write('\n');

        var jsonOutput = JSON.stringify(result, null, 2);

        if (outputPath) {
            fs.writeFileSync(outputPath, jsonOutput, 'utf8');
            console.error('Result written to: ' + outputPath);
        } else {
            console.log(jsonOutput);
        }

        console.error('\n=== Summary ===');
        for (var t = 0; t < result.tracks.length; t++) {
            var ti = result.tracks[t];
            var gainStr = ti.gainAdjustDb ? ' (gain: ' + (ti.gainAdjustDb > 0 ? '+' : '') + ti.gainAdjustDb + 'dB)' : '';
            console.error(
                'Track ' + (t + 1) + ' (' + ti.name + '): ' +
                ti.segmentCount + ' segments, ' +
                ti.activePercent + '% active, ' +
                'floor: ' + ti.noiseFloorDb + ' dBFS' + gainStr
            );
        }
        if (result.alignment.warning) {
            console.error('Warning: ' + result.alignment.warning);
        }
        console.error('Total keyframes: ' + result.keyframes.reduce(function (sum, kf) { return sum + kf.length; }, 0));

    } catch (e) {
        console.error('Analysis failed:', e.message);
        if (e.stack) console.error(e.stack);
        process.exit(1);
    }
}

module.exports = {
    analyze: analyze,
    saveAnalysis: saveAnalysis,
    loadAnalysis: loadAnalysis,
    ANALYSIS_DEFAULTS: ANALYSIS_DEFAULTS
};