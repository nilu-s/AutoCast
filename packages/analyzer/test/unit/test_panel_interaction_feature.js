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
        }
    };
}

function makeEventTarget() {
    return {
        listeners: {},
        addEventListener: function (name, fn) {
            this.listeners[name] = fn;
        },
        querySelector: function () { return null; }
    };
}

describe('Panel Interaction Feature', function () {
    it('should bind and trigger primary action buttons', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_interaction_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInteractionFeature;

        var els = {
            btnLoadTracks: makeEventTarget(),
            btnAnalyze: makeEventTarget(),
            btnApply: makeEventTarget(),
            cutPreviewApplyBtn: makeEventTarget(),
            cutPreviewBackBtn: makeEventTarget(),
            btnReset: makeEventTarget()
        };

        var calls = {
            load: 0,
            analyze: 0,
            apply: 0,
            cancel: 0,
            page: '',
            status: '',
            reset: 0
        };

        feature.bindPrimaryActions({
            els: els,
            loadTracksFromHost: function () { calls.load++; },
            analyzeTracks: function () { calls.analyze++; },
            applyEdits: function () { calls.apply++; },
            cancelPendingCutPreviewRender: function () { calls.cancel++; },
            setPanelPageMode: function (mode) { calls.page = mode; },
            setStatus: function (_type, text) { calls.status = text; },
            resetUI: function () { calls.reset++; }
        });

        els.btnLoadTracks.listeners.click();
        els.btnAnalyze.listeners.click();
        els.btnApply.listeners.click();
        els.cutPreviewApplyBtn.listeners.click();
        els.cutPreviewBackBtn.listeners.click();
        els.btnReset.listeners.click();

        assert(calls.load === 1, 'Expected load handler once');
        assert(calls.analyze === 1, 'Expected analyze handler once');
        assert(calls.apply === 2, 'Expected apply handler from two buttons');
        assert(calls.cancel === 1, 'Expected review cancel once');
        assert(calls.page === 'setup', 'Expected setup page mode on back');
        assert(calls.status === 'Review closed', 'Expected review closed status');
        assert(calls.reset === 1, 'Expected reset handler once');
    });

    it('should toggle snippet selection from cut preview click', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_interaction_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInteractionFeature;

        var section = makeEventTarget();
        section.querySelector = function () { return null; };
        var documentObj = makeEventTarget();
        var windowObj = makeEventTarget();
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

    it('should update drag state via navigator mouse events', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_interaction_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInteractionFeature;

        var navigatorEl = makeEventTarget();
        navigatorEl.querySelector = function (selector) {
            if (selector === '.cp-nav-track') return { clientWidth: 100 };
            return null;
        };
        var documentObj = makeEventTarget();
        var windowObj = makeEventTarget();
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
