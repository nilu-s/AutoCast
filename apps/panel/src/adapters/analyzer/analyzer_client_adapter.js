'use strict';

(function (root) {
    function pickAnalyzer() {
        return root.AutoCastAnalyzer || null;
    }

    root.AutoCastAnalyzerAdapter = {
        analyze: function (trackPaths, params, progressCallback) {
            var analyzer = pickAnalyzer();
            if (!analyzer || typeof analyzer.analyze !== 'function') {
                return Promise.reject(new Error('No analyzer bridge available'));
            }
            return analyzer.analyze(trackPaths, params, progressCallback);
        },
        quickGainScan: function (trackPaths, progressCallback) {
            var analyzer = pickAnalyzer();
            if (!analyzer || typeof analyzer.quickGainScan !== 'function') {
                return Promise.reject(new Error('No quick gain bridge available'));
            }
            return analyzer.quickGainScan(trackPaths, progressCallback);
        }
    };
})(this);
