/**
 * AutoCast – Panel UI Controller v2.1
 *
 * Notes:
 * - This keeps the existing UI structure.
 * - Added live progress support for clip cutting.
 * - Analyzer params now include bleedMarginDb support if the UI exposes it.
 */

'use strict';

(function () {
    AutoCastBridge.init();

    // Initialize Analyzer via Node.js worker_threads if running in Premiere
    if (typeof require !== 'undefined') {
        try {
            var path = require('path');
            var childProcess = require('child_process');

            window.AutoCastAnalyzer = {
                analyze: function (trackPaths, params, progressCallback) {
                    return new Promise(function (resolve, reject) {
                        var extensionPath = AutoCastBridge.getExtensionPath();
                        if (!extensionPath || extensionPath === '.') {
                            var pathname = window.location.pathname;
                            if (window.navigator.platform.indexOf('Win') > -1 && pathname.charAt(0) === '/') {
                                pathname = pathname.substring(1);
                            }
                            extensionPath = path.dirname(pathname).replace(/%20/g, ' ');
                        }

                        var workerPath = path.join(extensionPath, 'node', 'analyzer_worker_stdio.js');

                        var proc = childProcess.spawn('node', [workerPath], {
                            cwd: extensionPath
                        });

                        var stdoutData = '';
                        var stderrData = '';

                        proc.stdout.on('data', function (data) {
                            var str = data.toString();
                            stdoutData += str;

                            // Try to parse line by line
                            var lines = stdoutData.split('\n');
                            stdoutData = lines.pop(); // Keep incomplete line

                            for (var i = 0; i < lines.length; i++) {
                                var line = lines[i].trim();
                                if (!line) continue;
                                try {
                                    var msg = JSON.parse(line);
                                    if (msg.type === 'progress') {
                                        if (progressCallback) progressCallback(msg.percent, msg.message);
                                    } else if (msg.type === 'done') {
                                        resolve(msg.result);
                                    } else if (msg.type === 'error') {
                                        reject(new Error(msg.error));
                                    }
                                } catch (e) { }
                            }
                        });

                        proc.stderr.on('data', function (data) {
                            stderrData += data.toString();
                        });

                        proc.on('error', function (err) {
                            reject(err);
                        });

                        proc.on('close', function (code) {
                            if (code !== 0 && code !== null) {
                                reject(new Error('Process exited (' + code + '): ' + stderrData.substring(0, 100)));
                            }
                        });

                        // Send data
                        proc.stdin.write(JSON.stringify({ trackPaths: trackPaths, params: params }) + '\n');
                        proc.stdin.end();
                    });
                },

                /**
                 * Lightweight gain scan: only computes RMS + gain matching per track.
                 * Much faster than the full analysis – used for the startup preset.
                 */
                quickGainScan: function (trackPaths, progressCallback) {
                    return new Promise(function (resolve, reject) {
                        var extensionPath = AutoCastBridge.getExtensionPath();
                        if (!extensionPath || extensionPath === '.') {
                            var pathname = window.location.pathname;
                            if (window.navigator.platform.indexOf('Win') > -1 && pathname.charAt(0) === '/') {
                                pathname = pathname.substring(1);
                            }
                            extensionPath = path.dirname(pathname).replace(/%20/g, ' ');
                        }

                        var workerPath = path.join(extensionPath, 'node', 'quick_gain_scan.js');

                        var proc = childProcess.spawn('node', [workerPath], {
                            cwd: extensionPath
                        });

                        var stdoutData = '';
                        var stderrData = '';

                        proc.stdout.on('data', function (data) {
                            var str = data.toString();
                            stdoutData += str;

                            var lines = stdoutData.split('\n');
                            stdoutData = lines.pop();

                            for (var i = 0; i < lines.length; i++) {
                                var line = lines[i].trim();
                                if (!line) continue;
                                try {
                                    var msg = JSON.parse(line);
                                    if (msg.type === 'progress') {
                                        if (progressCallback) progressCallback(msg.percent, msg.message);
                                    } else if (msg.type === 'done') {
                                        resolve(msg.result);
                                    } else if (msg.type === 'error') {
                                        reject(new Error(msg.error));
                                    }
                                } catch (e) { }
                            }
                        });

                        proc.stderr.on('data', function (data) {
                            stderrData += data.toString();
                        });

                        proc.on('error', function (err) {
                            reject(err);
                        });

                        proc.on('close', function (code) {
                            if (code !== 0 && code !== null) {
                                reject(new Error('Quick scan exited (' + code + '): ' + stderrData.substring(0, 100)));
                            }
                        });

                        proc.stdin.write(JSON.stringify({ trackPaths: trackPaths }) + '\n');
                        proc.stdin.end();
                    });
                }
            };
        } catch (e) {
            window.NODE_INIT_ERROR = e.toString();
            console.error('[AutoCast] Failed to initialize worker_threads analyzer:', e);
        }
    }

    var state = {
        tracks: [],
        analysisResult: null,
        isAnalyzing: false,
        undoStack: [],
        maxUndoLevels: 5,
        perTrackSensitivity: {},
        mockSamples: null,
        currentAudio: null,
        currentPlayingTrack: -1,
        lastCutUndoSteps: 0
    };

    var TRACK_COLORS = [
        '#4ea1f3', '#4caf50', '#ff9800', '#e91e63',
        '#9c27b0', '#00bcd4', '#ffeb3b', '#795548'
    ];

    function $(id) {
        return document.getElementById(id);
    }

    var els = {
        statusBar: $('statusBar'),
        statusText: $('statusText'),
        statusIcon: $('statusIcon'),
        trackList: $('trackList'),
        resultsSection: null,
        resultsContent: null,
        progressContainer: $('progressContainer'),
        progressFill: $('progressFill'),
        progressText: $('progressText'),
        waveformSection: null,
        waveformContainer: null,
        btnLoadTracks: $('btnLoadTracks'),
        btnAnalyze: $('btnAnalyze'),
        btnPreviewMarkers: $('btnPreviewMarkers'),
        btnApply: $('btnApply'),
        btnUndo: $('btnUndo'),
        btnReset: $('btnReset'),
        paramThreshold: $('paramThreshold'),
        paramDucking: $('paramDucking'),
        valThreshold: $('valThreshold'),
        valDucking: $('valDucking'),
        modeIndicator: $('modeIndicator')
    };

    function bindSlider(slider, display, suffix) {
        if (!slider || !display) return;
        slider.addEventListener('input', function () {
            display.textContent = slider.value + ' ' + suffix;
        });
    }

    bindSlider(els.paramThreshold, els.valThreshold, 'dB');
    bindSlider(els.paramDucking, els.valDucking, 'dB');

    function getParams() {
        return {
            thresholdAboveFloorDb: parseInt(els.paramThreshold.value, 10),
            holdFrames: 80, // Keep gate open 800ms after speech ends
            minSegmentMs: 1000, // Drop segments shorter than 1s
            minGapMs: 800, // Merge gaps shorter than 800ms
            duckingLevelDb: els.paramDucking ? parseInt(els.paramDucking.value, 10) : -24,
            rampMs: 30,
            overlapPolicy: 'spectral_bleed_safe',
            bleedMarginDb: 15,
            overlapMarginDb: 8,
            autoGain: true,
            useSpectralVAD: true,
            adaptiveCrossfade: true,
            perTrackThresholdDb: getPerTrackSensitivity()
        };
    }

    function getPerTrackSensitivity() {
        var hasPerTrack = false;
        for (var key in state.perTrackSensitivity) {
            if (state.perTrackSensitivity.hasOwnProperty(key)) {
                hasPerTrack = true;
                break;
            }
        }

        if (!hasPerTrack) return null;

        var arr = [];
        var globalThreshold = parseInt(els.paramThreshold.value, 10);
        for (var i = 0; i < state.tracks.length; i++) {
            arr.push(
                state.perTrackSensitivity[i] !== undefined
                    ? state.perTrackSensitivity[i]
                    : globalThreshold
            );
        }
        return arr;
    }

    function setStatus(type, text) {
        if (els.statusBar) els.statusBar.className = 'status-bar status-' + type;
        if (els.statusText) els.statusText.textContent = text;
    }

    function setProgress(percent, message) {
        if (!els.progressContainer || !els.progressFill || !els.progressText) return;

        els.progressContainer.style.display = 'flex';
        els.progressFill.style.width = percent + '%';
        els.progressText.textContent = percent + '%';

        if (message) setStatus('analyzing', message);
    }

    function hideProgress() {
        if (els.progressContainer) {
            els.progressContainer.style.display = 'none';
        }
    }

    function setButtonsDisabled(disabled) {
        if (els.btnApply) els.btnApply.disabled = disabled;
        if (els.btnAnalyze) els.btnAnalyze.disabled = disabled;
        if (els.btnPreviewMarkers) els.btnPreviewMarkers.disabled = disabled;
        if (els.btnReset) els.btnReset.disabled = disabled;
        // btnUndo has its own enable/disable logic – only block during active operations
        if (disabled && els.btnUndo) els.btnUndo.disabled = true;
    }

    function runMockCutting(done) {
        var step = 0;
        var messages = [
            'Preparing cuts...',
            'Mapping active islands...',
            'Trimming clips...',
            'Creating split clips...',
            'Finalizing...'
        ];

        var interval = setInterval(function () {
            step += 8;
            var msgIdx = Math.min(Math.floor(step / 25), messages.length - 1);
            setProgress(Math.min(step, 100), messages[msgIdx]);

            if (step >= 100) {
                clearInterval(interval);
                done();
            }
        }, 120);
    }

    function renderTracks() {
        if (!els.trackList) return;

        if (!state.tracks || state.tracks.length === 0) {
            els.trackList.innerHTML = '<div class="empty-state">No tracks loaded.</div>';
            return;
        }

        var globalThreshold = parseInt(els.paramThreshold.value, 10);
        var html = '';
        for (var i = 0; i < state.tracks.length; i++) {
            var track = state.tracks[i];
            var color = TRACK_COLORS[i % TRACK_COLORS.length];
            var threshold = state.perTrackSensitivity[i] !== undefined
                ? state.perTrackSensitivity[i]
                : globalThreshold;

            // Ensure selected state is initialized
            if (track.selected === undefined) track.selected = true;

            // Badge color: grün wenn nah am Default, orange wenn stark abweichend
            var isModified = state.perTrackSensitivity[i] !== undefined;
            var badgeClass = isModified ? 'sensitivity-badge sensitivity-badge--custom' : 'sensitivity-badge';

            html += ''
                + '<div class="track-item" data-track-index="' + i + '">'
                + '  <div class="track-color" style="background:' + color + ';"></div>'
                + '  <div class="track-select" style="margin-right: 8px;"><input type="checkbox" class="track-cb" data-track-index="' + i + '" ' + (track.selected ? 'checked' : '') + '></div>'
                + '  <div class="track-meta">'
                + '    <div class="track-title">Track ' + (i + 1) + (track.name ? ' \u2013 ' + escapeHtml(track.name) : '') + '</div>'
                + '    <div class="track-subtitle">'
                + (track.path ? escapeHtml(track.path) : 'No available media files on this track')
                + '    </div>'
                + '  </div>'
                + '  <div class="track-controls">'
                + '    <div class="track-threshold-row">'
                + '      <span class="track-controls-label">Korrektur</span>'
                + '      <span class="' + badgeClass + '" data-track-index="' + i + '">' + threshold + ' dB</span>'
                + '    </div>'
                + '    <input class="track-sensitivity" type="range" min="3" max="24" step="1" value="' + threshold + '" data-track-index="' + i + '">'
                + '    <div class="slider-labels"><span>Sensitiver</span><span>Strenger</span></div>'
                + '  </div>'
                + '</div>';
        }

        els.trackList.innerHTML = html;

        var sliders = els.trackList.querySelectorAll('.track-sensitivity');
        for (var s = 0; s < sliders.length; s++) {
            sliders[s].addEventListener('input', function () {
                var trackIndex = parseInt(this.getAttribute('data-track-index'), 10);
                var value = parseInt(this.value, 10);
                state.perTrackSensitivity[trackIndex] = value;

                // Badge aktualisieren
                var badge = els.trackList.querySelector('.sensitivity-badge[data-track-index="' + trackIndex + '"]');
                if (badge) {
                    badge.textContent = value + ' dB';
                    badge.className = 'sensitivity-badge sensitivity-badge--custom';
                }
            });
        }

        var checkboxes = els.trackList.querySelectorAll('.track-cb');
        for (var c = 0; c < checkboxes.length; c++) {
            checkboxes[c].addEventListener('change', function () {
                var idx = parseInt(this.getAttribute('data-track-index'), 10);
                state.tracks[idx].selected = this.checked;
            });
        }
    }

    function renderResults() { /* removed */ }

    function renderWaveform() { /* removed */ }

    function updateModeIndicator() {
        if (!els.modeIndicator) return;
        els.modeIndicator.textContent = 'Mode: Mixed cut + duck';
    }

    function analyzeTracks() {
        if (state.isAnalyzing) return;

        if (!state.tracks || state.tracks.length === 0) {
            setStatus('error', 'No tracks available');
            return;
        }

        var trackPaths = [];
        var firstError = '';
        for (var i = 0; i < state.tracks.length; i++) {
            var track = state.tracks[i];
            var p = track.path;
            
            // Only include track if checked by user
            if (track.selected !== false) {
                if (p && !p.startsWith('[')) {
                    trackPaths.push(p);
                } else if (p && !firstError) {
                    firstError = p;
                }
            } else {
                // If it is deselected, we push null to maintain the array index alignment
                // so that the analyzer knows which track index it belongs to
                trackPaths.push(null);
            }
        }

        // Check if there's at least one valid path
        var hasValid = false;
        for (var i=0; i < trackPaths.length; i++) {
            if (trackPaths[i]) hasValid = true;
        }

        if (!hasValid) {
            setStatus('error', 'No valid track paths selected. ' + (firstError || ''));
            return;
        }

        state.isAnalyzing = true;
        setButtonsDisabled(true);
        setProgress(0, 'Preparing analysis...');

        var params = getParams();

        if (window.AutoCastAnalyzer && typeof window.AutoCastAnalyzer.analyze === 'function') {
            try {
                window.AutoCastAnalyzer.analyze(trackPaths, params, function (percent, message) {
                    setProgress(percent, message);
                }).then(function (result) {
                    state.analysisResult = result;
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    setStatus('success', 'Analysis complete');
                    renderResults();
                    renderWaveform();
                }).catch(function (err) {
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    setStatus('error', err && err.message ? err.message : 'Analysis failed');
                    console.error(err);
                });
            } catch (e) {
                state.isAnalyzing = false;
                hideProgress();
                setButtonsDisabled(false);
                setStatus('error', e && e.message ? e.message : 'Analysis failed');
                console.error(e);
            }
            return;
        }

        if (typeof window.__AUTOCAST_ANALYZE__ === 'function') {
            try {
                window.__AUTOCAST_ANALYZE__(trackPaths, params, function (percent, message) {
                    setProgress(percent, message);
                }, function (result) {
                    state.analysisResult = result;
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    setStatus('success', 'Analysis complete');
                    renderResults();
                    renderWaveform();
                }, function (err) {
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    setStatus('error', err && err.message ? err.message : 'Analysis failed');
                    console.error(err);
                });
            } catch (e2) {
                state.isAnalyzing = false;
                hideProgress();
                setButtonsDisabled(false);
                setStatus('error', e2 && e2.message ? e2.message : 'Analysis failed');
                console.error(e2);
            }
            return;
        }

        state.isAnalyzing = false;
        hideProgress();
        setButtonsDisabled(false);
        var errMsg = window.NODE_INIT_ERROR ? 'Node init failed: ' + window.NODE_INIT_ERROR : 'No analyzer bridge available';
        setStatus('error', errMsg);
    }

    function applyEdits() {
        if (!state.analysisResult) {
            setStatus('error', 'No analysis result available');
            return;
        }

        var tIndices = [];
        for (var i = 0; i < state.tracks.length; i++) {
            if (state.tracks[i].selected !== false) {
                tIndices.push(state.tracks[i].index !== undefined ? state.tracks[i].index : i);
            }
        }

        var mode = 'mixed';

        if (mode === 'chop' || mode === 'mixed') {
            setStatus('analyzing', 'Cutting clips...');
            setProgress(0, 'Preparing cuts...');
            setButtonsDisabled(true);

            if (AutoCastBridge.isInMockMode()) {
                runMockCutting(function () {
                    hideProgress();
                    setButtonsDisabled(false);
                    // Enable undo in mock mode
                    state.undoSnapshot = { snapshot: [], ticksPerSecond: 254016000000, trackIndices: tIndices };
                    if (els.btnUndo) els.btnUndo.disabled = false;
                    setStatus('success', 'Mock cutting complete');
                });
                return;
            }

            // Step 1: Capture current clip state before any cuts
            setProgress(2, 'Saving clip state for undo...');
            AutoCastBridge.captureTrackState({ trackIndices: tIndices, ticksPerSecond: 254016000000 }, function (captureResult) {
                if (captureResult && captureResult.success) {
                    state.undoSnapshot = {
                        snapshot: captureResult.snapshot,
                        trackIndices: tIndices,
                        ticksPerSecond: 254016000000
                    };
                } else {
                    // Capture failed – undo won't be available
                    state.undoSnapshot = null;
                    console.warn('[AutoCast] captureTrackState failed:', captureResult);
                }

                // Step 2: Proceed with the actual cuts
                var cutProgressHandler = function (evt) {
                    try {
                        var payload = evt && evt.data ? JSON.parse(evt.data) : null;
                        if (!payload) return;
                        setProgress(
                            Math.max(0, Math.min(100, parseInt(payload.percent, 10) || 0)),
                            payload.message || 'Cutting clips...'
                        );
                    } catch (e) {
                        console.error('[AutoCast] Cut progress parse error:', e);
                    }
                };

                AutoCastBridge.addCutProgressListener(cutProgressHandler);

                AutoCastBridge.applyCuts({
                    segments: state.analysisResult.segments,
                    trackIndices: tIndices,
                    ticksPerSecond: 254016000000,
                    mode: mode,
                    duckingLevelDb: parseInt(els.paramDucking.value, 10)
                }, function (result) {
                    AutoCastBridge.removeCutProgressListener(cutProgressHandler);
                    hideProgress();
                    setButtonsDisabled(false);
                    console.log('[AutoCast] Raw result from ExtendScript:', result);

                    if (result && result.success) {
                        if (state.undoSnapshot && els.btnUndo) {
                            els.btnUndo.disabled = false;
                            els.btnUndo.title = 'Undo cuts (restores ' + (state.undoSnapshot.snapshot ? state.undoSnapshot.snapshot.length : 0) + ' track(s))';
                        }

                    setStatus(
                        'success',
                        'Clips cut successfully (' +
                        (result.clipsTrimmed || 0) + ' trimmed, ' +
                        (result.clipsCreated || 0) + ' created, ' +
                        (result.clipsRemoved || 0) + ' removed)'
                    );
                } else {
                    var errMsg = 'Cut error';
                    if (typeof result === 'string') {
                        errMsg = 'ExtendScript Crash: ' + result;
                    } else if (result && result.error) {
                        errMsg = result.error;
                    } else if (result && result.errors && result.errors.length) {
                        errMsg = result.errors[0];
                        if (result.errors.length > 1) {
                            errMsg += ' (+' + (result.errors.length - 1) + ' more)';
                        }
                    }
                    setStatus('error', errMsg);
                    if (result && result.errors && result.errors.length) {
                        console.error('[AutoCast] Cut errors:', result.errors);
                    }
                }

                // Always log debug info for diagnostics
                if (result && result.debug && result.debug.length) {
                    console.log('[AutoCast] Cut debug (' + result.debug.length + ' entries):');
                    for (var d = 0; d < result.debug.length; d++) {
                        console.log('  ' + result.debug[d]);
                    }
                    }
                });
            }); // end captureTrackState callback

            return;
        }

        setStatus('analyzing', 'Applying keyframes...');
        setButtonsDisabled(true);

        AutoCastBridge.applyKeyframes({
            keyframes: state.analysisResult.keyframes,
            trackIndices: tIndices,
            ticksPerSecond: 254016000000
        }, function (result) {
            setButtonsDisabled(false);

            if (result && result.success) {
                setStatus('success', 'Keyframes applied');
            } else {
                setStatus('error', (result && result.error) ? result.error : 'Apply failed');
            }
        });
    }

    function resetUI() {
        state.analysisResult = null;
        hideProgress();
        setStatus('idle', 'Ready');
        renderResults();
        renderWaveform();
    }

    function loadTracksFromHost() {
        setStatus('analyzing', 'Loading track info...');

        AutoCastBridge.getTrackInfo(function (result) {
            if (!result || result.error) {
                setStatus('error', result && result.error ? result.error : 'Could not load tracks');
                return;
            }

            var loadedTracks = result.tracks || result || [];
            for (var i = 0; i < loadedTracks.length; i++) {
                var t = loadedTracks[i];
                if (!t.path && t.clips && t.clips.length > 0) {
                    var foundPath = false;
                    for (var c = 0; c < t.clips.length; c++) {
                        if (t.clips[c].mediaPath) {
                            t.path = t.clips[c].mediaPath;
                            foundPath = true;
                            break;
                        } else if (t.clips[c].mediaPathError) {
                            t.path = '[Err] ' + t.clips[c].mediaPathError;
                            foundPath = true;
                        }
                    }
                    if (!foundPath) t.path = '[Info] No usable media paths found.';
                } else if (!t.clips || t.clips.length === 0) {
                    t.path = '[Empty] No clips on this track.';
                }
            }
            state.tracks = loadedTracks;
            renderTracks();
            setStatus('success', state.tracks.length + ' track(s) loaded');
        });
    }

    /**
     * Beim Öffnen: Tracks laden → Lautstärke messen → Sensitivity-Slider
     * automatisch als Preset einstellen (nur visuell, Premiere unberührt).
     *
     * Leise Spuren (hoher gainAdjustDb) → niedrigerer Schwellwert (sensitiver)
     * Laute Spuren  (niedriger gainAdjustDb) → höherer Schwellwert (strenger)
     *
     * Formel: neuerThreshold = globalThreshold - gainAdjustDb * 0.5
     * → Clamp auf [3, 24] dB
     */
    function autoAnalyzeAndNormalizeGain() {
        setStatus('analyzing', 'Lade Tonspuren...');

        AutoCastBridge.getTrackInfo(function (result) {
            if (!result || result.error) {
                setStatus('error', result && result.error ? result.error : 'Tonspuren konnten nicht geladen werden');
                return;
            }

            var loadedTracks = result.tracks || result || [];
            for (var i = 0; i < loadedTracks.length; i++) {
                var t = loadedTracks[i];
                if (!t.path && t.clips && t.clips.length > 0) {
                    var foundPath = false;
                    for (var c = 0; c < t.clips.length; c++) {
                        if (t.clips[c].mediaPath) {
                            t.path = t.clips[c].mediaPath;
                            foundPath = true;
                            break;
                        } else if (t.clips[c].mediaPathError) {
                            t.path = '[Err] ' + t.clips[c].mediaPathError;
                            foundPath = true;
                        }
                    }
                    if (!foundPath) t.path = '[Info] No usable media paths found.';
                } else if (!t.clips || t.clips.length === 0) {
                    t.path = '[Empty] No clips on this track.';
                }
            }

            state.tracks = loadedTracks;
            renderTracks();
            setStatus('analyzing', state.tracks.length + ' Spur(en) geladen – messe Lautstärken...');

            // Gültige Pfade für die Analyse sammeln
            var trackPaths = [];
            var trackIndexMap = [];
            for (var j = 0; j < state.tracks.length; j++) {
                var p = state.tracks[j].path;
                if (p && !p.startsWith('[')) {
                    trackPaths.push(p);
                    trackIndexMap.push(j);
                }
            }

            if (trackPaths.length === 0) {
                setStatus('idle', state.tracks.length + ' Spur(en) geladen – keine Mediendateien gefunden');
                return;
            }

            if (!window.AutoCastAnalyzer || typeof window.AutoCastAnalyzer.quickGainScan !== 'function') {
                setStatus('idle', state.tracks.length + ' Spur(en) geladen');
                return;
            }

            state.isAnalyzing = true;
            setButtonsDisabled(true);
            setProgress(0, 'Messe Lautstärken...');

            var globalThreshold = parseInt(els.paramThreshold.value, 10);

            window.AutoCastAnalyzer.quickGainScan(trackPaths, function (percent, message) {
                setProgress(percent, message);
            }).then(function (analysisResult) {
                state.isAnalyzing = false;
                hideProgress();
                setButtonsDisabled(false);

                // Sensitivity-Preset berechnen und Slider setzen
                var tracks = analysisResult.tracks || [];
                var presetParts = [];

                for (var k = 0; k < tracks.length; k++) {
                    var gainDb = tracks[k].gainAdjustDb || 0;
                    var stateIdx = trackIndexMap[k] !== undefined ? trackIndexMap[k] : k;

                    // Leise Spur → sensitiver (niedrigerer Schwellwert)
                    // Laute Spur  → strenger (höherer Schwellwert)
                    var recommended = Math.round(globalThreshold - gainDb * 0.5);
                    recommended = Math.max(3, Math.min(24, recommended));

                    state.perTrackSensitivity[stateIdx] = recommended;

                    if (Math.abs(gainDb) >= 0.5) {
                        presetParts.push('S' + (stateIdx + 1) + ': ' + recommended + ' dB');
                    }
                }

                // Slider visuell aktualisieren (inklusive Badges)
                renderTracks();

                var statusMsg = 'Preset gesetzt';
                if (presetParts.length > 0) {
                    statusMsg += ': ' + presetParts.join(', ');
                } else {
                    statusMsg = 'Alle Spuren gleich laut – Preset: ' + globalThreshold + ' dB';
                }
                setStatus('success', statusMsg);

            }).catch(function (err) {
                state.isAnalyzing = false;
                hideProgress();
                setButtonsDisabled(false);
                setStatus('idle', state.tracks.length + ' Spur(en) geladen – Lautstärkemessung fehlgeschlagen');
                console.warn('[AutoCast] Auto-Preset fehlgeschlagen:', err);
            });
        });
    }

    function safeNum(value) {
        return (typeof value === 'number' && isFinite(value)) ? value : '-';
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    if (els.btnLoadTracks) {
        els.btnLoadTracks.addEventListener('click', loadTracksFromHost);
    }

    if (els.btnAnalyze) {
        els.btnAnalyze.addEventListener('click', analyzeTracks);
    }

    if (els.btnApply) {
        els.btnApply.addEventListener('click', applyEdits);
    }

    if (els.btnReset) {
        els.btnReset.addEventListener('click', resetUI);
    }

    function undoCuts() {
        var snapshot = state.undoSnapshot;
        if (!snapshot) {
            setStatus('error', 'Nothing to undo');
            return;
        }

        setStatus('analyzing', 'Undoing cuts...');
        setProgress(0, 'Restoring clips...');
        setButtonsDisabled(true);

        if (AutoCastBridge.isInMockMode()) {
            setTimeout(function () {
                setButtonsDisabled(false);
                if (els.btnUndo) els.btnUndo.disabled = true;
                state.undoSnapshot = null;
                hideProgress();
                setStatus('success', 'Mock undo complete');
            }, 600);
            return;
        }

        AutoCastBridge.restoreTrackState(snapshot, function (result) {
            hideProgress();
            setButtonsDisabled(false);

            if (result && result.success) {
                if (els.btnUndo) els.btnUndo.disabled = true;
                state.undoSnapshot = null;
                setStatus('success', 'Cuts undone \u2013 ' + (result.restored || 0) + ' clip(s) restored');
            } else {
                if (els.btnUndo) els.btnUndo.disabled = false;
                var errMsg = (result && result.error) ? result.error
                    : (result && result.errors && result.errors.length) ? result.errors[0]
                    : 'Undo failed';
                setStatus('error', errMsg);
                console.error('[AutoCast] restoreTrackState errors:', result);
            }
        });
    }

    if (els.btnUndo) {
        els.btnUndo.addEventListener('click', undoCuts);
    }

    updateModeIndicator();

    hideProgress();
    renderTracks();
    renderResults();
    renderWaveform();
    setStatus('idle', 'Ready');

    // Beim Öffnen: Tracks laden + Lautstärke messen + Sensitivity-Preset setzen
    setTimeout(autoAnalyzeAndNormalizeGain, 500);
})();
