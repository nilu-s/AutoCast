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

describe('Cut Preview Viewport Feature', function () {
    it('should sort visible items by timeline', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_viewport_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelCutPreviewViewportFeature;

        var state = {
            cutPreview: {
                items: [
                    { id: 'b', start: 4, end: 5, trackIndex: 1 },
                    { id: 'a', start: 1, end: 2, trackIndex: 0 }
                ]
            }
        };
        var out = feature.getVisibleCutPreviewItems(state);
        assert(out[0].id === 'a', 'Expected sorted first item');
        assert(out[1].id === 'b', 'Expected sorted second item');
    });

    it('should compute viewport bounds with fit zoom', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_viewport_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelCutPreviewViewportFeature;

        var state = {
            analysisResult: { totalDurationSec: 12 },
            cutPreview: { items: [{ start: 0, end: 12, trackIndex: 0 }] },
            cutPreviewPixelsPerSec: 0,
            cutPreviewZoom: 123,
            cutPreviewViewStartSec: 9
        };
        var zoomModel = feature.getZoomModel(state, { clientWidth: 970 });
        var viewport = feature.ensureCutPreviewViewport(state, true, zoomModel);

        assert(zoomModel.trackWidth === 800, 'Expected adjusted timeline width');
        assert(viewport.viewStartSec === 0, 'Expected reset start at fit mode');
        assert(viewport.visibleDurationSec > 0, 'Expected positive visible duration');
    });
});
