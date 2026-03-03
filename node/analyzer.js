/**
 * AutoCast – Main Analyzer
 * 
 * Orchestrates the full analysis pipeline:
 *   WAV → RMS → VAD → Segments → Overlap Resolution → Ducking Map (JSON)
 * 
 * Can be used:
 *   - As a module: require('./analyzer').analyze(tracks, params)
 *   - As CLI: node analyzer.js --tracks a.wav b.wav --output segments.json
 */

'use strict';

var path = require('path');
var fs = require('fs');
var wavReader = require('./wav_reader');
var rmsCalc = require('./rms_calculator');
var vadGate = require('./vad_gate');
var segmentBuilder = require('./segment_builder');
var overlapResolver = require('./overlap_resolver');

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

    // Segments
    minSegmentMs: 300,
    minGapMs: 250,

    // Overlap
    overlapPolicy: 'dominant_wins', // 'dominant_wins' | 'all_active'
    overlapMarginDb: 6,

    // Ducking output
    duckingLevelDb: -24,
    rampMs: 30,

    // Alignment check
    alignmentToleranceSec: 0.5
};

/**
 * Run the full analysis pipeline.
 * 
 * @param {Array<string>} trackPaths - Absolute paths to WAV files (one per speaker)
 * @param {object} [userParams] - Override any defaults (see ANALYSIS_DEFAULTS)
 * @param {function} [progressCallback] - function(percent, message) called during processing
 * @returns {{
 *   tracks: Array<{path, name, durationSec, noiseFloorDb, segmentCount, activePercent}>,
 *   segments: Array<Array<{start, end, trackIndex, state}>>,
 *   keyframes: Array<Array<{time, gainDb}>>,
 *   alignment: {aligned, maxDriftSec, warning},
 *   params: object,
 *   totalDurationSec: number
 * }}
 */
function analyze(trackPaths, userParams, progressCallback) {
    var params = mergeDefaults(userParams, ANALYSIS_DEFAULTS);
    var progress = progressCallback || function () { };

    var trackCount = trackPaths.length;
    if (trackCount === 0) {
        throw new Error('No tracks provided for analysis.');
    }

    // =====================
    // Phase 1: Read WAV files
    // =====================
    progress(5, 'Reading audio files...');

    var trackInfos = [];
    var audioData = [];

    for (var i = 0; i < trackCount; i++) {
        var absPath = path.resolve(trackPaths[i]);
        progress(5 + Math.round((i / trackCount) * 15), 'Reading: ' + path.basename(absPath));

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

    // =====================
    // Phase 2: Alignment check
    // =====================
    progress(20, 'Checking track alignment...');
    var alignment = wavReader.checkAlignment(trackInfos, params.alignmentToleranceSec);

    // Use shortest duration as reference
    var totalDurationSec = Infinity;
    for (var i = 0; i < trackInfos.length; i++) {
        if (trackInfos[i].durationSec < totalDurationSec) {
            totalDurationSec = trackInfos[i].durationSec;
        }
    }

    // =====================
    // Phase 3: RMS calculation per track
    // =====================
    progress(25, 'Calculating audio energy...');

    var rmsProfiles = [];

    for (var i = 0; i < trackCount; i++) {
        progress(25 + Math.round((i / trackCount) * 20), 'RMS for track ' + (i + 1) + '/' + trackCount);

        var rmsResult = rmsCalc.calculateRMS(
            audioData[i].samples,
            audioData[i].sampleRate,
            params.frameDurationMs
        );
        rmsProfiles.push(rmsResult.rms);
    }

    // Release audio data (free memory)
    audioData = null;

    // =====================
    // Phase 4: VAD per track
    // =====================
    progress(50, 'Detecting voice activity...');

    var vadResults = [];
    var allSegments = [];

    for (var i = 0; i < trackCount; i++) {
        progress(50 + Math.round((i / trackCount) * 15), 'VAD for track ' + (i + 1) + '/' + trackCount);

        var vadResult = vadGate.detectActivity(rmsProfiles[i], {
            thresholdAboveFloorDb: params.thresholdAboveFloorDb,
            absoluteThresholdDb: params.absoluteThresholdDb,
            attackFrames: params.attackFrames,
            releaseFrames: params.releaseFrames,
            holdFrames: params.holdFrames,
            smoothingWindow: params.rmsSmoothing
        });
        vadResults.push(vadResult);

        // Build segments from gate
        var segments = segmentBuilder.buildSegments(vadResult.gateOpen, i, {
            minSegmentMs: params.minSegmentMs,
            minGapMs: params.minGapMs,
            frameDurationMs: params.frameDurationMs
        });
        allSegments.push(segments);

        // Store stats
        var stats = segmentBuilder.computeStats(segments, totalDurationSec);
        trackInfos[i].noiseFloorDb = Math.round(vadResult.noiseFloorDb * 10) / 10;
        trackInfos[i].thresholdDb = Math.round(vadResult.thresholdDb * 10) / 10;
        trackInfos[i].segmentCount = stats.segmentCount;
        trackInfos[i].activePercent = stats.activePercent;
        trackInfos[i].totalActiveSec = stats.totalActiveSec;
    }

    // =====================
    // Phase 5: Overlap resolution
    // =====================
    progress(70, 'Resolving overlaps...');

    var resolvedSegments = overlapResolver.resolveOverlaps(allSegments, rmsProfiles, {
        policy: params.overlapPolicy,
        frameDurationMs: params.frameDurationMs,
        overlapMarginDb: params.overlapMarginDb
    });

    // =====================
    // Phase 6: Generate ducking keyframe map
    // =====================
    progress(80, 'Generating ducking map...');

    // Build segment states array from resolved segments
    var segmentStates = [];
    for (var t = 0; t < trackCount; t++) {
        var states = [];
        for (var s = 0; s < resolvedSegments[t].length; s++) {
            states.push(resolvedSegments[t][s].state || 'active');
        }
        segmentStates.push(states);
    }

    var keyframes = overlapResolver.generateDuckingMap(
        allSegments,
        totalDurationSec,
        segmentStates,
        {
            duckingLevelDb: params.duckingLevelDb,
            rampMs: params.rampMs
        }
    );

    progress(95, 'Finalizing...');

    // =====================
    // Build output
    // =====================
    var result = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        tracks: trackInfos,
        segments: resolvedSegments,
        keyframes: keyframes,
        alignment: alignment,
        params: params
    };

    progress(100, 'Analysis complete.');

    return result;
}

/**
 * Merge user params with defaults
 */
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
        console.log('AutoCast Analyzer CLI');
        console.log('Usage: node analyzer.js --tracks file1.wav file2.wav [--output result.json] [--params params.json]');
        console.log('');
        console.log('Options:');
        console.log('  --tracks    WAV files to analyze (one per speaker)');
        console.log('  --output    Output JSON file (default: stdout)');
        console.log('  --params    JSON file with parameter overrides');
        console.log('  --help      Show this help');
        process.exit(0);
    }

    // Parse CLI args
    var tracks = [];
    var outputPath = null;
    var paramsPath = null;
    var mode = null;

    for (var i = 0; i < args.length; i++) {
        if (args[i] === '--tracks') {
            mode = 'tracks';
        } else if (args[i] === '--output') {
            mode = 'output';
        } else if (args[i] === '--params') {
            mode = 'params';
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

    // Load params if provided
    var cliParams = {};
    if (paramsPath) {
        try {
            cliParams = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
        } catch (e) {
            console.error('Error reading params file:', e.message);
            process.exit(1);
        }
    }

    // Run analysis
    console.error('AutoCast Analyzer – analyzing ' + tracks.length + ' track(s)...');

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

        // Print summary
        console.error('\n=== Summary ===');
        for (var t = 0; t < result.tracks.length; t++) {
            var ti = result.tracks[t];
            console.error('Track ' + (t + 1) + ' (' + ti.name + '): ' +
                ti.segmentCount + ' segments, ' +
                ti.activePercent + '% active, ' +
                'noise floor: ' + ti.noiseFloorDb + ' dBFS');
        }
        if (result.alignment.warning) {
            console.error('⚠ ' + result.alignment.warning);
        }
        console.error('Total keyframes: ' + result.keyframes.reduce(function (sum, kf) { return sum + kf.length; }, 0));

    } catch (e) {
        console.error('Analysis failed:', e.message);
        process.exit(1);
    }
}

module.exports = {
    analyze: analyze,
    ANALYSIS_DEFAULTS: ANALYSIS_DEFAULTS
};
