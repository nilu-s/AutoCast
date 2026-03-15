'use strict';

(function (root) {
    function defaultParseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function defaultClamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function beginNavigatorDrag(state, navigatorEl, ensureCutPreviewViewport, mode, clientX) {
        if (!navigatorEl) return;
        var trackEl = navigatorEl.querySelector ? navigatorEl.querySelector('.cp-nav-track') : null;
        if (!trackEl) return;
        var viewport = ensureCutPreviewViewport(false);
        if (!viewport) return;

        state.navigatorDrag = {
            mode: mode,
            startX: clientX,
            navWidth: Math.max(1, trackEl.clientWidth),
            startViewStartSec: viewport.viewStartSec,
            startViewEndSec: viewport.viewEndSec,
            totalDurationSec: viewport.totalDurationSec
        };
    }

    function updateNavigatorDrag(state, getZoomModel, clamp, pixelsPerSecToSlider, clientX) {
        if (!state.navigatorDrag) return;
        var drag = state.navigatorDrag;
        var model = getZoomModel();
        var deltaSec = ((clientX - drag.startX) / drag.navWidth) * drag.totalDurationSec;
        var minWindowSec = Math.max(0.08, drag.totalDurationSec / 1200);
        var start = drag.startViewStartSec;
        var end = drag.startViewEndSec;

        if (drag.mode === 'move') {
            start += deltaSec;
            end += deltaSec;
        } else if (drag.mode === 'left') {
            start += deltaSec;
            if (start < 0) start = 0;
            if (start > end - minWindowSec) start = end - minWindowSec;
        } else if (drag.mode === 'right') {
            end += deltaSec;
            if (end > drag.totalDurationSec) end = drag.totalDurationSec;
            if (end < start + minWindowSec) end = start + minWindowSec;
        }

        if (end > drag.totalDurationSec) {
            var over = end - drag.totalDurationSec;
            end -= over;
            start -= over;
        }
        if (start < 0) {
            end += -start;
            start = 0;
        }

        var visibleDuration = Math.max(minWindowSec, end - start);
        var maxVisible = drag.totalDurationSec;
        if (visibleDuration > maxVisible) visibleDuration = maxVisible;

        state.cutPreviewPixelsPerSec = clamp(model.trackWidth / Math.max(visibleDuration, 0.0001), model.fitPixelsPerSec, model.maxPixelsPerSec);
        state.cutPreviewZoom = pixelsPerSecToSlider(state.cutPreviewPixelsPerSec, model);

        var maxStart = Math.max(0, drag.totalDurationSec - (model.trackWidth / state.cutPreviewPixelsPerSec));
        state.cutPreviewViewStartSec = clamp(start, 0, maxStart);
    }

    function endNavigatorDrag(state) {
        state.navigatorDrag = null;
    }

    function bindCutPreviewControls(options) {
        options = options || {};
        var state = options.state || {};
        var els = options.els || {};
        var parseNum = typeof options.parseNum === 'function' ? options.parseNum : defaultParseNum;
        var clamp = typeof options.clamp === 'function' ? options.clamp : defaultClamp;
        var findDataElement = options.findDataElement;
        var getCutPreviewItemById = options.getCutPreviewItemById;
        var setCutPreviewItemSelected = options.setCutPreviewItemSelected;
        var setActiveSnippet = options.setActiveSnippet;
        var toggleSnippetPreview = options.toggleSnippetPreview;
        var renderCutPreview = options.renderCutPreview;
        var setTrackPreviewGain = options.setTrackPreviewGain;
        var updateCurrentPreviewGain = options.updateCurrentPreviewGain;
        var getZoomModel = options.getZoomModel;
        var ensureCutPreviewViewport = options.ensureCutPreviewViewport;
        var sliderToPixelsPerSec = options.sliderToPixelsPerSec;
        var pixelsPerSecToSlider = options.pixelsPerSecToSlider;
        var documentObj = options.documentObj || root.document;
        var windowObj = options.windowObj || root;

        if (els.cutPreviewSection) {
            els.cutPreviewSection.addEventListener('click', function (evt) {
                var target = evt.target;
                if (!target) return;

                var selectBtn = findDataElement(target, 'data-item-select');
                if (selectBtn) {
                    var selectId = selectBtn.getAttribute('data-item-select');
                    var selectItem = getCutPreviewItemById(selectId);
                    if (!selectItem) return;
                    state.activeSnippetId = selectId;
                    setCutPreviewItemSelected(selectId, !selectItem.selected);
                    return;
                }

                var playBtn = findDataElement(target, 'data-item-play');
                if (playBtn) {
                    var playId = playBtn.getAttribute('data-item-play');
                    setActiveSnippet(playId, false);
                    toggleSnippetPreview(playId);
                    return;
                }

                var inspectorToggle = findDataElement(target, 'data-inspector-toggle');
                if (inspectorToggle) {
                    var toggleId = inspectorToggle.getAttribute('data-inspector-toggle');
                    var toggleItem = getCutPreviewItemById(toggleId);
                    if (!toggleItem) return;
                    state.activeSnippetId = toggleId;
                    setCutPreviewItemSelected(toggleId, !toggleItem.selected);
                    return;
                }

                var snippetBtn = findDataElement(target, 'data-item-id');
                if (snippetBtn && snippetBtn.className.indexOf('cp-snippet') !== -1) {
                    var itemId = snippetBtn.getAttribute('data-item-id');
                    setActiveSnippet(itemId, true);
                    renderCutPreview();
                    // Also update review list to show the selected snippet
                    if (typeof options.onSnippetSelected === 'function') {
                        options.onSnippetSelected(itemId);
                    }
                    return;
                }
            });

            els.cutPreviewSection.addEventListener('input', function (evt) {
                var target = evt.target;
                if (!target || !target.getAttribute) return;
                var trackVolumeRaw = target.getAttribute('data-track-volume');
                if (trackVolumeRaw === null || trackVolumeRaw === undefined) return;

                var trackIndex = parseInt(trackVolumeRaw, 10);
                if (!isFinite(trackIndex)) return;
                var gainPercent = clamp(parseNum(target.value, 100), 0, 300);
                setTrackPreviewGain(trackIndex, gainPercent / 100);
                updateCurrentPreviewGain();

                var label = els.cutPreviewSection.querySelector('[data-track-volume-label="' + trackIndex + '"]');
                if (label) label.textContent = Math.round(gainPercent) + '%';
            });
        }

        if (els.cutPreviewZoom) {
            els.cutPreviewZoom.addEventListener('input', function () {
                if (!state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return;
                var model = getZoomModel();
                var beforeViewport = ensureCutPreviewViewport(false);
                if (!beforeViewport) return;
                var centerSec = beforeViewport.viewStartSec + beforeViewport.visibleDurationSec / 2;
                state.cutPreviewZoom = clamp(parseNum(this.value, 0), 0, 1000);
                state.cutPreviewPixelsPerSec = sliderToPixelsPerSec(state.cutPreviewZoom, model);

                var visibleDuration = model.trackWidth / state.cutPreviewPixelsPerSec;
                var maxStart = Math.max(0, model.totalDurationSec - visibleDuration);
                state.cutPreviewViewStartSec = clamp(centerSec - visibleDuration / 2, 0, maxStart);
                renderCutPreview();
            });
        }

        if (els.cutPreviewFitBtn) {
            els.cutPreviewFitBtn.addEventListener('click', function () {
                ensureCutPreviewViewport(true);
                renderCutPreview();
            });
        }

        if (els.cutPreviewVolumeMaster) {
            els.cutPreviewVolumeMaster.addEventListener('input', function () {
                var gainPercent = clamp(parseNum(this.value, 100), 0, 300);
                state.previewMasterGain = gainPercent / 100;
                if (els.cutPreviewVolumeMasterLabel) {
                    els.cutPreviewVolumeMasterLabel.textContent = Math.round(gainPercent) + '%';
                }
                updateCurrentPreviewGain();
            });
        }

        if (els.cutPreviewTimeline) {
            els.cutPreviewTimeline.addEventListener('wheel', function (evt) {
                if (!state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return;
                var viewport = ensureCutPreviewViewport(false);
                if (!viewport) return;

                var deltaPx = Math.abs(evt.deltaX) > Math.abs(evt.deltaY) ? evt.deltaX : evt.deltaY;
                var shiftSec = deltaPx / Math.max(20, viewport.pixelsPerSec);
                var maxStart = Math.max(0, viewport.totalDurationSec - viewport.visibleDurationSec);
                state.cutPreviewViewStartSec = clamp(state.cutPreviewViewStartSec + shiftSec, 0, maxStart);
                renderCutPreview();
                evt.preventDefault();
            });
        }

        if (els.cutPreviewNavigator) {
            els.cutPreviewNavigator.addEventListener('mousedown', function (evt) {
                var dragNode = findDataElement(evt.target, 'data-nav-drag');
                if (!dragNode) return;
                beginNavigatorDrag(state, els.cutPreviewNavigator, ensureCutPreviewViewport, dragNode.getAttribute('data-nav-drag'), evt.clientX);
                evt.preventDefault();
            });
        }

        if (documentObj && typeof documentObj.addEventListener === 'function') {
            documentObj.addEventListener('mousemove', function (evt) {
                if (!state.navigatorDrag) return;
                updateNavigatorDrag(state, getZoomModel, clamp, pixelsPerSecToSlider, evt.clientX);
                renderCutPreview();
                evt.preventDefault();
            });

            documentObj.addEventListener('mouseup', function () {
                if (!state.navigatorDrag) return;
                endNavigatorDrag(state);
            });
        }

        if (windowObj && typeof windowObj.addEventListener === 'function') {
            windowObj.addEventListener('resize', function () {
                if (!state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return;
                if (state.panelPageMode !== 'review') return;
                renderCutPreview();
            });
        }
    }

    function bindPrimaryActions(options) {
        options = options || {};
        var els = options.els || {};

        if (els.btnLoadTracks) {
            els.btnLoadTracks.addEventListener('click', options.loadTracksFromHost);
        }
        if (els.btnAnalyze) {
            els.btnAnalyze.addEventListener('click', options.analyzeTracks);
        }
        if (els.cutPreviewApplyBtn) {
            els.cutPreviewApplyBtn.addEventListener('click', options.applyEdits);
        }

        if (els.btnReset) {
            els.btnReset.addEventListener('click', options.resetUI);
        }
    }

    root.AutoCastPanelInteractionFeature = {
        beginNavigatorDrag: beginNavigatorDrag,
        updateNavigatorDrag: updateNavigatorDrag,
        endNavigatorDrag: endNavigatorDrag,
        bindCutPreviewControls: bindCutPreviewControls,
        bindPrimaryActions: bindPrimaryActions
    };
})(this);
