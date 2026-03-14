'use strict';

(function (root) {
    function runLoadTracksFromHost(options) {
        options = options || {};

        var state = options.state || {};
        var hostAdapter = options.hostAdapter || null;
        var tracksFeature = options.tracksFeature || null;
        var ticksPerSecond = options.ticksPerSecond;
        var setStatus = options.setStatus || function () { };
        var renderTracks = options.renderTracks || function () { };
        var buildCutPreviewState = options.buildCutPreviewState || function () { return null; };
        var getCutPreviewItemById = options.getCutPreviewItemById || function () { return null; };
        var renderCutPreview = options.renderCutPreview || function () { };

        if (!hostAdapter || typeof hostAdapter.getTrackInfo !== 'function') {
            setStatus('error', 'Host adapter unavailable');
            return;
        }
        if (!tracksFeature || typeof tracksFeature.normalizeLoadedTracks !== 'function') {
            setStatus('error', 'Tracks feature unavailable');
            return;
        }

        setStatus('analyzing', 'Loading track info...');

        hostAdapter.getTrackInfo(function (result) {
            if (!result || result.error) {
                setStatus('error', result && result.error ? result.error : 'Could not load tracks');
                return;
            }

            var loadedTracks = tracksFeature.normalizeLoadedTracks(result, ticksPerSecond);
            state.tracks = loadedTracks;
            renderTracks();

            if (state.analysisResult) {
                var previousActiveId = state.activeSnippetId;
                state.cutPreview = buildCutPreviewState(state.analysisResult);
                if (!getCutPreviewItemById(previousActiveId)) {
                    state.activeSnippetId = null;
                } else {
                    state.activeSnippetId = previousActiveId;
                }
                renderCutPreview();
            }

            setStatus('success', state.tracks.length + ' track(s) loaded');
        });
    }

    root.AutoCastPanelTracksLoaderFeature = {
        runLoadTracksFromHost: runLoadTracksFromHost
    };
})(this);
