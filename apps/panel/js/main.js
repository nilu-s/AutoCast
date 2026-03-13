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
        cutPreview: null,
        isAnalyzing: false,
        perTrackSensitivity: {},
        mockSamples: null,
        currentAudio: null,
        currentPlayingTrack: -1,
        currentPlayingPreviewId: null,
        analysisRunId: 0,
        cutPreviewFilterState: 'all',
        cutPreviewTrackFilter: 'all',
        cutPreviewSort: 'time',
        cutPreviewZoom: 90
    };

    var TRACK_COLORS = [
        '#4ea1f3', '#4caf50', '#ff9800', '#e91e63',
        '#9c27b0', '#00bcd4', '#ffeb3b', '#795548'
    ];
    var TICKS_PER_SECOND = 254016000000;
    var AUDIO_PREVIEW_PREROLL_SEC = 0.2;
    var AUDIO_PREVIEW_POSTROLL_SEC = 0.2;

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
        cutPreviewSection: $('cutPreviewSection'),
        cutPreviewMeta: $('cutPreviewMeta'),
        cutPreviewTimeline: $('cutPreviewTimeline'),
        cutPreviewList: $('cutPreviewList'),
        cutPreviewTrackFilter: $('cutPreviewTrackFilter'),
        cutPreviewSort: $('cutPreviewSort'),
        cutPreviewZoom: $('cutPreviewZoom'),
        waveformSection: null,
        waveformContainer: null,
        btnLoadTracks: $('btnLoadTracks'),
        btnAnalyze: $('btnAnalyze'),
        btnApply: $('btnApply'),
        btnReset: $('btnReset'),
        paramThreshold: $('paramThreshold'),
        valThreshold: $('valThreshold'),
        paramMinPeak: $('paramMinPeak'),
        valMinPeak: $('valMinPeak'),
        modeIndicator: $('modeIndicator')
    };

    function bindSlider(slider, display, suffix) {
        if (!slider || !display) return;
        slider.addEventListener('input', function () {
            display.textContent = suffix ? (slider.value + ' ' + suffix) : String(slider.value);
        });
    }

    bindSlider(els.paramThreshold, els.valThreshold, '');
    bindSlider(els.paramMinPeak, els.valMinPeak, 'dB');

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
            finalMinPeakDbFs: parseFloat(els.paramMinPeak.value),
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
        if (els.btnReset) els.btnReset.disabled = disabled;
    }

    function hideSummary() {
        if (els.analysisSummary) {
            els.analysisSummary.style.display = 'none';
        }
        if (els.summaryPrimary) els.summaryPrimary.textContent = '';
        if (els.summaryDetail) els.summaryDetail.textContent = '';
    }

    function hideCutPreview() {
        if (els.cutPreviewSection) {
            els.cutPreviewSection.style.display = 'none';
        }
        if (els.cutPreviewMeta) els.cutPreviewMeta.textContent = '';
        if (els.cutPreviewTimeline) els.cutPreviewTimeline.innerHTML = '';
        if (els.cutPreviewList) els.cutPreviewList.innerHTML = '';
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
                if (state.cutPreview) renderCutPreview();
            });
        }
    }

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
                        state.cutPreview = buildCutPreviewState(result);
                        stopCurrentPreviewAudio();
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
                        renderCutPreview();
                    }).catch(function (err) {
                        if (runId !== state.analysisRunId) return;
                        state.cutPreview = null;
                        stopCurrentPreviewAudio();
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        hideSummary();
                        hideCutPreview();
                        setStatus('error', err && err.message ? err.message : 'Analysis failed');
                        console.error(err);
                    });
                } catch (e) {
                    if (runId !== state.analysisRunId) return;
                    state.cutPreview = null;
                    stopCurrentPreviewAudio();
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    hideSummary();
                    hideCutPreview();
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
                        state.cutPreview = buildCutPreviewState(result);
                        stopCurrentPreviewAudio();
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        setStatus('success', 'Analysis complete');
                        var fallbackStats = computeSegmentStats(result);
                        renderSummary(
                            'Analysis complete: ' + fallbackStats.totalSegments + ' active segments',
                            'Avg segment ' + formatPercent(fallbackStats.avgSegmentSec) + ' s, avg active ' + formatPercent(fallbackStats.avgActivePercent) + '%'
                        );
                        renderCutPreview();
                    }, function (err) {
                        if (runId !== state.analysisRunId) return;
                        state.cutPreview = null;
                        stopCurrentPreviewAudio();
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        hideSummary();
                        hideCutPreview();
                        setStatus('error', err && err.message ? err.message : 'Analysis failed');
                        console.error(err);
                    });
                } catch (e2) {
                    if (runId !== state.analysisRunId) return;
                    state.cutPreview = null;
                    stopCurrentPreviewAudio();
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    hideSummary();
                    hideCutPreview();
                    setStatus('error', e2 && e2.message ? e2.message : 'Analysis failed');
                    console.error(e2);
                }
                return;
            }

            state.isAnalyzing = false;
            hideProgress();
            setButtonsDisabled(false);
            hideSummary();
            hideCutPreview();
            var errMsg = window.NODE_INIT_ERROR ? 'Node init failed: ' + window.NODE_INIT_ERROR : 'No analyzer bridge available';
            setStatus('error', errMsg);
        }

        state.analysisRunId++;
        state.isAnalyzing = true;
        setButtonsDisabled(true);
        hideSummary();
        hideCutPreview();
        stopCurrentPreviewAudio();
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

        var applyPayload = buildApplyCutsPayload();
        if (!applyPayload || !applyPayload.trackIndices || applyPayload.trackIndices.length === 0) {
            setStatus('error', 'No tracks selected for apply');
            return;
        }

        setStatus('analyzing', 'Cutting clips...');
        setProgress(0, 'Preparing cuts...');
        setButtonsDisabled(true);
        stopCurrentPreviewAudio();

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
            segments: applyPayload.segments,
            trackIndices: applyPayload.trackIndices,
            ticksPerSecond: TICKS_PER_SECOND
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
    }
    function resetUI() {
        state.analysisResult = null;
        state.cutPreview = null;
        state.cutPreviewFilterState = 'all';
        state.cutPreviewTrackFilter = 'all';
        state.cutPreviewSort = 'time';
        state.cutPreviewZoom = 90;
        stopCurrentPreviewAudio();
        hideProgress();
        hideSummary();
        hideCutPreview();
        if (els.btnApply) els.btnApply.disabled = true;
        if (els.btnReset) els.btnReset.disabled = true;
        if (els.btnAnalyze) els.btnAnalyze.disabled = false;
        setStatus('idle', 'Ready');
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
                t.ticksPerSecond = result.ticksPerSecond || TICKS_PER_SECOND;
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
            if (state.analysisResult) {
                state.cutPreview = buildCutPreviewState(state.analysisResult);
                renderCutPreview();
            }
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

    function parseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function round(v, digits) {
        if (typeof v !== 'number' || !isFinite(v)) return 0;
        var p = Math.pow(10, digits || 0);
        return Math.round(v * p) / p;
    }

    function formatSigned(v, digits) {
        var num = parseNum(v, 0);
        var txt = round(num, digits || 1).toFixed(digits || 1);
        return (num >= 0 ? '+' : '') + txt;
    }

    function formatClock(sec) {
        var value = parseNum(sec, 0);
        if (value < 0) value = 0;
        var mins = Math.floor(value / 60);
        var wholeSec = Math.floor(value % 60);
        var millis = Math.floor((value - Math.floor(value)) * 1000);
        var secText = wholeSec < 10 ? ('0' + wholeSec) : String(wholeSec);
        var msText = String(millis);
        while (msText.length < 3) msText = '0' + msText;
        return mins + ':' + secText + '.' + msText;
    }

    function formatDurationMs(ms) {
        var sec = Math.max(0, parseNum(ms, 0) / 1000);
        return round(sec, 2) + 's';
    }

    function getTrackByIndex(trackIndex) {
        for (var i = 0; i < state.tracks.length; i++) {
            if (state.tracks[i] && state.tracks[i].index === trackIndex) return state.tracks[i];
        }
        return state.tracks[trackIndex] || null;
    }

    function getTrackDisplayName(trackIndex) {
        var track = getTrackByIndex(trackIndex);
        if (track && track.name) return track.name;
        return 'Track ' + (trackIndex + 1);
    }

    function normalizeCutPreviewItem(raw, fallbackTrackIndex, counter) {
        var stateValue = raw && raw.state ? String(raw.state) : 'kept';
        if (stateValue === 'active') stateValue = 'kept';
        if (stateValue !== 'kept' && stateValue !== 'near_miss' && stateValue !== 'suppressed') {
            stateValue = 'kept';
        }

        var start = parseNum(raw && raw.start, 0);
        var end = parseNum(raw && raw.end, start);
        if (end <= start) end = start + 0.01;

        var trackIndex = parseInt(raw && raw.trackIndex, 10);
        if (!isFinite(trackIndex)) trackIndex = fallbackTrackIndex;

        var item = {
            id: raw && raw.id ? String(raw.id) : ('cp_ui_' + trackIndex + '_' + Math.round(start * 1000) + '_' + Math.round(end * 1000) + '_' + counter),
            trackIndex: trackIndex,
            trackName: raw && raw.trackName ? String(raw.trackName) : getTrackDisplayName(trackIndex),
            trackColor: raw && raw.trackColor ? String(raw.trackColor) : TRACK_COLORS[Math.abs(trackIndex) % TRACK_COLORS.length],
            laneIndex: isFinite(parseInt(raw && raw.laneIndex, 10)) ? parseInt(raw && raw.laneIndex, 10) : trackIndex,
            start: round(start, 4),
            end: round(end, 4),
            durationMs: Math.max(1, Math.round((end - start) * 1000)),
            state: stateValue,
            selected: (raw && typeof raw.selected === 'boolean') ? raw.selected : (stateValue === 'kept'),
            score: Math.max(0, Math.min(100, Math.round(parseNum(raw && raw.score, stateValue === 'kept' ? 70 : 35)))),
            scoreLabel: raw && raw.scoreLabel ? String(raw.scoreLabel) : 'weak',
            reasons: (raw && raw.reasons && raw.reasons.length) ? raw.reasons.slice(0) : ['No detailed analyzer reason available'],
            typeLabel: raw && raw.typeLabel ? String(raw.typeLabel) : (stateValue === 'suppressed' ? 'suppressed_bleed' : 'unknown'),
            typeConfidence: Math.max(0, Math.min(100, round(parseNum(raw && raw.typeConfidence, stateValue === 'kept' ? 70 : 35), 1))),
            sourceClipIndex: (raw && raw.sourceClipIndex !== undefined && raw.sourceClipIndex !== null) ? parseInt(raw.sourceClipIndex, 10) : null,
            mediaPath: raw && raw.mediaPath ? String(raw.mediaPath) : '',
            sourceStartSec: parseNum(raw && raw.sourceStartSec, start),
            sourceEndSec: parseNum(raw && raw.sourceEndSec, end),
            decisionStage: raw && raw.decisionStage ? String(raw.decisionStage) : 'legacy_result',
            overlapInfo: raw && raw.overlapInfo ? raw.overlapInfo : null,
            metrics: raw && raw.metrics ? raw.metrics : {
                meanOverThreshold: 0,
                peakOverThreshold: 0,
                spectralConfidence: 0,
                overlapPenalty: 0,
                speakerLockScore: 0,
                postprocessPenalty: 0
            }
        };

        if (!item.reasons || item.reasons.length === 0) {
            item.reasons = ['Heuristic ranking applied'];
        }
        if (item.score >= 70) item.scoreLabel = 'strong';
        else if (item.score >= 45 && item.scoreLabel !== 'strong') item.scoreLabel = 'borderline';
        else if (item.scoreLabel !== 'strong' && item.scoreLabel !== 'borderline') item.scoreLabel = 'weak';
        return item;
    }

    function createFallbackCutPreviewFromSegments(result) {
        var items = [];
        var segsByTrack = (result && result.segments) ? result.segments : [];
        var idCounter = 0;

        for (var t = 0; t < segsByTrack.length; t++) {
            var segs = segsByTrack[t] || [];
            for (var s = 0; s < segs.length; s++) {
                var seg = segs[s];
                if (!seg) continue;
                var st = parseNum(seg.start, 0);
                var en = parseNum(seg.end, st);
                if (!(en > st)) continue;
                idCounter++;
                items.push(normalizeCutPreviewItem({
                    id: 'fallback_' + t + '_' + s + '_' + idCounter,
                    trackIndex: t,
                    trackName: getTrackDisplayName(t),
                    start: st,
                    end: en,
                    state: seg.state === 'suppressed' ? 'suppressed' : 'kept',
                    selected: seg.state !== 'suppressed',
                    score: seg.state === 'suppressed' ? 28 : 72,
                    scoreLabel: seg.state === 'suppressed' ? 'weak' : 'strong',
                    reasons: seg.state === 'suppressed' ? ['Suppressed by legacy overlap result'] : ['Kept in legacy segment output'],
                    typeLabel: seg.state === 'suppressed' ? 'suppressed_bleed' : 'primary_speech',
                    typeConfidence: seg.state === 'suppressed' ? 62 : 72,
                    mediaPath: (state.tracks[t] && state.tracks[t].path) ? state.tracks[t].path : '',
                    sourceStartSec: st,
                    sourceEndSec: en,
                    decisionStage: 'legacy_fallback'
                }, t, idCounter));
            }
        }

        var lanes = [];
        var laneCount = Math.max(state.tracks.length, segsByTrack.length);
        for (var i = 0; i < laneCount; i++) {
            lanes.push({
                laneIndex: i,
                trackIndex: i,
                trackName: getTrackDisplayName(i),
                trackColor: TRACK_COLORS[i % TRACK_COLORS.length],
                itemIds: []
            });
        }

        return {
            items: items,
            lanes: lanes,
            summary: null
        };
    }

    function ticksToSec(ticks, ticksPerSecond) {
        var num = parseNum(ticks, 0);
        var rate = parseNum(ticksPerSecond, TICKS_PER_SECOND);
        if (rate <= 0) rate = TICKS_PER_SECOND;
        return num / rate;
    }

    function hydrateItemSourceMapping(item) {
        var track = getTrackByIndex(item.trackIndex);
        if (!track || !track.clips || track.clips.length === 0) return item;

        var ticksRate = track.ticksPerSecond || TICKS_PER_SECOND;
        var best = null;
        var bestCoverage = 0;

        for (var c = 0; c < track.clips.length; c++) {
            var clip = track.clips[c];
            if (!clip) continue;
            var clipStart = ticksToSec(clip.startTicks, ticksRate);
            var clipEnd = ticksToSec(clip.endTicks, ticksRate);
            var overlapStart = Math.max(item.start, clipStart);
            var overlapEnd = Math.min(item.end, clipEnd);
            var coverage = overlapEnd - overlapStart;
            if (coverage <= 0) continue;
            if (!clip.mediaPath || String(clip.mediaPath).charAt(0) === '[') continue;

            if (coverage > bestCoverage) {
                var clipIn = ticksToSec(clip.inPointTicks, ticksRate);
                bestCoverage = coverage;
                best = {
                    sourceClipIndex: clip.clipIndex !== undefined ? clip.clipIndex : c,
                    mediaPath: clip.mediaPath,
                    sourceStartSec: clipIn + (overlapStart - clipStart),
                    sourceEndSec: clipIn + (overlapEnd - clipStart)
                };
            }
        }

        if (best) {
            item.sourceClipIndex = best.sourceClipIndex;
            item.mediaPath = best.mediaPath;
            item.sourceStartSec = round(best.sourceStartSec, 4);
            item.sourceEndSec = round(best.sourceEndSec, 4);
        }
        return item;
    }

    function computeCutPreviewSummary(items) {
        var summary = {
            totalItems: items.length,
            keptCount: 0,
            nearMissCount: 0,
            suppressedCount: 0,
            selectedCount: 0,
            avgScore: 0
        };
        var scoreSum = 0;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.state === 'kept') summary.keptCount++;
            else if (item.state === 'near_miss') summary.nearMissCount++;
            else summary.suppressedCount++;
            if (item.selected) summary.selectedCount++;
            scoreSum += parseNum(item.score, 0);
        }
        summary.avgScore = items.length > 0 ? round(scoreSum / items.length, 1) : 0;
        return summary;
    }

    function getMaxTrackIndex(items) {
        var maxIdx = -1;
        for (var i = 0; i < items.length; i++) {
            if (items[i].trackIndex > maxIdx) maxIdx = items[i].trackIndex;
        }
        return maxIdx;
    }

    function isTrackFilterValid(lanes, value) {
        if (!value || value === 'all') return true;
        var trackIndex = parseInt(value, 10);
        if (!isFinite(trackIndex)) return false;
        for (var i = 0; i < lanes.length; i++) {
            if (lanes[i].trackIndex === trackIndex) return true;
        }
        return false;
    }

    function buildCutPreviewState(result) {
        var base = (result && result.cutPreview && result.cutPreview.items) ? result.cutPreview : null;
        if (!base) {
            base = createFallbackCutPreviewFromSegments(result);
        }

        var rawItems = base.items || [];
        var normalizedItems = [];
        var idCounter = 0;

        for (var i = 0; i < rawItems.length; i++) {
            idCounter++;
            var fallbackTrack = isFinite(parseInt(rawItems[i] && rawItems[i].trackIndex, 10))
                ? parseInt(rawItems[i].trackIndex, 10)
                : 0;
            var item = normalizeCutPreviewItem(rawItems[i], fallbackTrack, idCounter);
            hydrateItemSourceMapping(item);
            normalizedItems.push(item);
        }

        normalizedItems.sort(function (a, b) {
            if (a.start !== b.start) return a.start - b.start;
            if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
            return a.end - b.end;
        });

        var laneCount = Math.max(state.tracks.length, getMaxTrackIndex(normalizedItems) + 1);
        var lanes = [];
        var perLaneIds = {};

        for (var li = 0; li < laneCount; li++) {
            perLaneIds[li] = [];
        }
        for (i = 0; i < normalizedItems.length; i++) {
            if (!perLaneIds[normalizedItems[i].trackIndex]) perLaneIds[normalizedItems[i].trackIndex] = [];
            perLaneIds[normalizedItems[i].trackIndex].push(normalizedItems[i].id);
        }

        if (base.lanes && base.lanes.length) {
            for (i = 0; i < base.lanes.length; i++) {
                var ln = base.lanes[i];
                var laneTrackIndex = isFinite(parseInt(ln.trackIndex, 10))
                    ? parseInt(ln.trackIndex, 10)
                    : (isFinite(parseInt(ln.laneIndex, 10)) ? parseInt(ln.laneIndex, 10) : i);
                lanes.push({
                    laneIndex: isFinite(parseInt(ln.laneIndex, 10)) ? parseInt(ln.laneIndex, 10) : laneTrackIndex,
                    trackIndex: laneTrackIndex,
                    trackName: ln.trackName || getTrackDisplayName(laneTrackIndex),
                    trackColor: ln.trackColor || TRACK_COLORS[laneTrackIndex % TRACK_COLORS.length],
                    itemIds: perLaneIds[laneTrackIndex] || []
                });
            }
        }

        if (!lanes.length) {
            for (i = 0; i < laneCount; i++) {
                lanes.push({
                    laneIndex: i,
                    trackIndex: i,
                    trackName: getTrackDisplayName(i),
                    trackColor: TRACK_COLORS[i % TRACK_COLORS.length],
                    itemIds: perLaneIds[i] || []
                });
            }
        }

        if (!isTrackFilterValid(lanes, state.cutPreviewTrackFilter)) {
            state.cutPreviewTrackFilter = 'all';
        }

        return {
            items: normalizedItems,
            lanes: lanes,
            summary: computeCutPreviewSummary(normalizedItems)
        };
    }

    function getVisibleCutPreviewItems() {
        if (!state.cutPreview || !state.cutPreview.items) return [];
        var out = [];

        for (var i = 0; i < state.cutPreview.items.length; i++) {
            var item = state.cutPreview.items[i];
            if (state.cutPreviewFilterState !== 'all' && item.state !== state.cutPreviewFilterState) continue;
            if (state.cutPreviewTrackFilter !== 'all') {
                var filterTrack = parseInt(state.cutPreviewTrackFilter, 10);
                if (isFinite(filterTrack) && item.trackIndex !== filterTrack) continue;
            }
            out.push(item);
        }

        out.sort(function (a, b) {
            if (state.cutPreviewSort === 'score') {
                if (a.score !== b.score) return b.score - a.score;
                if (a.start !== b.start) return a.start - b.start;
                return a.trackIndex - b.trackIndex;
            }
            if (a.start !== b.start) return a.start - b.start;
            if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
            return a.end - b.end;
        });

        return out;
    }

    function renderCutPreview() {
        if (!state.cutPreview || !state.cutPreview.items || state.cutPreview.items.length === 0) {
            hideCutPreview();
            return;
        }

        if (els.cutPreviewSection) {
            els.cutPreviewSection.style.display = 'block';
        }
        state.cutPreview.summary = computeCutPreviewSummary(state.cutPreview.items);

        renderCutPreviewControls();
        renderCutPreviewTimeline();
        renderCutPreviewList();
    }

    function renderCutPreviewControls() {
        if (!state.cutPreview || !state.cutPreview.summary) return;

        if (els.cutPreviewMeta) {
            var sum = state.cutPreview.summary;
            els.cutPreviewMeta.textContent =
                sum.totalItems + ' snippets | kept ' + sum.keptCount +
                ' | near miss ' + sum.nearMissCount +
                ' | suppressed ' + sum.suppressedCount +
                ' | selected ' + sum.selectedCount +
                ' | avg score ' + sum.avgScore;
        }

        var filterBtns = document.querySelectorAll('.cut-preview-filter-btn');
        for (var i = 0; i < filterBtns.length; i++) {
            var btn = filterBtns[i];
            var stateVal = btn.getAttribute('data-filter-state');
            if (stateVal === state.cutPreviewFilterState) btn.classList.add('is-active');
            else btn.classList.remove('is-active');
        }

        if (els.cutPreviewTrackFilter) {
            var html = '<option value="all">All Tracks</option>';
            for (i = 0; i < state.cutPreview.lanes.length; i++) {
                var lane = state.cutPreview.lanes[i];
                html += '<option value="' + lane.trackIndex + '"' +
                    (String(lane.trackIndex) === String(state.cutPreviewTrackFilter) ? ' selected' : '') + '>' +
                    escapeHtml('Track ' + (lane.trackIndex + 1) + ' - ' + lane.trackName) +
                    '</option>';
            }
            els.cutPreviewTrackFilter.innerHTML = html;
        }

        if (els.cutPreviewSort) {
            els.cutPreviewSort.value = state.cutPreviewSort;
        }
        if (els.cutPreviewZoom) {
            els.cutPreviewZoom.value = String(state.cutPreviewZoom);
        }
    }

    function getTimelineTickStep(durationSec) {
        if (durationSec <= 20) return 2;
        if (durationSec <= 60) return 5;
        if (durationSec <= 180) return 10;
        if (durationSec <= 600) return 30;
        if (durationSec <= 1800) return 60;
        return 120;
    }

    function renderCutPreviewTimeline() {
        if (!els.cutPreviewTimeline || !state.cutPreview) return;

        var visibleItems = getVisibleCutPreviewItems();
        if (!visibleItems.length) {
            els.cutPreviewTimeline.innerHTML = '<div class="cp-empty">No snippets for current filter.</div>';
            return;
        }

        var lanes = [];
        for (var i = 0; i < state.cutPreview.lanes.length; i++) {
            var lane = state.cutPreview.lanes[i];
            if (state.cutPreviewTrackFilter !== 'all' && String(lane.trackIndex) !== String(state.cutPreviewTrackFilter)) continue;
            lanes.push(lane);
        }

        if (!lanes.length) {
            els.cutPreviewTimeline.innerHTML = '<div class="cp-empty">No lanes available for current filter.</div>';
            return;
        }

        var maxEnd = 0;
        for (i = 0; i < state.cutPreview.items.length; i++) {
            if (state.cutPreview.items[i].end > maxEnd) maxEnd = state.cutPreview.items[i].end;
        }
        var totalDurationSec = Math.max(parseNum(state.analysisResult && state.analysisResult.totalDurationSec, maxEnd), maxEnd);
        var pixelsPerSec = parseNum(state.cutPreviewZoom, 90);
        var timelineWidth = Math.max(860, Math.round(totalDurationSec * pixelsPerSec) + 20);

        var byTrack = {};
        for (i = 0; i < visibleItems.length; i++) {
            var item = visibleItems[i];
            if (!byTrack[item.trackIndex]) byTrack[item.trackIndex] = [];
            byTrack[item.trackIndex].push(item);
        }

        var tickStep = getTimelineTickStep(totalDurationSec);
        var axisTicks = '';
        for (var ts = 0; ts <= totalDurationSec + 0.0001; ts += tickStep) {
            var left = Math.round(ts * pixelsPerSec);
            axisTicks += ''
                + '<div class="cp-axis-tick" style="left:' + left + 'px;">'
                + '  <span class="cp-axis-tick-label">' + escapeHtml(formatClock(ts)) + '</span>'
                + '</div>';
        }

        var html = '<div class="cp-timeline-scroll">';
        html += '<div class="cp-timeline-row cp-axis-row">';
        html += '<div class="cp-lane-label">Time</div>';
        html += '<div class="cp-axis-track" style="width:' + timelineWidth + 'px;">' + axisTicks + '</div>';
        html += '</div>';

        for (var l = 0; l < lanes.length; l++) {
            var laneObj = lanes[l];
            var laneItems = byTrack[laneObj.trackIndex] || [];
            html += '<div class="cp-timeline-row">';
            html += '<div class="cp-lane-label">' + escapeHtml('T' + (laneObj.trackIndex + 1) + ' ' + laneObj.trackName) + '</div>';
            html += '<div class="cp-lane-track" style="width:' + timelineWidth + 'px;">';

            for (var si = 0; si < laneItems.length; si++) {
                var snippet = laneItems[si];
                var leftPx = Math.max(0, Math.round(snippet.start * pixelsPerSec));
                var widthPx = Math.max(6, Math.round((snippet.end - snippet.start) * pixelsPerSec));
                var snippetClass = 'cp-snippet cp-state-' + snippet.state;
                if (!snippet.selected) snippetClass += ' cp-unselected';
                if (state.currentPlayingPreviewId === snippet.id) snippetClass += ' cp-playing';

                html += ''
                    + '<button type="button" class="' + snippetClass + '"'
                    + ' data-item-id="' + escapeHtml(snippet.id) + '"'
                    + ' title="' + escapeHtml('Score ' + snippet.score + ' | ' + snippet.typeLabel + ' | ' + formatClock(snippet.start) + '-' + formatClock(snippet.end)) + '"'
                    + ' style="left:' + leftPx + 'px;width:' + widthPx + 'px;">'
                    + escapeHtml(String(snippet.score))
                    + '</button>';
            }

            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        els.cutPreviewTimeline.innerHTML = html;
    }

    function renderCutPreviewList() {
        if (!els.cutPreviewList || !state.cutPreview) return;

        var items = getVisibleCutPreviewItems();
        if (!items.length) {
            els.cutPreviewList.innerHTML = '<div class="cp-empty">No snippets for current filter.</div>';
            return;
        }

        var html = '';
        html += '<div class="cp-list-head">'
            + '<div>Pick</div>'
            + '<div>Track</div>'
            + '<div>Time</div>'
            + '<div>State</div>'
            + '<div>Score / Type</div>'
            + '<div>Reasons / Metrics</div>'
            + '</div>';
        html += '<div class="cp-list-body">';

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var stateBadgeClass = 'cp-badge cp-badge-state-' + item.state;
            var scoreBadgeClass = 'cp-badge cp-badge-score-' + item.scoreLabel;
            var playClass = 'cp-play-btn cp-item-play';
            if (state.currentPlayingPreviewId === item.id) playClass += ' is-playing';

            var reasonsText = item.reasons && item.reasons.length ? item.reasons.join(' • ') : 'No reasons';
            var metrics = item.metrics || {};
            var metricsText = 'Pk ' + formatSigned(parseNum(metrics.peakOverThreshold, 0), 1) + 'dB'
                + ' | Mn ' + formatSigned(parseNum(metrics.meanOverThreshold, 0), 1) + 'dB'
                + ' | Sp ' + Math.round(parseNum(metrics.spectralConfidence, 0) * 100) + '%'
                + ' | Ov ' + Math.round(parseNum(metrics.overlapPenalty, 0) * 100) + '%';

            html += '<div class="cp-list-row">';
            html += '<div class="cp-row-main">';
            html += '<input type="checkbox" class="cp-checkbox cp-item-select" data-item-id="' + escapeHtml(item.id) + '"' + (item.selected ? ' checked' : '') + '>';
            html += '<button type="button" class="' + playClass + '" data-item-id="' + escapeHtml(item.id) + '" title="Preview snippet">▶</button>';
            html += '</div>';
            html += '<div class="cp-time">' + escapeHtml('T' + (item.trackIndex + 1)) + '</div>';
            html += '<div class="cp-time">' + escapeHtml(formatClock(item.start) + ' - ' + formatClock(item.end) + ' (' + formatDurationMs(item.durationMs) + ')') + '</div>';
            html += '<div><span class="' + stateBadgeClass + '">' + escapeHtml(item.state) + '</span></div>';
            html += '<div class="cp-row-details">';
            html += '  <div class="cp-row-topline">';
            html += '    <span class="' + scoreBadgeClass + '">' + escapeHtml(item.score + ' ' + item.scoreLabel) + '</span>';
            html += '    <span class="cp-badge">' + escapeHtml(item.typeLabel + ' (' + round(item.typeConfidence, 1) + '%)') + '</span>';
            html += '  </div>';
            html += '  <div class="cp-row-bottomline cp-metrics">' + escapeHtml(metricsText) + '</div>';
            html += '</div>';
            html += '<div class="cp-row-details">';
            html += '  <div class="cp-reasons">' + escapeHtml(reasonsText) + '</div>';
            html += '  <div class="cp-metrics">' + escapeHtml('Stage: ' + item.decisionStage) + '</div>';
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        els.cutPreviewList.innerHTML = html;
    }

    function getCutPreviewItemById(itemId) {
        if (!state.cutPreview || !state.cutPreview.items) return null;
        for (var i = 0; i < state.cutPreview.items.length; i++) {
            if (state.cutPreview.items[i].id === itemId) return state.cutPreview.items[i];
        }
        return null;
    }

    function setCutPreviewItemSelected(itemId, selected) {
        var item = getCutPreviewItemById(itemId);
        if (!item) return;
        item.selected = !!selected;
        renderCutPreview();
    }

    function findDataElement(startEl, attrName) {
        var cur = startEl;
        while (cur && cur !== document.body) {
            if (cur.getAttribute && cur.getAttribute(attrName)) return cur;
            cur = cur.parentNode;
        }
        return null;
    }

    function resolveMediaPathToAudioUrl(mediaPath) {
        if (!mediaPath) return null;
        var text = String(mediaPath);
        if (!text || text.charAt(0) === '[') return null;

        if (/^(https?:|file:|blob:)/i.test(text)) return text;

        var normalized = text.replace(/\\/g, '/');
        var absWin = /^[A-Za-z]:\//.test(normalized);
        var absUnix = normalized.charAt(0) === '/';
        var uncPath = normalized.indexOf('//') === 0;

        function toFileUrl(absPath) {
            var p = String(absPath).replace(/\\/g, '/');
            if (/^[A-Za-z]:\//.test(p)) return 'file:///' + encodeURI(p);
            if (p.indexOf('//') === 0) return 'file:' + encodeURI(p);
            if (p.charAt(0) === '/') return 'file://' + encodeURI(p);
            return null;
        }

        if (absWin || absUnix || uncPath) {
            return toFileUrl(normalized);
        }

        if (typeof path !== 'undefined' && path.resolve) {
            try {
                var extensionPath = AutoCastBridge.getExtensionPath();
                if (!extensionPath || extensionPath === '.' || extensionPath.indexOf('/mock/') === 0) {
                    var pathname = decodeURIComponent(window.location.pathname || '');
                    if (window.navigator.platform.indexOf('Win') > -1 && pathname.charAt(0) === '/') {
                        pathname = pathname.substring(1);
                    }
                    extensionPath = path.dirname(pathname);
                    if (path.basename(extensionPath) === 'panel' &&
                        path.basename(path.dirname(extensionPath)) === 'apps') {
                        extensionPath = path.resolve(extensionPath, '..', '..');
                    }
                }
                var resolved = path.resolve(extensionPath, text);
                return toFileUrl(resolved);
            } catch (e) {
                console.warn('[AutoCast] Failed to resolve media path for preview:', e);
            }
        }

        return text;
    }

    function stopCurrentPreviewAudio(skipRender) {
        if (state.currentAudio && state.currentAudio.audio) {
            try {
                state.currentAudio.audio.pause();
            } catch (e) { }
        }
        state.currentAudio = null;
        state.currentPlayingPreviewId = null;
        if (!skipRender) renderCutPreview();
    }

    function toggleSnippetPreview(itemId) {
        var item = getCutPreviewItemById(itemId);
        if (!item) return;

        if (state.currentPlayingPreviewId === itemId) {
            stopCurrentPreviewAudio(false);
            setStatus('idle', 'Preview stopped');
            return;
        }

        var mediaUrl = resolveMediaPathToAudioUrl(item.mediaPath);
        if (!mediaUrl) {
            setStatus('error', 'Snippet preview unavailable (no playable media path)');
            return;
        }

        stopCurrentPreviewAudio(true);

        var snippetStart = parseNum(item.sourceStartSec, item.start);
        var snippetEnd = parseNum(item.sourceEndSec, item.end);
        if (snippetEnd <= snippetStart) snippetEnd = snippetStart + 0.08;

        var startAt = Math.max(0, snippetStart - AUDIO_PREVIEW_PREROLL_SEC);
        var stopAt = snippetEnd + AUDIO_PREVIEW_POSTROLL_SEC;

        var audio = new Audio();
        audio.preload = 'auto';
        audio.src = mediaUrl;

        state.currentAudio = {
            audio: audio,
            endSec: stopAt,
            itemId: itemId
        };
        state.currentPlayingPreviewId = itemId;
        renderCutPreview();

        audio.addEventListener('loadedmetadata', function () {
            try {
                var maxStart = isFinite(audio.duration) ? Math.max(0, audio.duration - 0.02) : startAt;
                audio.currentTime = Math.min(startAt, maxStart);
            } catch (e) { }

            var playPromise = audio.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(function (err) {
                    stopCurrentPreviewAudio(false);
                    setStatus('error', 'Preview playback failed: ' + (err && err.message ? err.message : 'unknown error'));
                });
            }
        });

        audio.addEventListener('timeupdate', function () {
            if (!state.currentAudio || state.currentAudio.itemId !== itemId) return;
            if (audio.currentTime >= state.currentAudio.endSec) {
                stopCurrentPreviewAudio(false);
                setStatus('idle', 'Preview finished');
            }
        });

        audio.addEventListener('ended', function () {
            if (state.currentPlayingPreviewId === itemId) {
                stopCurrentPreviewAudio(false);
            }
        });

        audio.addEventListener('error', function () {
            stopCurrentPreviewAudio(false);
            setStatus('error', 'Could not play snippet preview');
        });

        setStatus('analyzing', 'Previewing snippet...');
    }

    function mergeSegmentsForApply(segments) {
        if (!segments || segments.length === 0) return [];

        var cleaned = [];
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (!seg) continue;
            var st = parseNum(seg.start, 0);
            var en = parseNum(seg.end, st);
            if (!(en > st)) continue;
            cleaned.push({ start: st, end: en, state: 'active' });
        }

        cleaned.sort(function (a, b) {
            if (a.start !== b.start) return a.start - b.start;
            return a.end - b.end;
        });

        var merged = [];
        for (i = 0; i < cleaned.length; i++) {
            var cur = cleaned[i];
            if (!merged.length) {
                merged.push({ start: cur.start, end: cur.end, state: 'active' });
                continue;
            }
            var prev = merged[merged.length - 1];
            if (cur.start <= prev.end + 0.0005) {
                if (cur.end > prev.end) prev.end = cur.end;
            } else {
                merged.push({ start: cur.start, end: cur.end, state: 'active' });
            }
        }

        return merged;
    }

    function buildApplyCutsPayload() {
        if (!state.analysisResult) return null;

        var trackIndices = [];
        var segments = [];

        for (var i = 0; i < state.tracks.length; i++) {
            if (state.tracks[i].selected === false) continue;
            trackIndices.push(state.tracks[i].index !== undefined ? state.tracks[i].index : i);

            if (state.cutPreview && state.cutPreview.items && state.cutPreview.items.length > 0) {
                var selectedSegments = [];
                for (var j = 0; j < state.cutPreview.items.length; j++) {
                    var item = state.cutPreview.items[j];
                    if (item.trackIndex !== i || !item.selected) continue;
                    selectedSegments.push({
                        start: item.start,
                        end: item.end,
                        state: 'active'
                    });
                }
                segments.push(mergeSegmentsForApply(selectedSegments));
            } else {
                var legacySegs = (state.analysisResult.segments && state.analysisResult.segments[i])
                    ? state.analysisResult.segments[i]
                    : [];
                var activeLegacy = [];
                for (var k = 0; k < legacySegs.length; k++) {
                    var lseg = legacySegs[k];
                    if (!lseg || lseg.state === 'suppressed') continue;
                    activeLegacy.push({
                        start: lseg.start,
                        end: lseg.end,
                        state: 'active'
                    });
                }
                segments.push(mergeSegmentsForApply(activeLegacy));
            }
        }

        return {
            segments: segments,
            trackIndices: trackIndices
        };
    }

    function bindCutPreviewControls() {
        if (els.cutPreviewSection) {
            els.cutPreviewSection.addEventListener('click', function (evt) {
                var target = evt.target;
                if (!target) return;

                var filterBtn = findDataElement(target, 'data-filter-state');
                if (filterBtn && filterBtn.className.indexOf('cut-preview-filter-btn') !== -1) {
                    state.cutPreviewFilterState = filterBtn.getAttribute('data-filter-state') || 'all';
                    renderCutPreview();
                    return;
                }

                var playBtn = findDataElement(target, 'data-item-id');
                if (playBtn && playBtn.className.indexOf('cp-item-play') !== -1) {
                    toggleSnippetPreview(playBtn.getAttribute('data-item-id'));
                    return;
                }

                var snippetBtn = findDataElement(target, 'data-item-id');
                if (snippetBtn && snippetBtn.className.indexOf('cp-snippet') !== -1) {
                    var itemId = snippetBtn.getAttribute('data-item-id');
                    var item = getCutPreviewItemById(itemId);
                    if (!item) return;
                    item.selected = !item.selected;
                    renderCutPreview();
                    return;
                }
            });

            els.cutPreviewSection.addEventListener('change', function (evt) {
                var target = evt.target;
                if (!target) return;
                if (target.className && target.className.indexOf('cp-item-select') !== -1) {
                    setCutPreviewItemSelected(target.getAttribute('data-item-id'), target.checked);
                }
            });
        }

        if (els.cutPreviewTrackFilter) {
            els.cutPreviewTrackFilter.addEventListener('change', function () {
                state.cutPreviewTrackFilter = this.value || 'all';
                renderCutPreview();
            });
        }

        if (els.cutPreviewSort) {
            els.cutPreviewSort.addEventListener('change', function () {
                state.cutPreviewSort = this.value || 'time';
                renderCutPreview();
            });
        }

        if (els.cutPreviewZoom) {
            els.cutPreviewZoom.addEventListener('input', function () {
                state.cutPreviewZoom = clamp(parseNum(this.value, 90), 30, 260);
                renderCutPreviewTimeline();
            });
        }
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

    bindCutPreviewControls();

    updateModeIndicator();

    hideProgress();
    hideCutPreview();
    renderTracks();
    if (els.btnApply) els.btnApply.disabled = true;
    if (els.btnReset) els.btnReset.disabled = true;
    setStatus('idle', 'Ready');

    // Auto-load track metadata, but no loudness scan on startup.
    setTimeout(loadTracksFromHost, 500);
})();

