'use strict';

var vmHelpers = require('../../shared/tests/panel_test_vm_utils');

describe('Panel Flow Runtime Feature - Analysis Flow', function () {
    it('analysis run feature should execute quick scan + analyze flow', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/analysis/services/analysis_run_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelAnalysisRunFeature;
        var state = {
            tracks: [{ path: 'A.wav', selected: true }],
            perTrackSensitivity: {},
            analysisResult: null,
            cutPreview: null,
            isAnalyzing: false,
            analysisRunId: 0,
            activeSnippetId: null,
            cutPreviewPixelsPerSec: 1,
            cutPreviewViewStartSec: 1,
            cutPreviewZoom: 1
        };
        var statusType = '';
        var statusText = '';

        feature.runAnalysisFlow({
            state: state,
            analysisFeature: {
                collectTrackPaths: function () {
                    return { trackPaths: ['A.wav'], firstError: '', hasValid: true };
                },
                buildAutoSensitivityMap: function () {
                    return { 0: 2 };
                }
            },
            panelContracts: null,
            analyzerAdapter: {
                quickGainScan: function () {
                    return vmHelpers.resolvedThenable({ tracks: [{ gainAdjustDb: 0 }] });
                },
                analyze: function () {
                    return vmHelpers.resolvedThenable({ tracks: [], segments: [], alignment: {}, waveform: {} });
                }
            },
            windowObj: {},
            els: { paramThreshold: { value: '0' } },
            getParams: function () { return {}; },
            validateAnalyzeResultPayload: function (v) { return v; },
            buildCutPreviewState: function () { return { items: [] }; },
            renderTracks: function () { },
            renderCutPreview: function () { },
            hideProgress: function () { },
            setButtonsDisabled: function () { },
            hideCutPreview: function () { },
            setStatus: function (type, text) {
                statusType = type;
                statusText = text;
            },
            setProgress: function () { },
            stopCurrentPreviewAudio: function () { }
        });

        assert(state.analysisResult !== null, 'Expected analysis result');
        assert(state.cutPreview !== null, 'Expected cut preview state');
        assert(state.isAnalyzing === false, 'Expected flow to finish');
        assert(statusType === 'success', 'Expected success status');
        assert(statusText === 'Analysis complete', 'Expected analysis complete status text');
        assert(state.perTrackSensitivity[0] === 2, 'Expected auto sensitivity map');
    });
});
