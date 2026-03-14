'use strict';

var vmHelpers = require('../../shared/tests/panel_test_vm_utils');

describe('Panel Flow Runtime Feature - Apply Edits', function () {
    it('apply edits runner should use mock cutting in mock mode', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/apply-edits/services/apply_edits_feature.js', sandbox);
        vmHelpers.loadScript('apps/panel/src/features/apply-edits/services/apply_edits_runner_feature.js', sandbox);

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
