'use strict';

var vmHelpers = require('../../../shared/tests/panel_test_vm_utils');

describe('Panel Interaction Feature - Navigator Drag', function () {
    it('should update drag state via navigator mouse events', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/cut-preview/services/cut_preview_interaction_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInteractionFeature;

        var navigatorEl = vmHelpers.makeEventTarget();
        navigatorEl.querySelector = function (selector) {
            if (selector === '.cp-nav-track') return { clientWidth: 100 };
            return null;
        };
        var documentObj = vmHelpers.makeEventTarget();
        var windowObj = vmHelpers.makeEventTarget();
        var state = {
            cutPreview: { items: [{ id: 'a' }] },
            panelPageMode: 'review',
            navigatorDrag: null,
            cutPreviewPixelsPerSec: 10,
            cutPreviewZoom: 0,
            cutPreviewViewStartSec: 0
        };

        feature.bindCutPreviewControls({
            state: state,
            els: { cutPreviewNavigator: navigatorEl },
            findDataElement: function (_target, attr) {
                if (attr !== 'data-nav-drag') return null;
                return {
                    getAttribute: function () { return 'move'; }
                };
            },
            getCutPreviewItemById: function () { return null; },
            setCutPreviewItemSelected: function () { },
            setActiveSnippet: function () { },
            toggleSnippetPreview: function () { },
            renderCutPreview: function () { },
            setTrackPreviewGain: function () { },
            updateCurrentPreviewGain: function () { },
            getZoomModel: function () {
                return {
                    trackWidth: 1000,
                    fitPixelsPerSec: 5,
                    maxPixelsPerSec: 250,
                    totalDurationSec: 100
                };
            },
            ensureCutPreviewViewport: function () {
                return {
                    viewStartSec: 0,
                    viewEndSec: 10,
                    totalDurationSec: 100,
                    visibleDurationSec: 10,
                    pixelsPerSec: 10
                };
            },
            sliderToPixelsPerSec: function () { return 0; },
            pixelsPerSecToSlider: function () { return 42; },
            documentObj: documentObj,
            windowObj: windowObj
        });

        navigatorEl.listeners.mousedown({ target: {}, clientX: 10, preventDefault: function () { } });
        assert(!!state.navigatorDrag, 'Expected drag state after mousedown');

        documentObj.listeners.mousemove({ clientX: 20, preventDefault: function () { } });
        assert(state.cutPreviewViewStartSec > 0, 'Expected moved viewport start');

        documentObj.listeners.mouseup();
        assert(state.navigatorDrag === null, 'Expected drag state to end on mouseup');
    });
});
