'use strict';

(function (root) {
    function parseNum(value, fallback) {
        var num = parseFloat(value);
        return isFinite(num) ? num : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getValidPreviewParts(item) {
        if (!item || !item.previewParts || !item.previewParts.length) return [];

        var out = [];
        for (var i = 0; i < item.previewParts.length; i++) {
            var part = item.previewParts[i];
            if (!part || !part.mediaPath) continue;

            var start = parseNum(part.sourceStartSec, NaN);
            var end = parseNum(part.sourceEndSec, NaN);
            if (!isFinite(start) || !isFinite(end) || end <= start) continue;

            out.push({
                mediaPath: String(part.mediaPath),
                sourceStartSec: start,
                sourceEndSec: end,
                durationSec: end - start
            });
        }
        return out;
    }

    function buildFallbackPlan(item) {
        var fallbackStart = parseNum(item && item.sourceStartSec, parseNum(item && item.start, 0));
        var fallbackEnd = parseNum(item && item.sourceEndSec, parseNum(item && item.end, fallbackStart));
        if (fallbackEnd <= fallbackStart) fallbackEnd = fallbackStart + 0.08;

        return {
            mediaPath: item && item.mediaPath ? String(item.mediaPath) : '',
            sourceStartSec: fallbackStart,
            sourceEndSec: fallbackEnd,
            mode: 'single',
            approximate: false,
            totalParts: 1,
            usedParts: 1,
            note: ''
        };
    }

    function buildPreviewPlaybackPlan(item) {
        if (!item) return null;

        var fallbackPlan = buildFallbackPlan(item);
        var parts = getValidPreviewParts(item);
        if (!parts.length) return fallbackPlan;

        if (parts.length === 1) {
            return {
                mediaPath: parts[0].mediaPath,
                sourceStartSec: parts[0].sourceStartSec,
                sourceEndSec: parts[0].sourceEndSec,
                mode: 'single',
                approximate: false,
                totalParts: 1,
                usedParts: 1,
                note: ''
            };
        }

        var pathBuckets = {};
        var bestPath = '';
        var bestDuration = -1;

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (!pathBuckets[part.mediaPath]) {
                pathBuckets[part.mediaPath] = {
                    mediaPath: part.mediaPath,
                    totalDur: 0,
                    minStart: part.sourceStartSec,
                    maxEnd: part.sourceEndSec,
                    longestPart: part,
                    parts: []
                };
            }

            var bucket = pathBuckets[part.mediaPath];
            bucket.totalDur += part.durationSec;
            if (part.sourceStartSec < bucket.minStart) bucket.minStart = part.sourceStartSec;
            if (part.sourceEndSec > bucket.maxEnd) bucket.maxEnd = part.sourceEndSec;
            if (!bucket.longestPart || part.durationSec > bucket.longestPart.durationSec) {
                bucket.longestPart = part;
            }
            bucket.parts.push(part);

            if (bucket.totalDur > bestDuration) {
                bestDuration = bucket.totalDur;
                bestPath = part.mediaPath;
            }
        }

        var bestBucket = pathBuckets[bestPath];
        if (!bestBucket) return fallbackPlan;

        var span = Math.max(0.0001, bestBucket.maxEnd - bestBucket.minStart);
        var fillRatio = clamp(bestBucket.totalDur / span, 0, 1);
        if (fillRatio >= 0.86) {
            return {
                mediaPath: bestBucket.mediaPath,
                sourceStartSec: bestBucket.minStart,
                sourceEndSec: bestBucket.maxEnd,
                mode: 'same_source_combined',
                approximate: true,
                totalParts: parts.length,
                usedParts: bestBucket.parts.length,
                note: 'Combined nearby parts from the same source file'
            };
        }

        var longest = bestBucket.longestPart;
        return {
            mediaPath: longest.mediaPath,
            sourceStartSec: longest.sourceStartSec,
            sourceEndSec: longest.sourceEndSec,
            mode: 'largest_part',
            approximate: true,
            totalParts: parts.length,
            usedParts: 1,
            note: 'Previewing largest source part of a multi-clip snippet'
        };
    }

    root.AutoCastPanelAudioPreviewFeature = {
        getValidPreviewParts: getValidPreviewParts,
        buildPreviewPlaybackPlan: buildPreviewPlaybackPlan
    };
})(this);
