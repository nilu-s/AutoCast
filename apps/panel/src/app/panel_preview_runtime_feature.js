'use strict';

(function (root) {
    function defaultParseNum(v, fallback) {
        var n = parseFloat(v);
        return isFinite(n) ? n : fallback;
    }

    function defaultClamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function defaultRound(v, digits) {
        var p = Math.pow(10, digits || 0);
        return Math.round(v * p) / p;
    }

    function defaultString(v) {
        return v === null || v === undefined ? '' : String(v);
    }

    function requireModule(ref, name) {
        if (!ref) throw new Error('[AutoCast] Required feature module missing: ' + name);
        return ref;
    }

    function createPreviewRuntime(options) {
        options = options || {};

        var state = options.state || {};
        var els = options.els || {};
        var hostAdapter = options.hostAdapter || null;
        var windowObj = options.windowObj || root;
        var documentObj = options.documentObj || (windowObj && windowObj.document ? windowObj.document : null);
        var consoleObj = options.consoleObj || (windowObj && windowObj.console ? windowObj.console : null);

        var parseNum = typeof options.parseNum === 'function' ? options.parseNum : defaultParseNum;
        var clamp = typeof options.clamp === 'function' ? options.clamp : defaultClamp;
        var round = typeof options.round === 'function' ? options.round : defaultRound;
        var formatSigned = typeof options.formatSigned === 'function' ? options.formatSigned : defaultString;
        var formatClock = typeof options.formatClock === 'function' ? options.formatClock : defaultString;
        var formatDurationMs = typeof options.formatDurationMs === 'function' ? options.formatDurationMs : defaultString;
        var formatSummaryDuration = typeof options.formatSummaryDuration === 'function' ? options.formatSummaryDuration : defaultString;
        var escapeHtml = typeof options.escapeHtml === 'function' ? options.escapeHtml : defaultString;

        var setPanelPageMode = typeof options.setPanelPageMode === 'function' ? options.setPanelPageMode : function () { };
        var hideCutPreview = typeof options.hideCutPreview === 'function' ? options.hideCutPreview : function () { };
        var setStatus = typeof options.setStatus === 'function' ? options.setStatus : function () { };

        var trackColors = options.trackColors || [];
        var ticksPerSecondDefault = options.ticksPerSecondDefault || 254016000000;
        var audioPreviewPrerollSec = isFinite(options.audioPreviewPrerollSec) ? options.audioPreviewPrerollSec : 0.2;
        var audioPreviewPostrollSec = isFinite(options.audioPreviewPostrollSec) ? options.audioPreviewPostrollSec : 0.2;

        function getRenderFeature() {
            return requireModule(options.cutPreviewRenderFeature, 'AutoCastPanelCutPreviewRenderFeature');
        }

        function getViewportFeature() {
            return requireModule(options.cutPreviewViewportFeature, 'AutoCastPanelCutPreviewViewportFeature');
        }

        function getCutPreviewRuntimeFeature() {
            return requireModule(options.cutPreviewRuntimeFeature, 'AutoCastPanelCutPreviewRuntimeFeature');
        }

        function getAudioPreviewPlayerFeature() {
            return requireModule(options.audioPreviewPlayerFeature, 'AutoCastPanelAudioPreviewPlayerFeature');
        }

        function getTrackByIndex(trackIndex) {
            var tracks = state.tracks || [];
            for (var i = 0; i < tracks.length; i++) {
                if (tracks[i] && tracks[i].index === trackIndex) return tracks[i];
            }
            return tracks[trackIndex] || null;
        }

        function getTrackDisplayName(trackIndex) {
            var track = getTrackByIndex(trackIndex);
            if (track && track.name) return track.name;
            return 'Track ' + (trackIndex + 1);
        }

        function getTrackPreviewGain(trackIndex) {
            var key = String(trackIndex);
            var raw = state.previewTrackGain && state.previewTrackGain[key];
            if (raw === undefined || raw === null || !isFinite(raw)) return 1;
            return clamp(parseNum(raw, 1), 0, 3);
        }

        function setTrackPreviewGain(trackIndex, gainValue) {
            if (!state.previewTrackGain) state.previewTrackGain = {};
            state.previewTrackGain[String(trackIndex)] = clamp(parseNum(gainValue, 1), 0, 3);
        }

        function getEffectivePreviewGain(trackIndex) {
            return clamp(
                getTrackPreviewGain(trackIndex) * clamp(parseNum(state.previewMasterGain, 1), 0, 3),
                0,
                3
            );
        }

        function hydrateItemSourceMapping(item) {
            var sourceMapper = requireModule(
                options.cutPreviewSourceMapperFeature,
                'AutoCastPanelCutPreviewSourceMapperFeature'
            );
            return sourceMapper.hydrateItemSourceMapping(item, {
                tracks: state.tracks || [],
                getTrackByIndex: getTrackByIndex,
                parseNum: parseNum,
                round: round,
                ticksPerSecondDefault: ticksPerSecondDefault
            });
        }

        function buildCutPreviewState(result) {
            var cutPreviewFeature = requireModule(options.cutPreviewFeature, 'AutoCastPanelCutPreviewFeature');
            return cutPreviewFeature.buildCutPreviewState(result, {
                parseNum: parseNum,
                clamp: clamp,
                round: round,
                getTrackDisplayName: getTrackDisplayName,
                trackColors: trackColors,
                trackCount: (state.tracks || []).length,
                tracks: state.tracks || [],
                isUninterestingSnippet: function (item) {
                    return getRenderFeature().isUninterestingSnippet(item, { parseNum: parseNum });
                },
                hydrateItemSourceMapping: hydrateItemSourceMapping
            });
        }

        function getVisibleCutPreviewItems() {
            return getViewportFeature().getVisibleCutPreviewItems(state);
        }

        function getTotalCutPreviewDurationSec() {
            return getViewportFeature().getTotalCutPreviewDurationSec(state, parseNum);
        }

        function getZoomModel() {
            return getViewportFeature().getZoomModel(state, els.cutPreviewTimeline, parseNum);
        }

        function sliderToPixelsPerSec(sliderValue, zoomModel) {
            var model = zoomModel || getZoomModel();
            return getViewportFeature().sliderToPixelsPerSec(sliderValue, model, parseNum, clamp);
        }

        function pixelsPerSecToSlider(pixelsPerSec, zoomModel) {
            var model = zoomModel || getZoomModel();
            return getViewportFeature().pixelsPerSecToSlider(pixelsPerSec, model, parseNum, clamp);
        }

        function ensureCutPreviewViewport(forceFit) {
            return getViewportFeature().ensureCutPreviewViewport(state, forceFit, getZoomModel(), parseNum, clamp);
        }

        function getTimelineTickStep(visibleDurationSec) {
            return getViewportFeature().getTimelineTickStep(visibleDurationSec);
        }

        function setActiveSnippet(itemId, ensureVisible) {
            return getCutPreviewRuntimeFeature().setActiveSnippet({
                state: state,
                itemId: itemId,
                ensureVisible: !!ensureVisible,
                ensureCutPreviewViewport: ensureCutPreviewViewport,
                clamp: clamp
            });
        }

        function cancelPendingCutPreviewRender() {
            return getCutPreviewRuntimeFeature().cancelPendingCutPreviewRender({
                state: state,
                windowObj: windowObj
            });
        }

        function requestCutPreviewRender(immediate) {
            return getCutPreviewRuntimeFeature().requestCutPreviewRender({
                state: state,
                immediate: !!immediate,
                renderNow: renderCutPreviewNow,
                windowObj: windowObj
            });
        }

        function renderCutPreview() {
            requestCutPreviewRender(false);
        }

        function renderCutPreviewNow() {
            var result = getCutPreviewRuntimeFeature().renderCutPreviewNow({
                state: state,
                els: els,
                renderFeature: getRenderFeature(),
                setPanelPageMode: setPanelPageMode,
                hideCutPreview: hideCutPreview,
                getVisibleCutPreviewItems: getVisibleCutPreviewItems,
                getTotalCutPreviewDurationSec: getTotalCutPreviewDurationSec,
                ensureCutPreviewViewport: ensureCutPreviewViewport,
                getTimelineTickStep: getTimelineTickStep,
                getTrackPreviewGain: getTrackPreviewGain,
                buildPreviewPlaybackPlan: buildPreviewPlaybackPlan,
                getTrackDisplayName: getTrackDisplayName,
                parseNum: parseNum,
                round: round,
                clamp: clamp,
                formatClock: formatClock,
                formatDurationMs: formatDurationMs,
                formatSigned: formatSigned,
                formatSummaryDuration: formatSummaryDuration,
                escapeHtml: escapeHtml
            });
            
            // Also render the review section
            renderReviewSection();
            
            return result;
        }

        function getCutPreviewItemById(itemId) {
            return getCutPreviewRuntimeFeature().getCutPreviewItemById(state, itemId);
        }

        function setCutPreviewItemSelected(itemId, selected) {
            return getCutPreviewRuntimeFeature().setCutPreviewItemSelected({
                state: state,
                itemId: itemId,
                selected: selected,
                renderCutPreview: renderCutPreview
            });
        }

        function findDataElement(startEl, attrName) {
            var cur = startEl;
            var body = documentObj && documentObj.body ? documentObj.body : null;
            while (cur && cur !== body) {
                if (cur.getAttribute && cur.getAttribute(attrName)) return cur;
                cur = cur.parentNode;
            }
            return null;
        }

        function resolveMediaPathToAudioUrl(mediaPath) {
            return getAudioPreviewPlayerFeature().resolveMediaPathToAudioUrl(mediaPath, {
                pathObj: options.pathObj || (typeof path !== 'undefined' ? path : null),
                hostAdapter: hostAdapter,
                windowObj: windowObj,
                consoleObj: consoleObj
            });
        }

        function buildPreviewPlaybackPlan(item) {
            return requireModule(options.audioPreviewFeature, 'AutoCastPanelAudioPreviewFeature')
                .buildPreviewPlaybackPlan(item);
        }

        function stopCurrentPreviewAudio(skipRender) {
            return getAudioPreviewPlayerFeature().stopCurrentPreviewAudio({
                state: state,
                skipRender: !!skipRender,
                renderCutPreview: renderCutPreview
            });
        }

        function updateCurrentPreviewGain() {
            return getAudioPreviewPlayerFeature().updateCurrentPreviewGain({
                state: state,
                getCutPreviewItemById: getCutPreviewItemById,
                getEffectivePreviewGain: getEffectivePreviewGain,
                clamp: clamp
            });
        }

        function createPreviewGainController(audio, trackIndex) {
            return getAudioPreviewPlayerFeature().createPreviewGainController(audio, trackIndex, {
                state: state,
                getEffectivePreviewGain: getEffectivePreviewGain,
                parseNum: parseNum,
                clamp: clamp,
                windowObj: windowObj
            });
        }

        function toggleSnippetPreview(itemId) {
            var AudioCtor = options.audioCtor ||
                (windowObj && windowObj.Audio ? windowObj.Audio : (typeof Audio !== 'undefined' ? Audio : null));
            return getAudioPreviewPlayerFeature().toggleSnippetPreview(itemId, {
                state: state,
                getCutPreviewItemById: getCutPreviewItemById,
                buildPreviewPlaybackPlan: buildPreviewPlaybackPlan,
                resolveMediaPathToAudioUrl: resolveMediaPathToAudioUrl,
                stopCurrentPreviewAudio: function (skipRender) {
                    stopCurrentPreviewAudio(skipRender);
                },
                createPreviewGainController: createPreviewGainController,
                parseNum: parseNum,
                clamp: clamp,
                renderCutPreview: renderCutPreview,
                setStatus: setStatus,
                audioCtor: AudioCtor,
                audioPreviewPrerollSec: audioPreviewPrerollSec,
                audioPreviewPostrollSec: audioPreviewPostrollSec
            });
        }

        function bindCutPreviewControls() {
            var interactionFeature = requireModule(
                options.cutPreviewInteractionFeature,
                'AutoCastPanelInteractionFeature'
            );
            interactionFeature.bindCutPreviewControls({
                state: state,
                els: els,
                parseNum: parseNum,
                clamp: clamp,
                findDataElement: findDataElement,
                getCutPreviewItemById: getCutPreviewItemById,
                setCutPreviewItemSelected: setCutPreviewItemSelected,
                setActiveSnippet: setActiveSnippet,
                toggleSnippetPreview: toggleSnippetPreview,
                renderCutPreview: renderCutPreview,
                setTrackPreviewGain: setTrackPreviewGain,
                updateCurrentPreviewGain: updateCurrentPreviewGain,
                getZoomModel: getZoomModel,
                ensureCutPreviewViewport: ensureCutPreviewViewport,
                sliderToPixelsPerSec: sliderToPixelsPerSec,
                pixelsPerSecToSlider: pixelsPerSecToSlider,
                documentObj: documentObj,
                windowObj: windowObj,
                onSnippetSelected: function(itemId) {
                    // When snippet is selected from timeline, update review list
                    // Find which track this snippet belongs to
                    var item = getCutPreviewItemById(itemId);
                    if (item) {
                        state.reviewActiveTrackIndex = item.trackIndex;
                        renderReviewSection();
                        // Scroll to the selected snippet in the review list
                        setTimeout(function() {
                            if (els.cutPreviewReviewList) {
                                var snippetEl = els.cutPreviewReviewList.querySelector('[data-review-item-id="' + itemId + '"]');
                                if (snippetEl) {
                                    snippetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }
                        }, 50);
                    }
                }
            });

            bindReviewControls();
        }

        function getReviewFeature() {
            return options.cutPreviewReviewFeature || root.AutoCastPanelCutPreviewReviewFeature || null;
        }

        function getReviewListComponent() {
            return options.cutPreviewReviewListComponent || root.AutoCastPanelCutPreviewReviewListComponent || null;
        }

        function getReviewStore() {
            return options.cutPreviewReviewStore || root.AutoCastPanelCutPreviewReviewStore || null;
        }

        function initializeReviewState() {
            var reviewFeature = getReviewFeature();
            if (!reviewFeature || !reviewFeature.initializeReviewState) return null;
            return reviewFeature.initializeReviewState({
                reviewStore: getReviewStore()
            });
        }

        function renderReviewSection() {
            var reviewFeature = getReviewFeature();
            var reviewListComponent = getReviewListComponent();
            if (!reviewFeature || !reviewListComponent || !els.cutPreviewReviewList) return;

            if (!state.reviewState) {
                state.reviewState = initializeReviewState();
            }

            // Ensure active track index is initialized
            if (state.reviewActiveTrackIndex === undefined) {
                state.reviewActiveTrackIndex = 0;
            }

            reviewFeature.renderReviewSection(
                els.cutPreviewReviewList,
                state.cutPreview,
                state.reviewState,
                state.activeSnippetId,
                {
                    reviewListComponent: reviewListComponent,
                    reviewStore: getReviewStore(),
                    activeTrackIndex: state.reviewActiveTrackIndex
                }
            );
        }

        function bindReviewControls() {
            var reviewFeature = getReviewFeature();
            if (!reviewFeature || !els.cutPreviewReviewList) return;

            reviewFeature.bindReviewControls({
                containerEl: els.cutPreviewReviewList,
                state: state,
                reviewState: state.reviewState,
                onSelectSnippet: function(itemId) {
                    // Set active snippet and ensure it's visible in viewport
                    setActiveSnippet(itemId, true);
                    // Re-render timeline to show the blue highlight
                    renderCutPreview();
                    // Also re-render review list to show active state
                    renderReviewSection();
                    // Scroll to the selected snippet in the review list
                    setTimeout(function() {
                        if (els.cutPreviewReviewList) {
                            var snippetEl = els.cutPreviewReviewList.querySelector('[data-review-item-id="' + itemId + '"]');
                            if (snippetEl) {
                                snippetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }
                    }, 50);
                },
                onSelectTrack: function(trackIndex) {
                    // Track selection handled in state
                    state.reviewActiveTrackIndex = trackIndex;
                },
                onIncludeSnippet: function(itemId) {
                    if (!state.reviewState) state.reviewState = initializeReviewState();
                    reviewFeature.includeSnippet(state.reviewState, itemId, {
                        reviewStore: getReviewStore()
                    });
                    applyReviewDecisions();
                },
                onExcludeSnippet: function(itemId) {
                    if (!state.reviewState) state.reviewState = initializeReviewState();
                    reviewFeature.excludeSnippet(state.reviewState, itemId, {
                        reviewStore: getReviewStore()
                    });
                    applyReviewDecisions();
                },
                onResetSnippet: function(itemId) {
                    if (!state.reviewState) state.reviewState = initializeReviewState();
                    reviewFeature.resetSnippetDecision(state.reviewState, itemId, {
                        reviewStore: getReviewStore()
                    });
                    applyReviewDecisions();
                },
                renderCallback: function() {
                    renderReviewSection();
                    renderCutPreview();
                }
            });
        }

        function applyReviewDecisions() {
            var reviewFeature = getReviewFeature();
            if (!reviewFeature || !state.cutPreview || !state.reviewState) return;

            state.cutPreview = reviewFeature.applyReviewDecisions(
                state.cutPreview,
                state.reviewState,
                { reviewStore: getReviewStore() }
            );
        }

        function resetReviewState() {
            var reviewFeature = getReviewFeature();
            if (!reviewFeature || !state.reviewState) return;
            reviewFeature.resetAllReviewDecisions(state.reviewState, {
                reviewStore: getReviewStore()
            });
        }

        return {
            buildCutPreviewState: buildCutPreviewState,
            cancelPendingCutPreviewRender: cancelPendingCutPreviewRender,
            renderCutPreview: renderCutPreview,
            getCutPreviewItemById: getCutPreviewItemById,
            stopCurrentPreviewAudio: stopCurrentPreviewAudio,
            bindCutPreviewControls: bindCutPreviewControls,
            renderReviewSection: renderReviewSection,
            initializeReviewState: initializeReviewState,
            resetReviewState: resetReviewState
        };
    }

    root.AutoCastPanelPreviewRuntimeFeature = {
        create: createPreviewRuntime
    };
})(this);
