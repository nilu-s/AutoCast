'use strict';

(function (root) {
    function defaultParseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function defaultClamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function getVisibleCutPreviewItems(state) {
        if (!state || !state.cutPreview || !state.cutPreview.items) return [];
        var out = state.cutPreview.items.slice();
        out.sort(function (a, b) {
            if (a.start !== b.start) return a.start - b.start;
            if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
            return a.end - b.end;
        });
        return out;
    }

    function getTotalCutPreviewDurationSec(state, parseNumFn) {
        var parseNum = typeof parseNumFn === 'function' ? parseNumFn : defaultParseNum;
        if (!state || !state.cutPreview || !state.cutPreview.items || state.cutPreview.items.length === 0) return 0;
        var maxEnd = 0;
        for (var i = 0; i < state.cutPreview.items.length; i++) {
            if (state.cutPreview.items[i].end > maxEnd) maxEnd = state.cutPreview.items[i].end;
        }
        var totalFromResult = parseNum(state.analysisResult && state.analysisResult.totalDurationSec, maxEnd);
        return Math.max(maxEnd, totalFromResult, 0.2);
    }

    function getTimelineTrackWidth(timelineEl, parseNumFn) {
        var parseNum = typeof parseNumFn === 'function' ? parseNumFn : defaultParseNum;
        var full = parseNum(timelineEl && timelineEl.clientWidth, 0);
        var width = full - 170;
        if (width < 260) width = 780;
        return width;
    }

    function getZoomModel(state, timelineEl, parseNumFn) {
        var totalDurationSec = getTotalCutPreviewDurationSec(state, parseNumFn);
        var trackWidth = getTimelineTrackWidth(timelineEl, parseNumFn);
        var fitPixelsPerSec = trackWidth / Math.max(totalDurationSec, 0.2);
        if (!isFinite(fitPixelsPerSec) || fitPixelsPerSec <= 0) fitPixelsPerSec = 10;
        var maxPixelsPerSec = Math.max(fitPixelsPerSec * 260, fitPixelsPerSec + 120, 260);
        return {
            totalDurationSec: totalDurationSec,
            trackWidth: trackWidth,
            fitPixelsPerSec: fitPixelsPerSec,
            maxPixelsPerSec: maxPixelsPerSec
        };
    }

    function sliderToPixelsPerSec(sliderValue, zoomModel, parseNumFn, clampFn) {
        var parseNum = typeof parseNumFn === 'function' ? parseNumFn : defaultParseNum;
        var clamp = typeof clampFn === 'function' ? clampFn : defaultClamp;
        var norm = clamp(parseNum(sliderValue, 0) / 1000, 0, 1);
        if (zoomModel.maxPixelsPerSec <= zoomModel.fitPixelsPerSec + 0.0001) return zoomModel.fitPixelsPerSec;
        return zoomModel.fitPixelsPerSec * Math.pow(zoomModel.maxPixelsPerSec / zoomModel.fitPixelsPerSec, norm);
    }

    function pixelsPerSecToSlider(pixelsPerSec, zoomModel, parseNumFn, clampFn) {
        var parseNum = typeof parseNumFn === 'function' ? parseNumFn : defaultParseNum;
        var clamp = typeof clampFn === 'function' ? clampFn : defaultClamp;
        if (zoomModel.maxPixelsPerSec <= zoomModel.fitPixelsPerSec + 0.0001) return 0;
        var ratio = clamp(parseNum(pixelsPerSec, zoomModel.fitPixelsPerSec) / zoomModel.fitPixelsPerSec, 1, zoomModel.maxPixelsPerSec / zoomModel.fitPixelsPerSec);
        var norm = Math.log(ratio) / Math.log(zoomModel.maxPixelsPerSec / zoomModel.fitPixelsPerSec);
        return clamp(Math.round(norm * 1000), 0, 1000);
    }

    function ensureCutPreviewViewport(state, forceFit, zoomModel, parseNumFn, clampFn) {
        var parseNum = typeof parseNumFn === 'function' ? parseNumFn : defaultParseNum;
        var clamp = typeof clampFn === 'function' ? clampFn : defaultClamp;
        if (!state || !state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return null;
        var model = zoomModel;

        if (forceFit || !isFinite(state.cutPreviewPixelsPerSec) || state.cutPreviewPixelsPerSec <= 0) {
            state.cutPreviewPixelsPerSec = model.fitPixelsPerSec;
            state.cutPreviewZoom = 0;
            state.cutPreviewViewStartSec = 0;
        } else {
            state.cutPreviewPixelsPerSec = clamp(state.cutPreviewPixelsPerSec, model.fitPixelsPerSec, model.maxPixelsPerSec);
            state.cutPreviewZoom = pixelsPerSecToSlider(state.cutPreviewPixelsPerSec, model, parseNum, clamp);
        }

        var visibleDuration = model.trackWidth / state.cutPreviewPixelsPerSec;
        var maxStart = Math.max(0, model.totalDurationSec - visibleDuration);
        state.cutPreviewViewStartSec = clamp(parseNum(state.cutPreviewViewStartSec, 0), 0, maxStart);

        return {
            totalDurationSec: model.totalDurationSec,
            trackWidth: model.trackWidth,
            pixelsPerSec: state.cutPreviewPixelsPerSec,
            fitPixelsPerSec: model.fitPixelsPerSec,
            maxPixelsPerSec: model.maxPixelsPerSec,
            visibleDurationSec: visibleDuration,
            viewStartSec: state.cutPreviewViewStartSec,
            viewEndSec: state.cutPreviewViewStartSec + visibleDuration
        };
    }

    function getTimelineTickStep(visibleDurationSec) {
        if (visibleDurationSec <= 6) return 0.5;
        if (visibleDurationSec <= 14) return 1;
        if (visibleDurationSec <= 28) return 2;
        if (visibleDurationSec <= 70) return 5;
        if (visibleDurationSec <= 160) return 10;
        if (visibleDurationSec <= 520) return 30;
        if (visibleDurationSec <= 1800) return 60;
        return 120;
    }

    root.AutoCastPanelCutPreviewViewportFeature = {
        getVisibleCutPreviewItems: getVisibleCutPreviewItems,
        getTotalCutPreviewDurationSec: getTotalCutPreviewDurationSec,
        getTimelineTrackWidth: getTimelineTrackWidth,
        getZoomModel: getZoomModel,
        sliderToPixelsPerSec: sliderToPixelsPerSec,
        pixelsPerSecToSlider: pixelsPerSecToSlider,
        ensureCutPreviewViewport: ensureCutPreviewViewport,
        getTimelineTickStep: getTimelineTickStep
    };
})(this);
