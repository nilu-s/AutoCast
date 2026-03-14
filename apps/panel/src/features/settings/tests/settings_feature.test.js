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
        },
        JSON: JSON
    };
}

describe('Panel Settings Feature', function () {
    it('should merge persisted settings with defaults', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/settings/services/settings_feature.js', sandbox);

        var featureFactory = sandbox.AutoCastPanelSettingsFeature;
        assert(!!featureFactory && typeof featureFactory.create === 'function', 'Expected settings feature factory');

        var storage = {
            getItem: function () { return JSON.stringify({ threshold: 3 }); },
            setItem: function () { }
        };

        var feature = featureFactory.create(storage);
        var loaded = feature.loadSettings({ threshold: 0, minPeakDb: -52 });

        assert(loaded.threshold === 3, 'Expected persisted threshold override');
        assert(loaded.minPeakDb === -52, 'Expected default minPeak to stay intact');
    });

    it('should save settings via adapter', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/settings/services/settings_feature.js', sandbox);

        var captured = null;
        var feature = sandbox.AutoCastPanelSettingsFeature.create({
            getItem: function () { return null; },
            setItem: function (_key, value) { captured = value; }
        });

        var saved = feature.saveSettings({ threshold: -2, minPeakDb: -49 });
        assert(saved === true, 'Expected saveSettings to return true');
        assert(!!captured, 'Expected serialized payload');
        assert(captured.indexOf('"threshold":-2') !== -1, 'Expected threshold in persisted payload');
    });
});
