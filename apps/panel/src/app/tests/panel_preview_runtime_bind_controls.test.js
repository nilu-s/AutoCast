'use strict';

var vmHelpers = require('../../shared/tests/panel_test_vm_utils');

describe('Panel Preview Runtime Feature - Bind Controls', function () {
    it('should bind cut preview controls with runtime handlers', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/app/panel_preview_runtime_feature.js', sandbox);

        var boundOptions = null;
        var state = {
            tracks: [{ index: 0, name: 'Host', selected: true }],
            previewTrackGain: {},
            previewMasterGain: 1,
            cutPreview: { items: [] }
        };

        var runtime = sandbox.AutoCastPanelPreviewRuntimeFeature.create({
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
            cutPreviewFeature: { buildCutPreviewState: function () { return {}; } },
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
            cutPreviewInteractionFeature: {
                bindCutPreviewControls: function (options) {
                    boundOptions = options;
                }
            },
            audioPreviewFeature: { buildPreviewPlaybackPlan: function () { return {}; } },
            audioPreviewPlayerFeature: {
                resolveMediaPathToAudioUrl: function () { return ''; },
                stopCurrentPreviewAudio: function () { return true; },
                updateCurrentPreviewGain: function () { return true; },
                createPreviewGainController: function () { return {}; },
                toggleSnippetPreview: function () { return true; }
            }
        });

        runtime.bindCutPreviewControls();
        assert(!!boundOptions, 'Expected interaction feature binding');
        assert(typeof boundOptions.setTrackPreviewGain === 'function', 'Expected track gain handler');
        assert(typeof boundOptions.toggleSnippetPreview === 'function', 'Expected preview toggle handler');
    });
});
