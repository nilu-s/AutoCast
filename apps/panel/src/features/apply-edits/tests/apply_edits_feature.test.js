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

describe('Apply Edits Feature', function () {
    it('should normalize progress payload from bridge event', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/apply-edits/services/apply_edits_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelApplyEditsFeature;
        var parsed = feature.parseCutProgressEvent({
            data: JSON.stringify({ percent: 175, message: 'Cutting...' })
        });

        assert(!!parsed, 'Expected parsed progress payload');
        assert(parsed.percent === 100, 'Expected progress clamped to 100');
        assert(parsed.message === 'Cutting...', 'Expected message passthrough');
    });

    it('should build stable success status text', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/apply-edits/services/apply_edits_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelApplyEditsFeature;
        var text = feature.buildSuccessStatusText({
            clipsTrimmed: 3,
            clipsCreated: 5,
            clipsRemoved: 3,
            fillMarkersCreated: 2
        });

        assert(text.indexOf('3 trimmed') !== -1, 'Expected trimmed counter');
        assert(text.indexOf('5 created') !== -1, 'Expected created counter');
        assert(text.indexOf('2 fill markers') !== -1, 'Expected fill marker counter');
    });
});
