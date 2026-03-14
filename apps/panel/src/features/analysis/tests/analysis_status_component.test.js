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

describe('Analysis Status Component', function () {
    it('should clamp and format progress labels', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/analysis/components/analysis_status_component.js', sandbox);

        var component = sandbox.AutoCastPanelAnalysisStatusComponent;
        assert(!!component, 'Expected analysis status component');
        assert(component.formatProgressLabel(25, 'Reading files') === '25% - Reading files', 'Expected label with message');
        assert(component.formatProgressLabel(140, '') === '100%', 'Expected percent clamp at upper bound');
        assert(component.formatProgressLabel(-8, null) === '0%', 'Expected percent clamp at lower bound');
    });
});
