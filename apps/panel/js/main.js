/**
 * AutoCast Ã¢â‚¬â€œ Panel UI Controller v2.1
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
                            if (path.basename(extensionPath) === 'panel' &&
                                path.basename(path.dirname(extensionPath)) === 'apps') {
                                extensionPath = path.resolve(extensionPath, '..', '..');
                            }
                        }

                        var workerPath = path.join(
                            extensionPath,
                            'packages',
                            'analyzer',
                            'src',
                            'analyzer_worker_stdio.js'
                        );

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
                 * Much faster than the full analysis Ã¢â‚¬â€œ used for the startup preset.
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
                            if (path.basename(extensionPath) === 'panel' &&
                                path.basename(path.dirname(extensionPath)) === 'apps') {
                                extensionPath = path.resolve(extensionPath, '..', '..');
                            }
                        }

                        var workerPath = path.join(
                            extensionPath,
                            'packages',
                            'analyzer',
                            'src',
                            'quick_gain_scan.js'
                        );

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
        perTrackSensitivity: {},
        mockSamples: null,
        currentAudio: null,
        currentPlayingTrack: -1,
        analysisRunId: 0
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
        analysisSummary: $('analysisSummary'),
        summaryPrimary: $('summaryPrimary'),
        summaryDetail: $('summaryDetail'),
        waveformSection: null,
        waveformContainer: null,
        btnLoadTracks: $('btnLoadTracks'),
        btnAnalyze: $('btnAnalyze'),
        btnPreviewMarkers: $('btnPreviewMarkers'),
        btnApply: $('btnApply'),
        btnReset: $('btnReset'),
        paramThreshold: $('paramThreshold'),
        valThreshold: $('valThreshold'),
        modeIndicator: $('modeIndicator')
    };

    function bindSlider(slider, display, suffix) {
        if (!slider || !display) return;
        slider.addEventListener('input', function () {
            display.textContent = suffix ? (slider.value + ' ' + suffix) : String(slider.value);
        });
    }

    bindSlider(els.paramThreshold, els.valThreshold, '');

    function getParams() {
        var debugMode = false;
        try {
            debugMode = (window.__AUTOCAST_DEBUG__ === true) ||
                (window.localStorage && window.localStorage.getItem('autocast.debug') === '1');
        } catch (e) { }

        var params = {
            thresholdAboveFloorDb: parseInt(els.paramThreshold.value, 10),
            absoluteThresholdDb: -64,
            attackFrames: 1,
            releaseFrames: 6,
            holdFrames: 24,
            minSegmentMs: 260,
            postOverlapMinSegmentMs: 160,
            minGapMs: 180,
            independentTrackAnalysis: true,
            snippetPadBeforeMs: 1200,
            snippetPadAfterMs: 1200,
            crossTrackTailTrimInIndependentMode: true,
            overlapTailAllowanceMs: 180,
            enablePrimaryTrackGapFill: true,
            primaryTrackGapFillMaxMs: 1800,
            primaryTrackGapFillQuietDb: -50,
            overlapPolicy: 'dominant_wins',
            bleedMarginDb: 15,
            overlapMarginDb: 8,
            suppressionScoreThreshold: 0.65,
            fillGaps: false,
            autoGain: true,
            useSpectralVAD: true,
            spectralMinConfidence: 0.18,
            spectralSoftMargin: 0.18,
            spectralScoreOpen: 0.50,
            spectralScoreClose: 0.35,
            spectralRmsWeight: 0.75,
            spectralHoldFrames: 4,
            primarySpeakerLock: true,
            speakerProfileMinConfidence: 0.30,
            speakerProfileMinFrames: 24,
            speakerMatchThreshold: 0.56,
            speakerMatchSoftMargin: 0.12,
            speakerMatchHoldFrames: 4,
            adaptiveNoiseFloor: true,
            localNoiseWindowMs: 1500,
            noiseFloorUpdateMs: 500,
            localNoisePercentile: 0.15,
            maxAdaptiveFloorRiseDb: 8,
            localNoiseSampleStride: 2,
            enableHardSilenceCut: true,
            hardSilenceCutDb: -51,
            hardSilenceLookaroundMs: 220,
            hardSilencePeakDeltaDb: 8,
            enableBleedHandling: false,
            bleedSuppressionDb: 0,
            bleedSuppressionSimilarityThreshold: 0.90,
            bleedSuppressionProtectConfidence: 0.34,
            perTrackThresholdDb: getPerTrackSensitivity(),
            enableTrackLoudnessBias: true,
            trackLoudnessBiasStrength: 0.35,
            debugMode: debugMode,
            debugMaxFrames: 4000
        };

        return params;
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
    }

    function hideSummary() {
        if (els.analysisSummary) {
            els.analysisSummary.style.display = 'none';
        }
        if (els.summaryPrimary) els.summaryPrimary.textContent = '';
        if (els.summaryDetail) els.summaryDetail.textContent = '';
    }

    function formatPercent(value) {
        return Math.round(value * 10) / 10;
    }

    function computeSegmentStats(result) {
        var tracks = (result && result.segments) ? result.segments : [];
        var totalSegments = 0;
        var totalDurationSec = 0;
        var activePercentSum = 0;
        var activeTrackCount = 0;

        for (var t = 0; t < tracks.length; t++) {
            var segs = tracks[t] || [];
            for (var s = 0; s < segs.length; s++) {
                var seg = segs[s];
                if (!seg || seg.state === 'suppressed') continue;
                totalSegments++;
                totalDurationSec += Math.max(0, (seg.end || 0) - (seg.start || 0));
            }
            if (result.tracks && result.tracks[t] && typeof result.tracks[t].activePercent === 'number') {
                activePercentSum += result.tracks[t].activePercent;
                activeTrackCount++;
            }
        }

        return {
            totalSegments: totalSegments,
            avgSegmentSec: totalSegments > 0 ? (totalDurationSec / totalSegments) : 0,
            avgActivePercent: activeTrackCount > 0 ? (activePercentSum / activeTrackCount) : 0
        };
    }

    function renderSummary(primaryText, detailText) {
        if (!els.analysisSummary) return;
        els.analysisSummary.style.display = 'block';
        if (els.summaryPrimary) els.summaryPrimary.textContent = primaryText || '';
        if (els.summaryDetail) els.summaryDetail.textContent = detailText || '';
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
                + '      <span class="track-controls-label">Auto sensitivity</span>'
                + '      <span class="sensitivity-badge" data-track-index="' + i + '">' + threshold + '</span>'
                + '    </div>'
                + '  </div>'
                + '</div>';
        }

        els.trackList.innerHTML = html;
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
        els.modeIndicator.textContent = 'Mode: Smooth Blocks';
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

        var globalThreshold = parseInt(els.paramThreshold.value, 10);

        function applyAutoSensitivityFromGainScan(scanResult) {
            var tracks = (scanResult && scanResult.tracks) ? scanResult.tracks : [];
            state.perTrackSensitivity = {};

            var validIndex = 0;
            for (var ti = 0; ti < state.tracks.length; ti++) {
                if (!trackPaths[ti]) continue;
                var gainDb = (tracks[validIndex] && tracks[validIndex].gainAdjustDb) || 0;
                var recommended = Math.round(globalThreshold - gainDb * 0.25);
                recommended = Math.max(-8, Math.min(8, recommended));
                state.perTrackSensitivity[ti] = recommended;
                validIndex++;
            }
            renderTracks();
        }

        function startFullAnalysis() {
            var params = getParams();
            var runId = state.analysisRunId;

            if (window.AutoCastAnalyzer && typeof window.AutoCastAnalyzer.analyze === 'function') {
                try {
                    window.AutoCastAnalyzer.analyze(trackPaths, params, function (percent, message) {
                        setProgress(percent, message);
                    }).then(function (result) {
                        if (runId !== state.analysisRunId) return;
                        state.analysisResult = result;
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        setStatus('success', 'Analysis complete');
                        var smoothLabel = 'Smooth Blocks';
                        var smoothStats = computeSegmentStats(result);
                        renderSummary(
                            'Mode ' + smoothLabel + ': ' + smoothStats.totalSegments + ' active segments',
                            'Avg segment ' + formatPercent(smoothStats.avgSegmentSec) + ' s, avg active ' + formatPercent(smoothStats.avgActivePercent) + '%'
                        );
                        renderResults();
                        renderWaveform();
                    }).catch(function (err) {
                        if (runId !== state.analysisRunId) return;
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        hideSummary();
                        setStatus('error', err && err.message ? err.message : 'Analysis failed');
                        console.error(err);
                    });
                } catch (e) {
                    if (runId !== state.analysisRunId) return;
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    hideSummary();
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
                        if (runId !== state.analysisRunId) return;
                        state.analysisResult = result;
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        setStatus('success', 'Analysis complete');
                        var fallbackStats = computeSegmentStats(result);
                        renderSummary(
                            'Analysis complete: ' + fallbackStats.totalSegments + ' active segments',
                            'Avg segment ' + formatPercent(fallbackStats.avgSegmentSec) + ' s, avg active ' + formatPercent(fallbackStats.avgActivePercent) + '%'
                        );
                        renderResults();
                        renderWaveform();
                    }, function (err) {
                        if (runId !== state.analysisRunId) return;
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        hideSummary();
                        setStatus('error', err && err.message ? err.message : 'Analysis failed');
                        console.error(err);
                    });
                } catch (e2) {
                    if (runId !== state.analysisRunId) return;
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    hideSummary();
                    setStatus('error', e2 && e2.message ? e2.message : 'Analysis failed');
                    console.error(e2);
                }
                return;
            }

            state.isAnalyzing = false;
            hideProgress();
            setButtonsDisabled(false);
            hideSummary();
            var errMsg = window.NODE_INIT_ERROR ? 'Node init failed: ' + window.NODE_INIT_ERROR : 'No analyzer bridge available';
            setStatus('error', errMsg);
        }

        state.analysisRunId++;
        state.isAnalyzing = true;
        setButtonsDisabled(true);
        hideSummary();
        setProgress(0, 'Measuring loudness...');

        if (window.AutoCastAnalyzer && typeof window.AutoCastAnalyzer.quickGainScan === 'function') {
            var gainScanPaths = [];
            for (var gp = 0; gp < trackPaths.length; gp++) {
                if (trackPaths[gp]) gainScanPaths.push(trackPaths[gp]);
            }

            window.AutoCastAnalyzer.quickGainScan(gainScanPaths, function (percent) {
                setProgress(Math.min(45, Math.max(0, Math.round(percent * 0.45))), 'Measuring loudness...');
            }).then(function (scanResult) {
                applyAutoSensitivityFromGainScan(scanResult);
                setProgress(45, 'Starting speech analysis...');
                startFullAnalysis();
            }).catch(function (scanErr) {
                console.warn('[AutoCast] quickGainScan failed, continuing without auto sensitivity:', scanErr);
                setProgress(20, 'Starting speech analysis...');
                startFullAnalysis();
            });
            return;
        }

        setProgress(20, 'Starting speech analysis...');
        startFullAnalysis();
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
        setStatus('analyzing', 'Cutting clips...');
        setProgress(0, 'Preparing cuts...');
        setButtonsDisabled(true);
        if (AutoCastBridge.isInMockMode()) {
            runMockCutting(function () {
                hideProgress();
                setButtonsDisabled(false);
                setStatus('success', 'Mock cutting complete');
            });
            return;
        }
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
            ticksPerSecond: 254016000000
        }, function (result) {
            AutoCastBridge.removeCutProgressListener(cutProgressHandler);
            hideProgress();
            setButtonsDisabled(false);
            console.log('[AutoCast] Raw result from ExtendScript:', result);
            if (result && result.success) {
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
            if (result && result.debug && result.debug.length) {
                console.log('[AutoCast] Cut debug (' + result.debug.length + ' entries):');
                for (var d = 0; d < result.debug.length; d++) {
                    console.log('  ' + result.debug[d]);
                }
            }
        });
        return;
    }
    function resetUI() {
        state.analysisResult = null;
        hideProgress();
        hideSummary();
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

    updateModeIndicator();

    hideProgress();
    renderTracks();
    renderResults();
    renderWaveform();
    setStatus('idle', 'Ready');

    // Auto-load track metadata, but no loudness scan on startup.
    setTimeout(loadTracksFromHost, 500);
})();

