'use strict';

(function (root) {
    function createNullHostAdapter() {
        return {
            init: function () { return false; },
            ping: function () { },
            getTrackInfo: function (callback) { if (callback) callback({ error: 'Host bridge unavailable' }); },
            applyCuts: function (_cutData, callback) { if (callback) callback({ success: false, error: 'Host bridge unavailable' }); },
            addCutProgressListener: function () { },
            removeCutProgressListener: function () { },
            getCutProgressEventName: function () { return 'com.autocast.cutProgress'; },
            getExtensionPath: function () { return '.'; },
            isInMockMode: function () { return true; },
            resizePanel: function () { return false; }
        };
    }

    function resolveHostAdapter() {
        return root.AutoCastHostAdapter || root.AutoCastBridge || createNullHostAdapter();
    }

    function createAnalyzerFallbackAdapter() {
        return {
            analyze: function (trackPaths, params, progressCallback) {
                if (!root.AutoCastAnalyzer || typeof root.AutoCastAnalyzer.analyze !== 'function') {
                    return Promise.reject(new Error('No analyzer bridge available'));
                }
                return root.AutoCastAnalyzer.analyze(trackPaths, params, progressCallback);
            },
            quickGainScan: function (trackPaths, progressCallback) {
                if (!root.AutoCastAnalyzer || typeof root.AutoCastAnalyzer.quickGainScan !== 'function') {
                    return Promise.reject(new Error('No quick gain bridge available'));
                }
                return root.AutoCastAnalyzer.quickGainScan(trackPaths, progressCallback);
            }
        };
    }

    function resolveAnalyzerAdapter() {
        return root.AutoCastAnalyzerAdapter || createAnalyzerFallbackAdapter();
    }

    function initAnalyzerClient(hostAdapter, options) {
        options = options || {};

        if (root.AutoCastAnalyzer && typeof root.AutoCastAnalyzer.analyze === 'function') {
            return null;
        }

        if (!root.AutoCastAnalyzerClient || typeof root.AutoCastAnalyzerClient.create !== 'function') {
            return null;
        }

        try {
            root.AutoCastAnalyzer = root.AutoCastAnalyzerClient.create({
                getExtensionPath: function () {
                    if (typeof options.getExtensionPath === 'function') {
                        return options.getExtensionPath();
                    }
                    return hostAdapter && typeof hostAdapter.getExtensionPath === 'function'
                        ? hostAdapter.getExtensionPath()
                        : '.';
                }
            });
            return null;
        } catch (e) {
            var msg = e && e.toString ? e.toString() : String(e);
            root.NODE_INIT_ERROR = msg;
            if (root.console && typeof root.console.error === 'function') {
                root.console.error('[AutoCast] Failed to initialize analyzer client:', e);
            }
            return msg;
        }
    }

    function createPanelController(options) {
        options = options || {};
        var runtime = {
            hostAdapter: resolveHostAdapter(),
            analyzerAdapter: null,
            hostReady: false,
            nodeInitError: null
        };

        return {
            start: function () {
                if (runtime.hostAdapter && typeof runtime.hostAdapter.init === 'function') {
                    runtime.hostReady = !!runtime.hostAdapter.init();
                }

                runtime.nodeInitError = initAnalyzerClient(runtime.hostAdapter, options);
                runtime.analyzerAdapter = resolveAnalyzerAdapter();

                if (typeof options.onStart === 'function') {
                    options.onStart(runtime);
                }

                return runtime;
            },
            getRuntime: function () {
                return runtime;
            }
        };
    }

    root.AutoCastPanelController = {
        create: createPanelController
    };
})(this);
