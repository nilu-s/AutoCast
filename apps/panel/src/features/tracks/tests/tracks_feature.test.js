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

describe('Tracks Feature', function () {
    it('should normalize host tracks and derive path from first clip media path', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/tracks/services/tracks_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelTracksFeature;
        var normalized = feature.normalizeLoadedTracks({
            ticksPerSecond: 254016000000,
            tracks: [
                {
                    name: 'Host',
                    clips: [
                        { mediaPath: '' },
                        { mediaPath: 'C:/audio/host.wav' }
                    ]
                }
            ]
        });

        assert(Array.isArray(normalized) && normalized.length === 1, 'Expected one normalized track');
        assert(normalized[0].path === 'C:/audio/host.wav', 'Expected media path derived from clips');
        assert(normalized[0].ticksPerSecond === 254016000000, 'Expected ticksPerSecond passthrough');
    });
});
