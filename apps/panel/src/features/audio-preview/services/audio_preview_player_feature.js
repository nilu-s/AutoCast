'use strict';

(function (root) {
    function defaultParseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function defaultClamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function resolveMediaPathToAudioUrl(mediaPath, options) {
        options = options || {};
        var pathObj = options.pathObj || null;
        var hostAdapter = options.hostAdapter || null;
        var windowObj = options.windowObj || root;
        var consoleObj = options.consoleObj || (windowObj && windowObj.console ? windowObj.console : null);

        if (!mediaPath) return null;
        var text = String(mediaPath);
        if (!text || text.charAt(0) === '[') return null;

        if (/^(https?:|file:|blob:)/i.test(text)) return text;

        var normalized = text.replace(/\\/g, '/');
        var absWin = /^[A-Za-z]:\//.test(normalized);
        var absUnix = normalized.charAt(0) === '/';
        var uncPath = normalized.indexOf('//') === 0;

        function toFileUrl(absPath) {
            var p = String(absPath).replace(/\\/g, '/');
            if (/^[A-Za-z]:\//.test(p)) return 'file:///' + encodeURI(p);
            if (p.indexOf('//') === 0) return 'file:' + encodeURI(p);
            if (p.charAt(0) === '/') return 'file://' + encodeURI(p);
            return null;
        }

        if (absWin || absUnix || uncPath) {
            return toFileUrl(normalized);
        }

        if (pathObj && typeof pathObj.resolve === 'function') {
            try {
                var extensionPath = hostAdapter && typeof hostAdapter.getExtensionPath === 'function'
                    ? hostAdapter.getExtensionPath()
                    : '.';
                if (!extensionPath || extensionPath === '.' || extensionPath.indexOf('/mock/') === 0) {
                    var pathname = decodeURIComponent((windowObj && windowObj.location && windowObj.location.pathname) || '');
                    if (windowObj && windowObj.navigator && windowObj.navigator.platform &&
                        windowObj.navigator.platform.indexOf('Win') > -1 &&
                        pathname.charAt(0) === '/') {
                        pathname = pathname.substring(1);
                    }
                    extensionPath = pathObj.dirname(pathname);
                    if (pathObj.basename(extensionPath) === 'panel' &&
                        pathObj.basename(pathObj.dirname(extensionPath)) === 'apps') {
                        extensionPath = pathObj.resolve(extensionPath, '..', '..');
                    }
                }
                var resolved = pathObj.resolve(extensionPath, text);
                return toFileUrl(resolved);
            } catch (e) {
                if (consoleObj && typeof consoleObj.warn === 'function') {
                    consoleObj.warn('[AutoCast] Failed to resolve media path for preview:', e);
                }
            }
        }

        return text;
    }

    function stopCurrentPreviewAudio(options) {
        options = options || {};
        var state = options.state || {};
        var skipRender = !!options.skipRender;
        var renderCutPreview = typeof options.renderCutPreview === 'function'
            ? options.renderCutPreview
            : function () { };

        if (state.currentAudio && state.currentAudio.disconnect) {
            try {
                state.currentAudio.disconnect();
            } catch (e0) { }
        }
        if (state.currentAudio && state.currentAudio.audio) {
            try {
                state.currentAudio.audio.pause();
            } catch (e1) { }
        }
        state.currentAudio = null;
        state.currentPlayingPreviewId = null;
        state.currentPreviewInfo = null;
        if (!skipRender) renderCutPreview();
    }

    function updateCurrentPreviewGain(options) {
        options = options || {};
        var state = options.state || {};
        var getCutPreviewItemById = options.getCutPreviewItemById;
        var getEffectivePreviewGain = options.getEffectivePreviewGain;
        var clamp = typeof options.clamp === 'function' ? options.clamp : defaultClamp;

        if (!state.currentAudio || !state.currentAudio.itemId) return;
        var item = getCutPreviewItemById(state.currentAudio.itemId);
        if (!item) return;
        var gainValue = getEffectivePreviewGain(item.trackIndex);
        if (state.currentAudio.setGain) {
            state.currentAudio.setGain(gainValue);
        } else if (state.currentAudio.audio) {
            state.currentAudio.audio.volume = clamp(gainValue, 0, 1);
        }
    }

    function createPreviewGainController(audio, trackIndex, options) {
        options = options || {};
        var state = options.state || {};
        var windowObj = options.windowObj || root;
        var getEffectivePreviewGain = options.getEffectivePreviewGain;
        var parseNum = typeof options.parseNum === 'function' ? options.parseNum : defaultParseNum;
        var clamp = typeof options.clamp === 'function' ? options.clamp : defaultClamp;

        var targetGain = getEffectivePreviewGain(trackIndex);
        var out = {
            setGain: null,
            disconnect: null
        };

        try {
            var Ctx = windowObj.AudioContext || windowObj.webkitAudioContext;
            if (!Ctx) throw new Error('AudioContext unavailable');

            if (!state.previewAudioContext) {
                state.previewAudioContext = new Ctx();
            }
            if (state.previewAudioContext.state === 'suspended' &&
                typeof state.previewAudioContext.resume === 'function') {
                state.previewAudioContext.resume();
            }

            var srcNode = state.previewAudioContext.createMediaElementSource(audio);
            var gainNode = state.previewAudioContext.createGain();
            srcNode.connect(gainNode);
            gainNode.connect(state.previewAudioContext.destination);
            gainNode.gain.value = clamp(targetGain, 0, 3);

            out.setGain = function (gainValue) {
                gainNode.gain.value = clamp(parseNum(gainValue, 1), 0, 3);
            };
            out.disconnect = function () {
                try { srcNode.disconnect(); } catch (e1) { }
                try { gainNode.disconnect(); } catch (e2) { }
            };
            return out;
        } catch (err) {
            audio.volume = clamp(targetGain, 0, 1);
            out.setGain = function (gainValue) {
                audio.volume = clamp(parseNum(gainValue, 1), 0, 1);
            };
            out.disconnect = function () { };
            return out;
        }
    }

    function toggleSnippetPreview(itemId, options) {
        options = options || {};
        var state = options.state || {};
        var getCutPreviewItemById = options.getCutPreviewItemById;
        var buildPreviewPlaybackPlan = options.buildPreviewPlaybackPlan;
        var resolveMediaPath = options.resolveMediaPathToAudioUrl;
        var stopPreviewAudio = options.stopCurrentPreviewAudio;
        var createGainController = options.createPreviewGainController;
        var parseNum = typeof options.parseNum === 'function' ? options.parseNum : defaultParseNum;
        var renderCutPreview = options.renderCutPreview || function () { };
        var setStatus = options.setStatus || function () { };
        var audioCtor = options.audioCtor || root.Audio;
        var prerollSec = parseNum(options.audioPreviewPrerollSec, 0.2);
        var postrollSec = parseNum(options.audioPreviewPostrollSec, 0.2);

        var item = getCutPreviewItemById(itemId);
        if (!item) return;

        if (state.currentPlayingPreviewId === itemId) {
            stopPreviewAudio(false);
            setStatus('idle', 'Preview stopped');
            return;
        }

        var playbackPlan = buildPreviewPlaybackPlan(item);
        var mediaUrl = resolveMediaPath(playbackPlan && playbackPlan.mediaPath);
        if (!mediaUrl) {
            setStatus('error', 'Snippet preview unavailable (no playable media path)');
            return;
        }

        stopPreviewAudio(true);

        var snippetStart = parseNum(playbackPlan && playbackPlan.sourceStartSec, parseNum(item.sourceStartSec, item.start));
        var snippetEnd = parseNum(playbackPlan && playbackPlan.sourceEndSec, parseNum(item.sourceEndSec, item.end));
        if (snippetEnd <= snippetStart) snippetEnd = snippetStart + 0.08;

        var startAt = Math.max(0, snippetStart - prerollSec);
        var stopAt = snippetEnd + postrollSec;

        var audio = new audioCtor();
        audio.preload = 'auto';
        audio.src = mediaUrl;
        var gainCtrl = createGainController(audio, item.trackIndex);

        state.currentAudio = {
            audio: audio,
            endSec: stopAt,
            itemId: itemId,
            setGain: gainCtrl.setGain,
            disconnect: gainCtrl.disconnect
        };
        state.currentPlayingPreviewId = itemId;
        state.currentPreviewInfo = playbackPlan || null;
        renderCutPreview();

        audio.addEventListener('loadedmetadata', function () {
            try {
                var maxStart = isFinite(audio.duration) ? Math.max(0, audio.duration - 0.02) : startAt;
                audio.currentTime = Math.min(startAt, maxStart);
            } catch (e0) { }

            var playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(function (err) {
                    stopPreviewAudio(false);
                    setStatus('error', 'Preview playback failed: ' + (err && err.message ? err.message : 'unknown error'));
                });
            }
        });

        audio.addEventListener('timeupdate', function () {
            if (!state.currentAudio || state.currentAudio.itemId !== itemId) return;
            if (audio.currentTime >= state.currentAudio.endSec) {
                stopPreviewAudio(false);
                setStatus('idle', 'Preview finished');
            }
        });

        audio.addEventListener('ended', function () {
            if (state.currentPlayingPreviewId === itemId) {
                stopPreviewAudio(false);
            }
        });

        audio.addEventListener('error', function () {
            stopPreviewAudio(false);
            setStatus('error', 'Could not play snippet preview');
        });

        if (playbackPlan && playbackPlan.approximate) {
            setStatus('analyzing', 'Previewing snippet (approx source mapping)...');
        } else {
            setStatus('analyzing', 'Previewing snippet...');
        }
    }

    root.AutoCastPanelAudioPreviewPlayerFeature = {
        resolveMediaPathToAudioUrl: resolveMediaPathToAudioUrl,
        stopCurrentPreviewAudio: stopCurrentPreviewAudio,
        updateCurrentPreviewGain: updateCurrentPreviewGain,
        createPreviewGainController: createPreviewGainController,
        toggleSnippetPreview: toggleSnippetPreview
    };
})(this);
