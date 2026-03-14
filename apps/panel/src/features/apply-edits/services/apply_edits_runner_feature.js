'use strict';

(function (root) {
    function runApplyEditsFlow(options) {
        options = options || {};

        var state = options.state || {};
        var applyEditsFeature = options.applyEditsFeature || null;
        var buildApplyCutsPayload = options.buildApplyCutsPayload || function () { return null; };
        var hostAdapter = options.hostAdapter || null;
        var ticksPerSecond = options.ticksPerSecond;

        var setStatus = options.setStatus || function () { };
        var setProgress = options.setProgress || function () { };
        var setButtonsDisabled = options.setButtonsDisabled || function () { };
        var stopCurrentPreviewAudio = options.stopCurrentPreviewAudio || function () { };
        var hideProgress = options.hideProgress || function () { };
        var runMockCutting = options.runMockCutting || function (done) { if (done) done(); };

        if (!applyEditsFeature) {
            setStatus('error', 'Apply-edits feature unavailable');
            return;
        }
        if (!state.analysisResult) {
            setStatus('error', 'No analysis result available');
            return;
        }

        var applyPayload = buildApplyCutsPayload();
        if (!applyPayload) {
            setStatus('error', 'Apply payload unavailable (helper missing).');
            return;
        }
        if (!applyPayload.trackIndices || applyPayload.trackIndices.length === 0) {
            setStatus('error', 'No tracks selected for apply.');
            return;
        }

        setStatus('analyzing', 'Cutting clips...');
        setProgress(0, 'Preparing cuts...');
        setButtonsDisabled(true);
        stopCurrentPreviewAudio();

        if (hostAdapter && typeof hostAdapter.isInMockMode === 'function' && hostAdapter.isInMockMode()) {
            runMockCutting(function () {
                hideProgress();
                setButtonsDisabled(false);
                setStatus('success', 'Mock cutting complete');
            });
            return;
        }

        var cutProgressHandler = function (evt) {
            var progress = applyEditsFeature.parseCutProgressEvent(evt);
            if (!progress) return;
            setProgress(progress.percent, progress.message);
        };

        if (hostAdapter && typeof hostAdapter.addCutProgressListener === 'function') {
            hostAdapter.addCutProgressListener(cutProgressHandler);
        }

        var bridgePayload = applyEditsFeature.buildBridgeApplyPayload(applyPayload, ticksPerSecond);

        if (!hostAdapter || typeof hostAdapter.applyCuts !== 'function') {
            hideProgress();
            setButtonsDisabled(false);
            setStatus('error', 'Host adapter unavailable');
            return;
        }

        hostAdapter.applyCuts(bridgePayload, function (result) {
            if (hostAdapter && typeof hostAdapter.removeCutProgressListener === 'function') {
                hostAdapter.removeCutProgressListener(cutProgressHandler);
            }
            hideProgress();
            setButtonsDisabled(false);
            if (root.console && typeof root.console.log === 'function') {
                root.console.log('[AutoCast] Raw result from ExtendScript:', result);
            }

            if (result && result.success) {
                var successText = applyEditsFeature.buildSuccessStatusText(result);
                setStatus('success', successText);
            } else {
                var errMsg = applyEditsFeature.extractErrorMessage(result);
                setStatus('error', errMsg);
                if (result && result.errors && result.errors.length && root.console && typeof root.console.error === 'function') {
                    root.console.error('[AutoCast] Cut errors:', result.errors);
                }
            }

            if (result && result.debug && result.debug.length && root.console && typeof root.console.log === 'function') {
                root.console.log('[AutoCast] Cut debug (' + result.debug.length + ' entries):');
                for (var d = 0; d < result.debug.length; d++) {
                    root.console.log('  ' + result.debug[d]);
                }
            }
        });
    }

    root.AutoCastPanelApplyEditsRunnerFeature = {
        runApplyEditsFlow: runApplyEditsFlow
    };
})(this);
