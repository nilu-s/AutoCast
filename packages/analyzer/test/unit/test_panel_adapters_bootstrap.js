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

describe('Panel Adapters + Bootstrap', function () {
    it('host adapter should delegate to AutoCastBridge', function () {
        var calls = { init: 0, resize: 0 };
        var sandbox = makeSandbox();
        sandbox.AutoCastBridge = {
            init: function () { calls.init++; return true; },
            ping: function (cb) { if (cb) cb({ ok: true }); },
            getTrackInfo: function (cb) { if (cb) cb({ tracks: [] }); },
            applyCuts: function (_payload, cb) { if (cb) cb({ success: true }); },
            addCutProgressListener: function () { },
            removeCutProgressListener: function () { },
            getCutProgressEventName: function () { return 'evt'; },
            getExtensionPath: function () { return '/ext'; },
            isInMockMode: function () { return false; },
            resizePanel: function () { calls.resize++; return true; }
        };

        loadScript('apps/panel/src/adapters/host/csi_bridge_adapter.js', sandbox);

        var adapter = sandbox.AutoCastHostAdapter;
        assert(!!adapter, 'Expected host adapter');
        assert(adapter.init() === true, 'Expected delegated init');
        assert(calls.init === 1, 'Expected one init call');
        assert(adapter.getExtensionPath() === '/ext', 'Expected delegated extension path');
        assert(adapter.resizePanel(800, 600) === true, 'Expected delegated resize');
        assert(calls.resize === 1, 'Expected one resize call');
    });

    it('analyzer adapter should delegate to AutoCastAnalyzer', function () {
        var sandbox = makeSandbox();
        sandbox.AutoCastAnalyzer = {
            analyze: function () { return 'analyze-ok'; },
            quickGainScan: function () { return 'quick-ok'; }
        };

        loadScript('apps/panel/src/adapters/analyzer/analyzer_client_adapter.js', sandbox);

        var adapter = sandbox.AutoCastAnalyzerAdapter;
        assert(!!adapter, 'Expected analyzer adapter');
        assert(adapter.analyze([], {}, null) === 'analyze-ok', 'Expected delegated analyze');
        assert(adapter.quickGainScan([], null) === 'quick-ok', 'Expected delegated quick gain');
    });

    it('bootstrap should initialize controller runtime and analyzer client', function () {
        var sandbox = makeSandbox();
        var createCalled = 0;

        sandbox.AutoCastHostAdapter = {
            init: function () { return true; },
            getExtensionPath: function () { return '/ext'; },
            isInMockMode: function () { return false; },
            ping: function () { },
            getTrackInfo: function () { },
            applyCuts: function () { },
            addCutProgressListener: function () { },
            removeCutProgressListener: function () { },
            resizePanel: function () { return true; }
        };

        sandbox.AutoCastAnalyzerClient = {
            create: function (opts) {
                createCalled++;
                assert(opts && typeof opts.getExtensionPath === 'function', 'Expected getExtensionPath callback');
                assert(opts.getExtensionPath() === '/ext', 'Expected extension path from host adapter');
                return {
                    analyze: function () { return 'ok'; },
                    quickGainScan: function () { return 'ok'; }
                };
            }
        };

        loadScript('apps/panel/src/adapters/analyzer/analyzer_client_adapter.js', sandbox);
        loadScript('apps/panel/src/app/panel_controller.js', sandbox);
        loadScript('apps/panel/src/app/panel_bootstrap.js', sandbox);

        var boot = sandbox.AutoCastPanelBootstrap.bootstrap();
        assert(!!boot, 'Expected bootstrap result');
        assert(!!boot.runtime, 'Expected runtime context');
        assert(boot.runtime.hostReady === true, 'Expected host init to succeed');
        assert(createCalled === 1, 'Expected analyzer client to be created once');
        assert(boot.runtime.analyzerAdapter.analyze([], {}, null) === 'ok', 'Expected runtime analyzer adapter');
    });
});
