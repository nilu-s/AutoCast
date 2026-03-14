'use strict';

(function (root) {
    function runAnalysisFlow(options) {
        options = options || {};

        var state = options.state || {};
        var analysisFeature = options.analysisFeature;
        var panelContracts = options.panelContracts || null;
        var analyzerAdapter = options.analyzerAdapter || null;
        var windowObj = options.windowObj || root;
        var els = options.els || {};

        var getParams = options.getParams || function () { return {}; };
        var validateAnalyzeResultPayload = options.validateAnalyzeResultPayload || function (v) { return v; };
        var buildCutPreviewState = options.buildCutPreviewState || function () { return null; };
        var renderTracks = options.renderTracks || function () { };
        var renderCutPreview = options.renderCutPreview || function () { };
        var hideProgress = options.hideProgress || function () { };
        var setButtonsDisabled = options.setButtonsDisabled || function () { };
        var hideCutPreview = options.hideCutPreview || function () { };
        var setStatus = options.setStatus || function () { };
        var setProgress = options.setProgress || function () { };
        var stopCurrentPreviewAudio = options.stopCurrentPreviewAudio || function () { };

        if (state.isAnalyzing) return;
        if (!analysisFeature || typeof analysisFeature.collectTrackPaths !== 'function') {
            setStatus('error', 'Analysis feature unavailable');
            return;
        }

        if (!state.tracks || state.tracks.length === 0) {
            setStatus('error', 'No tracks available');
            return;
        }

        var pathInfo = analysisFeature.collectTrackPaths(state.tracks);
        var trackPaths = pathInfo.trackPaths;
        var firstError = pathInfo.firstError;
        var hasValid = !!pathInfo.hasValid;

        if (!hasValid) {
            setStatus('error', 'No valid track paths selected. ' + (firstError || ''));
            return;
        }

        var globalThreshold = parseInt(els.paramThreshold && els.paramThreshold.value, 10);

        function clearCutPreviewState() {
            state.cutPreview = null;
            state.activeSnippetId = null;
            stopCurrentPreviewAudio();
            state.isAnalyzing = false;
            hideProgress();
            setButtonsDisabled(false);
            hideCutPreview();
        }

        function resetCutPreviewViewportState() {
            state.activeSnippetId = null;
            state.cutPreviewPixelsPerSec = 0;
            state.cutPreviewViewStartSec = 0;
            state.cutPreviewZoom = 0;
        }

        function applyAutoSensitivityFromGainScan(scanResult) {
            if (panelContracts && typeof panelContracts.validateQuickGainResult === 'function') {
                var quickValidation = panelContracts.validateQuickGainResult(scanResult);
                if (!quickValidation.ok) {
                    throw new Error(quickValidation.message || 'Invalid quick gain scan payload');
                }
                scanResult = quickValidation.value;
            }

            state.perTrackSensitivity = analysisFeature.buildAutoSensitivityMap({
                scanResult: scanResult,
                trackPaths: trackPaths,
                trackCount: state.tracks.length,
                globalThreshold: globalThreshold
            });
            renderTracks();
        }

        function handleAnalyzeSuccess(result, runId) {
            result = validateAnalyzeResultPayload(result);
            if (runId !== state.analysisRunId) return;
            state.analysisResult = result;
            state.cutPreview = buildCutPreviewState(result);
            resetCutPreviewViewportState();
            stopCurrentPreviewAudio();
            state.isAnalyzing = false;
            hideProgress();
            setButtonsDisabled(false);
            setStatus('success', 'Analysis complete');
            renderCutPreview();
        }

        function handleAnalyzeError(err, runId) {
            if (runId !== state.analysisRunId) return;
            clearCutPreviewState();
            setStatus('error', err && err.message ? err.message : 'Analysis failed');
            if (root.console && typeof root.console.error === 'function') {
                root.console.error(err);
            }
        }

        function startFullAnalysis(runId) {
            var params = getParams();

            if (analyzerAdapter && typeof analyzerAdapter.analyze === 'function') {
                try {
                    analyzerAdapter.analyze(trackPaths, params, function (percent, message) {
                        setProgress(percent, message);
                    }).then(function (result) {
                        try {
                            handleAnalyzeSuccess(result, runId);
                        } catch (validationErr) {
                            handleAnalyzeError(validationErr, runId);
                        }
                    }).catch(function (err) {
                        handleAnalyzeError(err, runId);
                    });
                } catch (e) {
                    handleAnalyzeError(e, runId);
                }
                return;
            }

            if (typeof windowObj.__AUTOCAST_ANALYZE__ === 'function') {
                try {
                    windowObj.__AUTOCAST_ANALYZE__(trackPaths, params, function (percent, message) {
                        setProgress(percent, message);
                    }, function (result) {
                        try {
                            handleAnalyzeSuccess(result, runId);
                        } catch (validationErr2) {
                            handleAnalyzeError(validationErr2, runId);
                        }
                    }, function (err) {
                        handleAnalyzeError(err, runId);
                    });
                } catch (e2) {
                    handleAnalyzeError(e2, runId);
                }
                return;
            }

            clearCutPreviewState();
            var errMsg = windowObj.NODE_INIT_ERROR
                ? 'Node init failed: ' + windowObj.NODE_INIT_ERROR
                : 'No analyzer bridge available';
            setStatus('error', errMsg);
        }

        state.analysisRunId++;
        state.isAnalyzing = true;
        setButtonsDisabled(true);
        hideCutPreview();
        resetCutPreviewViewportState();
        stopCurrentPreviewAudio();
        setProgress(0, 'Measuring loudness...');

        var runId = state.analysisRunId;

        if (analyzerAdapter && typeof analyzerAdapter.quickGainScan === 'function') {
            var gainScanPaths = [];
            for (var gp = 0; gp < trackPaths.length; gp++) {
                if (trackPaths[gp]) gainScanPaths.push(trackPaths[gp]);
            }

            analyzerAdapter.quickGainScan(gainScanPaths, function (percent) {
                setProgress(Math.min(45, Math.max(0, Math.round(percent * 0.45))), 'Measuring loudness...');
            }).then(function (scanResult) {
                applyAutoSensitivityFromGainScan(scanResult);
                setProgress(45, 'Starting speech analysis...');
                startFullAnalysis(runId);
            }).catch(function (scanErr) {
                if (root.console && typeof root.console.warn === 'function') {
                    root.console.warn('[AutoCast] quickGainScan failed, continuing without auto sensitivity:', scanErr);
                }
                setProgress(20, 'Starting speech analysis...');
                startFullAnalysis(runId);
            });
            return;
        }

        setProgress(20, 'Starting speech analysis...');
        startFullAnalysis(runId);
    }

    root.AutoCastPanelAnalysisRunFeature = {
        runAnalysisFlow: runAnalysisFlow
    };
})(this);
