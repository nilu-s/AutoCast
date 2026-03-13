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

    if (window.AutoCastAnalyzerClient && typeof window.AutoCastAnalyzerClient.create === 'function') {
        try {
            window.AutoCastAnalyzer = window.AutoCastAnalyzerClient.create({
                getExtensionPath: function () {
                    return AutoCastBridge.getExtensionPath();
                }
            });
        } catch (e) {
            window.NODE_INIT_ERROR = e.toString();
            console.error('[AutoCast] Failed to initialize analyzer client:', e);
        }
    }

    var state = {
        tracks: [],
        analysisResult: null,
        cutPreview: null,
        isAnalyzing: false,
        perTrackSensitivity: {},
        currentAudio: null,
        currentPlayingPreviewId: null,
        analysisRunId: 0,
        activeSnippetId: null,
        previewMasterGain: 1,
        previewTrackGain: {},
        previewAudioContext: null,
        currentPreviewInfo: null,
        panelPageMode: 'setup',
        cutPreviewZoom: 0,
        cutPreviewPixelsPerSec: 0,
        cutPreviewViewStartSec: 0,
        navigatorDrag: null,
        cutPreviewRenderPending: false,
        cutPreviewRenderHandle: null
    };

    var TRACK_COLORS = [
        '#4ea1f3', '#4caf50', '#ff9800', '#e91e63',
        '#9c27b0', '#00bcd4', '#ffeb3b', '#795548'
    ];
    var TICKS_PER_SECOND = 254016000000;
    var AUDIO_PREVIEW_PREROLL_SEC = 0.2;
    var AUDIO_PREVIEW_POSTROLL_SEC = 0.2;

    function getApplyHelper() {
        if (window.AutoCastCutPreviewApply) return window.AutoCastCutPreviewApply;
        if (typeof require !== 'undefined') {
            try {
                return require('./cut_preview_apply');
            } catch (e) { }
        }
        return null;
    }

    function $(id) {
        return document.getElementById(id);
    }

    var els = {
        statusBar: $('statusBar'),
        statusText: $('statusText'),
        statusIcon: $('statusIcon'),
        panelRoot: document.querySelector('.panel'),
        tracksSection: $('tracksSection'),
        paramsSection: $('paramsSection'),
        footerActions: $('footerActions'),
        trackList: $('trackList'),
        progressContainer: $('progressContainer'),
        progressFill: $('progressFill'),
        progressText: $('progressText'),
        cutPreviewSection: $('cutPreviewSection'),
        cutPreviewMeta: $('cutPreviewMeta'),
        cutPreviewAnalysisMini: $('cutPreviewAnalysisMini'),
        cutPreviewTimeline: $('cutPreviewTimeline'),
        cutPreviewNavigator: $('cutPreviewNavigator'),
        cutPreviewInspector: $('cutPreviewInspector'),
        cutPreviewBackBtn: $('cutPreviewBackBtn'),
        cutPreviewApplyBtn: $('cutPreviewApplyBtn'),
        cutPreviewZoom: $('cutPreviewZoom'),
        cutPreviewFitBtn: $('cutPreviewFitBtn'),
        cutPreviewZoomLabel: $('cutPreviewZoomLabel'),
        cutPreviewVolumeMaster: $('cutPreviewVolumeMaster'),
        cutPreviewVolumeMasterLabel: $('cutPreviewVolumeMasterLabel'),
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

    var analyzerDefaultsCache = null;

    function cloneFlatObject(obj) {
        var out = {};
        if (!obj) return out;
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) out[key] = obj[key];
        }
        return out;
    }

    function resolveAnalyzerDefaults() {
        if (analyzerDefaultsCache) {
            return cloneFlatObject(analyzerDefaultsCache);
        }

        if (typeof require !== 'undefined') {
            try {
                var defaultsModule = require('../../packages/analyzer/src/analyzer_defaults.js');
                if (defaultsModule && defaultsModule.ANALYSIS_DEFAULTS) {
                    analyzerDefaultsCache = defaultsModule.ANALYSIS_DEFAULTS;
                    return cloneFlatObject(analyzerDefaultsCache);
                }
            } catch (e) { }
        }

        analyzerDefaultsCache = {};
        return {};
    }

    function getParams() {
        var debugMode = false;
        try {
            debugMode = (window.__AUTOCAST_DEBUG__ === true) ||
                (window.localStorage && window.localStorage.getItem('autocast.debug') === '1');
        } catch (e) { }

        var params = resolveAnalyzerDefaults();
        params.thresholdAboveFloorDb = parseInt(els.paramThreshold.value, 10);
        params.finalMinPeakDbFs = parseFloat(els.paramMinPeak.value);
        params.perTrackThresholdDb = getPerTrackSensitivity();
        params.debugMode = debugMode;
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
        if (els.cutPreviewApplyBtn) els.cutPreviewApplyBtn.disabled = disabled;
    }

    function setPanelPageMode(mode) {
        var reviewMode = mode === 'review';
        state.panelPageMode = reviewMode ? 'review' : 'setup';
        if (els.panelRoot && els.panelRoot.classList) {
            els.panelRoot.classList.toggle('is-review-mode', reviewMode);
        }
        if (els.cutPreviewSection) {
            els.cutPreviewSection.style.display = reviewMode ? 'block' : 'none';
        }
    }

    function hideCutPreview() {
        setPanelPageMode('setup');
        cancelPendingCutPreviewRender();
        state.navigatorDrag = null;
        if (els.cutPreviewMeta) els.cutPreviewMeta.textContent = '';
        if (els.cutPreviewAnalysisMini) els.cutPreviewAnalysisMini.innerHTML = '';
        if (els.cutPreviewTimeline) els.cutPreviewTimeline.innerHTML = '';
        if (els.cutPreviewNavigator) els.cutPreviewNavigator.innerHTML = '';
        if (els.cutPreviewInspector) els.cutPreviewInspector.innerHTML = '';
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
        els.modeIndicator.textContent = 'Mode: Cut Preview';
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
                if (p && p.charAt(0) !== '[') {
                    trackPaths.push(p);
                } else {
                    trackPaths.push(null);
                    if (p && !firstError) {
                        firstError = p;
                    }
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
                        state.activeSnippetId = null;
                        state.cutPreviewPixelsPerSec = 0;
                        state.cutPreviewViewStartSec = 0;
                        state.cutPreviewZoom = 0;
                        stopCurrentPreviewAudio();
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        setStatus('success', 'Analysis complete');
                        renderCutPreview();
                    }).catch(function (err) {
                        if (runId !== state.analysisRunId) return;
                        state.cutPreview = null;
                        state.activeSnippetId = null;
                        stopCurrentPreviewAudio();
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        hideCutPreview();
                        setStatus('error', err && err.message ? err.message : 'Analysis failed');
                        console.error(err);
                    });
                } catch (e) {
                    if (runId !== state.analysisRunId) return;
                    state.cutPreview = null;
                    state.activeSnippetId = null;
                    stopCurrentPreviewAudio();
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
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
                        state.activeSnippetId = null;
                        state.cutPreviewPixelsPerSec = 0;
                        state.cutPreviewViewStartSec = 0;
                        state.cutPreviewZoom = 0;
                        stopCurrentPreviewAudio();
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        setStatus('success', 'Analysis complete');
                        renderCutPreview();
                    }, function (err) {
                        if (runId !== state.analysisRunId) return;
                        state.cutPreview = null;
                        state.activeSnippetId = null;
                        stopCurrentPreviewAudio();
                        state.isAnalyzing = false;
                        hideProgress();
                        setButtonsDisabled(false);
                        hideCutPreview();
                        setStatus('error', err && err.message ? err.message : 'Analysis failed');
                        console.error(err);
                    });
                } catch (e2) {
                    if (runId !== state.analysisRunId) return;
                    state.cutPreview = null;
                    state.activeSnippetId = null;
                    stopCurrentPreviewAudio();
                    state.isAnalyzing = false;
                    hideProgress();
                    setButtonsDisabled(false);
                    hideCutPreview();
                    setStatus('error', e2 && e2.message ? e2.message : 'Analysis failed');
                    console.error(e2);
                }
                return;
            }

            state.isAnalyzing = false;
            hideProgress();
            setButtonsDisabled(false);
            hideCutPreview();
            var errMsg = window.NODE_INIT_ERROR ? 'Node init failed: ' + window.NODE_INIT_ERROR : 'No analyzer bridge available';
            setStatus('error', errMsg);
        }

        state.analysisRunId++;
        state.isAnalyzing = true;
        setButtonsDisabled(true);
        hideCutPreview();
        state.activeSnippetId = null;
        state.cutPreviewPixelsPerSec = 0;
        state.cutPreviewViewStartSec = 0;
        state.cutPreviewZoom = 0;
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
            setStatus('error', 'Apply payload unavailable (helper missing or no tracks selected).');
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
            fillSegments: applyPayload.fillSegments || [],
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
                    (result.clipsRemoved || 0) + ' removed' +
                    (result.fillMarkersCreated ? ', ' + result.fillMarkersCreated + ' fill markers' : '') +
                    ')'
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
        state.activeSnippetId = null;
        state.cutPreviewZoom = 0;
        state.cutPreviewPixelsPerSec = 0;
        state.cutPreviewViewStartSec = 0;
        state.navigatorDrag = null;
        stopCurrentPreviewAudio();
        hideProgress();
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
                var previousActiveId = state.activeSnippetId;
                state.cutPreview = buildCutPreviewState(state.analysisResult);
                if (!getCutPreviewItemById(previousActiveId)) {
                    state.activeSnippetId = null;
                } else {
                    state.activeSnippetId = previousActiveId;
                }
                renderCutPreview();
            }
            setStatus('success', state.tracks.length + ' track(s) loaded');
        });
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

    function formatSummaryDuration(sec) {
        var total = Math.max(0, parseNum(sec, 0));
        if (total < 60) return round(total, 1) + 's';
        var whole = Math.round(total);
        var h = Math.floor(whole / 3600);
        var m = Math.floor((whole % 3600) / 60);
        var s = whole % 60;
        if (h > 0) {
            return h + 'h ' + (m < 10 ? '0' + m : m) + 'm';
        }
        return m + 'm ' + (s < 10 ? '0' + s : s) + 's';
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

    function getTrackPreviewGain(trackIndex) {
        var key = String(trackIndex);
        var raw = state.previewTrackGain && state.previewTrackGain[key];
        if (raw === undefined || raw === null || !isFinite(raw)) return 1;
        return clamp(parseNum(raw, 1), 0, 3);
    }

    function setTrackPreviewGain(trackIndex, gainValue) {
        if (!state.previewTrackGain) state.previewTrackGain = {};
        state.previewTrackGain[String(trackIndex)] = clamp(parseNum(gainValue, 1), 0, 3);
    }

    function getEffectivePreviewGain(trackIndex) {
        return clamp(getTrackPreviewGain(trackIndex) * clamp(parseNum(state.previewMasterGain, 1), 0, 3), 0, 3);
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
        var rawMetrics = (raw && raw.metrics) ? raw.metrics : null;
        var rawDecisionStage = raw && raw.decisionStage ? String(raw.decisionStage) : 'legacy_result';
        var rawOrigin = raw && raw.origin ? String(raw.origin) : 'analysis_active';
        var rawTypeLabel = raw && raw.typeLabel ? String(raw.typeLabel) : (stateValue === 'suppressed' ? 'suppressed_bleed' : 'unknown');
        var rawAlwaysOpenFill = !!(
            (raw && raw.alwaysOpenFill === true) ||
            rawOrigin === 'always_open_fill' ||
            parseNum(rawMetrics && rawMetrics.alwaysOpenFill, 0) >= 0.5 ||
            rawDecisionStage.indexOf('always_open_fill') === 0
        );
        var rawUninteresting = !!(
            (raw && raw.isUninteresting === true) ||
            rawOrigin === 'timeline_gap' ||
            rawTypeLabel === 'uninteresting_gap' ||
            parseNum(rawMetrics && rawMetrics.uninterestingGap, 0) >= 0.5
        );
        var rawSelectable = (raw && typeof raw.selectable === 'boolean')
            ? raw.selectable
            : !rawUninteresting;

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
            selected: rawSelectable && ((raw && typeof raw.selected === 'boolean') ? raw.selected : (stateValue === 'kept')),
            selectable: !!rawSelectable,
            isUninteresting: rawUninteresting,
            score: Math.max(0, Math.min(100, Math.round(parseNum(raw && raw.score, stateValue === 'kept' ? 70 : 35)))),
            scoreLabel: raw && raw.scoreLabel ? String(raw.scoreLabel) : 'weak',
            reasons: (raw && raw.reasons && raw.reasons.length) ? raw.reasons.slice(0) : ['No detailed analyzer reason available'],
            typeLabel: rawTypeLabel,
            typeConfidence: Math.max(0, Math.min(100, round(parseNum(raw && raw.typeConfidence, stateValue === 'kept' ? 70 : 35), 1))),
            sourceClipIndex: (raw && raw.sourceClipIndex !== undefined && raw.sourceClipIndex !== null) ? parseInt(raw.sourceClipIndex, 10) : null,
            mediaPath: raw && raw.mediaPath ? String(raw.mediaPath) : '',
            sourceStartSec: parseNum(raw && raw.sourceStartSec, start),
            sourceEndSec: parseNum(raw && raw.sourceEndSec, end),
            previewParts: [],
            decisionStage: rawDecisionStage,
            origin: rawAlwaysOpenFill ? 'always_open_fill' : rawOrigin,
            alwaysOpenFill: rawAlwaysOpenFill,
            overlapInfo: raw && raw.overlapInfo ? raw.overlapInfo : null,
            metrics: rawMetrics ? rawMetrics : {
                meanOverThreshold: 0,
                peakOverThreshold: 0,
                spectralConfidence: 0,
                laughterConfidence: 0,
                overlapPenalty: 0,
                speakerLockScore: 0,
                postprocessPenalty: 0,
                speechEvidence: 0,
                laughterEvidence: 0,
                bleedEvidence: 0,
                bleedConfidence: 0,
                noiseEvidence: 0,
                classMargin: 0,
                keptSourceRatio: 0,
                keepLikelihood: 0,
                suppressLikelihood: 0,
                decisionMargin: 0,
                bleedHighConfidence: 0,
                alwaysOpenFill: 0,
                mergedSegmentCount: 1,
                maxMergedGapMs: 0,
                uninterestingGap: 0
            }
        };

        if (item.isUninteresting && item.metrics) {
            item.metrics.uninterestingGap = 1;
            item.selected = false;
            item.selectable = false;
            item.score = 0;
            item.scoreLabel = 'weak';
            if (item.state !== 'suppressed') item.state = 'suppressed';
            if (item.typeLabel !== 'uninteresting_gap') item.typeLabel = 'uninteresting_gap';
        }

        if (item.alwaysOpenFill && item.metrics) {
            item.metrics.alwaysOpenFill = 1;
            if (!isFinite(parseNum(item.metrics.alwaysOpenFillRatio, NaN))) {
                item.metrics.alwaysOpenFillRatio = 1;
            }
        }

        if (raw && raw.previewParts && raw.previewParts.length) {
            for (var pi = 0; pi < raw.previewParts.length; pi++) {
                var part = raw.previewParts[pi];
                if (!part || !part.mediaPath) continue;
                var partStart = parseNum(part.sourceStartSec, item.sourceStartSec);
                var partEnd = parseNum(part.sourceEndSec, item.sourceEndSec);
                if (partEnd <= partStart) continue;
                item.previewParts.push({
                    mediaPath: String(part.mediaPath),
                    sourceStartSec: round(partStart, 4),
                    sourceEndSec: round(partEnd, 4),
                    sourceClipIndex: (part.sourceClipIndex !== undefined && part.sourceClipIndex !== null)
                        ? parseInt(part.sourceClipIndex, 10)
                        : null,
                    timelineStartSec: round(parseNum(part.timelineStartSec, item.start), 4),
                    timelineEndSec: round(parseNum(part.timelineEndSec, item.end), 4),
                    coverageSec: round(Math.max(0, partEnd - partStart), 4)
                });
            }
        }

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
                    decisionStage: seg.origin === 'always_open_fill' ? 'always_open_fill' : 'legacy_fallback',
                    origin: seg.origin || 'analysis_active',
                    alwaysOpenFill: seg.origin === 'always_open_fill'
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
        var parts = [];

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

            var clipIn = ticksToSec(clip.inPointTicks, ticksRate);
            var mappedPart = {
                sourceClipIndex: clip.clipIndex !== undefined ? clip.clipIndex : c,
                mediaPath: clip.mediaPath,
                sourceStartSec: clipIn + (overlapStart - clipStart),
                sourceEndSec: clipIn + (overlapEnd - clipStart),
                timelineStartSec: overlapStart,
                timelineEndSec: overlapEnd,
                coverageSec: coverage
            };
            parts.push(mappedPart);

            if (coverage > bestCoverage) {
                bestCoverage = coverage;
                best = mappedPart;
            }
        }

        if (parts.length) {
            parts.sort(function (a, b) {
                if (a.timelineStartSec !== b.timelineStartSec) return a.timelineStartSec - b.timelineStartSec;
                return a.timelineEndSec - b.timelineEndSec;
            });

            item.previewParts = [];
            for (var p = 0; p < parts.length; p++) {
                item.previewParts.push({
                    sourceClipIndex: parts[p].sourceClipIndex,
                    mediaPath: parts[p].mediaPath,
                    sourceStartSec: round(parts[p].sourceStartSec, 4),
                    sourceEndSec: round(parts[p].sourceEndSec, 4),
                    timelineStartSec: round(parts[p].timelineStartSec, 4),
                    timelineEndSec: round(parts[p].timelineEndSec, 4),
                    coverageSec: round(parts[p].coverageSec, 4)
                });
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
            uninterestingCount: 0,
            selectedCount: 0,
            avgScore: 0
        };
        var scoreSum = 0;
        var scoreCount = 0;

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (isUninterestingSnippet(item)) summary.uninterestingCount++;
            else if (item.state === 'kept') summary.keptCount++;
            else if (item.state === 'near_miss') summary.nearMissCount++;
            else summary.suppressedCount++;
            if (item.selected) summary.selectedCount++;
            if (!isUninterestingSnippet(item)) {
                scoreSum += parseNum(item.score, 0);
                scoreCount++;
            }
        }
        summary.avgScore = scoreCount > 0 ? round(scoreSum / scoreCount, 1) : 0;
        return summary;
    }

    function getMaxTrackIndex(items) {
        var maxIdx = -1;
        for (var i = 0; i < items.length; i++) {
            if (items[i].trackIndex > maxIdx) maxIdx = items[i].trackIndex;
        }
        return maxIdx;
    }

    function normalizeTimelineStateLabel(stateLabel) {
        if (stateLabel === 'kept' || stateLabel === 'near_miss' || stateLabel === 'suppressed' || stateLabel === 'uninteresting') {
            return stateLabel;
        }
        if (stateLabel === 'active') return 'kept';
        return 'suppressed';
    }

    function normalizeStateTimelineByTrack(rawTimelineByTrack, laneCount, totalDurationSec) {
        var out = [];
        var epsilon = 0.0001;
        var duration = Math.max(0, parseNum(totalDurationSec, 0));

        for (var t = 0; t < laneCount; t++) {
            var rawTrack = rawTimelineByTrack && rawTimelineByTrack[t] ? rawTimelineByTrack[t] : [];
            var normalizedTrack = [];

            for (var i = 0; i < rawTrack.length; i++) {
                var seg = rawTrack[i];
                if (!seg) continue;
                var st = clamp(parseNum(seg.start, 0), 0, duration);
                var en = clamp(parseNum(seg.end, st), 0, duration);
                if (!(en > st + epsilon)) continue;
                var stateLabel = normalizeTimelineStateLabel(seg.state || 'suppressed');

                if (!normalizedTrack.length || normalizedTrack[normalizedTrack.length - 1].state !== stateLabel) {
                    normalizedTrack.push({
                        start: round(st, 4),
                        end: round(en, 4),
                        trackIndex: t,
                        state: stateLabel
                    });
                } else {
                    normalizedTrack[normalizedTrack.length - 1].end = round(en, 4);
                }
            }

            if (!normalizedTrack.length && duration > epsilon) {
                normalizedTrack.push({
                    start: 0,
                    end: round(duration, 4),
                    trackIndex: t,
                    state: 'uninteresting'
                });
            }

            out.push(normalizedTrack);
        }

        return out;
    }

    function buildStateTimelineFromItems(items, laneCount, totalDurationSec) {
        var duration = Math.max(0, parseNum(totalDurationSec, 0));
        var epsilon = 0.0001;
        var priority = {
            kept: 3,
            near_miss: 2,
            suppressed: 1,
            uninteresting: 0
        };
        var out = [];

        for (var t = 0; t < laneCount; t++) {
            var points = [0, duration];
            var trackItems = [];

            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (!item || item.trackIndex !== t) continue;
                var st = clamp(parseNum(item.start, 0), 0, duration);
                var en = clamp(parseNum(item.end, st), 0, duration);
                if (!(en > st + epsilon)) continue;
                trackItems.push({
                    start: st,
                    end: en,
                    state: isUninterestingSnippet(item) ? 'uninteresting' : normalizeTimelineStateLabel(item.state)
                });
                points.push(st, en);
            }

            points.sort(function (a, b) { return a - b; });
            var uniq = [];
            for (i = 0; i < points.length; i++) {
                if (!uniq.length || Math.abs(points[i] - uniq[uniq.length - 1]) > epsilon) {
                    uniq.push(points[i]);
                }
            }

            var trackTimeline = [];
            for (i = 0; i < uniq.length - 1; i++) {
                var segStart = uniq[i];
                var segEnd = uniq[i + 1];
                if (!(segEnd > segStart + epsilon)) continue;

                var bestState = 'uninteresting';
                var bestRank = 0;
                for (var j = 0; j < trackItems.length; j++) {
                    var trItem = trackItems[j];
                    if (trItem.end <= segStart + epsilon || trItem.start >= segEnd - epsilon) continue;
                    var label = normalizeTimelineStateLabel(trItem.state);
                    var rank = priority.hasOwnProperty(label) ? priority[label] : 1;
                    if (rank > bestRank) {
                        bestRank = rank;
                        bestState = label;
                    }
                }

                if (!trackTimeline.length || trackTimeline[trackTimeline.length - 1].state !== bestState) {
                    trackTimeline.push({
                        start: round(segStart, 4),
                        end: round(segEnd, 4),
                        trackIndex: t,
                        state: bestState
                    });
                } else {
                    trackTimeline[trackTimeline.length - 1].end = round(segEnd, 4);
                }
            }

            if (!trackTimeline.length && duration > epsilon) {
                trackTimeline.push({
                    start: 0,
                    end: round(duration, 4),
                    trackIndex: t,
                    state: 'uninteresting'
                });
            }

            out.push(trackTimeline);
        }

        return out;
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

        var totalDuration = parseNum((result && result.totalDurationSec), NaN);
        if (!isFinite(totalDuration)) {
            totalDuration = 0;
            for (i = 0; i < normalizedItems.length; i++) {
                if (normalizedItems[i].end > totalDuration) totalDuration = normalizedItems[i].end;
            }
        }
        var hasRawTimeline = !!(base && base.stateTimelineByTrack && base.stateTimelineByTrack.length);
        var stateTimelineByTrack = hasRawTimeline
            ? normalizeStateTimelineByTrack(base.stateTimelineByTrack, laneCount, totalDuration)
            : buildStateTimelineFromItems(normalizedItems, laneCount, totalDuration);

        return {
            items: normalizedItems,
            lanes: lanes,
            summary: computeCutPreviewSummary(normalizedItems),
            stateTimelineByTrack: stateTimelineByTrack
        };
    }

    function getVisibleCutPreviewItems() {
        if (!state.cutPreview || !state.cutPreview.items) return [];
        var out = state.cutPreview.items.slice();
        out.sort(function (a, b) {
            if (a.start !== b.start) return a.start - b.start;
            if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
            return a.end - b.end;
        });
        return out;
    }

    function getTotalCutPreviewDurationSec() {
        if (!state.cutPreview || !state.cutPreview.items || state.cutPreview.items.length === 0) return 0;
        var maxEnd = 0;
        for (var i = 0; i < state.cutPreview.items.length; i++) {
            if (state.cutPreview.items[i].end > maxEnd) maxEnd = state.cutPreview.items[i].end;
        }
        var totalFromResult = parseNum(state.analysisResult && state.analysisResult.totalDurationSec, maxEnd);
        return Math.max(maxEnd, totalFromResult, 0.2);
    }

    function getTimelineTrackWidth() {
        var full = parseNum(els.cutPreviewTimeline && els.cutPreviewTimeline.clientWidth, 0);
        var width = full - 170;
        if (width < 260) width = 780;
        return width;
    }

    function getZoomModel() {
        var totalDurationSec = getTotalCutPreviewDurationSec();
        var trackWidth = getTimelineTrackWidth();
        var fitPixelsPerSec = trackWidth / Math.max(totalDurationSec, 0.2);
        if (!isFinite(fitPixelsPerSec) || fitPixelsPerSec <= 0) fitPixelsPerSec = 10;
        var maxPixelsPerSec = Math.max(fitPixelsPerSec * 260, fitPixelsPerSec + 120, 260);
        return {
            totalDurationSec: totalDurationSec,
            trackWidth: trackWidth,
            fitPixelsPerSec: fitPixelsPerSec,
            maxPixelsPerSec: maxPixelsPerSec
        };
    }

    function sliderToPixelsPerSec(sliderValue, zoomModel) {
        var model = zoomModel || getZoomModel();
        var norm = clamp(parseNum(sliderValue, 0) / 1000, 0, 1);
        if (model.maxPixelsPerSec <= model.fitPixelsPerSec + 0.0001) return model.fitPixelsPerSec;
        return model.fitPixelsPerSec * Math.pow(model.maxPixelsPerSec / model.fitPixelsPerSec, norm);
    }

    function pixelsPerSecToSlider(pixelsPerSec, zoomModel) {
        var model = zoomModel || getZoomModel();
        if (model.maxPixelsPerSec <= model.fitPixelsPerSec + 0.0001) return 0;
        var ratio = clamp(parseNum(pixelsPerSec, model.fitPixelsPerSec) / model.fitPixelsPerSec, 1, model.maxPixelsPerSec / model.fitPixelsPerSec);
        var norm = Math.log(ratio) / Math.log(model.maxPixelsPerSec / model.fitPixelsPerSec);
        return clamp(Math.round(norm * 1000), 0, 1000);
    }

    function ensureCutPreviewViewport(forceFit) {
        if (!state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return null;
        var model = getZoomModel();

        if (forceFit || !isFinite(state.cutPreviewPixelsPerSec) || state.cutPreviewPixelsPerSec <= 0) {
            state.cutPreviewPixelsPerSec = model.fitPixelsPerSec;
            state.cutPreviewZoom = 0;
            state.cutPreviewViewStartSec = 0;
        } else {
            state.cutPreviewPixelsPerSec = clamp(state.cutPreviewPixelsPerSec, model.fitPixelsPerSec, model.maxPixelsPerSec);
            state.cutPreviewZoom = pixelsPerSecToSlider(state.cutPreviewPixelsPerSec, model);
        }

        var visibleDuration = model.trackWidth / state.cutPreviewPixelsPerSec;
        var maxStart = Math.max(0, model.totalDurationSec - visibleDuration);
        state.cutPreviewViewStartSec = clamp(parseNum(state.cutPreviewViewStartSec, 0), 0, maxStart);

        return {
            totalDurationSec: model.totalDurationSec,
            trackWidth: model.trackWidth,
            fitPixelsPerSec: model.fitPixelsPerSec,
            maxPixelsPerSec: model.maxPixelsPerSec,
            pixelsPerSec: state.cutPreviewPixelsPerSec,
            visibleDurationSec: visibleDuration,
            viewStartSec: state.cutPreviewViewStartSec,
            viewEndSec: state.cutPreviewViewStartSec + visibleDuration
        };
    }

    function getTimelineTickStep(visibleDurationSec) {
        if (visibleDurationSec <= 6) return 0.5;
        if (visibleDurationSec <= 14) return 1;
        if (visibleDurationSec <= 28) return 2;
        if (visibleDurationSec <= 70) return 5;
        if (visibleDurationSec <= 160) return 10;
        if (visibleDurationSec <= 520) return 30;
        if (visibleDurationSec <= 1800) return 60;
        return 120;
    }

    function setActiveSnippet(itemId, ensureVisible) {
        var item = getCutPreviewItemById(itemId);
        if (!item) return;
        state.activeSnippetId = item.id;
        if (ensureVisible) {
            var viewport = ensureCutPreviewViewport(false);
            if (!viewport) return;
            var margin = Math.min(1.2, viewport.visibleDurationSec * 0.08);
            var start = viewport.viewStartSec;
            var end = viewport.viewEndSec;
            if (item.start < (start + margin)) {
                state.cutPreviewViewStartSec = Math.max(0, item.start - margin);
            } else if (item.end > (end - margin)) {
                state.cutPreviewViewStartSec = item.end + margin - viewport.visibleDurationSec;
                var maxStart = Math.max(0, viewport.totalDurationSec - viewport.visibleDurationSec);
                state.cutPreviewViewStartSec = clamp(state.cutPreviewViewStartSec, 0, maxStart);
            }
        }
    }

    function shortStateLabel(stateLabel) {
        if (stateLabel === 'kept') return 'keep';
        if (stateLabel === 'near_miss') return 'near';
        if (stateLabel === 'suppressed') return 'supp';
        return stateLabel || '';
    }

    function shortTypeLabel(typeLabel) {
        if (!typeLabel) return '';
        if (typeLabel === 'primary_speech') return 'primary';
        if (typeLabel === 'borderline_speech') return 'borderline';
        if (typeLabel === 'mixed_speech_laughter') return 'mix';
        if (typeLabel === 'laughter_candidate') return 'laugh';
        if (typeLabel === 'bleed_candidate') return 'bleed*';
        if (typeLabel === 'overlap_candidate') return 'overlap';
        if (typeLabel === 'suppressed_bleed') return 'bleed';
        if (typeLabel === 'weak_voice') return 'weak';
        if (typeLabel === 'uninteresting_gap') return 'idle';
        return typeLabel;
    }

    function getTypeCssClass(typeLabel) {
        var key = typeLabel ? String(typeLabel).toLowerCase() : 'unknown';
        key = key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!key) key = 'unknown';
        return 'cp-type-' + key;
    }

    function isAlwaysOpenFillSnippet(item) {
        if (!item) return false;
        if (item.alwaysOpenFill) return true;
        if (item.origin === 'always_open_fill') return true;
        return !!(item.metrics && parseNum(item.metrics.alwaysOpenFill, 0) >= 0.5);
    }

    function isUninterestingSnippet(item) {
        if (!item) return false;
        if (item.isUninteresting) return true;
        if (item.origin === 'timeline_gap') return true;
        if (item.typeLabel === 'uninteresting_gap') return true;
        return !!(item.metrics && parseNum(item.metrics.uninterestingGap, 0) >= 0.5);
    }

    function isGenericDecisionReasonText(text) {
        var t = String(text || '').toLowerCase();
        return t === 'kept in final decision' ||
            t === 'pruned in postprocess pass' ||
            t === 'suppressed in overlap resolution' ||
            t === 'kept in legacy segment output' ||
            t === 'suppressed by legacy overlap result';
    }

    function firstInformativeReason(item) {
        if (!item || !item.reasons || !item.reasons.length) return '';
        for (var i = 0; i < item.reasons.length; i++) {
            var reasonText = String(item.reasons[i] || '').replace(/\s+/g, ' ').trim();
            if (!reasonText) continue;
            if (isGenericDecisionReasonText(reasonText)) continue;
            return reasonText;
        }
        return '';
    }

    function compactReasonText(item, maxChars) {
        var text = firstInformativeReason(item);
        if (!text) return '';
        var len = parseInt(maxChars, 10);
        if (!isFinite(len) || len < 8) len = 28;
        if (text.length <= len) return text;
        return text.substring(0, len - 3) + '...';
    }

    function buildSnippetInlineLabel(item, widthPx) {
        var stateText = isUninterestingSnippet(item) ? 'idle' : shortStateLabel(item.state);
        var typeText = shortTypeLabel(item.typeLabel);
        var reason = compactReasonText(item, widthPx >= 260 ? 34 : 20);
        var fillHint = isAlwaysOpenFillSnippet(item) ? 'main-fill' : '';
        if (widthPx >= 260) {
            return stateText + ' | ' + typeText + ' | ' + item.score + ' ' + item.scoreLabel +
                (fillHint ? ' | ' + fillHint : '') +
                (reason ? ' | ' + reason : '');
        }
        if (widthPx >= 190) {
            return stateText + ' | ' + typeText + ' | ' + item.score + (fillHint ? ' | ' + fillHint : '');
        }
        if (widthPx >= 120) {
            return stateText + ' | ' + item.score + (fillHint ? ' | ' + fillHint : '');
        }
        if (widthPx >= 74) {
            return stateText;
        }
        return '';
    }

    function isOverviewZoom(viewport) {
        if (!viewport) return false;
        return viewport.pixelsPerSec <= (viewport.fitPixelsPerSec * 1.45);
    }

    function cancelPendingCutPreviewRender() {
        if (!state.cutPreviewRenderPending) return;
        state.cutPreviewRenderPending = false;
        if (state.cutPreviewRenderHandle === null || state.cutPreviewRenderHandle === undefined) return;

        try {
            if (window.cancelAnimationFrame) {
                window.cancelAnimationFrame(state.cutPreviewRenderHandle);
            } else {
                clearTimeout(state.cutPreviewRenderHandle);
            }
        } catch (e) { }
        state.cutPreviewRenderHandle = null;
    }

    function requestCutPreviewRender(immediate) {
        if (immediate) {
            cancelPendingCutPreviewRender();
            renderCutPreviewNow();
            return;
        }

        if (state.cutPreviewRenderPending) return;
        state.cutPreviewRenderPending = true;

        var raf = window.requestAnimationFrame || function (cb) {
            return setTimeout(cb, 16);
        };

        state.cutPreviewRenderHandle = raf(function () {
            state.cutPreviewRenderPending = false;
            state.cutPreviewRenderHandle = null;
            renderCutPreviewNow();
        });
    }

    function renderCutPreview() {
        requestCutPreviewRender(false);
    }

    function renderCutPreviewNow() {
        if (!state.cutPreview || !state.cutPreview.items || state.cutPreview.items.length === 0) {
            hideCutPreview();
            return;
        }

        setPanelPageMode('review');
        state.cutPreview.summary = computeCutPreviewSummary(state.cutPreview.items);

        var items = getVisibleCutPreviewItems();
        if (!items.length) {
            hideCutPreview();
            return;
        }
        if (!state.activeSnippetId || !getCutPreviewItemById(state.activeSnippetId)) {
            var preferred = null;
            for (var ii = 0; ii < items.length; ii++) {
                if (!isUninterestingSnippet(items[ii])) {
                    preferred = items[ii];
                    break;
                }
            }
            state.activeSnippetId = (preferred || items[0]).id;
        }

        ensureCutPreviewViewport(false);
        renderCutPreviewControls();
        renderCutPreviewTimeline();
        renderCutPreviewNavigator();
        renderCutPreviewInspector();
    }

    function renderCutPreviewControls() {
        if (!state.cutPreview || !state.cutPreview.summary) return;
        var viewport = ensureCutPreviewViewport(false);
        if (!viewport) return;

        if (els.cutPreviewMeta) {
            var sum = state.cutPreview.summary;
            var viewModeText = isOverviewZoom(viewport) ? 'overview' : 'detail';
            els.cutPreviewMeta.textContent =
                sum.totalItems + ' snippets | selected ' + sum.selectedCount +
                ' | kept ' + sum.keptCount +
                ' | near miss ' + sum.nearMissCount +
                ' | suppressed ' + sum.suppressedCount +
                ' | uninteresting ' + (sum.uninterestingCount || 0) +
                ' | avg score ' + sum.avgScore +
                ' | view ' + viewModeText;
        }
        if (els.cutPreviewAnalysisMini) {
            var tracksInfo = (state.analysisResult && state.analysisResult.tracks) ? state.analysisResult.tracks : [];
            var totalTracks = Math.max(tracksInfo.length, state.tracks.length, state.cutPreview.lanes.length);
            var selectedTracks = 0;
            for (var ti = 0; ti < state.tracks.length; ti++) {
                if (state.tracks[ti] && state.tracks[ti].selected !== false) selectedTracks++;
            }
            if (selectedTracks === 0 && totalTracks > 0) selectedTracks = totalTracks;

            var totalSegments = 0;
            var activePercentSum = 0;
            var activePercentCount = 0;
            for (ti = 0; ti < tracksInfo.length; ti++) {
                totalSegments += Math.max(0, parseNum(tracksInfo[ti] && tracksInfo[ti].segmentCount, 0));
                if (tracksInfo[ti] && isFinite(parseNum(tracksInfo[ti].activePercent, NaN))) {
                    activePercentSum += parseNum(tracksInfo[ti].activePercent, 0);
                    activePercentCount++;
                }
            }
            var avgActive = activePercentCount > 0 ? round(activePercentSum / activePercentCount, 1) : 0;
            var timelineDuration = getTotalCutPreviewDurationSec();

            els.cutPreviewAnalysisMini.innerHTML = ''
                + '<span class="cp-summary-chip">Tracks ' + escapeHtml(String(selectedTracks + '/' + totalTracks)) + '</span>'
                + '<span class="cp-summary-chip">Duration ' + escapeHtml(formatSummaryDuration(timelineDuration)) + '</span>'
                + '<span class="cp-summary-chip">Final Segments ' + escapeHtml(String(totalSegments)) + '</span>'
                + '<span class="cp-summary-chip">Avg Active ' + escapeHtml(String(avgActive)) + '%</span>';
        }
        if (els.cutPreviewZoom) {
            els.cutPreviewZoom.value = String(state.cutPreviewZoom);
        }
        if (els.cutPreviewZoomLabel) {
            var zoomPercent = Math.round((viewport.pixelsPerSec / viewport.fitPixelsPerSec) * 100);
            els.cutPreviewZoomLabel.textContent = zoomPercent + '%';
        }
        if (els.cutPreviewVolumeMaster) {
            els.cutPreviewVolumeMaster.value = String(Math.round(clamp(parseNum(state.previewMasterGain, 1), 0, 3) * 100));
        }
        if (els.cutPreviewVolumeMasterLabel) {
            els.cutPreviewVolumeMasterLabel.textContent = Math.round(clamp(parseNum(state.previewMasterGain, 1), 0, 3) * 100) + '%';
        }
    }

    function renderCutPreviewTimeline() {
        if (!els.cutPreviewTimeline || !state.cutPreview) return;
        var viewport = ensureCutPreviewViewport(false);
        if (!viewport) return;

        var visibleItems = getVisibleCutPreviewItems();
        if (!visibleItems.length) {
            els.cutPreviewTimeline.innerHTML = '<div class="cp-empty">No snippets available.</div>';
            return;
        }

        var overviewMode = isOverviewZoom(viewport);
        var lanes = state.cutPreview.lanes.slice().sort(function (a, b) {
            return a.laneIndex - b.laneIndex;
        });

        if (!lanes.length) {
            els.cutPreviewTimeline.innerHTML = '<div class="cp-empty">No lanes available.</div>';
            return;
        }

        var byTrack = {};
        for (var i = 0; i < visibleItems.length; i++) {
            var item = visibleItems[i];
            if (!byTrack[item.trackIndex]) byTrack[item.trackIndex] = [];
            byTrack[item.trackIndex].push(item);
        }

        var tickStep = getTimelineTickStep(viewport.visibleDurationSec);
        var tickStart = Math.floor(viewport.viewStartSec / tickStep) * tickStep;
        if (tickStart < 0) tickStart = 0;
        var axisTicks = '';
        for (var ts = tickStart; ts <= viewport.viewEndSec + 0.0001; ts += tickStep) {
            if (ts < viewport.viewStartSec - 0.0001) continue;
            var left = Math.round((ts - viewport.viewStartSec) * viewport.pixelsPerSec);
            if (left < 0 || left > viewport.trackWidth + 2) continue;
            axisTicks += ''
                + '<div class="cp-axis-tick" style="left:' + left + 'px;">'
                + '  <span class="cp-axis-tick-label">' + escapeHtml(formatClock(ts)) + '</span>'
                + '</div>';
        }

        var html = '<div class="cp-timeline-viewport">';
        html += '<div class="cp-timeline-row cp-axis-row">';
        html += '<div class="cp-lane-label">Time</div>';
        html += '<div class="cp-axis-track" style="width:' + viewport.trackWidth + 'px;">' + axisTicks + '</div>';
        html += '</div>';

        for (var l = 0; l < lanes.length; l++) {
            var laneObj = lanes[l];
            var laneItems = byTrack[laneObj.trackIndex] || [];
            var trackGainPercent = Math.round(getTrackPreviewGain(laneObj.trackIndex) * 100);
            html += '<div class="cp-timeline-row">';
            html += '<div class="cp-lane-label">'
                + '  <div class="cp-lane-label-main"><span class="cp-lane-title">' + escapeHtml('T' + (laneObj.trackIndex + 1) + ' ' + laneObj.trackName) + '</span></div>'
                + '  <div class="cp-lane-gain-row">'
                + '    <span class="cp-lane-gain-label">Vol</span>'
                + '    <input type="range" class="cp-lane-gain-slider" min="0" max="300" step="1" value="' + trackGainPercent + '" data-track-volume="' + laneObj.trackIndex + '">'
                + '    <span class="cp-lane-gain-value" data-track-volume-label="' + laneObj.trackIndex + '">' + trackGainPercent + '%</span>'
                + '  </div>'
                + '</div>';
            html += '<div class="cp-lane-track" style="width:' + viewport.trackWidth + 'px;">';

            for (var si = 0; si < laneItems.length; si++) {
                var snippet = laneItems[si];
                var visStart = Math.max(snippet.start, viewport.viewStartSec);
                var visEnd = Math.min(snippet.end, viewport.viewEndSec);
                if (visEnd <= visStart) continue;

                var leftPx = Math.max(0, Math.round((visStart - viewport.viewStartSec) * viewport.pixelsPerSec));
                var widthRaw = Math.round((visEnd - visStart) * viewport.pixelsPerSec);
                if (!isFinite(widthRaw) || widthRaw < 0) widthRaw = 0;
                var widthPx = Math.max(overviewMode ? 1 : 4, widthRaw);
                var minimalMode = overviewMode || widthPx < 34;
                var compact = minimalMode || widthPx < 78;
                var snippetClass = 'cp-snippet cp-state-' + snippet.state;
                snippetClass += ' ' + getTypeCssClass(snippet.typeLabel);
                if (snippet.selected) snippetClass += ' cp-selected';
                else snippetClass += ' cp-unselected';
                if (compact) snippetClass += ' cp-snippet-compact';
                if (overviewMode) snippetClass += ' cp-snippet-overview';
                if (minimalMode) snippetClass += ' cp-snippet-minimal';
                if (isAlwaysOpenFillSnippet(snippet)) snippetClass += ' cp-snippet-always-open';
                if (isUninterestingSnippet(snippet)) snippetClass += ' cp-snippet-uninteresting';
                if (state.activeSnippetId === snippet.id) snippetClass += ' cp-focused';
                if (state.currentPlayingPreviewId === snippet.id) snippetClass += ' cp-playing';
                var inlineLabel = buildSnippetInlineLabel(snippet, widthPx);
                var selectClass = 'cp-snippet-select';
                if (snippet.selected) selectClass += ' is-selected';
                var playClass = 'cp-snippet-play';
                if (state.currentPlayingPreviewId === snippet.id) playClass += ' is-playing';
                var playSymbol = state.currentPlayingPreviewId === snippet.id ? '■' : '▶';
                var selectHtml = (snippet.selectable && !minimalMode && widthPx >= 38)
                    ? ('  <button type="button" class="' + selectClass + '" data-item-select="' + escapeHtml(snippet.id) + '" title="Toggle selection">' + (snippet.selected ? '✓' : '') + '</button>')
                    : '';
                var playHtml = (!minimalMode && widthPx >= 62)
                    ? ('  <button type="button" class="' + playClass + '" data-item-play="' + escapeHtml(snippet.id) + '" title="Preview snippet">' + playSymbol + '</button>')
                    : '';
                var labelHtml = (!overviewMode && widthPx >= 74)
                    ? ('  <span class="cp-snippet-label">' + escapeHtml(inlineLabel) + '</span>')
                    : '';

                html += ''
                    + '<div class="' + snippetClass + '"'
                    + ' data-item-id="' + escapeHtml(snippet.id) + '"'
                    + ' title="' + escapeHtml('State ' + (isUninterestingSnippet(snippet) ? 'uninteresting' : snippet.state) + ' | Score ' + snippet.score + ' | ' + shortTypeLabel(snippet.typeLabel) + (isAlwaysOpenFillSnippet(snippet) ? ' | dominant continuity fill' : '') + ' | ' + compactReasonText(snippet, 42) + ' | ' + formatClock(snippet.start) + '-' + formatClock(snippet.end)) + '"'
                    + ' style="left:' + leftPx + 'px;width:' + widthPx + 'px;">'
                    + selectHtml
                    + playHtml
                    + labelHtml
                    + '</div>';
            }

            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        els.cutPreviewTimeline.innerHTML = html;
    }

    function renderCutPreviewNavigator() {
        if (!els.cutPreviewNavigator || !state.cutPreview) return;
        var viewport = ensureCutPreviewViewport(false);
        if (!viewport) return;
        var items = getVisibleCutPreviewItems();
        if (!items.length) {
            els.cutPreviewNavigator.innerHTML = '<div class="cp-empty">No navigator data available.</div>';
            return;
        }

        var html = '';
        html += '<div class="cp-nav-track">';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var leftPct = clamp((item.start / viewport.totalDurationSec) * 100, 0, 100);
            var widthPct = clamp(((item.end - item.start) / viewport.totalDurationSec) * 100, 0.1, 100);
            var navClass = 'cp-nav-snippet cp-state-' + item.state;
            navClass += ' ' + getTypeCssClass(item.typeLabel);
            if (isAlwaysOpenFillSnippet(item)) navClass += ' cp-nav-always-open-fill';
            if (isUninterestingSnippet(item)) navClass += ' cp-nav-uninteresting';
            html += '<div class="' + navClass + '" style="left:' + leftPct + '%;width:' + widthPct + '%;"></div>';
        }
        var windowLeftPct = clamp((viewport.viewStartSec / viewport.totalDurationSec) * 100, 0, 100);
        var windowWidthPct = clamp((viewport.visibleDurationSec / viewport.totalDurationSec) * 100, 1, 100);
        html += '<div class="cp-nav-window" data-nav-drag="move" style="left:' + windowLeftPct + '%;width:' + windowWidthPct + '%;">';
        html += '  <div class="cp-nav-handle cp-nav-handle-left" data-nav-drag="left"></div>';
        html += '  <div class="cp-nav-handle cp-nav-handle-right" data-nav-drag="right"></div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="cp-nav-caption">' + escapeHtml(formatClock(viewport.viewStartSec) + ' - ' + formatClock(viewport.viewEndSec) + ' / ' + formatClock(viewport.totalDurationSec)) + '</div>';
        els.cutPreviewNavigator.innerHTML = html;
    }

    function renderCutPreviewInspector() {
        if (!els.cutPreviewInspector || !state.cutPreview) return;
        var item = getCutPreviewItemById(state.activeSnippetId);
        if (!item) {
            els.cutPreviewInspector.innerHTML = '<div class="cp-inspector-empty">Click a snippet to inspect details.</div>';
            return;
        }

        var metrics = item.metrics || {};
        var reasons = item.reasons || [];
        var isPlaying = state.currentPlayingPreviewId === item.id;
        var previewPlan = buildPreviewPlaybackPlan(item);
        var isAlwaysOpenFill = isAlwaysOpenFillSnippet(item);
        var isUninteresting = isUninterestingSnippet(item);
        var statePillClass = 'cp-pill cp-pill-' + item.state;
        var selectedLabel = item.selectable ? (item.selected ? 'Selected' : 'Unselected') : 'Locked';
        var inspectorPlayLabel = isPlaying ? 'Stop Preview' : 'Play Preview';

        var html = '';
        html += '<div class="cp-inspector-head">';
        html += '  <div class="cp-inspector-title">' + escapeHtml(getTrackDisplayName(item.trackIndex) + ' | ' + formatClock(item.start) + ' - ' + formatClock(item.end)) + '</div>';
        html += '  <div class="cp-inspector-actions">';
        if (item.selectable) {
            html += '    <button type="button" class="btn btn-secondary cp-inspector-btn" data-inspector-toggle="' + escapeHtml(item.id) + '">' + escapeHtml(item.selected ? 'Deselect' : 'Select') + '</button>';
        } else {
            html += '    <button type="button" class="btn btn-secondary cp-inspector-btn" disabled>' + escapeHtml('Uninteresting') + '</button>';
        }
        html += '    <button type="button" class="btn btn-secondary cp-inspector-btn" data-item-play="' + escapeHtml(item.id) + '">' + escapeHtml(inspectorPlayLabel) + '</button>';
        html += '  </div>';
        html += '</div>';

        html += '<div class="cp-inspector-pills">';
        html += '  <span class="cp-pill ' + (item.selected ? 'cp-pill-kept' : '') + '">' + escapeHtml(selectedLabel) + '</span>';
        html += '  <span class="' + statePillClass + '">' + escapeHtml('state: ' + (isUninteresting ? 'uninteresting' : item.state)) + '</span>';
        html += '  <span class="cp-pill">' + escapeHtml('score: ' + item.score + ' (' + item.scoreLabel + ')') + '</span>';
        html += '  <span class="cp-pill">' + escapeHtml('type: ' + item.typeLabel + ' (' + round(item.typeConfidence, 1) + '%)') + '</span>';
        if (isAlwaysOpenFill) html += '  <span class="cp-pill cp-pill-always-open">dominant continuity fill</span>';
        if (isUninteresting) html += '  <span class="cp-pill">timeline gap</span>';
        if (previewPlan && previewPlan.approximate) {
            html += '  <span class="cp-pill">' + escapeHtml('preview: approx (' + previewPlan.usedParts + '/' + previewPlan.totalParts + ' parts)') + '</span>';
        } else {
            html += '  <span class="cp-pill">' + escapeHtml('preview: exact') + '</span>';
        }
        if (isPlaying) html += '  <span class="cp-pill cp-pill-playing">preview active</span>';
        html += '</div>';

        html += '<div class="cp-inspector-grid">';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Selected</span><span class="cp-inspector-value">' + escapeHtml(item.selectable ? (item.selected ? 'yes' : 'no') : 'locked') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">State</span><span class="cp-inspector-value">' + escapeHtml(isUninteresting ? 'uninteresting' : item.state) + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Score</span><span class="cp-inspector-value">' + escapeHtml(String(item.score) + ' (' + item.scoreLabel + ')') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Type Label</span><span class="cp-inspector-value">' + escapeHtml(item.typeLabel) + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Type Confidence</span><span class="cp-inspector-value">' + escapeHtml(round(item.typeConfidence, 1) + '%') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Duration</span><span class="cp-inspector-value">' + escapeHtml(formatDurationMs(item.durationMs)) + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Decision Stage</span><span class="cp-inspector-value">' + escapeHtml(item.decisionStage || '-') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Track</span><span class="cp-inspector-value">' + escapeHtml(getTrackDisplayName(item.trackIndex)) + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Preview Source</span><span class="cp-inspector-value">' + escapeHtml((previewPlan && previewPlan.approximate ? 'Approximate' : 'Exact') + (previewPlan && previewPlan.totalParts > 1 ? (' (' + previewPlan.usedParts + '/' + previewPlan.totalParts + ' parts)') : '')) + '</span></div>';
        html += '</div>';

        html += '<details class="cp-inspector-extra" open>';
        html += '  <summary>Class Signals</summary>';
        html += '  <div class="cp-metrics-grid cp-metrics-grid-tight">';
        html += buildMetricCard('Speech', round(parseNum(metrics.speechEvidence, 0), 3));
        html += buildMetricCard('Laughter', round(parseNum(metrics.laughterEvidence, 0), 3));
        html += buildMetricCard('Bleed', round(parseNum(metrics.bleedEvidence, 0), 3));
        html += buildMetricCard('Noise', round(parseNum(metrics.noiseEvidence, 0), 3));
        html += buildMetricCard('Bleed Conf', round(parseNum(metrics.bleedConfidence, 0), 3));
        html += buildMetricCard('Margin', round(parseNum(metrics.classMargin, 0), 3));
        html += buildMetricCard('Kept Src', round(parseNum(metrics.keptSourceRatio, 0), 3));
        html += buildMetricCard('Keep Likelihood', round(parseNum(metrics.keepLikelihood, 0), 3));
        html += buildMetricCard('Suppress Likelihood', round(parseNum(metrics.suppressLikelihood, 0), 3));
        html += buildMetricCard('Decision Margin', round(parseNum(metrics.decisionMargin, 0), 3));
        html += buildMetricCard('Bleed Safety Gate', parseNum(metrics.bleedHighConfidence, 0) >= 0.5 ? 'on' : 'off');
        html += buildMetricCard('Always-Open Fill', parseNum(metrics.alwaysOpenFill, 0) >= 0.5 ? 'yes' : 'no');
        html += '  </div>';
        html += '</details>';

        html += '<details class="cp-inspector-extra">';
        html += '  <summary>Audio Metrics</summary>';
        html += '  <div class="cp-metrics-grid cp-metrics-grid-tight">';
        html += buildMetricCard('Mean > Thresh', formatSigned(parseNum(metrics.meanOverThreshold, 0), 2) + ' dB');
        html += buildMetricCard('Peak > Thresh', formatSigned(parseNum(metrics.peakOverThreshold, 0), 2) + ' dB');
        html += buildMetricCard('Spectral', round(parseNum(metrics.spectralConfidence, 0), 3));
        html += buildMetricCard('Laughter Conf', round(parseNum(metrics.laughterConfidence, 0), 3));
        html += buildMetricCard('Overlap', round(parseNum(metrics.overlapPenalty, 0), 3));
        html += buildMetricCard('Speaker Lock', round(parseNum(metrics.speakerLockScore, 0), 3));
        html += buildMetricCard('Postprocess', round(parseNum(metrics.postprocessPenalty, 0), 3));
        html += buildMetricCard('Merged Snippets', Math.max(1, Math.round(parseNum(metrics.mergedSegmentCount, 1))));
        html += buildMetricCard('Max Merge Gap', round(parseNum(metrics.maxMergedGapMs, 0), 0) + ' ms');
        html += '  </div>';
        html += '</details>';

        html += '<details class="cp-inspector-extra">';
        html += '  <summary>Reasons</summary>';
        if (previewPlan && previewPlan.note) {
            html += '  <div class="cp-inspector-value" style="margin:4px 0 6px 0;">' + escapeHtml(previewPlan.note) + '</div>';
        }
        html += '  <ul class="cp-reasons-list">';
        if (!reasons.length) {
            html += '    <li>' + escapeHtml('No reasons available.') + '</li>';
        } else {
            for (var r = 0; r < reasons.length; r++) {
                html += '    <li>' + escapeHtml(reasons[r]) + '</li>';
            }
        }
        html += '  </ul>';
        html += '</details>';

        els.cutPreviewInspector.innerHTML = html;
    }

    function buildMetricCard(name, value) {
        return '<div class="cp-metric-card"><div class="cp-metric-name">' + escapeHtml(name) + '</div><div class="cp-metric-value">' + escapeHtml(String(value)) + '</div></div>';
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
        if (!item.selectable) return;
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

    function getValidPreviewParts(item) {
        if (!item || !item.previewParts || !item.previewParts.length) return [];
        var out = [];
        for (var i = 0; i < item.previewParts.length; i++) {
            var part = item.previewParts[i];
            if (!part || !part.mediaPath) continue;
            var st = parseNum(part.sourceStartSec, NaN);
            var en = parseNum(part.sourceEndSec, NaN);
            if (!isFinite(st) || !isFinite(en) || en <= st) continue;
            out.push({
                mediaPath: String(part.mediaPath),
                sourceStartSec: st,
                sourceEndSec: en,
                durationSec: en - st
            });
        }
        return out;
    }

    function buildPreviewPlaybackPlan(item) {
        if (!item) return null;

        var fallbackStart = parseNum(item.sourceStartSec, item.start);
        var fallbackEnd = parseNum(item.sourceEndSec, item.end);
        if (fallbackEnd <= fallbackStart) fallbackEnd = fallbackStart + 0.08;
        var fallbackMediaPath = item.mediaPath ? String(item.mediaPath) : '';

        var parts = getValidPreviewParts(item);
        if (!parts.length) {
            return {
                mediaPath: fallbackMediaPath,
                sourceStartSec: fallbackStart,
                sourceEndSec: fallbackEnd,
                mode: 'single',
                approximate: false,
                totalParts: 1,
                usedParts: 1,
                note: ''
            };
        }

        if (parts.length === 1) {
            return {
                mediaPath: parts[0].mediaPath,
                sourceStartSec: parts[0].sourceStartSec,
                sourceEndSec: parts[0].sourceEndSec,
                mode: 'single',
                approximate: false,
                totalParts: 1,
                usedParts: 1,
                note: ''
            };
        }

        var pathBuckets = {};
        var bestPath = '';
        var bestDur = -1;

        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (!pathBuckets[p.mediaPath]) {
                pathBuckets[p.mediaPath] = {
                    mediaPath: p.mediaPath,
                    totalDur: 0,
                    minStart: p.sourceStartSec,
                    maxEnd: p.sourceEndSec,
                    longestPart: p,
                    parts: []
                };
            }
            var bucket = pathBuckets[p.mediaPath];
            bucket.totalDur += p.durationSec;
            if (p.sourceStartSec < bucket.minStart) bucket.minStart = p.sourceStartSec;
            if (p.sourceEndSec > bucket.maxEnd) bucket.maxEnd = p.sourceEndSec;
            if (!bucket.longestPart || p.durationSec > bucket.longestPart.durationSec) {
                bucket.longestPart = p;
            }
            bucket.parts.push(p);
            if (bucket.totalDur > bestDur) {
                bestDur = bucket.totalDur;
                bestPath = p.mediaPath;
            }
        }

        var bestBucket = pathBuckets[bestPath];
        if (!bestBucket) {
            return {
                mediaPath: fallbackMediaPath,
                sourceStartSec: fallbackStart,
                sourceEndSec: fallbackEnd,
                mode: 'single',
                approximate: false,
                totalParts: 1,
                usedParts: 1,
                note: ''
            };
        }

        var span = Math.max(0.0001, bestBucket.maxEnd - bestBucket.minStart);
        var fillRatio = clamp(bestBucket.totalDur / span, 0, 1);
        if (fillRatio >= 0.86) {
            return {
                mediaPath: bestBucket.mediaPath,
                sourceStartSec: bestBucket.minStart,
                sourceEndSec: bestBucket.maxEnd,
                mode: 'same_source_combined',
                approximate: true,
                totalParts: parts.length,
                usedParts: bestBucket.parts.length,
                note: 'Combined nearby parts from the same source file'
            };
        }

        var longest = bestBucket.longestPart;
        return {
            mediaPath: longest.mediaPath,
            sourceStartSec: longest.sourceStartSec,
            sourceEndSec: longest.sourceEndSec,
            mode: 'largest_part',
            approximate: true,
            totalParts: parts.length,
            usedParts: 1,
            note: 'Previewing largest source part of a multi-clip snippet'
        };
    }

    function stopCurrentPreviewAudio(skipRender) {
        if (state.currentAudio && state.currentAudio.disconnect) {
            try {
                state.currentAudio.disconnect();
            } catch (e0) { }
        }
        if (state.currentAudio && state.currentAudio.audio) {
            try {
                state.currentAudio.audio.pause();
            } catch (e) { }
        }
        state.currentAudio = null;
        state.currentPlayingPreviewId = null;
        state.currentPreviewInfo = null;
        if (!skipRender) renderCutPreview();
    }

    function updateCurrentPreviewGain() {
        if (!state.currentAudio || !state.currentAudio.itemId) return;
        var item = getCutPreviewItemById(state.currentAudio.itemId);
        if (!item) return;
        var gainValue = getEffectivePreviewGain(item.trackIndex);
        if (state.currentAudio.setGain) {
            state.currentAudio.setGain(gainValue);
        } else if (state.currentAudio.audio) {
            state.currentAudio.audio.volume = clamp(gainValue, 0, 1);
        }
    }

    function createPreviewGainController(audio, trackIndex) {
        var targetGain = getEffectivePreviewGain(trackIndex);
        var out = {
            setGain: null,
            disconnect: null
        };

        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) throw new Error('AudioContext unavailable');

            if (!state.previewAudioContext) {
                state.previewAudioContext = new Ctx();
            }
            if (state.previewAudioContext.state === 'suspended' &&
                typeof state.previewAudioContext.resume === 'function') {
                state.previewAudioContext.resume();
            }

            var srcNode = state.previewAudioContext.createMediaElementSource(audio);
            var gainNode = state.previewAudioContext.createGain();
            srcNode.connect(gainNode);
            gainNode.connect(state.previewAudioContext.destination);
            gainNode.gain.value = clamp(targetGain, 0, 3);

            out.setGain = function (gainValue) {
                gainNode.gain.value = clamp(parseNum(gainValue, 1), 0, 3);
            };
            out.disconnect = function () {
                try { srcNode.disconnect(); } catch (e1) { }
                try { gainNode.disconnect(); } catch (e2) { }
            };
            return out;
        } catch (err) {
            audio.volume = clamp(targetGain, 0, 1);
            out.setGain = function (gainValue) {
                audio.volume = clamp(parseNum(gainValue, 1), 0, 1);
            };
            out.disconnect = function () { };
            return out;
        }
    }

    function toggleSnippetPreview(itemId) {
        var item = getCutPreviewItemById(itemId);
        if (!item) return;

        if (state.currentPlayingPreviewId === itemId) {
            stopCurrentPreviewAudio(false);
            setStatus('idle', 'Preview stopped');
            return;
        }

        var playbackPlan = buildPreviewPlaybackPlan(item);
        var mediaUrl = resolveMediaPathToAudioUrl(playbackPlan && playbackPlan.mediaPath);
        if (!mediaUrl) {
            setStatus('error', 'Snippet preview unavailable (no playable media path)');
            return;
        }

        stopCurrentPreviewAudio(true);

        var snippetStart = parseNum(playbackPlan && playbackPlan.sourceStartSec, parseNum(item.sourceStartSec, item.start));
        var snippetEnd = parseNum(playbackPlan && playbackPlan.sourceEndSec, parseNum(item.sourceEndSec, item.end));
        if (snippetEnd <= snippetStart) snippetEnd = snippetStart + 0.08;

        var startAt = Math.max(0, snippetStart - AUDIO_PREVIEW_PREROLL_SEC);
        var stopAt = snippetEnd + AUDIO_PREVIEW_POSTROLL_SEC;

        var audio = new Audio();
        audio.preload = 'auto';
        audio.src = mediaUrl;
        var gainCtrl = createPreviewGainController(audio, item.trackIndex);

        state.currentAudio = {
            audio: audio,
            endSec: stopAt,
            itemId: itemId,
            setGain: gainCtrl.setGain,
            disconnect: gainCtrl.disconnect
        };
        state.currentPlayingPreviewId = itemId;
        state.currentPreviewInfo = playbackPlan || null;
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

        if (playbackPlan && playbackPlan.approximate) {
            setStatus('analyzing', 'Previewing snippet (approx source mapping)...');
        } else {
            setStatus('analyzing', 'Previewing snippet...');
        }
    }

    function buildApplyCutsPayload() {
        var applyHelper = getApplyHelper();
        if (applyHelper && typeof applyHelper.buildApplyCutsPayloadFromState === 'function') {
            return applyHelper.buildApplyCutsPayloadFromState(state.tracks, state.cutPreview, state.analysisResult);
        }
        console.error('[AutoCast] cut_preview_apply helper missing; cannot build apply payload.');
        return null;
    }

    function beginNavigatorDrag(mode, clientX) {
        if (!els.cutPreviewNavigator) return;
        var trackEl = els.cutPreviewNavigator.querySelector('.cp-nav-track');
        if (!trackEl) return;
        var viewport = ensureCutPreviewViewport(false);
        if (!viewport) return;

        state.navigatorDrag = {
            mode: mode,
            startX: clientX,
            navWidth: Math.max(1, trackEl.clientWidth),
            startViewStartSec: viewport.viewStartSec,
            startViewEndSec: viewport.viewEndSec,
            totalDurationSec: viewport.totalDurationSec
        };
    }

    function updateNavigatorDrag(clientX) {
        if (!state.navigatorDrag) return;
        var drag = state.navigatorDrag;
        var model = getZoomModel();
        var deltaSec = ((clientX - drag.startX) / drag.navWidth) * drag.totalDurationSec;
        var minWindowSec = Math.max(0.08, drag.totalDurationSec / 1200);
        var start = drag.startViewStartSec;
        var end = drag.startViewEndSec;

        if (drag.mode === 'move') {
            start += deltaSec;
            end += deltaSec;
        } else if (drag.mode === 'left') {
            start += deltaSec;
            if (start < 0) start = 0;
            if (start > end - minWindowSec) start = end - minWindowSec;
        } else if (drag.mode === 'right') {
            end += deltaSec;
            if (end > drag.totalDurationSec) end = drag.totalDurationSec;
            if (end < start + minWindowSec) end = start + minWindowSec;
        }

        if (end > drag.totalDurationSec) {
            var over = end - drag.totalDurationSec;
            end -= over;
            start -= over;
        }
        if (start < 0) {
            end += -start;
            start = 0;
        }

        var visibleDuration = Math.max(minWindowSec, end - start);
        var maxVisible = drag.totalDurationSec;
        if (visibleDuration > maxVisible) visibleDuration = maxVisible;

        state.cutPreviewPixelsPerSec = clamp(model.trackWidth / Math.max(visibleDuration, 0.0001), model.fitPixelsPerSec, model.maxPixelsPerSec);
        state.cutPreviewZoom = pixelsPerSecToSlider(state.cutPreviewPixelsPerSec, model);

        var maxStart = Math.max(0, drag.totalDurationSec - (model.trackWidth / state.cutPreviewPixelsPerSec));
        state.cutPreviewViewStartSec = clamp(start, 0, maxStart);
    }

    function endNavigatorDrag() {
        state.navigatorDrag = null;
    }

    function bindCutPreviewControls() {
        if (els.cutPreviewSection) {
            els.cutPreviewSection.addEventListener('click', function (evt) {
                var target = evt.target;
                if (!target) return;

                var selectBtn = findDataElement(target, 'data-item-select');
                if (selectBtn) {
                    var selectId = selectBtn.getAttribute('data-item-select');
                    var selectItem = getCutPreviewItemById(selectId);
                    if (!selectItem) return;
                    state.activeSnippetId = selectId;
                    setCutPreviewItemSelected(selectId, !selectItem.selected);
                    return;
                }

                var playBtn = findDataElement(target, 'data-item-play');
                if (playBtn) {
                    var playId = playBtn.getAttribute('data-item-play');
                    setActiveSnippet(playId, false);
                    toggleSnippetPreview(playId);
                    return;
                }

                var inspectorToggle = findDataElement(target, 'data-inspector-toggle');
                if (inspectorToggle) {
                    var toggleId = inspectorToggle.getAttribute('data-inspector-toggle');
                    var toggleItem = getCutPreviewItemById(toggleId);
                    if (!toggleItem) return;
                    state.activeSnippetId = toggleId;
                    setCutPreviewItemSelected(toggleId, !toggleItem.selected);
                    return;
                }

                var snippetBtn = findDataElement(target, 'data-item-id');
                if (snippetBtn && snippetBtn.className.indexOf('cp-snippet') !== -1) {
                    var itemId = snippetBtn.getAttribute('data-item-id');
                    setActiveSnippet(itemId, true);
                    renderCutPreview();
                    return;
                }
            });

            els.cutPreviewSection.addEventListener('input', function (evt) {
                var target = evt.target;
                if (!target || !target.getAttribute) return;
                var trackVolumeRaw = target.getAttribute('data-track-volume');
                if (trackVolumeRaw === null || trackVolumeRaw === undefined) return;

                var trackIndex = parseInt(trackVolumeRaw, 10);
                if (!isFinite(trackIndex)) return;
                var gainPercent = clamp(parseNum(target.value, 100), 0, 300);
                setTrackPreviewGain(trackIndex, gainPercent / 100);
                updateCurrentPreviewGain();

                var label = els.cutPreviewSection.querySelector('[data-track-volume-label="' + trackIndex + '"]');
                if (label) label.textContent = Math.round(gainPercent) + '%';
            });
        }

        if (els.cutPreviewZoom) {
            els.cutPreviewZoom.addEventListener('input', function () {
                if (!state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return;
                var model = getZoomModel();
                var beforeViewport = ensureCutPreviewViewport(false);
                if (!beforeViewport) return;
                var centerSec = beforeViewport.viewStartSec + beforeViewport.visibleDurationSec / 2;
                state.cutPreviewZoom = clamp(parseNum(this.value, 0), 0, 1000);
                state.cutPreviewPixelsPerSec = sliderToPixelsPerSec(state.cutPreviewZoom, model);

                var visibleDuration = model.trackWidth / state.cutPreviewPixelsPerSec;
                var maxStart = Math.max(0, model.totalDurationSec - visibleDuration);
                state.cutPreviewViewStartSec = clamp(centerSec - visibleDuration / 2, 0, maxStart);
                renderCutPreview();
            });
        }

        if (els.cutPreviewFitBtn) {
            els.cutPreviewFitBtn.addEventListener('click', function () {
                ensureCutPreviewViewport(true);
                renderCutPreview();
            });
        }

        if (els.cutPreviewVolumeMaster) {
            els.cutPreviewVolumeMaster.addEventListener('input', function () {
                var gainPercent = clamp(parseNum(this.value, 100), 0, 300);
                state.previewMasterGain = gainPercent / 100;
                if (els.cutPreviewVolumeMasterLabel) {
                    els.cutPreviewVolumeMasterLabel.textContent = Math.round(gainPercent) + '%';
                }
                updateCurrentPreviewGain();
            });
        }

        if (els.cutPreviewTimeline) {
            els.cutPreviewTimeline.addEventListener('wheel', function (evt) {
                if (!state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return;
                var viewport = ensureCutPreviewViewport(false);
                if (!viewport) return;

                var deltaPx = Math.abs(evt.deltaX) > Math.abs(evt.deltaY) ? evt.deltaX : evt.deltaY;
                var shiftSec = deltaPx / Math.max(20, viewport.pixelsPerSec);
                var maxStart = Math.max(0, viewport.totalDurationSec - viewport.visibleDurationSec);
                state.cutPreviewViewStartSec = clamp(state.cutPreviewViewStartSec + shiftSec, 0, maxStart);
                renderCutPreview();
                evt.preventDefault();
            });
        }

        if (els.cutPreviewNavigator) {
            els.cutPreviewNavigator.addEventListener('mousedown', function (evt) {
                var dragNode = findDataElement(evt.target, 'data-nav-drag');
                if (!dragNode) return;
                beginNavigatorDrag(dragNode.getAttribute('data-nav-drag'), evt.clientX);
                evt.preventDefault();
            });
        }

        document.addEventListener('mousemove', function (evt) {
            if (!state.navigatorDrag) return;
            updateNavigatorDrag(evt.clientX);
            renderCutPreview();
            evt.preventDefault();
        });

        document.addEventListener('mouseup', function () {
            if (!state.navigatorDrag) return;
            endNavigatorDrag();
        });

        window.addEventListener('resize', function () {
            if (!state.cutPreview || !state.cutPreview.items || !state.cutPreview.items.length) return;
            if (state.panelPageMode !== 'review') return;
            renderCutPreview();
        });
    }

    function requestLargeStartupPanel() {
        if (!AutoCastBridge || typeof AutoCastBridge.resizePanel !== 'function') return;
        if (AutoCastBridge.isInMockMode && AutoCastBridge.isInMockMode()) return;
        try {
            var availW = parseNum(window.screen && window.screen.availWidth, 0);
            var availH = parseNum(window.screen && window.screen.availHeight, 0);
            if (!availW || !availH) return;
            var targetW = clamp(Math.round(availW * 0.95), 1200, 3400);
            var targetH = clamp(Math.round(availH * 0.95), 760, 2200);
            AutoCastBridge.resizePanel(targetW, targetH);
        } catch (e) {
            console.warn('[AutoCast] Could not resize panel at startup:', e);
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

    if (els.cutPreviewApplyBtn) {
        els.cutPreviewApplyBtn.addEventListener('click', applyEdits);
    }

    if (els.cutPreviewBackBtn) {
        els.cutPreviewBackBtn.addEventListener('click', function () {
            cancelPendingCutPreviewRender();
            setPanelPageMode('setup');
            setStatus('idle', 'Review closed');
        });
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
    if (els.cutPreviewApplyBtn) els.cutPreviewApplyBtn.disabled = true;
    if (els.btnReset) els.btnReset.disabled = true;
    setStatus('idle', 'Ready');

    setTimeout(requestLargeStartupPanel, 80);
    setTimeout(requestLargeStartupPanel, 700);
    setTimeout(requestLargeStartupPanel, 1800);

    // Auto-load track metadata, but no loudness scan on startup.
    setTimeout(loadTracksFromHost, 500);
})();

