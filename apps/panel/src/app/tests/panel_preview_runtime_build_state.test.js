'use strict';

var vmHelpers = require('../../shared/tests/panel_test_vm_utils');

describe('Panel Preview Runtime Feature - Build State', function () {
    it('should build cut preview state using injected feature modules', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/app/panel_preview_runtime_feature.js', sandbox);

        var capturedTrackCount = -1;
        var feature = sandbox.AutoCastPanelPreviewRuntimeFeature;
        var state = {
            tracks: [{ index: 0, name: 'Host', selected: true }],
            previewTrackGain: {},
            previewMasterGain: 1
        };

        var runtime = feature.create({
            state: state,
            els: {},
            parseNum: function (v, fallback) { return isFinite(v) ? v : fallback; },
            clamp: function (v, min, max) { return Math.max(min, Math.min(max, v)); },
            round: function (v) { return v; },
            formatSigned: function (v) { return String(v); },
            formatClock: function (v) { return String(v); },
            formatDurationMs: function (v) { return String(v); },
            formatSummaryDuration: function (v) { return String(v); },
            escapeHtml: function (v) { return String(v); },
            trackColors: ['#fff'],
            cutPreviewFeature: {
                buildCutPreviewState: function (_result, options) {
                    capturedTrackCount = options.trackCount;
                    assert(options.getTrackDisplayName(0) === 'Host', 'Expected track name resolver');
                    return { items: [] };
                }
            },
            cutPreviewSourceMapperFeature: { hydrateItemSourceMapping: function (item) { return item; } },
            cutPreviewViewportFeature: {
                getVisibleCutPreviewItems: function () { return []; },
                getTotalCutPreviewDurationSec: function () { return 0; },
                getZoomModel: function () { return {}; },
                sliderToPixelsPerSec: function () { return 0; },
                pixelsPerSecToSlider: function () { return 0; },
                ensureCutPreviewViewport: function () { return {}; },
                getTimelineTickStep: function () { return 1; }
            },
            cutPreviewRuntimeFeature: {
                setActiveSnippet: function () { },
                cancelPendingCutPreviewRender: function () { },
                requestCutPreviewRender: function () { },
                renderCutPreviewNow: function () { return true; },
                getCutPreviewItemById: function () { return null; },
                setCutPreviewItemSelected: function () { }
            },
            cutPreviewRenderFeature: { isUninterestingSnippet: function () { return false; } },
            cutPreviewInteractionFeature: { bindCutPreviewControls: function () { } },
            audioPreviewFeature: { buildPreviewPlaybackPlan: function () { return { parts: [] }; } },
            audioPreviewPlayerFeature: {
                resolveMediaPathToAudioUrl: function () { return ''; },
                stopCurrentPreviewAudio: function () { return true; },
                updateCurrentPreviewGain: function () { return true; },
                createPreviewGainController: function () { return {}; },
                toggleSnippetPreview: function () { return true; }
            }
        });

        var built = runtime.buildCutPreviewState({ segments: [] });
        assert(!!built, 'Expected cut preview state');
        assert(capturedTrackCount === 1, 'Expected track count from state');
    });
});
