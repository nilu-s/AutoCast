'use strict';

(function (root) {
    function requireStateStore(storeRef, storeName, requireFeatureFn) {
        var storeModule = requireFeatureFn(storeRef, storeName);
        if (!storeModule || typeof storeModule.createState !== 'function') {
            throw new Error('[AutoCast] Invalid state store module: ' + storeName);
        }
        return storeModule;
    }

    function defineStateProxyProperty(stateProxy, store, propName) {
        Object.defineProperty(stateProxy, propName, {
            enumerable: true,
            configurable: false,
            get: function () {
                return store.getState()[propName];
            },
            set: function (value) {
                var patch = {};
                patch[propName] = value;
                store.setState(patch);
            }
        });
    }

    function createPanelState(options) {
        options = options || {};
        var requireFeatureFn = typeof options.requireFeature === 'function'
            ? options.requireFeature
            : function (featureRef, featureName) {
                if (!featureRef) throw new Error('[AutoCast] Required feature module missing: ' + featureName);
                return featureRef;
            };

        var tracksStore = requireStateStore(
            options.tracksStateStore,
            'AutoCastPanelTracksStore',
            requireFeatureFn
        ).createState({
            tracks: [],
            perTrackSensitivity: {}
        });

        var analysisStore = requireStateStore(
            options.analysisStateStore,
            'AutoCastPanelAnalysisStore',
            requireFeatureFn
        ).createState({
            analysisResult: null,
            isAnalyzing: false,
            analysisRunId: 0
        });

        var cutPreviewStore = requireStateStore(
            options.cutPreviewStateStore,
            'AutoCastPanelCutPreviewStore',
            requireFeatureFn
        ).createState({
            cutPreview: null,
            activeSnippetId: null,
            panelPageMode: 'setup',
            cutPreviewZoom: 0,
            cutPreviewPixelsPerSec: 0,
            cutPreviewViewStartSec: 0,
            navigatorDrag: null,
            cutPreviewRenderPending: false,
            cutPreviewRenderHandle: null
        });

        var audioPreviewStore = requireStateStore(
            options.audioPreviewStateStore,
            'AutoCastPanelAudioPreviewStore',
            requireFeatureFn
        ).createState({
            currentAudio: null,
            currentPlayingPreviewId: null,
            previewMasterGain: 1,
            previewTrackGain: {},
            previewAudioContext: null,
            currentPreviewInfo: null
        });

        var stateProxy = {};

        defineStateProxyProperty(stateProxy, tracksStore, 'tracks');
        defineStateProxyProperty(stateProxy, tracksStore, 'perTrackSensitivity');

        defineStateProxyProperty(stateProxy, analysisStore, 'analysisResult');
        defineStateProxyProperty(stateProxy, analysisStore, 'isAnalyzing');
        defineStateProxyProperty(stateProxy, analysisStore, 'analysisRunId');

        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreview');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'activeSnippetId');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'panelPageMode');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewZoom');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewPixelsPerSec');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewViewStartSec');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'navigatorDrag');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewRenderPending');
        defineStateProxyProperty(stateProxy, cutPreviewStore, 'cutPreviewRenderHandle');

        defineStateProxyProperty(stateProxy, audioPreviewStore, 'currentAudio');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'currentPlayingPreviewId');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'previewMasterGain');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'previewTrackGain');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'previewAudioContext');
        defineStateProxyProperty(stateProxy, audioPreviewStore, 'currentPreviewInfo');

        return stateProxy;
    }

    root.AutoCastPanelStateRuntimeFeature = {
        createPanelState: createPanelState
    };
})(this);
