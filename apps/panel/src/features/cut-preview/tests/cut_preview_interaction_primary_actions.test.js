'use strict';

var vmHelpers = require('../../../shared/tests/panel_test_vm_utils');

describe('Panel Interaction Feature - Primary Actions', function () {
    it('should bind and trigger primary action buttons', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/cut-preview/services/cut_preview_interaction_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInteractionFeature;

        var els = {
            btnLoadTracks: vmHelpers.makeEventTarget(),
            btnAnalyze: vmHelpers.makeEventTarget(),
            btnApply: vmHelpers.makeEventTarget(),
            cutPreviewApplyBtn: vmHelpers.makeEventTarget(),
            btnReset: vmHelpers.makeEventTarget()
        };

        var calls = {
            load: 0,
            analyze: 0,
            apply: 0,
            reset: 0
        };

        feature.bindPrimaryActions({
            els: els,
            loadTracksFromHost: function () { calls.load++; },
            analyzeTracks: function () { calls.analyze++; },
            applyEdits: function () { calls.apply++; },
            resetUI: function () { calls.reset++; }
        });

        els.btnLoadTracks.listeners.click();
        els.btnAnalyze.listeners.click();
        els.btnApply.listeners.click();
        els.cutPreviewApplyBtn.listeners.click();
        els.btnReset.listeners.click();

        assert(calls.load === 1, 'Expected load handler once');
        assert(calls.analyze === 1, 'Expected analyze handler once');
        assert(calls.apply === 2, 'Expected apply handler from two buttons');
        assert(calls.reset === 1, 'Expected reset handler once');
    });
});
