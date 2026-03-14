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

describe('Audio Preview Player Feature', function () {
    it('should resolve absolute windows paths to file urls', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/audio-preview/services/audio_preview_player_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelAudioPreviewPlayerFeature;

        var url = feature.resolveMediaPathToAudioUrl('C:\\tmp\\clip.wav', {});
        assert(url === 'file:///C:/tmp/clip.wav', 'Expected windows file url');
    });

    it('should stop current preview audio and clear runtime state', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/audio-preview/services/audio_preview_player_feature.js', sandbox);
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

    it('should fallback to HTML audio volume control when AudioContext is unavailable', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/audio-preview/services/audio_preview_player_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelAudioPreviewPlayerFeature;

        var state = {};
        var audio = { volume: 0 };
        var ctrl = feature.createPreviewGainController(audio, 0, {
            state: state,
            getEffectivePreviewGain: function () { return 1.8; },
            windowObj: {}
        });

        assertApprox(audio.volume, 1, 0.0001, 'Expected fallback volume clamped to 1');
        ctrl.setGain(0.4);
        assertApprox(audio.volume, 0.4, 0.0001, 'Expected setGain to adjust fallback volume');
    });

    it('should start snippet preview and update state', function () {
        var sandbox = makeSandbox();
        loadScript('apps/panel/src/features/audio-preview/services/audio_preview_player_feature.js', sandbox);
        var feature = sandbox.AutoCastPanelAudioPreviewPlayerFeature;

        var listeners = {};
        function MockAudio() {
            this.preload = '';
            this.src = '';
            this.duration = 100;
            this.currentTime = 0;
            this.volume = 1;
            this.addEventListener = function (name, fn) {
                listeners[name] = fn;
            };
            this.play = function () {
                return { catch: function () { } };
            };
            this.pause = function () { };
        }

        var state = {
            currentPlayingPreviewId: null,
            currentAudio: null,
            currentPreviewInfo: null
        };
        var stopCalls = [];
        var statusText = '';
        var renderCount = 0;

        feature.toggleSnippetPreview('id1', {
            state: state,
            getCutPreviewItemById: function () {
                return {
                    id: 'id1',
                    trackIndex: 0,
                    start: 5,
                    end: 8,
                    sourceStartSec: 5,
                    sourceEndSec: 8
                };
            },
            buildPreviewPlaybackPlan: function () {
                return {
                    mediaPath: 'C:/audio/host.wav',
                    sourceStartSec: 5,
                    sourceEndSec: 8,
                    approximate: false
                };
            },
            resolveMediaPathToAudioUrl: function () { return 'file:///C:/audio/host.wav'; },
            stopCurrentPreviewAudio: function (skipRender) { stopCalls.push(skipRender); },
            createPreviewGainController: function () {
                return {
                    setGain: function () { },
                    disconnect: function () { }
                };
            },
            renderCutPreview: function () { renderCount++; },
            setStatus: function (_type, text) { statusText = text; },
            parseNum: function (v, fallback) {
                var n = parseFloat(v);
                return isFinite(n) ? n : fallback;
            },
            clamp: function (v, min, max) {
                return Math.max(min, Math.min(max, v));
            },
            audioCtor: MockAudio,
            audioPreviewPrerollSec: 0.2,
            audioPreviewPostrollSec: 0.2
        });

        assert(stopCalls.length === 1 && stopCalls[0] === true, 'Expected pre-stop with skipRender=true');
        assert(state.currentPlayingPreviewId === 'id1', 'Expected current playing id');
        assert(!!state.currentAudio, 'Expected current audio handle');
        assert(renderCount === 1, 'Expected render once on start');
        assert(statusText === 'Previewing snippet...', 'Expected start preview status');
        assert(typeof listeners.loadedmetadata === 'function', 'Expected metadata listener');
    });
});
