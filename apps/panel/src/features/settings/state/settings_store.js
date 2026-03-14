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

    function normalizeValueByDefault(rawValue, defaultValue) {
        if (rawValue === undefined || rawValue === null) return defaultValue;
        if (typeof defaultValue === 'number') {
            var num = parseFloat(rawValue);
            return isFinite(num) ? num : defaultValue;
        }
        if (typeof defaultValue === 'boolean') {
            return !!rawValue;
        }
        return String(rawValue);
    }

    function mergeSettings(defaults, persisted) {
        var base = cloneFlatObject(defaults || {});
        var raw = (persisted && typeof persisted === 'object') ? persisted : {};
        for (var key in base) {
            if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
            if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
            base[key] = normalizeValueByDefault(raw[key], base[key]);
        }
        return base;
    }

    function serializeSettings(settings) {
        return JSON.stringify(settings || {});
    }

    function createState(initialState) {
        var state = cloneFlatObject(initialState || {});
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
            }
        };
    }

    root.AutoCastPanelSettingsStore = {
        mergeSettings: mergeSettings,
        serializeSettings: serializeSettings,
        createState: createState
    };
})(this);
