/**
 * AutoCast - Panel UI Controller v2.2
 *
 * Runtime entrypoint:
 * - keeps bootstrap/host/analyzer wiring stable
 * - delegates panel state and cut-preview/audio orchestration to runtime modules
 */

'use strict';

(function () {
    var bootResult = null;
    if (window.AutoCastPanelBootstrap && typeof window.AutoCastPanelBootstrap.bootstrap === 'function') {
        bootResult = window.AutoCastPanelBootstrap.bootstrap();
    }

    var runtime = bootResult && bootResult.runtime ? bootResult.runtime : null;

    var HostAdapter = runtime && runtime.hostAdapter
        ? runtime.hostAdapter
        : (window.AutoCastHostAdapter || window.AutoCastBridge || {
            init: function () { return false; },
            getExtensionPath: function () { return '.'; },
            isInMockMode: function () { return true; },
            addCutProgressListener: function () { },
            removeCutProgressListener: function () { },
            applyCuts: function (_payload, callback) { if (callback) callback({ success: false, error: 'Host unavailable' }); },
            getTrackInfo: function (callback) { if (callback) callback({ error: 'Host unavailable' }); },
            resizePanel: function () { return false; }
        });

    var AnalyzerAdapter = runtime && runtime.analyzerAdapter
        ? runtime.analyzerAdapter
        : (window.AutoCastAnalyzerAdapter || null);

    if (!runtime && HostAdapter && typeof HostAdapter.init === 'function') {
        HostAdapter.init();
    }

    var TRACK_COLORS = [
        '#4ea1f3', '#4caf50', '#ff9800', '#e91e63',
        '#9c27b0', '#00bcd4', '#ffeb3b', '#795548'
    ];
    var TICKS_PER_SECOND = 254016000000;
    var AUDIO_PREVIEW_PREROLL_SEC = 0.2;
    var AUDIO_PREVIEW_POSTROLL_SEC = 0.2;

    var PanelContracts = window.AutoCastPanelContracts || null;
    var TracksFeature = window.AutoCastPanelTracksFeature || null;
    var TracksLoaderFeature = window.AutoCastPanelTracksLoaderFeature || null;
    var AnalysisFeature = window.AutoCastPanelAnalysisFeature || null;
    var AnalysisRunFeature = window.AutoCastPanelAnalysisRunFeature || null;
    var ApplyEditsFeature = window.AutoCastPanelApplyEditsFeature || null;
    var ApplyEditsRunnerFeature = window.AutoCastPanelApplyEditsRunnerFeature || null;
    var SettingsFeatureFactory = window.AutoCastPanelSettingsFeature || null;
    var StorageAdapter = window.AutoCastPanelStorageAdapter || null;

    var PanelInitFeature = window.AutoCastPanelInitFeature || null;
    var PanelUiRuntimeFeature = window.AutoCastPanelUiRuntimeFeature || null;
    var PanelFlowRuntimeFeature = window.AutoCastPanelFlowRuntimeFeature || null;
    var PanelParamsFeature = window.AutoCastPanelParamsFeature || null;
    var PanelStateRuntimeFeature = window.AutoCastPanelStateRuntimeFeature || null;
    var PanelPreviewRuntimeFeature = window.AutoCastPanelPreviewRuntimeFeature || null;

    var TracksStateStore = window.AutoCastPanelTracksStore || null;
    var AnalysisStateStore = window.AutoCastPanelAnalysisStore || null;
    var CutPreviewStateStore = window.AutoCastPanelCutPreviewStore || null;
    var AudioPreviewStateStore = window.AutoCastPanelAudioPreviewStore || null;

    var CutPreviewFeature = window.AutoCastPanelCutPreviewFeature || null;
    var CutPreviewSourceMapperFeature = window.AutoCastPanelCutPreviewSourceMapperFeature || null;
    var CutPreviewViewportFeature = window.AutoCastPanelCutPreviewViewportFeature || null;
    var CutPreviewRuntimeFeature = window.AutoCastPanelCutPreviewRuntimeFeature || null;
    var CutPreviewInteractionFeature = window.AutoCastPanelInteractionFeature || null;
    var CutPreviewRenderFeature = window.AutoCastPanelCutPreviewRenderFeature || null;
    var CutPreviewReviewStore = window.AutoCastPanelCutPreviewReviewStore || null;
    var CutPreviewReviewFeature = window.AutoCastPanelCutPreviewReviewFeature || null;
    var CutPreviewReviewListComponent = window.AutoCastPanelCutPreviewReviewListComponent || null;
    var AudioPreviewFeature = window.AutoCastPanelAudioPreviewFeature || null;
    var AudioPreviewPlayerFeature = window.AutoCastPanelAudioPreviewPlayerFeature || null;

    var SharedHtml = window.AutoCastPanelHtmlUtils || null;
    var SharedMath = window.AutoCastPanelMathFormatUtils || null;

    function requireFeature(featureRef, featureName) {
        if (!featureRef) {
            throw new Error('[AutoCast] Required feature module missing: ' + featureName);
        }
        return featureRef;
    }

    function getPanelUiRuntimeFeature() {
        return requireFeature(PanelUiRuntimeFeature, 'AutoCastPanelUiRuntimeFeature');
    }

    function getPanelFlowRuntimeFeature() {
        return requireFeature(PanelFlowRuntimeFeature, 'AutoCastPanelFlowRuntimeFeature');
    }

    function getPanelParamsFeature() {
        return requireFeature(PanelParamsFeature, 'AutoCastPanelParamsFeature');
    }

    var state = requireFeature(PanelStateRuntimeFeature, 'AutoCastPanelStateRuntimeFeature').createPanelState({
        requireFeature: requireFeature,
        tracksStateStore: TracksStateStore,
        analysisStateStore: AnalysisStateStore,
        cutPreviewStateStore: CutPreviewStateStore,
        audioPreviewStateStore: AudioPreviewStateStore
    });

    function validateAnalyzeResultPayload(result) {
        if (!PanelContracts || typeof PanelContracts.validateAnalyzeResult !== 'function') {
            return result;
        }
        var validation = PanelContracts.validateAnalyzeResult(result);
        if (!validation.ok) {
            throw new Error(validation.message || 'Invalid analyzer result payload');
        }
        return validation.value;
    }

    function $(id) {
        return document.getElementById(id);
    }

    var els = {
        statusBar: $('statusBar'),
        statusText: $('statusText'),
        statusIcon: $('statusIcon'),
        panelRoot: document.querySelector('.panel'),
        tracksSection: $('tracksSection'),
        paramsSection: $('paramsSection'),
        footerActions: $('footerActions'),
        trackList: $('trackList'),
        progressContainer: $('progressContainer'),
        progressFill: $('progressFill'),
        progressText: $('progressText'),
        cutPreviewSection: $('cutPreviewSection'),
        cutPreviewMeta: $('cutPreviewMeta'),
        cutPreviewAnalysisMini: $('cutPreviewAnalysisMini'),
        cutPreviewTimeline: $('cutPreviewTimeline'),
        cutPreviewNavigator: $('cutPreviewNavigator'),
        cutPreviewInspector: $('cutPreviewInspector'),
        cutPreviewReviewList: $('cutPreviewReviewList'),
        cutPreviewApplyBtn: $('cutPreviewApplyBtn'),
        cutPreviewZoom: $('cutPreviewZoom'),
        cutPreviewFitBtn: $('cutPreviewFitBtn'),
        cutPreviewZoomLabel: $('cutPreviewZoomLabel'),
        cutPreviewVolumeMaster: $('cutPreviewVolumeMaster'),
        cutPreviewVolumeMasterLabel: $('cutPreviewVolumeMasterLabel'),
        tabNav: $('tabNav'),
        tabSetup: $('tabSetup'),
        tabReview: $('tabReview'),
        btnReviewManualCutsTemp: $('btnReviewManualCutsTemp'), // TEMP JSON EXPORT
        btnExportJsonReviewTemp: $('btnExportJsonReviewTemp'), // TEMP JSON EXPORT REVIEW
        btnLoadTracks: $('btnLoadTracks'),
        btnAnalyze: $('btnAnalyze'),
        btnReset: $('btnReset'),
        paramThreshold: $('paramThreshold'),
        valThreshold: $('valThreshold'),
        paramMinPeak: $('paramMinPeak'),
        valMinPeak: $('valMinPeak'),
        modeIndicator: $('modeIndicator'),
        btnBackToSetup: $('btnBackToSetup')
    };

    function bindSlider(slider, display, suffix) {
        return getPanelUiRuntimeFeature().bindSlider(slider, display, suffix);
    }

    bindSlider(els.paramThreshold, els.valThreshold, '');
    bindSlider(els.paramMinPeak, els.valMinPeak, 'dB');

    function parseNum(v, fallback) {
        return SharedMath.parseNum(v, fallback);
    }

    function clamp(v, min, max) {
        return SharedMath.clamp(v, min, max);
    }

    function round(v, digits) {
        return SharedMath.round(v, digits);
    }

    function formatSigned(v, digits) {
        return SharedMath.formatSigned(v, digits);
    }

    function formatClock(sec) {
        return SharedMath.formatClock(sec);
    }

    function formatDurationMs(ms) {
        return SharedMath.formatDurationMs(ms);
    }

    function formatSummaryDuration(sec) {
        return SharedMath.formatSummaryDuration(sec);
    }

    function escapeHtml(str) {
        return SharedHtml.escapeHtml(str);
    }

    var settingsFeature = (SettingsFeatureFactory && typeof SettingsFeatureFactory.create === 'function')
        ? SettingsFeatureFactory.create(StorageAdapter)
        : null;
    var analyzerDefaultsCacheRef = { value: null };

    function loadPanelSettings() {
        return getPanelParamsFeature().loadPanelSettings(settingsFeature, els);
    }

    function savePanelSettings() {
        return getPanelParamsFeature().savePanelSettings(settingsFeature, els);
    }

    loadPanelSettings();
    if (els.paramThreshold) els.paramThreshold.addEventListener('change', savePanelSettings);
    if (els.paramMinPeak) els.paramMinPeak.addEventListener('change', savePanelSettings);

    function getPerTrackSensitivity() {
        return getPanelParamsFeature().getPerTrackSensitivity({
            analysisFeature: requireFeature(AnalysisFeature, 'AutoCastPanelAnalysisFeature'),
            perTrackSensitivity: state.perTrackSensitivity,
            trackCount: state.tracks.length,
            globalThreshold: parseInt(els.paramThreshold.value, 10)
        });
    }

    function getParams() {
        return getPanelParamsFeature().getParams({
            analysisFeature: requireFeature(AnalysisFeature, 'AutoCastPanelAnalysisFeature'),
            analyzerDefaultsCacheRef: analyzerDefaultsCacheRef,
            analyzerDefaults: window.AutoCastAnalyzerDefaults || null,
            thresholdValue: els.paramThreshold.value,
            minPeakValue: els.paramMinPeak.value,
            perTrackThresholdDb: getPerTrackSensitivity(),
            windowObj: window
        });
    }

    function setStatus(type, text) {
        return getPanelUiRuntimeFeature().setStatus(els, type, text);
    }

    function setProgress(percent, message) {
        return getPanelUiRuntimeFeature().setProgress({
            els: els,
            percent: percent,
            message: message,
            setStatus: setStatus
        });
    }

    function hideProgress() {
        return getPanelUiRuntimeFeature().hideProgress(els);
    }

    function setButtonsDisabled(disabled) {
        return getPanelUiRuntimeFeature().setButtonsDisabled(els, disabled);
    }

    function setPanelPageMode(mode) {
        return getPanelUiRuntimeFeature().setPanelPageMode(state, els, mode);
    }

    function hideCutPreview() {
        return getPanelUiRuntimeFeature().hideCutPreview({
            state: state,
            els: els,
            setPanelPageMode: setPanelPageMode,
            cancelPendingCutPreviewRender: cancelPendingCutPreviewRender
        });
    }

    function updateModeIndicator() {
        return getPanelUiRuntimeFeature().updateModeIndicator(els);
    }

    var previewRuntime = requireFeature(
        PanelPreviewRuntimeFeature,
        'AutoCastPanelPreviewRuntimeFeature'
    ).create({
        state: state,
        els: els,
        hostAdapter: HostAdapter,
        windowObj: window,
        documentObj: document,
        consoleObj: console,
        parseNum: parseNum,
        clamp: clamp,
        round: round,
        formatSigned: formatSigned,
        formatClock: formatClock,
        formatDurationMs: formatDurationMs,
        formatSummaryDuration: formatSummaryDuration,
        escapeHtml: escapeHtml,
        trackColors: TRACK_COLORS,
        ticksPerSecondDefault: TICKS_PER_SECOND,
        audioPreviewPrerollSec: AUDIO_PREVIEW_PREROLL_SEC,
        audioPreviewPostrollSec: AUDIO_PREVIEW_POSTROLL_SEC,
        setPanelPageMode: setPanelPageMode,
        hideCutPreview: hideCutPreview,
        setStatus: setStatus,
        cutPreviewFeature: requireFeature(CutPreviewFeature, 'AutoCastPanelCutPreviewFeature'),
        cutPreviewSourceMapperFeature: requireFeature(CutPreviewSourceMapperFeature, 'AutoCastPanelCutPreviewSourceMapperFeature'),
        cutPreviewViewportFeature: requireFeature(CutPreviewViewportFeature, 'AutoCastPanelCutPreviewViewportFeature'),
        cutPreviewRuntimeFeature: requireFeature(CutPreviewRuntimeFeature, 'AutoCastPanelCutPreviewRuntimeFeature'),
        cutPreviewInteractionFeature: requireFeature(CutPreviewInteractionFeature, 'AutoCastPanelInteractionFeature'),
        cutPreviewRenderFeature: requireFeature(CutPreviewRenderFeature, 'AutoCastPanelCutPreviewRenderFeature'),
        cutPreviewReviewFeature: CutPreviewReviewFeature,
        cutPreviewReviewStore: CutPreviewReviewStore,
        cutPreviewReviewListComponent: CutPreviewReviewListComponent,
        audioPreviewFeature: requireFeature(AudioPreviewFeature, 'AutoCastPanelAudioPreviewFeature'),
        audioPreviewPlayerFeature: requireFeature(AudioPreviewPlayerFeature, 'AutoCastPanelAudioPreviewPlayerFeature')
    });

    function buildCutPreviewState(result) {
        return previewRuntime.buildCutPreviewState(result);
    }

    function cancelPendingCutPreviewRender() {
        return previewRuntime.cancelPendingCutPreviewRender();
    }

    function renderCutPreview() {
        return previewRuntime.renderCutPreview();
    }

    function getCutPreviewItemById(itemId) {
        return previewRuntime.getCutPreviewItemById(itemId);
    }

    function stopCurrentPreviewAudio(skipRender) {
        return previewRuntime.stopCurrentPreviewAudio(skipRender);
    }

    function renderTracks() {
        return getPanelFlowRuntimeFeature().renderTracks({
            state: state,
            els: els,
            tracksFeature: requireFeature(TracksFeature, 'AutoCastPanelTracksFeature'),
            trackColors: TRACK_COLORS,
            parseNum: parseNum,
            renderCutPreview: renderCutPreview
        });
    }

    function analyzeTracks() {
        return getPanelFlowRuntimeFeature().analyzeTracks({
            state: state,
            analysisFeature: requireFeature(AnalysisFeature, 'AutoCastPanelAnalysisFeature'),
            analysisRunFeature: requireFeature(AnalysisRunFeature, 'AutoCastPanelAnalysisRunFeature'),
            panelContracts: PanelContracts,
            analyzerAdapter: AnalyzerAdapter,
            windowObj: window,
            els: els,
            getParams: getParams,
            validateAnalyzeResultPayload: validateAnalyzeResultPayload,
            buildCutPreviewState: buildCutPreviewState,
            renderTracks: renderTracks,
            renderCutPreview: renderCutPreview,
            hideProgress: hideProgress,
            setButtonsDisabled: setButtonsDisabled,
            hideCutPreview: hideCutPreview,
            setStatus: setStatus,
            setProgress: setProgress,
            stopCurrentPreviewAudio: stopCurrentPreviewAudio
        });
    }

    function applyEdits() {
        return getPanelFlowRuntimeFeature().applyEdits({
            state: state,
            applyEditsFeature: requireFeature(ApplyEditsFeature, 'AutoCastPanelApplyEditsFeature'),
            applyEditsRunnerFeature: requireFeature(ApplyEditsRunnerFeature, 'AutoCastPanelApplyEditsRunnerFeature'),
            buildApplyCutsPayload: buildApplyCutsPayload,
            hostAdapter: HostAdapter,
            ticksPerSecond: TICKS_PER_SECOND,
            setStatus: setStatus,
            setProgress: setProgress,
            setButtonsDisabled: setButtonsDisabled,
            stopCurrentPreviewAudio: stopCurrentPreviewAudio,
            hideProgress: hideProgress
        });
    }

    function resetUI() {
        return getPanelFlowRuntimeFeature().resetUI({
            state: state,
            els: els,
            stopCurrentPreviewAudio: stopCurrentPreviewAudio,
            hideProgress: hideProgress,
            hideCutPreview: hideCutPreview,
            setStatus: setStatus,
            resetReviewState: previewRuntime.resetReviewState
        });
    }

    function loadTracksFromHost() {
        return getPanelFlowRuntimeFeature().loadTracksFromHost({
            state: state,
            hostAdapter: HostAdapter,
            tracksFeature: requireFeature(TracksFeature, 'AutoCastPanelTracksFeature'),
            tracksLoaderFeature: requireFeature(TracksLoaderFeature, 'AutoCastPanelTracksLoaderFeature'),
            ticksPerSecond: TICKS_PER_SECOND,
            setStatus: setStatus,
            renderTracks: renderTracks,
            buildCutPreviewState: buildCutPreviewState,
            getCutPreviewItemById: getCutPreviewItemById,
            renderCutPreview: renderCutPreview
        });
    }

    function buildApplyCutsPayload() {
        var applyHelper = window.AutoCastCutPreviewApply || null;
        if (!applyHelper && typeof globalThis !== 'undefined') {
            applyHelper = globalThis.AutoCastCutPreviewApply || null;
        }
        if (!applyHelper && typeof require !== 'undefined') {
            try {
                applyHelper = require('./cut_preview_apply');
            } catch (e) { }
        }
        if (applyHelper && typeof applyHelper.buildApplyCutsPayloadFromState === 'function') {
            return applyHelper.buildApplyCutsPayloadFromState(state.tracks, state.cutPreview, state.analysisResult);
        }
        console.error('[AutoCast] cut_preview_apply helper missing; cannot build apply payload.');
        return null;
    }

    function bindCutPreviewControls() {
        return previewRuntime.bindCutPreviewControls();
    }

    function onTabClick(tab) {
        if (tab === 'setup' && state.panelPageMode === 'review') {
            cancelPendingCutPreviewRender();
            setPanelPageMode('setup');
            setStatus('idle', 'Review closed');
        } else if (tab === 'review' && state.panelPageMode === 'setup') {
            if (state.analysisResult) {
                setPanelPageMode('review');
                setStatus('success', 'Review mode');
            }
        }
    }

    getPanelUiRuntimeFeature().bindTabNavigation(els, onTabClick);

    if (els.btnBackToSetup) {
        els.btnBackToSetup.addEventListener('click', function() {
            onTabClick('setup');
        });
    }

    // ==========================================
    // TEMP JSON EXPORT / REVIEW MANUAL CUTS
    // ==========================================
    if (els.btnReviewManualCutsTemp) {
        els.btnReviewManualCutsTemp.addEventListener('click', function() {
            if (!HostAdapter || typeof HostAdapter.getTrackInfo !== 'function') {
                alert("HostAdapter not available.");
                return;
            }
            setStatus('busy', 'Fetching track info...');
            HostAdapter.getTrackInfo(function(result) {
                if (result && result.error) {
                    alert("Error getting track info: " + result.error);
                    setStatus('error', 'Fetch Failed');
                    return;
                }
                if (!result || !result.tracks) {
                    alert("No tracks found or invalid result.");
                    setStatus('error', 'Fetch Failed');
                    return;
                }
                
                var segments = [];
                var trackCount = result.tracks.length;
                var tpS = result.ticksPerSecond || 254016000000;
                var idCounter = 1;

                // Cache tracks but don't overwrite if we already have .wav paths in trackInfos!
                var previousTrackInfos = state.trackInfos || null;
                state.tracks = result.tracks;
                
                for (var t = 0; t < trackCount; t++) {
                    var track = result.tracks[t];
                    var clips = track.clips || [];
                    
                    var wavPath = null;
                    if (previousTrackInfos && previousTrackInfos.length > t && previousTrackInfos[t] && previousTrackInfos[t].path) {
                        wavPath = previousTrackInfos[t].path;
                    }

                    for (var c = 0; c < clips.length; c++) {
                        var clip = clips[c];
                        var itemStart = clip.startTicks / tpS;
                        var itemEnd = clip.endTicks / tpS;

                        var finalMediaPath = wavPath ? wavPath : clip.mediaPath;
                        var finalSrcStart = wavPath ? itemStart : (clip.inPointTicks / tpS);
                        var finalSrcEnd = wavPath ? itemEnd : (clip.outPointTicks / tpS);

                        segments.push({
                            id: 'temp_clip_' + track.index + '_' + (idCounter++),
                            trackIndex: track.index,
                            trackName: track.name,
                            clipName: clip.name,
                            start: itemStart,
                            end: itemEnd,
                            decisionState: 'keep',
                            contentState: 'unknown',
                            score: 100,
                            selected: true,
                            selectable: true,
                            sourceClipIndex: c,
                            mediaPath: finalMediaPath,
                            sourceStartSec: finalSrcStart,
                            sourceEndSec: finalSrcEnd,
                            inPoint: clip.inPointTicks / tpS,
                            outPoint: clip.outPointTicks / tpS,
                            durationTicks: clip.durationTicks,
                            inPointTicks: clip.inPointTicks,
                            outPointTicks: clip.outPointTicks,
                            contentType: "" 
                        });
                    }
                }
                
                state.analysisResult = { tracks: result.tracks, cutPreview: { items: segments }, totalDurationSec: 0 };
                for (var i = 0; i < segments.length; i++) {
                    if (segments[i].end > state.analysisResult.totalDurationSec) {
                        state.analysisResult.totalDurationSec = segments[i].end;
                    }
                }
                
                if (!state.reviewState && typeof previewRuntime.initializeReviewState === 'function') {
                    state.reviewState = previewRuntime.initializeReviewState() || { reviewDecisions: {}, excludedSnippetIds: [] };
                } else if (!state.reviewState) {
                    state.reviewState = { reviewDecisions: {}, excludedSnippetIds: [] };
                }
                
                for (var i = 0; i < segments.length; i++) {
                    state.reviewState.reviewDecisions[segments[i].id] = 'included';
                }
                
                state.cutPreview = buildCutPreviewState(state.analysisResult);
                
                if (state.cutPreview && state.cutPreview.items) {
                    for(var i = 0; i < state.cutPreview.items.length; i++) {
                        var it = state.cutPreview.items[i];
                        var orig = null;
                        for (var s = 0; s < segments.length; s++) {
                            if (segments[s].id === it.id) { orig = segments[s]; break; }
                        }
                        if (orig) {
                            it.contentType = orig.contentType;
                            it.inPoint = orig.inPoint;
                            it.outPoint = orig.outPoint;
                            it.clipName = orig.clipName;
                        } else {
                            it.contentType = ""; 
                            it.inPoint = it.sourceStartSec;
                            it.outPoint = it.sourceEndSec;
                            it.clipName = "clip";
                        }
                    }
                }

                renderCutPreview();
                setPanelPageMode('review');
                setStatus('success', 'Manual cuts loaded for review');
            });
        });
    }

    if (els.btnExportJsonReviewTemp) {
        els.btnExportJsonReviewTemp.addEventListener('click', function() {
            var expSegments = [];
            if (state.cutPreview && state.cutPreview.items) {
                var items = state.cutPreview.items;
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    expSegments.push({
                        trackIndex: it.trackIndex,
                        trackName: it.trackName,
                        clipName: it.clipName || "clip",
                        start: it.start,
                        end: it.end,
                        inPoint: it.inPoint || it.sourceStartSec || 0,
                        outPoint: it.outPoint || it.sourceEndSec || 0,
                        duration: it.end - it.start,
                        contentType: it.contentType || ""
                    });
                }
            }
            if (expSegments.length === 0) {
                alert("No manual cuts to export.");
                return;
            }
            
            var jsonStr = JSON.stringify(expSegments, null, 2);
            if (window.cep && window.cep.fs) {
                var saveResult = window.cep.fs.showSaveDialogEx("Save Segments JSON", "", ["json"], "segments.json", "");
                if (saveResult.data) {
                    var writeRes = window.cep.fs.writeFile(saveResult.data, jsonStr);
                    if (writeRes.err === 0) {
                        setStatus('success', "Saved JSON");
                    } else {
                        alert("Error saving file: " + writeRes.err);
                        setStatus('error', 'Save Error');
                    }
                } else {
                    setStatus('idle', 'Export Cancelled');
                }
            } else {
                console.log("Segments JSON:\n", jsonStr);
                alert("CEP FS not available, logged to console.");
                setStatus('success', 'Logged JSON');
            }
        });
    }

    document.addEventListener('change', function(e) {
        if (e.target && e.target.classList.contains('temp-category-select')) {
            var itemId = e.target.getAttribute('data-item-id');
            var newVal = e.target.value;
            if (itemId && state.cutPreview && state.cutPreview.items) {
                for (var i = 0; i < state.cutPreview.items.length; i++) {
                    if (state.cutPreview.items[i].id === itemId) {
                        state.cutPreview.items[i].contentType = newVal;
                        break;
                    }
                }
            }
            if (itemId) {
                var selects = document.querySelectorAll('.temp-category-select[data-item-id="' + itemId + '"]');
                for (var j = 0; j < selects.length; j++) {
                    if (selects[j] !== e.target) {
                        selects[j].value = newVal;
                    }
                }
                if (typeof previewRuntime.renderReviewSection === 'function') {
                    previewRuntime.renderReviewSection();
                }
            }
        }
    });
    // ==========================================

    requireFeature(PanelInitFeature, 'AutoCastPanelInitFeature').initializePanel({
        interactionFeature: requireFeature(CutPreviewInteractionFeature, 'AutoCastPanelInteractionFeature'),
        uiRuntimeFeature: getPanelUiRuntimeFeature(),
        onTabClick: onTabClick,
        bindPrimaryActionsOptions: {
            els: els,
            loadTracksFromHost: loadTracksFromHost,
            analyzeTracks: analyzeTracks,
            applyEdits: applyEdits,
            cancelPendingCutPreviewRender: cancelPendingCutPreviewRender,
            setPanelPageMode: setPanelPageMode,
            setStatus: setStatus,
            resetUI: resetUI
        },
        bindCutPreviewControls: bindCutPreviewControls,
        updateModeIndicator: updateModeIndicator,
        hideProgress: hideProgress,
        hideCutPreview: hideCutPreview,
        renderTracks: renderTracks,
        setStatus: setStatus,
        loadTracksFromHost: loadTracksFromHost,
        els: els,
        hostAdapter: HostAdapter,
        parseNum: parseNum,
        clamp: clamp,
        windowObj: window,
        consoleObj: console
    });
})();
