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

describe('Cut Preview Source Mapper Feature', function () {
    it('should convert ticks to seconds with fallback rate', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_source_mapper_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelCutPreviewSourceMapperFeature;
        var sec = feature.ticksToSec(508032000000, 254016000000, {});
        assertApprox(sec, 2, 0.0001, 'Expected 2 seconds');
    });

    it('should hydrate media mapping and preview parts from clips', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_source_mapper_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelCutPreviewSourceMapperFeature;
        var item = {
            trackIndex: 0,
            start: 12,
            end: 15,
            sourceStartSec: 12,
            sourceEndSec: 15,
            previewParts: []
        };
        var tracks = [{
            ticksPerSecond: 254016000000,
            clips: [{
                clipIndex: 2,
                mediaPath: 'C:/audio/host.wav',
                startTicks: 10 * 254016000000,
                endTicks: 20 * 254016000000,
                inPointTicks: 30 * 254016000000
            }]
        }];

        var out = feature.hydrateItemSourceMapping(item, {
            tracks: tracks,
            ticksPerSecondDefault: 254016000000
        });

        assert(out.mediaPath === 'C:/audio/host.wav', 'Expected mapped media path');
        assert(out.sourceClipIndex === 2, 'Expected mapped clip index');
        assert(out.previewParts.length === 1, 'Expected one preview part');
        assertApprox(out.sourceStartSec, 32, 0.0001, 'Expected mapped source start');
        assertApprox(out.sourceEndSec, 35, 0.0001, 'Expected mapped source end');
    });
});
