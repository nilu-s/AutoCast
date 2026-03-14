/**
 * AutoCast - Panel UI Controller v2.1
 *
 * Notes:
 * - This keeps the existing UI structure.
 * - Added live progress support for clip cutting.
 * - Analyzer params now include bleedMarginDb support if the UI exposes it.
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

    var state = null;

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
    var CutPreviewFeature = window.AutoCastPanelCutPreviewFeature || null;
    var CutPreviewSourceMapperFeature = window.AutoCastPanelCutPreviewSourceMapperFeature || null;
    var CutPreviewViewportFeature = window.AutoCastPanelCutPreviewViewportFeature || null;
    var CutPreviewRuntimeFeature = window.AutoCastPanelCutPreviewRuntimeFeature || null;
    var CutPreviewInteractionFeature = window.AutoCastPanelInteractionFeature || null;
    var CutPreviewRenderFeature = window.AutoCastPanelCutPreviewRenderFeature || null;
    var AudioPreviewFeature = window.AutoCastPanelAudioPreviewFeature || null;
    var AudioPreviewPlayerFeature = window.AutoCastPanelAudioPreviewPlayerFeature || null;
    var ApplyEditsFeature = window.AutoCastPanelApplyEditsFeature || null;
    var ApplyEditsRunnerFeature = window.AutoCastPanelApplyEditsRunnerFeature || null;
    var SettingsFeatureFactory = window.AutoCastPanelSettingsFeature || null;
    var StorageAdapter = window.AutoCastPanelStorageAdapter || null;
    var PanelInitFeature = window.AutoCastPanelInitFeature || null;
    var PanelUiRuntimeFeature = window.AutoCastPanelUiRuntimeFeature || null;
    var PanelFlowRuntimeFeature = window.AutoCastPanelFlowRuntimeFeature || null;
    var PanelParamsFeature = window.AutoCastPanelParamsFeature || null;
    var TracksStateStore = window.AutoCastPanelTracksStore || null;
    var AnalysisStateStore = window.AutoCastPanelAnalysisStore || null;
    var CutPreviewStateStore = window.AutoCastPanelCutPreviewStore || null;
    var AudioPreviewStateStore = window.AutoCastPanelAudioPreviewStore || null;
    var SharedHtml = window.AutoCastPanelHtmlUtils || null;
    var SharedMath = window.AutoCastPanelMathFormatUtils || null;

    function requireFeature(featureRef, featureName) {
        if (!featureRef) {
            throw new Error('[AutoCast] Required feature module missing: ' + featureName);
        }
        return featureRef;
    }

    function getRenderFeature() {
        return requireFeature(CutPreviewRenderFeature, 'AutoCastPanelCutPreviewRenderFeature');
    }

    function getViewportFeature() {
        return requireFeature(CutPreviewViewportFeature, 'AutoCastPanelCutPreviewViewportFeature');
    }

    function getCutPreviewRuntimeFeature() {
        return requireFeature(CutPreviewRuntimeFeature, 'AutoCastPanelCutPreviewRuntimeFeature');
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

    function getAudioPreviewPlayerFeature() {
        return requireFeature(AudioPreviewPlayerFeature, 'AutoCastPanelAudioPreviewPlayerFeature');
    }

    function requireStateStore(storeRef, storeName) {
        var storeModule = requireFeature(storeRef, storeName);
        if (typeof storeModule.createState !== 'function') {
            throw new Error('[AutoCast] Invalid state store module: ' + storeName);
        }
        return storeModule;
    }

    function defineStateProxyProperty(stateProxy, store, propName) {
        Object.defineProperty(stateProxy, propName, {
            enumerable: true,
            configurable: false,
            get: function () {
                return store.getState()[propName];
            },
            set: function (value) {
                var patch = {};
                patch[propName] = value;
                store.setState(patch);
            }
        });
    }

    function createPanelState() {
        var tracksStore = requireStateStore(TracksStateStore, 'AutoCastPanelTracksStore').createState({
            tracks: [],
            perTrackSensitivity: {}
        });
        var analysisStore = requireStateStore(AnalysisStateStore, 'AutoCastPanelAnalysisStore').createState({
            analysisResult: null,
            isAnalyzing: false,
            analysisRunId: 0
        });
        var cutPreviewStore = requireStateStore(CutPreviewStateStore, 'AutoCastPanelCutPreviewStore').createState({
            cutPreview: null,
            activeSnippetId: null,
            panelPageMode: 'setup',
            cutPreviewZoom: 0,
            cutPreviewPixelsPerSec: 0,
            cutPreviewViewStartSec: 0,
            navigatorDrag: null,
            cutPreviewRenderPending: false,
            cutPreviewRenderHandle: null
        });
        var audioPreviewStore = requireStateStore(AudioPreviewStateStore, 'AutoCastPanelAudioPreviewStore').createState({
            currentAudio: null,
            currentPlayingPreviewId: null,
            previewMasterGain: 1,
            previewTrackGain: {},
            previewAudioContext: null,
            currentPreviewInfo: null
        });

        var stateProxy = {};

        defineStateProxyProperty(stateProxy, tracksStore, 'tracks');
        defineStateProxyProperty(stateProxy, tracksStore, 'perTrackSensitivity');

        defineStateProxyProperty(stateProxy, analysisStore, 'analysisResult');
        defineStateProxyProperty(stateProxy, analysisStore, 'isAnalyzing');
        defineStateProxyProperty(stateProxy, analysisStore, 'analysisRunId');

        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreview');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'activeSnippetId');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'panelPageMode');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewZoom');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewPixelsPerSec');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewViewStartSec');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'navigatorDrag');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewRenderPending');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewRenderHandle');

        defineStateProxyProperty(stateProxy, audioPreviewStore, 'currentAudio');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'currentPlayingPreviewId');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'previewMasterGain');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'previewTrackGain');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'previewAudioContext');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'currentPreviewInfo');

        return stateProxy;
    }

    state = createPanelState();

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
        cutPreviewBackBtn: $('cutPreviewBackBtn'),
        cutPreviewApplyBtn: $('cutPreviewApplyBtn'),
        cutPreviewZoom: $('cutPreviewZoom'),
        cutPreviewFitBtn: $('cutPreviewFitBtn'),
        cutPreviewZoomLabel: $('cutPreviewZoomLabel'),
        cutPreviewVolumeMaster: $('cutPreviewVolumeMaster'),
        cutPreviewVolumeMasterLabel: $('cutPreviewVolumeMasterLabel'),
        btnLoadTracks: $('btnLoadTracks'),
        btnAnalyze: $('btnAnalyze'),
        btnApply: $('btnApply'),
        btnReset: $('btnReset'),
        paramThreshold: $('paramThreshold'),
        valThreshold: $('valThreshold'),
        paramMinPeak: $('paramMinPeak'),
        valMinPeak: $('valMinPeak'),
        modeIndicator: $('modeIndicator')
    };

    function bindSlider(slider, display, suffix) {
        return getPanelUiRuntimeFeature().bindSlider(slider, display, suffix);
    }

    bindSlider(els.paramThreshold, els.valThreshold, '');
    bindSlider(els.paramMinPeak, els.valMinPeak, 'dB');

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

    function getParams() {
        return getPanelParamsFeature().getParams({
            analysisFeature: requireFeature(AnalysisFeature, 'AutoCastPanelAnalysisFeature'),
            analyzerDefaultsCacheRef: analyzerDefaultsCacheRef,
            requireFn: typeof require === 'function' ? require : null,
            thresholdValue: els.paramThreshold.value,
            minPeakValue: els.paramMinPeak.value,
            perTrackThresholdDb: getPerTrackSensitivity(),
            windowObj: window
        });
    }

    function getPerTrackSensitivity() {
        return getPanelParamsFeature().getPerTrackSensitivity({
            analysisFeature: requireFeature(AnalysisFeature, 'AutoCastPanelAnalysisFeature'),
            perTrackSensitivity: state.perTrackSensitivity,
            trackCount: state.tracks.length,
            globalThreshold: parseInt(els.paramThreshold.value, 10)
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

    function updateModeIndicator() {
        return getPanelUiRuntimeFeature().updateModeIndicator(els);
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
            setStatus: setStatus
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

    function escapeHtml(str) {
        return SharedHtml.escapeHtml(str);
    }

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

    function getTrackByIndex(trackIndex) {
        for (var i = 0; i < state.tracks.length; i++) {
            if (state.tracks[i] && state.tracks[i].index === trackIndex) return state.tracks[i];
        }
        return state.tracks[trackIndex] || null;
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
        return clamp(getTrackPreviewGain(trackIndex) * clamp(parseNum(state.previewMasterGain, 1), 0, 3), 0, 3);
    }

    function hydrateItemSourceMapping(item) {
        var sourceMapper = requireFeature(CutPreviewSourceMapperFeature, 'AutoCastPanelCutPreviewSourceMapperFeature');
        return sourceMapper.hydrateItemSourceMapping(item, {
            tracks: state.tracks,
            getTrackByIndex: getTrackByIndex,
            parseNum: parseNum,
            round: round,
            ticksPerSecondDefault: TICKS_PER_SECOND
        });
    }
    function buildCutPreviewState(result) {
        var cutPreviewFeature = requireFeature(CutPreviewFeature, 'AutoCastPanelCutPreviewFeature');
        return cutPreviewFeature.buildCutPreviewState(result, {
            parseNum: parseNum,
            clamp: clamp,
            round: round,
            getTrackDisplayName: getTrackDisplayName,
            trackColors: TRACK_COLORS,
            trackCount: state.tracks.length,
            tracks: state.tracks,
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
            windowObj: window
        });
    }

    function requestCutPreviewRender(immediate) {
        return getCutPreviewRuntimeFeature().requestCutPreviewRender({
            state: state,
            immediate: !!immediate,
            renderNow: renderCutPreviewNow,
            windowObj: window
        });
    }

    function renderCutPreview() {
        requestCutPreviewRender(false);
    }

    function renderCutPreviewNow() {
        return getCutPreviewRuntimeFeature().renderCutPreviewNow({
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
        while (cur && cur !== document.body) {
            if (cur.getAttribute && cur.getAttribute(attrName)) return cur;
            cur = cur.parentNode;
        }
        return null;
    }

    function resolveMediaPathToAudioUrl(mediaPath) {
        return getAudioPreviewPlayerFeature().resolveMediaPathToAudioUrl(mediaPath, {
            pathObj: (typeof path !== 'undefined' ? path : null),
            hostAdapter: HostAdapter,
            windowObj: window,
            consoleObj: console
        });
    }

    function buildPreviewPlaybackPlan(item) {
        return requireFeature(AudioPreviewFeature, 'AutoCastPanelAudioPreviewFeature')
            .buildPreviewPlaybackPlan(item);
    }

    function stopCurrentPreviewAudio(skipRender) {
        return getAudioPreviewPlayerFeature()
            .stopCurrentPreviewAudio({
                state: state,
                skipRender: !!skipRender,
                renderCutPreview: renderCutPreview
            });
    }

    function updateCurrentPreviewGain() {
        return getAudioPreviewPlayerFeature()
            .updateCurrentPreviewGain({
                state: state,
                getCutPreviewItemById: getCutPreviewItemById,
                getEffectivePreviewGain: getEffectivePreviewGain,
                clamp: clamp
            });
    }

    function createPreviewGainController(audio, trackIndex) {
        return getAudioPreviewPlayerFeature()
            .createPreviewGainController(audio, trackIndex, {
                state: state,
                getEffectivePreviewGain: getEffectivePreviewGain,
                parseNum: parseNum,
                clamp: clamp,
                windowObj: window
            });
    }

    function toggleSnippetPreview(itemId) {
        return getAudioPreviewPlayerFeature()
            .toggleSnippetPreview(itemId, {
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
                audioCtor: Audio,
                audioPreviewPrerollSec: AUDIO_PREVIEW_PREROLL_SEC,
                audioPreviewPostrollSec: AUDIO_PREVIEW_POSTROLL_SEC
            });
    }
    function buildApplyCutsPayload() {
        var applyHelper = window.AutoCastCutPreviewApply || null;
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
        var interactionFeature = requireFeature(CutPreviewInteractionFeature, 'AutoCastPanelInteractionFeature');
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
            documentObj: document,
            windowObj: window
        });
    }
    requireFeature(PanelInitFeature, 'AutoCastPanelInitFeature').initializePanel({
        interactionFeature: requireFeature(CutPreviewInteractionFeature, 'AutoCastPanelInteractionFeature'),
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


