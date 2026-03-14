'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

function loadScript(relPath, sandbox) {
    var abs = path.join(process.cwd(), relPath);
    var src = fs.readFileSync(abs, 'utf8');
    vm.runInNewContext(src, sandbox, { filename: abs });
}

function makeSandbox(extra) {
    var sandbox = {
        console: {
            log: function () { },
            warn: function () { },
            error: function () { }
        },
        JSON: JSON,
        Promise: Promise
    };

    if (extra && typeof extra === 'object') {
        for (var key in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, key)) {
                sandbox[key] = extra[key];
            }
        }
    }

    return sandbox;
}

function makeEventTarget() {
    return {
        listeners: {},
        addEventListener: function (name, fn) {
            this.listeners[name] = fn;
        },
        querySelector: function () { return null; }
    };
}

function resolvedThenable(value) {
    return {
        then: function (onFulfilled) {
            if (onFulfilled) onFulfilled(value);
            return {
                catch: function () { return this; }
            };
        },
        catch: function () { return this; }
    };
}

module.exports = {
    loadScript: loadScript,
    makeSandbox: makeSandbox,
    makeEventTarget: makeEventTarget,
    resolvedThenable: resolvedThenable
};
