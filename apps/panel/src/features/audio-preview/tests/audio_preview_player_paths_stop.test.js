'use strict';

var vmHelpers = require('../../../shared/tests/panel_test_vm_utils');

describe('Audio Preview Player Feature - Paths and Stop', function () {
    it('should resolve absolute windows paths to file urls', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/audio-preview/services/audio_preview_player_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelAudioPreviewPlayerFeature;

        var url = feature.resolveMediaPathToAudioUrl('C:\\tmp\\clip.wav', {});
        assert(url === 'file:///C:/tmp/clip.wav', 'Expected windows file url');
    });

    it('should stop current preview audio and clear runtime state', function () {
        var sandbox = vmHelpers.makeSandbox();
        vmHelpers.loadScript('apps/panel/src/features/audio-preview/services/audio_preview_player_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelAudioPreviewPlayerFeature;

        var disconnected = 0;
        var paused = 0;
        var rendered = 0;
        var state = {
            currentAudio: {
                disconnect: function () { disconnected++; },
                audio: {
                    pause: function () { paused++; }
                }
            },
            currentPlayingPreviewId: 'a',
            currentPreviewInfo: { ok: true }
        };

        feature.stopCurrentPreviewAudio({
            state: state,
            skipRender: false,
            renderCutPreview: function () { rendered++; }
        });

        assert(disconnected === 1, 'Expected disconnect call');
        assert(paused === 1, 'Expected pause call');
        assert(rendered === 1, 'Expected render call');
        assert(state.currentAudio === null, 'Expected currentAudio reset');
        assert(state.currentPlayingPreviewId === null, 'Expected playing id reset');
        assert(state.currentPreviewInfo === null, 'Expected preview info reset');
    });
});
