'use strict';

var cutPreviewBuilder = require('../../modules/preview/cut_preview_builder');
var analyzerContracts = require('../contracts/analyzer_contracts');
var debugTimelineBuilder = require('./debug_timeline_builder');

function runFinalizeStage(ctx) {
    ctx = ctx || {};

    var params = ctx.params || {};
    var totalDurationSec = ctx.totalDurationSec || 0;
    var trackInfos = ctx.trackInfos || [];
    var resolvedSegments = ctx.resolvedSegments || [];
    var allSegments = ctx.allSegments || [];
    var overlapResolvedSegments = ctx.overlapResolvedSegments || [];
    var alignment = ctx.alignment || null;
    var gainInfo = ctx.gainInfo || null;
    var rmsProfiles = ctx.rmsProfiles || [];
    var rawRmsProfiles = ctx.rawRmsProfiles || [];
    var spectralResults = ctx.spectralResults || [];
    var laughterResults = ctx.laughterResults || [];
    var gateSnapshots = ctx.gateSnapshots || [];
    var progress = ctx.progress || function () { };

    progress(80, 'Building cut output...');
    assertRawRmsProfiles(rawRmsProfiles, rmsProfiles);

    progress(90, 'Building waveform preview...');
    var waveform = generateWaveformPreview(rawRmsProfiles, totalDurationSec, params);

    progress(95, 'Finalizing...');

    var cutPreview = cutPreviewBuilder.buildCutPreview({
        sourceSegments: allSegments,
        overlapSegments: overlapResolvedSegments,
        finalSegments: resolvedSegments,
        trackInfos: trackInfos,
        totalDurationSec: totalDurationSec,
        frameDurationMs: params.frameDurationMs,
        rmsProfiles: rmsProfiles,
        rawRmsProfiles: rawRmsProfiles,
        spectralResults: spectralResults,
        laughterResults: laughterResults,
        gateSnapshots: gateSnapshots,
        params: params
    });

    var result = {
        contract: {
            name: 'analyze_result',
            version: analyzerContracts.ANALYZER_CONTRACT_VERSION
        },
        version: '2.2.0',
        timestamp: new Date().toISOString(),
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        tracks: trackInfos,
        segments: resolvedSegments,
        cutPreview: cutPreview,
        previewModel: {
            policyVersion: (cutPreview && cutPreview.policyVersion) || null,
            metricsVersion: (cutPreview && cutPreview.metricsVersion) || null
        },
        trackStateTimeline: cutPreview && cutPreview.stateTimelineByTrack ? cutPreview.stateTimelineByTrack : [],
        waveform: waveform,
        alignment: alignment,
        gainMatching: gainInfo,
        params: params
    };

    if (params.debugMode) {
        result.debug = debugTimelineBuilder.buildAnalysisDebug({
            frameDurationMs: params.frameDurationMs,
            debugMaxFrames: params.debugMaxFrames,
            rmsProfiles: rmsProfiles,
            spectralResults: spectralResults,
            laughterResults: laughterResults,
            gateSnapshots: gateSnapshots,
            resolvedSegments: resolvedSegments
        });
    }

    progress(100, 'Analysis complete.');

    return {
        result: result,
        waveform: waveform,
        cutPreview: cutPreview
    };
}

function assertRawRmsProfiles(rawRmsProfiles, rmsProfiles) {
    var normalized = Array.isArray(rmsProfiles) ? rmsProfiles : [];
    if (!Array.isArray(rawRmsProfiles) || rawRmsProfiles.length < normalized.length) {
        throw new Error('Finalize stage requires rawRmsProfiles for every RMS track.');
    }
    for (var i = 0; i < normalized.length; i++) {
        if (!rawRmsProfiles[i] || typeof rawRmsProfiles[i].length !== 'number') {
            throw new Error('Finalize stage missing raw RMS profile for track ' + i + '.');
        }
    }
}

function generateWaveformPreview(rmsProfiles, totalDurationSec, params) {
    var resolution = params.waveformResolution || 500;
    var trackCount = rmsProfiles.length;
    var waveform = [];
    var maxPointCount = 0;

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
        if (points.length > maxPointCount) maxPointCount = points.length;
    }

    return {
        pointsPerTrack: waveform,
        timeStep: maxPointCount > 0 ? (totalDurationSec / maxPointCount) : 0,
        totalDurationSec: totalDurationSec
    };
}

module.exports = {
    runFinalizeStage: runFinalizeStage
};
