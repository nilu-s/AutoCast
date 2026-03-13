'use strict';

(function (root) {
    function createAnalyzerClient(options) {
        if (typeof require === 'undefined') {
            throw new Error('Node integration is unavailable in this environment.');
        }

        options = options || {};

        var fs = require('fs');
        var path = require('path');
        var childProcess = require('child_process');
        var processObj = require('process');
        var getExtensionPath = (typeof options.getExtensionPath === 'function')
            ? options.getExtensionPath
            : function () { return '.'; };

        function isNodeLikeExecutable(execPath) {
            if (!execPath) return false;
            var base = path.basename(String(execPath)).toLowerCase();
            return base === 'node' ||
                base === 'node.exe' ||
                base === 'nodejs' ||
                base === 'nodejs.exe';
        }

        function buildExecutableCandidates() {
            var out = [];
            var seen = {};

            function addCandidate(candidate) {
                if (!candidate) return;
                var key = String(candidate).toLowerCase();
                if (seen[key]) return;
                seen[key] = true;
                out.push(candidate);
            }

            var execPath = processObj && processObj.execPath ? processObj.execPath : null;
            if (isNodeLikeExecutable(execPath)) {
                addCandidate(execPath);
            }

            if (processObj && processObj.env && processObj.env.AUTOCAST_NODE_PATH) {
                addCandidate(processObj.env.AUTOCAST_NODE_PATH);
            }

            addCandidate('node');
            return out;
        }

        function pathFromLocation() {
            var pathname = window.location.pathname || '';
            try {
                pathname = decodeURIComponent(pathname);
            } catch (e) { }
            if (window.navigator.platform.indexOf('Win') > -1 && pathname.charAt(0) === '/') {
                pathname = pathname.substring(1);
            }
            return path.dirname(pathname);
        }

        function normalizePotentialPath(maybePath) {
            if (!maybePath || maybePath === '.') return '';
            var out = String(maybePath);

            if (/^file:\/\//i.test(out)) {
                out = out.replace(/^file:\/\/\/?/i, '');
                try {
                    out = decodeURIComponent(out);
                } catch (e) { }
                if (window.navigator.platform.indexOf('Win') > -1 && out.charAt(0) === '/') {
                    out = out.substring(1);
                }
            }
            return out;
        }

        function collectRootCandidates() {
            var out = [];
            var seen = {};

            function addCandidate(candidate) {
                candidate = normalizePotentialPath(candidate);
                if (!candidate) return;
                var resolved = path.resolve(candidate);
                var key = resolved.toLowerCase();
                if (seen[key]) return;
                seen[key] = true;
                out.push(resolved);
            }

            addCandidate(getExtensionPath());
            addCandidate(pathFromLocation());
            return out;
        }

        function resolveWorkerLocation(workerScriptName) {
            var starts = collectRootCandidates();
            var checked = [];

            for (var i = 0; i < starts.length; i++) {
                var current = starts[i];
                for (var depth = 0; depth < 7; depth++) {
                    var key = current.toLowerCase();
                    if (checked.indexOf(key) === -1) checked.push(key);

                    var workerPath = path.join(current, 'packages', 'analyzer', 'src', workerScriptName);
                    if (fs.existsSync(workerPath)) {
                        return {
                            extensionPath: current,
                            workerPath: workerPath
                        };
                    }

                    var parent = path.dirname(current);
                    if (!parent || parent === current) break;
                    current = parent;
                }
            }

            return {
                extensionPath: starts.length ? starts[0] : '.',
                workerPath: null
            };
        }

        function runAnalyzerWorker(workerScriptName, payload, progressCallback, failurePrefix) {
            var workerLocation = resolveWorkerLocation(workerScriptName);
            var extensionPath = workerLocation.extensionPath;
            var workerPath = workerLocation.workerPath;

            if (!workerPath) {
                return Promise.reject(new Error(
                    failurePrefix + ': worker script not found (' + workerScriptName + ')'
                ));
            }

            var executables = buildExecutableCandidates();

            function attempt(executableIndex) {
                return new Promise(function (resolve, reject) {
                    var executable = executables[executableIndex];
                    var proc = childProcess.spawn(executable, [workerPath], {
                        cwd: extensionPath
                    });

                    var stdoutData = '';
                    var stderrData = '';
                    var settled = false;

                    proc.stdout.on('data', function (data) {
                        var str = data.toString();
                        stdoutData += str;

                        var lines = stdoutData.split(/\r?\n/);
                        stdoutData = lines.pop();

                        for (var i = 0; i < lines.length; i++) {
                            var line = lines[i].trim();
                            if (!line) continue;
                            try {
                                var msg = JSON.parse(line);
                                if (msg.type === 'progress') {
                                    if (progressCallback) progressCallback(msg.percent, msg.message);
                                } else if (msg.type === 'done') {
                                    settled = true;
                                    resolve(msg.result);
                                } else if (msg.type === 'error') {
                                    settled = true;
                                    reject(new Error(msg.error));
                                }
                            } catch (e) { }
                        }
                    });

                    proc.stderr.on('data', function (data) {
                        stderrData += data.toString();
                    });

                    proc.on('error', function (err) {
                        if (settled) return;
                        settled = true;
                        reject(new Error('spawn ' + executable + ' failed: ' + (err && err.message ? err.message : String(err))));
                    });

                    proc.on('close', function (code) {
                        if (settled) return;
                        if (code === 0) {
                            settled = true;
                            reject(new Error('Worker exited without result using "' + executable + '".'));
                            return;
                        }
                        settled = true;
                        reject(new Error(
                            failurePrefix + ' via "' + executable + '" (' + code + '): ' + stderrData.substring(0, 160)
                        ));
                    });

                    proc.stdin.write(JSON.stringify(payload || {}) + '\n');
                    proc.stdin.end();
                }).catch(function (err) {
                    if (executableIndex + 1 < executables.length) {
                        return attempt(executableIndex + 1);
                    }
                    throw err;
                });
            }

            return attempt(0);
        }

        return {
            analyze: function (trackPaths, params, progressCallback) {
                return runAnalyzerWorker(
                    'analyzer_worker_stdio.js',
                    { trackPaths: trackPaths, params: params },
                    progressCallback,
                    'Analyzer process exited'
                );
            },
            quickGainScan: function (trackPaths, progressCallback) {
                return runAnalyzerWorker(
                    'quick_gain_scan.js',
                    { trackPaths: trackPaths },
                    progressCallback,
                    'Quick scan process exited'
                );
            }
        };
    }

    root.AutoCastAnalyzerClient = {
        create: createAnalyzerClient
    };
})(this);
