'use strict';

(function (root) {
    var STORAGE_KEY = 'autocast.panel.settings.v1';

    function safeParse(json, fallbackValue) {
        if (!json) return fallbackValue;
        try {
            return JSON.parse(json);
        } catch (e) {
            return fallbackValue;
        }
    }

    function createSettingsFeature(storageAdapter) {
        var storage = storageAdapter || root.AutoCastPanelStorageAdapter || null;
        var settingsStore = root.AutoCastPanelSettingsStore || null;

        function loadSettings(defaults) {
            var base = defaults || {};
            if (!storage || typeof storage.getItem !== 'function') {
                return base;
            }
            var raw = storage.getItem(STORAGE_KEY, null);
            var parsed = safeParse(raw, {});
            if (settingsStore && typeof settingsStore.mergeSettings === 'function') {
                return settingsStore.mergeSettings(base, parsed);
            }
            var out = {};
            var key;
            for (key in base) {
                if (base.hasOwnProperty(key)) out[key] = base[key];
            }
            for (key in parsed) {
                if (parsed.hasOwnProperty(key)) out[key] = parsed[key];
            }
            return out;
        }

        function saveSettings(settings) {
            if (!storage || typeof storage.setItem !== 'function') return false;
            if (settingsStore && typeof settingsStore.serializeSettings === 'function') {
                storage.setItem(STORAGE_KEY, settingsStore.serializeSettings(settings || {}));
                return true;
            }
            storage.setItem(STORAGE_KEY, JSON.stringify(settings || {}));
            return true;
        }

        return {
            loadSettings: loadSettings,
            saveSettings: saveSettings,
            STORAGE_KEY: STORAGE_KEY
        };
    }

    root.AutoCastPanelSettingsFeature = {
        create: createSettingsFeature
    };
})(this);
