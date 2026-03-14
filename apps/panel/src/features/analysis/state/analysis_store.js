'use strict';

(function (root) {
    function cloneFlatObject(source) {
        var out = {};
        if (!source || typeof source !== 'object') return out;
        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                out[key] = source[key];
            }
        }
        return out;
    }

    function createDefaultState() {
        return {
            analysisResult: null,
            isAnalyzing: false,
            analysisRunId: 0
        };
    }

    function createState(initialState) {
        var initialSnapshot = cloneFlatObject(initialState || createDefaultState());
        var state = cloneFlatObject(initialSnapshot);

        return {
            getState: function () {
                return state;
            },
            setState: function (patch) {
                if (!patch || typeof patch !== 'object') return state;
                for (var key in patch) {
                    if (Object.prototype.hasOwnProperty.call(patch, key)) {
                        state[key] = patch[key];
                    }
                }
                return state;
            },
            resetState: function (nextInitialState) {
                if (nextInitialState && typeof nextInitialState === 'object') {
                    initialSnapshot = cloneFlatObject(nextInitialState);
                }
                state = cloneFlatObject(initialSnapshot);
                return state;
            }
        };
    }

    root.AutoCastPanelAnalysisStore = {
        createState: createState
    };
})(this);
