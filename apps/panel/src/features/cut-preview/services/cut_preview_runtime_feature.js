'use strict';

(function (root) {
    function defaultParseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function defaultRound(v, digits) {
        if (typeof v !== 'number' || !isFinite(v)) return 0;
        var p = Math.pow(10, digits || 0);
        return Math.round(v * p) / p;
    }

    function computeCutPreviewSummary(items, options) {
        options = options || {};
        var parseNum = typeof options.parseNum === 'function' ? options.parseNum : defaultParseNum;
        var round = typeof options.round === 'function' ? options.round : defaultRound;
        var isUninterestingSnippet = typeof options.isUninterestingSnippet === 'function'
            ? options.isUninterestingSnippet
            : function (item) { return !!(item && item.isUninteresting); };

        var summary = {
            totalItems: items.length,
            keptCount: 0,
            nearMissCount: 0,
            suppressedCount: 0,
            uninterestingCount: 0,
            selectedCount: 0,
            avgScore: 0
        };
        var scoreSum = 0;
        var scoreCount = 0;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (isUninterestingSnippet(item)) summary.uninterestingCount++;
            else if (item.state === 'kept') summary.keptCount++;
            else if (item.state === 'near_miss') summary.nearMissCount++;
            else summary.suppressedCount++;
            if (item.selected) summary.selectedCount++;
            if (!isUninterestingSnippet(item)) {
                scoreSum += parseNum(item.score, 0);
                scoreCount++;
            }
        }
        summary.avgScore = scoreCount > 0 ? round(scoreSum / scoreCount, 1) : 0;
        return summary;
    }

    function getCutPreviewItemById(state, itemId) {
        if (!state || !state.cutPreview || !state.cutPreview.items) return null;
        for (var i = 0; i < state.cutPreview.items.length; i++) {
            if (state.cutPreview.items[i].id === itemId) return state.cutPreview.items[i];
        }
        return null;
    }

    function setCutPreviewItemSelected(options) {
        options = options || {};
        var state = options.state || {};
        var item = getCutPreviewItemById(state, options.itemId);
        if (!item || !item.selectable) return;
        item.selected = !!options.selected;
        if (typeof options.renderCutPreview === 'function') {
            options.renderCutPreview();
        }
    }

    function setActiveSnippet(options) {
        options = options || {};
        var state = options.state || {};
        var item = getCutPreviewItemById(state, options.itemId);
        if (!item) return;
        state.activeSnippetId = item.id;
        if (!options.ensureVisible) return;

        var viewport = typeof options.ensureCutPreviewViewport === 'function'
            ? options.ensureCutPreviewViewport(false)
            : null;
        if (!viewport) return;
        var clamp = typeof options.clamp === 'function'
            ? options.clamp
            : function (v, min, max) { return Math.max(min, Math.min(max, v)); };

        var margin = Math.min(1.2, viewport.visibleDurationSec * 0.08);
        var start = viewport.viewStartSec;
        var end = viewport.viewEndSec;
        if (item.start < (start + margin)) {
            state.cutPreviewViewStartSec = Math.max(0, item.start - margin);
        } else if (item.end > (end - margin)) {
            state.cutPreviewViewStartSec = item.end + margin - viewport.visibleDurationSec;
            var maxStart = Math.max(0, viewport.totalDurationSec - viewport.visibleDurationSec);
            state.cutPreviewViewStartSec = clamp(state.cutPreviewViewStartSec, 0, maxStart);
        }
    }

    function cancelPendingCutPreviewRender(options) {
        options = options || {};
        var state = options.state || {};
        var windowObj = options.windowObj || root;
        if (!state.cutPreviewRenderPending) return;
        state.cutPreviewRenderPending = false;
        if (state.cutPreviewRenderHandle === null || state.cutPreviewRenderHandle === undefined) return;

        try {
            if (windowObj.cancelAnimationFrame) {
                windowObj.cancelAnimationFrame(state.cutPreviewRenderHandle);
            } else {
                clearTimeout(state.cutPreviewRenderHandle);
            }
        } catch (e) { }
        state.cutPreviewRenderHandle = null;
    }

    function requestCutPreviewRender(options) {
        options = options || {};
        var state = options.state || {};
        var immediate = !!options.immediate;
        var renderNow = options.renderNow || function () { };
        var windowObj = options.windowObj || root;

        if (immediate) {
            cancelPendingCutPreviewRender({
                state: state,
                windowObj: windowObj
            });
            renderNow();
            return;
        }

        if (state.cutPreviewRenderPending) return;
        state.cutPreviewRenderPending = true;

        var raf = windowObj.requestAnimationFrame || function (cb) {
            return setTimeout(cb, 16);
        };

        state.cutPreviewRenderHandle = raf(function () {
            state.cutPreviewRenderPending = false;
            state.cutPreviewRenderHandle = null;
            renderNow();
        });
    }

    function isOverviewZoom(viewport) {
        if (!viewport) return false;
        return viewport.pixelsPerSec <= (viewport.fitPixelsPerSec * 1.45);
    }

    function renderCutPreviewControls(options) {
        options = options || {};
        var state = options.state || {};
        var els = options.els || {};
        if (!state.cutPreview || !state.cutPreview.summary) return;

        var viewport = options.ensureCutPreviewViewport(false);
        if (!viewport) return;

        var renderFeature = options.renderFeature;
        var controlsModel = renderFeature.buildControlsViewModel({
            summary: state.cutPreview.summary,
            viewport: viewport,
            tracksInfo: (state.analysisResult && state.analysisResult.tracks) ? state.analysisResult.tracks : [],
            tracks: state.tracks,
            lanes: state.cutPreview.lanes || [],
            cutPreviewZoom: state.cutPreviewZoom,
            previewMasterGain: state.previewMasterGain,
            timelineDurationSec: options.getTotalCutPreviewDurationSec(),
            isOverviewZoom: isOverviewZoom,
            parseNum: options.parseNum,
            round: options.round,
            clamp: options.clamp,
            escapeHtml: options.escapeHtml,
            formatSummaryDuration: options.formatSummaryDuration
        });
        if (!controlsModel) return;

        if (els.cutPreviewMeta) els.cutPreviewMeta.textContent = controlsModel.metaText || '';
        if (els.cutPreviewAnalysisMini) els.cutPreviewAnalysisMini.innerHTML = controlsModel.analysisMiniHtml || '';
        if (els.cutPreviewZoom) els.cutPreviewZoom.value = controlsModel.zoomValue || '0';
        if (els.cutPreviewZoomLabel) els.cutPreviewZoomLabel.textContent = controlsModel.zoomLabelText || '100%';
        if (els.cutPreviewVolumeMaster) els.cutPreviewVolumeMaster.value = controlsModel.masterVolumeValue || '100';
        if (els.cutPreviewVolumeMasterLabel) els.cutPreviewVolumeMasterLabel.textContent = controlsModel.masterVolumeLabelText || '100%';
    }

    function renderCutPreviewTimeline(options) {
        options = options || {};
        var state = options.state || {};
        var els = options.els || {};
        if (!els.cutPreviewTimeline || !state.cutPreview) return;
        var viewport = options.ensureCutPreviewViewport(false);
        if (!viewport) return;

        var visibleItems = options.getVisibleCutPreviewItems();
        var renderFeature = options.renderFeature;
        els.cutPreviewTimeline.innerHTML = renderFeature.buildTimelineHtml({
            viewport: viewport,
            visibleItems: visibleItems,
            lanes: state.cutPreview.lanes || [],
            activeSnippetId: state.activeSnippetId,
            currentPlayingPreviewId: state.currentPlayingPreviewId,
            getTrackPreviewGain: options.getTrackPreviewGain,
            isOverviewZoom: isOverviewZoom,
            getTimelineTickStep: options.getTimelineTickStep,
            formatClock: options.formatClock,
            escapeHtml: options.escapeHtml,
            shortTypeLabel: renderFeature.shortTypeLabel,
            compactReasonText: renderFeature.compactReasonText,
            buildSnippetInlineLabel: function (item, widthPx) {
                return renderFeature.buildSnippetInlineLabel(item, widthPx, { parseNum: options.parseNum });
            },
            getTypeCssClass: renderFeature.getTypeCssClass,
            isAlwaysOpenFillSnippet: function (item) {
                return renderFeature.isAlwaysOpenFillSnippet(item, { parseNum: options.parseNum });
            },
            isUninterestingSnippet: function (item) {
                return renderFeature.isUninterestingSnippet(item, { parseNum: options.parseNum });
            }
        });
    }

    function renderCutPreviewNavigator(options) {
        options = options || {};
        var state = options.state || {};
        var els = options.els || {};
        if (!els.cutPreviewNavigator || !state.cutPreview) return;
        var viewport = options.ensureCutPreviewViewport(false);
        if (!viewport) return;
        var items = options.getVisibleCutPreviewItems();
        var renderFeature = options.renderFeature;
        els.cutPreviewNavigator.innerHTML = renderFeature.buildNavigatorHtml({
            viewport: viewport,
            items: items,
            clamp: options.clamp,
            formatClock: options.formatClock,
            escapeHtml: options.escapeHtml,
            getTypeCssClass: renderFeature.getTypeCssClass,
            isAlwaysOpenFillSnippet: function (item) {
                return renderFeature.isAlwaysOpenFillSnippet(item, { parseNum: options.parseNum });
            },
            isUninterestingSnippet: function (item) {
                return renderFeature.isUninterestingSnippet(item, { parseNum: options.parseNum });
            }
        });
    }

    function renderCutPreviewInspector(options) {
        options = options || {};
        var state = options.state || {};
        var els = options.els || {};
        if (!els.cutPreviewInspector || !state.cutPreview) return;

        var item = getCutPreviewItemById(state, state.activeSnippetId);
        var renderFeature = options.renderFeature;
        els.cutPreviewInspector.innerHTML = renderFeature.buildInspectorHtml({
            item: item,
            isPlaying: state.currentPlayingPreviewId === (item && item.id),
            previewPlan: item ? options.buildPreviewPlaybackPlan(item) : null,
            getTrackDisplayName: options.getTrackDisplayName,
            formatClock: options.formatClock,
            round: options.round,
            parseNum: options.parseNum,
            formatDurationMs: options.formatDurationMs,
            formatSigned: options.formatSigned,
            escapeHtml: options.escapeHtml,
            buildMetricCard: function (name, value) {
                return renderFeature.buildMetricCard(name, value, { escapeHtml: options.escapeHtml });
            },
            isAlwaysOpenFillSnippet: function (snippet) {
                return renderFeature.isAlwaysOpenFillSnippet(snippet, { parseNum: options.parseNum });
            },
            isUninterestingSnippet: function (snippet) {
                return renderFeature.isUninterestingSnippet(snippet, { parseNum: options.parseNum });
            }
        });
    }

    function renderCutPreviewNow(options) {
        options = options || {};
        var state = options.state || {};

        if (!state.cutPreview || !state.cutPreview.items || state.cutPreview.items.length === 0) {
            options.hideCutPreview();
            return;
        }

        options.setPanelPageMode('review');
        state.cutPreview.summary = computeCutPreviewSummary(state.cutPreview.items, {
            parseNum: options.parseNum,
            round: options.round,
            isUninterestingSnippet: function (item) {
                return options.renderFeature.isUninterestingSnippet(item, { parseNum: options.parseNum });
            }
        });

        var items = options.getVisibleCutPreviewItems();
        if (!items.length) {
            options.hideCutPreview();
            return;
        }

        if (!state.activeSnippetId || !getCutPreviewItemById(state, state.activeSnippetId)) {
            var preferred = null;
            for (var ii = 0; ii < items.length; ii++) {
                if (!options.renderFeature.isUninterestingSnippet(items[ii], { parseNum: options.parseNum })) {
                    preferred = items[ii];
                    break;
                }
            }
            state.activeSnippetId = (preferred || items[0]).id;
        }

        options.ensureCutPreviewViewport(false);
        renderCutPreviewControls(options);
        renderCutPreviewTimeline(options);
        renderCutPreviewNavigator(options);
        renderCutPreviewInspector(options);
    }

    root.AutoCastPanelCutPreviewRuntimeFeature = {
        computeCutPreviewSummary: computeCutPreviewSummary,
        getCutPreviewItemById: getCutPreviewItemById,
        setCutPreviewItemSelected: setCutPreviewItemSelected,
        setActiveSnippet: setActiveSnippet,
        cancelPendingCutPreviewRender: cancelPendingCutPreviewRender,
        requestCutPreviewRender: requestCutPreviewRender,
        renderCutPreviewNow: renderCutPreviewNow
    };
})(this);
