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

describe('Panel Shared Utils', function () {
    it('html util should escape critical characters', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/shared/html_utils.js', sandbox);
        var htmlUtils = sandbox.AutoCastPanelHtmlUtils;

        var out = htmlUtils.escapeHtml('<x id=\"a\">A&B\'</x>');
        assert(out.indexOf('&lt;x') !== -1, 'Expected escaped opening tag');
        assert(out.indexOf('&amp;') !== -1, 'Expected escaped ampersand');
        assert(out.indexOf('&#39;') !== -1, 'Expected escaped apostrophe');
    });

    it('math util should format summary duration for minutes', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/shared/math_format_utils.js', sandbox);
        var mathUtils = sandbox.AutoCastPanelMathFormatUtils;

        assert(mathUtils.formatSummaryDuration(130) === '2m 10s', 'Expected minute formatting');
    });
});
