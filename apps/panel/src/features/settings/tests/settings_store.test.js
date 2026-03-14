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

describe('Settings Store', function () {
    it('should merge persisted settings by defaults schema', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/settings/state/settings_store.js', sandbox);

        var store = sandbox.AutoCastPanelSettingsStore;
        var merged = store.mergeSettings(
            { threshold: '0', minPeak: '-52' },
            { threshold: -3, minPeak: -49, ignored: true }
        );

        assert(merged.threshold === '-3', 'Expected threshold normalized to string');
        assert(merged.minPeak === '-49', 'Expected minPeak normalized to string');
        assert(merged.ignored === undefined, 'Expected unknown keys to be ignored');
    });

    it('should serialize settings to JSON', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/settings/state/settings_store.js', sandbox);

        var store = sandbox.AutoCastPanelSettingsStore;
        var json = store.serializeSettings({ threshold: '1' });
        assert(json === '{"threshold":"1"}', 'Expected stable JSON serialization');
    });
});
