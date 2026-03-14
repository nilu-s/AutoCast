'use strict';

var vmHelpers = require('../../../shared/tests/panel_test_vm_utils');

describe('Panel Interaction Feature - Selection', function () {
    it('should toggle snippet selection from cut preview click', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/cut-preview/services/cut_preview_interaction_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInteractionFeature;

        var section = vmHelpers.makeEventTarget();
        section.querySelector = function () { return null; };
        var documentObj = vmHelpers.makeEventTarget();
        var windowObj = vmHelpers.makeEventTarget();
        var state = {
            cutPreview: { items: [{ id: 'cp1' }] },
            panelPageMode: 'review'
        };
        var selectedArg = null;
        var selectItem = { selected: false };

        feature.bindCutPreviewControls({
            state: state,
            els: { cutPreviewSection: section },
            findDataElement: function (_target, attr) {
                if (attr !== 'data-item-select') return null;
                return {
                    getAttribute: function () { return 'cp1'; }
                };
            },
            getCutPreviewItemById: function () { return selectItem; },
            setCutPreviewItemSelected: function (id, selected) {
                selectedArg = { id: id, selected: selected };
            },
            setActiveSnippet: function () { },
            toggleSnippetPreview: function () { },
            renderCutPreview: function () { },
            setTrackPreviewGain: function () { },
            updateCurrentPreviewGain: function () { },
            getZoomModel: function () { return null; },
            ensureCutPreviewViewport: function () { return null; },
            sliderToPixelsPerSec: function () { return 0; },
            pixelsPerSecToSlider: function () { return 0; },
            documentObj: documentObj,
            windowObj: windowObj
        });

        section.listeners.click({ target: {} });
        assert(selectedArg && selectedArg.id === 'cp1', 'Expected selected item id');
        assert(selectedArg.selected === true, 'Expected toggled selection to true');
    });
});
