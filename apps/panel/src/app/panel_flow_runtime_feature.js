'use strict';

(function (root) {
    function runMockCutting(options) {
        options = options || {};
        var setProgress = options.setProgress || function () { };
        var done = typeof options.done === 'function' ? options.done : function () { };

        var step = 0;
        var messages = [
            'Preparing cuts...',
            'Mapping active islands...',
            'Trimming clips...',
            'Creating split clips...',
            'Finalizing...'
        ];

        var interval = setInterval(function () {
            step += 8;
            var msgIdx = Math.min(Math.floor(step / 25), messages.length - 1);
            setProgress(Math.min(step, 100), messages[msgIdx]);

            if (step >= 100) {
                clearInterval(interval);
                done();
            }
        }, 120);
    }

    function renderTracks(options) {
        options = options || {};
        var els = options.els || {};
        if (!els.trackList) return;

        var tracksFeature = options.tracksFeature;
        var state = options.state || {};
        var parseNum = options.parseNum || function (v, fallback) {
            var n = parseFloat(v);
            return isFinite(n) ? n : fallback;
        };
        var thresholdEl = els.paramThreshold;
        var globalThreshold = parseNum(thresholdEl && thresholdEl.value, 0);

        els.trackList.innerHTML = tracksFeature.renderTracksHtml({
            tracks: state.tracks,
            trackColors: options.trackColors || [],
            perTrackSensitivity: state.perTrackSensitivity || {},
            globalThreshold: parseInt(globalThreshold, 10)
        });

        tracksFeature.bindTrackSelection(els.trackList, function (idx, checked) {
            if (!state.tracks[idx]) return;
            state.tracks[idx].selected = checked;
            if (state.cutPreview && typeof options.renderCutPreview === 'function') {
                options.renderCutPreview();
            }
        });
    }

    function analyzeTracks(options) {
        options = options || {};
        options.analysisRunFeature.runAnalysisFlow({
            state: options.state,
            analysisFeature: options.analysisFeature,
            panelContracts: options.panelContracts,
            analyzerAdapter: options.analyzerAdapter,
            windowObj: options.windowObj,
            els: options.els,
            getParams: options.getParams,
            validateAnalyzeResultPayload: options.validateAnalyzeResultPayload,
            buildCutPreviewState: options.buildCutPreviewState,
            renderTracks: options.renderTracks,
            renderCutPreview: options.renderCutPreview,
            hideProgress: options.hideProgress,
            setButtonsDisabled: options.setButtonsDisabled,
            hideCutPreview: options.hideCutPreview,
            setStatus: options.setStatus,
            setProgress: options.setProgress,
            stopCurrentPreviewAudio: options.stopCurrentPreviewAudio
        });
    }

    function applyEdits(options) {
        options = options || {};
        options.applyEditsRunnerFeature.runApplyEditsFlow({
            state: options.state,
            applyEditsFeature: options.applyEditsFeature,
            buildApplyCutsPayload: options.buildApplyCutsPayload,
            hostAdapter: options.hostAdapter,
            ticksPerSecond: options.ticksPerSecond,
            setStatus: options.setStatus,
            setProgress: options.setProgress,
            setButtonsDisabled: options.setButtonsDisabled,
            stopCurrentPreviewAudio: options.stopCurrentPreviewAudio,
            hideProgress: options.hideProgress,
            runMockCutting: function (done) {
                runMockCutting({
                    setProgress: options.setProgress,
                    done: done
                });
            }
        });
    }

    function resetUI(options) {
        options = options || {};
        var state = options.state || {};
        var els = options.els || {};

        state.analysisResult = null;
        state.cutPreview = null;
        state.activeSnippetId = null;
        state.cutPreviewZoom = 0;
        state.cutPreviewPixelsPerSec = 0;
        state.cutPreviewViewStartSec = 0;
        state.navigatorDrag = null;
        state.reviewState = null;

        if (typeof options.stopCurrentPreviewAudio === 'function') {
            options.stopCurrentPreviewAudio();
        }
        if (typeof options.hideProgress === 'function') {
            options.hideProgress();
        }
        if (typeof options.hideCutPreview === 'function') {
            options.hideCutPreview();
        }
        if (typeof options.resetReviewState === 'function') {
            options.resetReviewState();
        }

        if (els.btnReset) els.btnReset.disabled = true;
        if (els.btnAnalyze) els.btnAnalyze.disabled = false;

        if (typeof options.setStatus === 'function') {
            options.setStatus('idle', 'Ready');
        }
    }

    function loadTracksFromHost(options) {
        options = options || {};
        options.tracksLoaderFeature.runLoadTracksFromHost({
            state: options.state,
            hostAdapter: options.hostAdapter,
            tracksFeature: options.tracksFeature,
            ticksPerSecond: options.ticksPerSecond,
            setStatus: options.setStatus,
            renderTracks: options.renderTracks,
            buildCutPreviewState: options.buildCutPreviewState,
            getCutPreviewItemById: options.getCutPreviewItemById,
            renderCutPreview: options.renderCutPreview
        });
    }

    root.AutoCastPanelFlowRuntimeFeature = {
        runMockCutting: runMockCutting,
        renderTracks: renderTracks,
        analyzeTracks: analyzeTracks,
        applyEdits: applyEdits,
        resetUI: resetUI,
        loadTracksFromHost: loadTracksFromHost
    };
})(this);
