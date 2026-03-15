/**
 * AutoCast - Cut Preview apply helpers
 *
 * Shared by panel runtime and node tests.
 */
'use strict';

(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root && typeof root === 'object') {
        root.AutoCastCutPreviewApply = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function parseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function mergeSegmentsForApply(segments) {
        if (!segments || segments.length === 0) return [];

        var cleaned = [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (!seg) continue;
            var st = parseNum(seg.start, 0);
            var en = parseNum(seg.end, st);
            if (!(en > st)) continue;
            cleaned.push({ start: st, end: en, state: 'active' });
        }

        cleaned.sort(function (a, b) {
            if (a.start !== b.start) return a.start - b.start;
            return a.end - b.end;
        });

        var merged = [];
        for (i = 0; i < cleaned.length; i++) {
            var cur = cleaned[i];
            if (!merged.length) {
                merged.push({ start: cur.start, end: cur.end, state: 'active' });
                continue;
            }
            var prev = merged[merged.length - 1];
            if (cur.start <= prev.end + 0.0005) {
                if (cur.end > prev.end) prev.end = cur.end;
            } else {
                merged.push({ start: cur.start, end: cur.end, state: 'active' });
            }
        }

        return merged;
    }

    function isAlwaysOpenFillItem(item) {
        if (!item) return false;
        if (item.alwaysOpenFill) return true;
        if (item.origin === 'always_open_fill') return true;
        return !!(item.metrics && parseNum(item.metrics.alwaysOpenFill, 0) >= 0.5);
    }

    function buildApplyCutsPayloadFromState(tracks, cutPreview, analysisResult) {
        if (!analysisResult || !tracks) return null;

        var trackIndices = [];
        var segments = [];
        var fillSegments = [];

        for (var i = 0; i < tracks.length; i++) {
            if (tracks[i] && tracks[i].selected === false) continue;
            trackIndices.push(
                tracks[i] && tracks[i].index !== undefined ? tracks[i].index : i
            );

            if (cutPreview && cutPreview.items && cutPreview.items.length > 0) {
                var selectedSegments = [];
                var selectedFillSegments = [];
                for (var j = 0; j < cutPreview.items.length; j++) {
                    var item = cutPreview.items[j];
                    if (!item || item.trackIndex !== i || !item.selected) continue;
                    selectedSegments.push({
                        start: item.start,
                        end: item.end,
                        state: 'active'
                    });
                    if (isAlwaysOpenFillItem(item)) {
                        selectedFillSegments.push({
                            start: item.start,
                            end: item.end,
                            state: 'active'
                        });
                    }
                }
                segments.push(mergeSegmentsForApply(selectedSegments));
                fillSegments.push(mergeSegmentsForApply(selectedFillSegments));
            } else {
                segments.push([]);
                fillSegments.push([]);
            }
        }

        return {
            segments: segments,
            trackIndices: trackIndices,
            fillSegments: fillSegments
        };
    }

    return {
        parseNum: parseNum,
        mergeSegmentsForApply: mergeSegmentsForApply,
        buildApplyCutsPayloadFromState: buildApplyCutsPayloadFromState
    };
});
