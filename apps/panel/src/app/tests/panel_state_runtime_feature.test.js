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
        Object: Object
    };
}

function createStoreModule() {
    return {
        createState: function (initialState) {
            var state = {};
            for (var key in initialState) {
                if (Object.prototype.hasOwnProperty.call(initialState, key)) {
                    state[key] = initialState[key];
                }
            }
            return {
                getState: function () {
                    return state;
                },
                setState: function (patch) {
                    for (var patchKey in patch) {
                        if (Object.prototype.hasOwnProperty.call(patch, patchKey)) {
                            state[patchKey] = patch[patchKey];
                        }
                    }
                    return state;
                }
            };
        }
    };
}

describe('Panel State Runtime Feature', function () {
    it('should create a proxy state backed by feature stores', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/app/panel_state_runtime_feature.js', sandbox);

        var feature = sandbox.AutoCastPanelStateRuntimeFeature;
        var storeModule = createStoreModule();
        var state = feature.createPanelState({
            requireFeature: function (ref) { return ref; },
            tracksStateStore: storeModule,
            analysisStateStore: storeModule,
            cutPreviewStateStore: storeModule,
            audioPreviewStateStore: storeModule
        });

        assert(Array.isArray(state.tracks), 'Expected default tracks array');
        assert(state.previewMasterGain === 1, 'Expected default preview master gain');

        state.analysisRunId = 4;
        state.cutPreviewZoom = 12;
        state.previewMasterGain = 2;

        assert(state.analysisRunId === 4, 'Expected analysisRunId write-through');
        assert(state.cutPreviewZoom === 12, 'Expected cutPreviewZoom write-through');
        assert(state.previewMasterGain === 2, 'Expected previewMasterGain write-through');
    });

    it('should throw when a required store module is invalid', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/app/panel_state_runtime_feature.js', sandbox);

        assertThrows(function () {
            sandbox.AutoCastPanelStateRuntimeFeature.createPanelState({
                requireFeature: function (ref) { return ref; },
                tracksStateStore: {},
                analysisStateStore: createStoreModule(),
                cutPreviewStateStore: createStoreModule(),
                audioPreviewStateStore: createStoreModule()
            });
        }, 'Expected invalid tracks store module to throw');
    });
});
