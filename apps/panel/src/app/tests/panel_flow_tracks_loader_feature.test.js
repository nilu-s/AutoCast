'use strict';

var vmHelpers = require('../../shared/tests/panel_test_vm_utils');

describe('Panel Flow Runtime Feature - Track Loading', function () {
    it('tracks loader feature should populate normalized tracks', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/tracks/services/tracks_feature.js', sandbox);
        vmHelpers.loadScript('apps/panel/src/features/tracks/services/tracks_loader_feature.js', sandbox);

        var loader = sandbox.AutoCastPanelTracksLoaderFeature;
        var tracksFeature = sandbox.AutoCastPanelTracksFeature;
        var state = {
            tracks: [],
            analysisResult: null,
            activeSnippetId: null,
            cutPreview: null
        };
        var finalStatus = '';

        loader.runLoadTracksFromHost({
            state: state,
            hostAdapter: {
                getTrackInfo: function (cb) {
                    cb({
                        tracks: [
                            { name: 'Track A', clips: [] }
                        ]
                    });
                }
            },
            tracksFeature: tracksFeature,
            ticksPerSecond: 254016000000,
            setStatus: function (_type, text) { finalStatus = text; },
            renderTracks: function () { },
            buildCutPreviewState: function () { return null; },
            getCutPreviewItemById: function () { return null; },
            renderCutPreview: function () { }
        });

        assert(state.tracks.length === 1, 'Expected one loaded track');
        assert(finalStatus === '1 track(s) loaded', 'Expected loaded status');
    });
});
