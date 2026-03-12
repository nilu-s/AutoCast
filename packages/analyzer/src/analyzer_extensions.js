'use strict';

var path = require('path');

function loadExtensions(extensionEntries) {
    if (!extensionEntries) return [];

    var entries = Array.isArray(extensionEntries) ? extensionEntries : [extensionEntries];
    var extensions = [];

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry) continue;

        if (typeof entry === 'string') {
            var resolved = path.resolve(entry);
            var loaded = require(resolved);
            validateExtension(loaded, resolved);
            extensions.push(loaded);
            continue;
        }

        if (typeof entry === 'object') {
            validateExtension(entry, 'inline extension #' + i);
            extensions.push(entry);
            continue;
        }

        throw new Error('Invalid extension entry at index ' + i + '. Expected module path or object.');
    }

    return extensions;
}

function invokeHook(extensions, hookName, context) {
    if (!extensions || extensions.length === 0) return;

    for (var i = 0; i < extensions.length; i++) {
        var ext = extensions[i];
        if (!ext || typeof ext[hookName] !== 'function') continue;

        try {
            ext[hookName](context);
        } catch (e) {
            var extName = ext.name || ('extension #' + (i + 1));
            throw new Error('Extension "' + extName + '" failed in hook "' + hookName + '": ' + e.message);
        }
    }
}

function validateExtension(ext, sourceLabel) {
    if (!ext || typeof ext !== 'object') {
        throw new Error('Extension at ' + sourceLabel + ' must export an object.');
    }

    var hookNames = [
        'onAfterReadTracks',
        'onAfterRms',
        'onAfterVad',
        'onAfterSegments',
        'onAfterResolveOverlaps',
        'onFinalizeResult'
    ];

    var hasHook = false;
    for (var i = 0; i < hookNames.length; i++) {
        if (typeof ext[hookNames[i]] === 'function') {
            hasHook = true;
            break;
        }
    }

    if (!hasHook) {
        throw new Error('Extension at ' + sourceLabel + ' does not implement any supported hooks.');
    }
}

module.exports = {
    loadExtensions: loadExtensions,
    invokeHook: invokeHook
};
