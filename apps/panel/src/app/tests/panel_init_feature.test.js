'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

function loadScript(relPath, sandbox) {
    var abs = path.join(process.cwd(), relPath);
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

describe('Panel Init Feature', function () {
    it('should initialize UI state, bind actions and schedule startup tasks', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/app/panel_init_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInitFeature;

        var timers = [];
        var windowObj = {
            screen: { availWidth: 2000, availHeight: 1200 },
            setTimeout: function (fn, delay) {
                timers.push({ fn: fn, delay: delay });
            }
        };

        var calls = {
            bindPrimary: 0,
            bindControls: 0,
            mode: 0,
            hideProgress: 0,
            hidePreview: 0,
            renderTracks: 0,
            status: '',
            resize: 0,
            loadTracks: 0
        };

        var els = {
            btnApply: { disabled: false },
            cutPreviewApplyBtn: { disabled: false },
            btnReset: { disabled: false }
        };

        feature.initializePanel({
            interactionFeature: {
                bindPrimaryActions: function () { calls.bindPrimary++; }
            },
            bindPrimaryActionsOptions: {},
            bindCutPreviewControls: function () { calls.bindControls++; },
            updateModeIndicator: function () { calls.mode++; },
            hideProgress: function () { calls.hideProgress++; },
            hideCutPreview: function () { calls.hidePreview++; },
            renderTracks: function () { calls.renderTracks++; },
            setStatus: function (_type, text) { calls.status = text; },
            loadTracksFromHost: function () { calls.loadTracks++; },
            els: els,
            hostAdapter: {
                isInMockMode: function () { return false; },
                resizePanel: function () { calls.resize++; }
            },
            parseNum: function (v, fallback) {
                var n = parseFloat(v);
                return isFinite(n) ? n : fallback;
            },
            clamp: function (v, min, max) {
                return Math.max(min, Math.min(max, v));
            },
            windowObj: windowObj,
            consoleObj: sandbox.console
        });

        assert(calls.bindPrimary === 1, 'Expected primary actions binding');
        assert(calls.bindControls === 1, 'Expected cut preview controls binding');
        assert(calls.mode === 1, 'Expected mode indicator update');
        assert(calls.hideProgress === 1, 'Expected hideProgress call');
        assert(calls.hidePreview === 1, 'Expected hideCutPreview call');
        assert(calls.renderTracks === 1, 'Expected renderTracks call');
        assert(calls.status === 'Ready', 'Expected ready status');
        assert(els.btnApply.disabled === true, 'Expected apply button disabled');
        assert(els.cutPreviewApplyBtn.disabled === true, 'Expected cut preview apply button disabled');
        assert(els.btnReset.disabled === true, 'Expected reset button disabled');

        assert(timers.length === 4, 'Expected 4 startup timers');
        timers.sort(function (a, b) { return a.delay - b.delay; });
        assert(timers[0].delay === 80, 'Expected first resize timer');
        assert(timers[1].delay === 500, 'Expected load tracks timer');
        assert(timers[2].delay === 700, 'Expected second resize timer');
        assert(timers[3].delay === 1800, 'Expected third resize timer');

        for (var i = 0; i < timers.length; i++) {
            timers[i].fn();
        }
        assert(calls.resize === 3, 'Expected three resize attempts');
        assert(calls.loadTracks === 1, 'Expected one loadTracks call');
    });

    it('should skip startup resize in mock mode', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/app/panel_init_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelInitFeature;

        var resizeCalls = 0;
        feature.requestLargeStartupPanel({
            hostAdapter: {
                isInMockMode: function () { return true; },
                resizePanel: function () { resizeCalls++; }
            },
            windowObj: {
                screen: { availWidth: 1800, availHeight: 1000 }
            }
        });

        assert(resizeCalls === 0, 'Expected no resize in mock mode');
    });
});
