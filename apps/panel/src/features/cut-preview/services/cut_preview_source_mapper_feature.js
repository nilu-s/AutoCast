'use strict';

(function (root) {
    function defaultParseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function defaultRound(v, digits) {
        var factor = Math.pow(10, digits || 0);
        return Math.round(v * factor) / factor;
    }

    function resolveTrack(item, context) {
        if (!item) return null;

        if (context && typeof context.getTrackByIndex === 'function') {
            return context.getTrackByIndex(item.trackIndex);
        }

        var tracks = context && Array.isArray(context.tracks) ? context.tracks : [];
        for (var i = 0; i < tracks.length; i++) {
            if (tracks[i] && tracks[i].index === item.trackIndex) return tracks[i];
        }
        return tracks[item.trackIndex] || null;
    }

    function ticksToSec(ticks, ticksPerSecond, context) {
        var parseNum = (context && typeof context.parseNum === 'function')
            ? context.parseNum
            : defaultParseNum;
        var fallbackRate = (context && isFinite(parseNum(context.ticksPerSecondDefault, NaN)))
            ? parseNum(context.ticksPerSecondDefault, 254016000000)
            : 254016000000;
        var num = parseNum(ticks, 0);
        var rate = parseNum(ticksPerSecond, fallbackRate);
        if (rate <= 0) rate = fallbackRate;
        return num / rate;
    }

    function hydrateItemSourceMapping(item, context) {
        var parseNum = (context && typeof context.parseNum === 'function')
            ? context.parseNum
            : defaultParseNum;
        var round = (context && typeof context.round === 'function')
            ? context.round
            : defaultRound;
        var ticksPerSecondDefault = (context && isFinite(parseNum(context.ticksPerSecondDefault, NaN)))
            ? parseNum(context.ticksPerSecondDefault, 254016000000)
            : 254016000000;

        var track = resolveTrack(item, context);
        if (!track || !track.clips || track.clips.length === 0) return item;

        var ticksRate = track.ticksPerSecond || ticksPerSecondDefault;
        var best = null;
        var bestCoverage = 0;
        var parts = [];

        for (var c = 0; c < track.clips.length; c++) {
            var clip = track.clips[c];
            if (!clip) continue;
            var clipStart = ticksToSec(clip.startTicks, ticksRate, context);
            var clipEnd = ticksToSec(clip.endTicks, ticksRate, context);
            var overlapStart = Math.max(item.start, clipStart);
            var overlapEnd = Math.min(item.end, clipEnd);
            var coverage = overlapEnd - overlapStart;
            if (coverage <= 0) continue;
            if (!clip.mediaPath || String(clip.mediaPath).charAt(0) === '[') continue;

            var clipIn = ticksToSec(clip.inPointTicks, ticksRate, context);
            var mappedPart = {
                sourceClipIndex: clip.clipIndex !== undefined ? clip.clipIndex : c,
                mediaPath: clip.mediaPath,
                sourceStartSec: clipIn + (overlapStart - clipStart),
                sourceEndSec: clipIn + (overlapEnd - clipStart),
                timelineStartSec: overlapStart,
                timelineEndSec: overlapEnd,
                coverageSec: coverage
            };
            parts.push(mappedPart);

            if (coverage > bestCoverage) {
                bestCoverage = coverage;
                best = mappedPart;
            }
        }

        if (parts.length) {
            parts.sort(function (a, b) {
                if (a.timelineStartSec !== b.timelineStartSec) return a.timelineStartSec - b.timelineStartSec;
                return a.timelineEndSec - b.timelineEndSec;
            });

            item.previewParts = [];
            for (var p = 0; p < parts.length; p++) {
                item.previewParts.push({
                    sourceClipIndex: parts[p].sourceClipIndex,
                    mediaPath: parts[p].mediaPath,
                    sourceStartSec: round(parts[p].sourceStartSec, 4),
                    sourceEndSec: round(parts[p].sourceEndSec, 4),
                    timelineStartSec: round(parts[p].timelineStartSec, 4),
                    timelineEndSec: round(parts[p].timelineEndSec, 4),
                    coverageSec: round(parts[p].coverageSec, 4)
                });
            }
        }

        if (best) {
            item.sourceClipIndex = best.sourceClipIndex;
            item.mediaPath = best.mediaPath;
            item.sourceStartSec = round(best.sourceStartSec, 4);
            item.sourceEndSec = round(best.sourceEndSec, 4);
        }
        return item;
    }

    root.AutoCastPanelCutPreviewSourceMapperFeature = {
        ticksToSec: ticksToSec,
        hydrateItemSourceMapping: hydrateItemSourceMapping
    };
})(this);
