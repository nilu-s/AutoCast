'use strict';

(function (root) {
    function safeGetStorage() {
        try {
            return root.localStorage || null;
        } catch (e) {
            return null;
        }
    }

    root.AutoCastPanelStorageAdapter = {
        getItem: function (key, fallbackValue) {
            var storage = safeGetStorage();
            if (!storage) return fallbackValue;
            var value = storage.getItem(key);
            return value === null ? fallbackValue : value;
        },
        setItem: function (key, value) {
            var storage = safeGetStorage();
            if (!storage) return false;
            storage.setItem(key, value);
            return true;
        },
        removeItem: function (key) {
            var storage = safeGetStorage();
            if (!storage) return false;
            storage.removeItem(key);
            return true;
        }
    };
})(this);
