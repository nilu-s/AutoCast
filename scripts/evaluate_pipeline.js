'use strict';

var fs = require('fs');
var path = require('path');
var analyze = require('../packages/analyzer/src/core/pipeline/analyzer_pipeline').analyze;

var GROUND_TRUTH_PATH = path.join(__dirname, '..', 'docs', 'segments.json');
var OUTPUT_PATH = path.join(__dirname, '..', 'evaluate_output.txt');
var REPORT_DIR = path.join(__dirname, '..', 'reports', 'autoresearch');
var MACHINE_REPORT_PATH = path.join(REPORT_DIR, 'last_eval.json');
var STEP_SEC = 0.1;
var ALLOWED_CONTENT_TYPES = {
    speech: true,
    review: true,
    ignore: true
};

function run() {
    if (!fs.existsSync(GROUND_TRUTH_PATH)) {
        console.error('No ground truth found at ' + GROUND_TRUTH_PATH);
        process.exit(1);
    }

    var groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, 'utf8'));
    if (!Array.isArray(groundTruth) || groundTruth.length === 0) {
        console.error('Ground truth is empty or invalid: ' + GROUND_TRUTH_PATH);
        process.exit(1);
    }

    var setup = buildTrackSetup(groundTruth);
    var trackPaths = setup.trackPaths;
    var trackCount = setup.trackCount;
    var maxTime = setup.maxTimeSec;

    console.log('--- AutoCast Pipeline Evaluator ---');
    console.log('Tracks: ' + trackCount);
    console.log('Duration: ' + maxTime.toFixed(2) + 's');
    console.log('Running analysis...');

    var result = analyze(trackPaths, {
        perTrackThresholdDb: buildUniformArray(trackCount, -32),
        snippetPadBeforeMs: 300,
        snippetPadAfterMs: 300,
        enableHardSilenceCut: true
    }, function () { });

    var predictions = flattenSegments(result && result.segments);
    var predictionStats = summarizePredictionTypes(predictions);

    var matrix = {
        speech: { speech: 0, review: 0, ignore: 0 },
        review: { speech: 0, review: 0, ignore: 0 },
        ignore: { speech: 0, review: 0, ignore: 0 }
    };

    var totalSteps = Math.ceil(maxTime / STEP_SEC);
    var byTrackGt = groupByTrack(groundTruth);
    var byTrackPred = groupByTrack(predictions);

    for (var t = 0; t < trackCount; t++) {
        var trackGt = byTrackGt[t] || [];
        var trackPred = byTrackPred[t] || [];
        for (var i = 0; i < totalSteps; i++) {
            var time = i * STEP_SEC + 0.001;
            var gtLabel = findLabelAt(trackGt, time, true);
            var predLabel = findLabelAt(trackPred, time, false);

            if (!ALLOWED_CONTENT_TYPES[gtLabel]) gtLabel = 'ignore';
            if (!ALLOWED_CONTENT_TYPES[predLabel]) predLabel = 'ignore';

            matrix[gtLabel][predLabel]++;
        }
    }

    var out = [];
    out.push('Ground truth: ' + GROUND_TRUTH_PATH);
    out.push('Tracks: ' + trackCount);
    out.push('DurationSec: ' + maxTime.toFixed(3));
    out.push('Evaluation step: ' + STEP_SEC + 's');
    out.push('');

    out.push('Predicted segments: ' + predictions.length);
    out.push('Predicted labels: ' + JSON.stringify(predictionStats.counts));
    out.push('Segments missing/invalid contentType: ' + predictionStats.invalidContentTypeCount);
    out.push('');

    out.push('--- Confusion Matrix (rows=ground truth, cols=predicted) ---');
    out.push(JSON.stringify(matrix, null, 2));

    var speechRecall = safeRatio(
        matrix.speech.speech,
        matrix.speech.speech + matrix.speech.review + matrix.speech.ignore
    );
    var reviewRecall = safeRatio(
        matrix.review.review,
        matrix.review.speech + matrix.review.review + matrix.review.ignore
    );
    var ignoreRecall = safeRatio(
        matrix.ignore.ignore,
        matrix.ignore.speech + matrix.ignore.review + matrix.ignore.ignore
    );
    var durationQuality = computeDurationQuality(groundTruth, predictions);
    var objectiveScore = computeObjectiveScore({
        speechRecall: speechRecall,
        reviewRecall: reviewRecall,
        ignoreRecall: ignoreRecall,
        durationQuality: durationQuality
    });

    out.push('');
    out.push('Speech recall: ' + toPct(speechRecall));
    out.push('Review recall: ' + toPct(reviewRecall));
    out.push('Ignore recall: ' + toPct(ignoreRecall));
    out.push('');
    out.push('Duration quality (speech+review):');
    out.push('- good: ' + durationQuality.goodCount);
    out.push('- near: ' + durationQuality.nearCount);
    out.push('- poor: ' + durationQuality.poorCount);
    out.push('- good+near ratio: ' + toPct(durationQuality.goodOrNearRatio));
    out.push('- avg duration rel error: ' + toPct(durationQuality.avgDurationRelativeError));
    out.push('');
    out.push('Autoresearch objective score: ' + objectiveScore.toFixed(4));

    fs.writeFileSync(OUTPUT_PATH, out.join('\n'), 'utf8');
    writeMachineReport({
        generatedAt: new Date().toISOString(),
        groundTruthPath: GROUND_TRUTH_PATH,
        trackCount: trackCount,
        durationSec: maxTime,
        frameStepSec: STEP_SEC,
        predictedSegmentCount: predictions.length,
        predictedLabelCounts: predictionStats.counts,
        invalidContentTypeCount: predictionStats.invalidContentTypeCount,
        confusionMatrix: matrix,
        recall: {
            speech: speechRecall,
            review: reviewRecall,
            ignore: ignoreRecall
        },
        durationQuality: durationQuality,
        objectiveScore: objectiveScore
    });
    console.log('Results written to ' + OUTPUT_PATH);
    console.log('Machine metrics written to ' + MACHINE_REPORT_PATH);
}

function buildTrackSetup(segments) {
    var trackToClip = {};
    var maxTrackIndex = 0;
    var maxTimeSec = 0;

    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i] || {};
        var trackIndex = toInt(seg.trackIndex, 0);
        if (trackIndex > maxTrackIndex) maxTrackIndex = trackIndex;
        if (typeof seg.clipName === 'string' && seg.clipName && !trackToClip.hasOwnProperty(trackIndex)) {
            trackToClip[trackIndex] = seg.clipName;
        }
        var end = toNumber(seg.end, 0);
        if (end > maxTimeSec) maxTimeSec = end;
    }

    var trackCount = maxTrackIndex + 1;
    var trackPaths = [];
    var AUDIO_FALLBACK_DIR = path.join(__dirname, '..', 'test_data_real', 'podcastExample');
    for (var t = 0; t < trackCount; t++) {
        if (trackToClip.hasOwnProperty(t)) {
            var clipName = trackToClip[t];
            var primaryPath = path.join(__dirname, '..', clipName);
            var fallbackPath = path.join(AUDIO_FALLBACK_DIR, clipName);
            if (fs.existsSync(primaryPath)) {
                trackPaths[t] = primaryPath;
            } else if (fs.existsSync(fallbackPath)) {
                trackPaths[t] = fallbackPath;
            } else {
                console.error('Audio file not found: ' + clipName + ' (looked in root and ' + AUDIO_FALLBACK_DIR + ')');
                trackPaths[t] = null;
            }
        } else {
            trackPaths[t] = null;
        }
    }

    return {
        trackPaths: trackPaths,
        trackCount: trackCount,
        maxTimeSec: maxTimeSec
    };
}

function buildUniformArray(length, value) {
    var out = [];
    for (var i = 0; i < length; i++) out.push(value);
    return out;
}

function flattenSegments(segments) {
    var out = [];
    if (!Array.isArray(segments)) return out;

    for (var i = 0; i < segments.length; i++) {
        var segOrTrack = segments[i];
        if (Array.isArray(segOrTrack)) {
            for (var j = 0; j < segOrTrack.length; j++) {
                if (segOrTrack[j] && typeof segOrTrack[j] === 'object') out.push(segOrTrack[j]);
            }
            continue;
        }
        if (segOrTrack && typeof segOrTrack === 'object') out.push(segOrTrack);
    }

    return out;
}

function summarizePredictionTypes(predictions) {
    var counts = {
        speech: 0,
        review: 0,
        ignore: 0
    };
    var invalidContentTypeCount = 0;

    for (var i = 0; i < predictions.length; i++) {
        var label = normalizePredictionContentType(predictions[i]);
        if (!ALLOWED_CONTENT_TYPES[label]) {
            invalidContentTypeCount++;
            continue;
        }
        counts[label]++;
    }

    return {
        counts: counts,
        invalidContentTypeCount: invalidContentTypeCount
    };
}

function groupByTrack(segments) {
    var byTrack = {};
    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (!seg || typeof seg !== 'object') continue;

        var trackIndex = toInt(seg.trackIndex, 0);
        if (!byTrack[trackIndex]) byTrack[trackIndex] = [];

        var normalized = {
            trackIndex: trackIndex,
            start: toNumber(seg.start, 0),
            end: toNumber(seg.end, 0),
            contentType: seg.contentType,
            state: seg.state
        };
        if (!(normalized.end > normalized.start)) continue;
        byTrack[trackIndex].push(normalized);
    }

    var keys = Object.keys(byTrack);
    for (var k = 0; k < keys.length; k++) {
        byTrack[keys[k]].sort(function (a, b) {
            if (a.start !== b.start) return a.start - b.start;
            return a.end - b.end;
        });
    }

    return byTrack;
}

function findLabelAt(segments, time, isGroundTruth) {
    var chosen = null;
    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (time >= seg.start && time < seg.end) {
            chosen = seg;
            break;
        }
    }

    if (!chosen) return 'ignore';

    if (isGroundTruth) {
        return ALLOWED_CONTENT_TYPES[chosen.contentType] ? chosen.contentType : 'ignore';
    }

    return normalizePredictionContentType(chosen);
}

function normalizePredictionContentType(seg) {
    if (seg && typeof seg.contentType === 'string' && ALLOWED_CONTENT_TYPES[seg.contentType]) {
        return seg.contentType;
    }

    if (seg && seg.state === 'review') return 'review';
    if (seg && seg.state === 'suppressed') return 'ignore';
    if (seg && seg.state === 'active') return 'speech';

    return 'ignore';
}

function computeDurationQuality(groundTruth, predictions) {
    var targetLabels = ['speech', 'review'];
    var summary = {
        total: 0,
        goodCount: 0,
        nearCount: 0,
        poorCount: 0,
        matchedCount: 0,
        avgDurationRelativeError: 1,
        goodOrNearRatio: 0,
        byLabel: {
            speech: { total: 0, good: 0, near: 0, poor: 0 },
            review: { total: 0, good: 0, near: 0, poor: 0 }
        }
    };

    var gtByTrack = groupByTrack(groundTruth);
    var predByTrack = groupByTrack(predictions);
    var durationErrSum = 0;

    var trackKeys = Object.keys(gtByTrack);
    for (var kt = 0; kt < trackKeys.length; kt++) {
        var trackIndex = trackKeys[kt];
        var gtTrack = gtByTrack[trackIndex] || [];
        var predTrack = predByTrack[trackIndex] || [];

        for (var i = 0; i < gtTrack.length; i++) {
            var gt = gtTrack[i];
            var gtLabel = ALLOWED_CONTENT_TYPES[gt.contentType] ? gt.contentType : 'ignore';
            if (targetLabels.indexOf(gtLabel) === -1) continue;

            summary.total++;
            summary.byLabel[gtLabel].total++;

            var match = findBestMatchingPrediction(gt, predTrack, gtLabel);
            if (!match || match.overlapSec <= 0) {
                summary.poorCount++;
                summary.byLabel[gtLabel].poor++;
                continue;
            }

            summary.matchedCount++;
            durationErrSum += match.durationRelError;

            if (match.coverage >= 0.8 && match.durationRelError <= 0.2) {
                summary.goodCount++;
                summary.byLabel[gtLabel].good++;
            } else if (match.coverage >= 0.6 && match.durationRelError <= 0.4) {
                summary.nearCount++;
                summary.byLabel[gtLabel].near++;
            } else {
                summary.poorCount++;
                summary.byLabel[gtLabel].poor++;
            }
        }
    }

    summary.goodOrNearRatio = safeRatio(summary.goodCount + summary.nearCount, summary.total);
    summary.avgDurationRelativeError = summary.matchedCount > 0
        ? durationErrSum / summary.matchedCount
        : 1;

    return summary;
}

function findBestMatchingPrediction(gtSegment, predictedTrackSegments, targetLabel) {
    var best = null;
    var gtDur = Math.max(0.000001, gtSegment.end - gtSegment.start);

    for (var i = 0; i < predictedTrackSegments.length; i++) {
        var pred = predictedTrackSegments[i];
        if (normalizePredictionContentType(pred) !== targetLabel) continue;

        var overlap = computeOverlapSec(gtSegment.start, gtSegment.end, pred.start, pred.end);
        if (overlap <= 0) continue;

        var predDur = Math.max(0.000001, pred.end - pred.start);
        var union = Math.max(0.000001, gtDur + predDur - overlap);
        var coverage = overlap / gtDur;
        var iou = overlap / union;
        var durationRelError = Math.abs(predDur - gtDur) / gtDur;

        if (!best || iou > best.iou || (iou === best.iou && coverage > best.coverage)) {
            best = {
                overlapSec: overlap,
                coverage: coverage,
                iou: iou,
                durationRelError: durationRelError
            };
        }
    }

    return best;
}

function computeOverlapSec(startA, endA, startB, endB) {
    var start = Math.max(startA, startB);
    var end = Math.min(endA, endB);
    if (!(end > start)) return 0;
    return end - start;
}

function computeObjectiveScore(metrics) {
    metrics = metrics || {};
    var durationRatio = metrics.durationQuality ? metrics.durationQuality.goodOrNearRatio : 0;
    return (
        0.45 * safeRatio(metrics.speechRecall, 1) +
        0.20 * safeRatio(metrics.reviewRecall, 1) +
        0.20 * safeRatio(metrics.ignoreRecall, 1) +
        0.15 * safeRatio(durationRatio, 1)
    );
}

function writeMachineReport(payload) {
    ensureDir(REPORT_DIR);
    fs.writeFileSync(MACHINE_REPORT_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

function ensureDir(dirPath) {
    if (fs.existsSync(dirPath)) return;
    fs.mkdirSync(dirPath, { recursive: true });
}

function safeRatio(num, den) {
    if (!den) return 0;
    return num / den;
}

function toPct(value) {
    return (value * 100).toFixed(2) + '%';
}

function toInt(value, fallback) {
    var parsed = parseInt(value, 10);
    return isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback) {
    var parsed = parseFloat(value);
    return isFinite(parsed) ? parsed : fallback;
}

run();
