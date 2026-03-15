'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

function loadScript(relPath, sandbox) {
    var abs = path.join(process.cwd(), relPath);
    var src = fs.readFileSync(abs, 'utf8');
    vm.runInNewContext(src, sandbox, { filename: abs });
}

describe('Cut Preview State Feature - Normalization', function () {
    it('should normalize unknown decision states to review', function () {
        var sandbox = {
            console: {
                log: function () { },
                warn: function () { },
                error: function () { }
            }
        };
        loadScript('apps/panel/src/features/cut-preview/services/cut_preview_state_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelCutPreviewFeature;
        var state = feature.buildCutPreviewState({
            totalDurationSec: 1.0,
            cutPreview: {
                items: [{
                    id: 'x1',
                    trackIndex: 0,
                    start: 0,
                    end: 0.5,
                    decisionState: 'unknown_policy'
                }],
                lanes: []
            }
        }, {
            trackCount: 1,
            tracks: [{ name: 'Host' }]
        });

        assert(state.items.length === 1, 'Expected one normalized item');
        assert(state.items[0].decisionState === 'review', 'Unknown decisionState should normalize to review');
        assert(state.items[0].stateModel && state.items[0].stateModel.decisionState === 'review', 'Expected stateModel decision state');
    });
});
