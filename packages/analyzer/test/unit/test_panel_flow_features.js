'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

function loadScript(relPath, sandbox) {
    var abs = path.join(__dirname, '..', '..', '..', '..', relPath);
    var src = fs.readFileSync(abs, 'utf8');
    vm.runInNewContext(src, sandbox, { filename: abs });
}

function makeSandbox() {
    return {
        console: {
            log: function () { },
            warn: function () { },
            error: function () { }
        },
        Promise: Promise,
        JSON: JSON
    };
}

function resolvedThenable(value) {
    return {
        then: function (onFulfilled) {
            if (onFulfilled) onFulfilled(value);
            return {
                catch: function () { return this; }
            };
        },
        catch: function () { return this; }
    };
}

describe('Panel Flow Features', function () {
    it('analysis run feature should execute quick scan + analyze flow', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/analysis/services/analysis_run_feature.js', sandbox);

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
                    return resolvedThenable({ tracks: [{ gainAdjustDb: 0 }] });
                },
                analyze: function () {
                    return resolvedThenable({ tracks: [], segments: [], alignment: {}, waveform: {} });
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

    it('tracks loader feature should populate normalized tracks', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/tracks/services/tracks_feature.js', sandbox);
        loadScript('apps/panel/src/features/tracks/services/tracks_loader_feature.js', sandbox);

        var loader = sandbox.AutoCastPanelTracksLoaderFeature;
        var tracksFeature = sandbox.AutoCastPanelTracksFeature;
        var state = {
            tracks: [],
            analysisResult: null,
            activeSnippetId: null,
            cutPreview: null
        };
        var finalStatus = '';

        loader.runLoadTracksFromHost({
            state: state,
            hostAdapter: {
                getTrackInfo: function (cb) {
                    cb({
                        tracks: [
                            { name: 'Track A', clips: [] }
                        ]
                    });
                }
            },
            tracksFeature: tracksFeature,
            ticksPerSecond: 254016000000,
            setStatus: function (_type, text) { finalStatus = text; },
            renderTracks: function () { },
            buildCutPreviewState: function () { return null; },
            getCutPreviewItemById: function () { return null; },
            renderCutPreview: function () { }
        });

        assert(state.tracks.length === 1, 'Expected one loaded track');
        assert(finalStatus === '1 track(s) loaded', 'Expected loaded status');
    });

    it('apply edits runner should use mock cutting in mock mode', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/apply-edits/services/apply_edits_feature.js', sandbox);
        loadScript('apps/panel/src/features/apply-edits/services/apply_edits_runner_feature.js', sandbox);

        var runner = sandbox.AutoCastPanelApplyEditsRunnerFeature;
        var feature = sandbox.AutoCastPanelApplyEditsFeature;
        var mockCutCalled = 0;
        var statusType = '';

        runner.runApplyEditsFlow({
            state: { analysisResult: { ok: true } },
            applyEditsFeature: feature,
            buildApplyCutsPayload: function () {
                return { trackIndices: [0], segments: [], fillSegments: [] };
            },
            hostAdapter: {
                isInMockMode: function () { return true; }
            },
            ticksPerSecond: 254016000000,
            setStatus: function (type) { statusType = type; },
            setProgress: function () { },
            setButtonsDisabled: function () { },
            stopCurrentPreviewAudio: function () { },
            hideProgress: function () { },
            runMockCutting: function (done) {
                mockCutCalled++;
                done();
            }
        });

        assert(mockCutCalled === 1, 'Expected mock cutting to run');
        assert(statusType === 'success', 'Expected success status after mock cutting');
    });
});
