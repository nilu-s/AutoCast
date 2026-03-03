/**
 * AutoCast – Panel UI Controller v2.0
 * 
 * Manages the full user workflow:
 *   Load Tracks → Configure → Analyze → Preview → Apply → Undo
 * 
 * v2.0 features:
 *   - Waveform preview (canvas rendering)
 *   - Per-track sensitivity sliders
 *   - Keyboard shortcuts (Ctrl+Enter, Ctrl+Shift+Enter)
 *   - Save/Load analysis results
 *   - Undo history (stores previous keyframe states)
 *   - Feature toggles (auto-gain, spectral VAD, adaptive crossfade)
 */

'use strict';

(function () {
    // =====================
    // State
    // =====================
    var state = {
        tracks: [],
        analysisResult: null,
        isAnalyzing: false,
        undoStack: [],      // v2.0: stores previous results for undo
        maxUndoLevels: 5,
        perTrackSensitivity: {} // v2.0: trackIndex -> thresholdDb
    };

    // Track colors for waveform and markers
    var TRACK_COLORS = [
        '#4ea1f3', '#4caf50', '#ff9800', '#e91e63',
        '#9c27b0', '#00bcd4', '#ffeb3b', '#795548'
    ];

    // =====================
    // DOM Elements
    // =====================
    function $(id) { return document.getElementById(id); }

    var els = {
        statusBar: $('statusBar'),
        statusText: $('statusText'),
        statusIcon: $('statusIcon'),
        trackList: $('trackList'),
        resultsSection: $('resultsSection'),
        resultsContent: $('resultsContent'),
        progressContainer: $('progressContainer'),
        progressFill: $('progressFill'),
        progressText: $('progressText'),
        waveformSection: $('waveformSection'),
        waveformContainer: $('waveformContainer'),

        // Buttons
        btnLoadTracks: $('btnLoadTracks'),
        btnAnalyze: $('btnAnalyze'),
        btnPreviewMarkers: $('btnPreviewMarkers'),
        btnApply: $('btnApply'),
        btnReset: $('btnReset'),
        btnSaveAnalysis: $('btnSaveAnalysis'),
        btnLoadAnalysis: $('btnLoadAnalysis'),

        // Params
        paramThreshold: $('paramThreshold'),
        paramHold: $('paramHold'),
        paramMinSeg: $('paramMinSeg'),
        paramDucking: $('paramDucking'),
        paramCrossfade: $('paramCrossfade'),
        paramOverlap: $('paramOverlap'),

        // Values
        valThreshold: $('valThreshold'),
        valHold: $('valHold'),
        valMinSeg: $('valMinSeg'),
        valDucking: $('valDucking'),
        valCrossfade: $('valCrossfade'),

        // v2.0 toggles
        toggleAutoGain: $('toggleAutoGain'),
        toggleSpectralVAD: $('toggleSpectralVAD'),
        toggleAdaptiveCrossfade: $('toggleAdaptiveCrossfade'),

        modeIndicator: $('modeIndicator')
    };

    // =====================
    // Parameter Binding
    // =====================
    function bindSlider(slider, display, suffix) {
        if (!slider || !display) return;
        slider.addEventListener('input', function () {
            display.textContent = slider.value + ' ' + suffix;
        });
    }

    bindSlider(els.paramThreshold, els.valThreshold, 'dB');
    bindSlider(els.paramHold, els.valHold, 'ms');
    bindSlider(els.paramMinSeg, els.valMinSeg, 'ms');
    bindSlider(els.paramDucking, els.valDucking, 'dB');
    bindSlider(els.paramCrossfade, els.valCrossfade, 'ms');

    function getParams() {
        var params = {
            thresholdAboveFloorDb: parseInt(els.paramThreshold.value),
            holdFrames: Math.round(parseInt(els.paramHold.value) / 10),
            minSegmentMs: parseInt(els.paramMinSeg.value),
            duckingLevelDb: parseInt(els.paramDucking.value),
            rampMs: parseInt(els.paramCrossfade.value),
            overlapPolicy: els.paramOverlap.value,
            autoGain: els.toggleAutoGain ? els.toggleAutoGain.checked : true,
            useSpectralVAD: els.toggleSpectralVAD ? els.toggleSpectralVAD.checked : true,
            adaptiveCrossfade: els.toggleAdaptiveCrossfade ? els.toggleAdaptiveCrossfade.checked : true
        };

        // Per-track sensitivity (v2.0)
        var perTrack = {};
        var hasPerTrack = false;
        for (var key in state.perTrackSensitivity) {
            perTrack[key] = state.perTrackSensitivity[key];
            hasPerTrack = true;
        }
        if (hasPerTrack) {
            var arr = [];
            for (var i = 0; i < state.tracks.length; i++) {
                arr.push(perTrack[i] !== undefined ? perTrack[i] : params.thresholdAboveFloorDb);
            }
            params.perTrackThresholdDb = arr;
        }

        return params;
    }

    // =====================
    // Status Management
    // =====================
    function setStatus(type, text) {
        els.statusBar.className = 'status-bar status-' + type;
        els.statusText.textContent = text;
    }

    function setProgress(percent, message) {
        els.progressContainer.style.display = 'flex';
        els.progressFill.style.width = percent + '%';
        els.progressText.textContent = percent + '%';
        if (message) setStatus('analyzing', message);
    }

    function hideProgress() {
        els.progressContainer.style.display = 'none';
    }

    // =====================
    // Track Loading
    // =====================
    els.btnLoadTracks.addEventListener('click', function () {
        setStatus('analyzing', 'Loading tracks...');

        window.csiBridge.callScript('getTrackInfo', {}, function (err, trackData) {
            if (err) {
                setStatus('error', 'Failed to load tracks: ' + err);
                return;
            }

            state.tracks = trackData.tracks || [];
            renderTrackList();
            setStatus('idle', state.tracks.length + ' tracks loaded');
        });
    });

    function renderTrackList() {
        var html = '';
        for (var i = 0; i < state.tracks.length; i++) {
            var track = state.tracks[i];
            var color = TRACK_COLORS[i % TRACK_COLORS.length];

            html += '<div class="track-item">';
            html += '<input type="checkbox" checked data-track="' + i + '">';
            html += '<span class="track-name" style="color: ' + color + '">' + (track.name || 'Audio ' + (i + 1)) + '</span>';

            // v2.0: per-track sensitivity slider
            html += '<div class="track-sensitivity" title="Per-Track Sensitivity">';
            html += '<input type="range" class="slider track-sensitivity-slider" min="3" max="30" value="12" step="1" data-track-sens="' + i + '">';
            html += '<span class="track-sensitivity-value" id="trackSens' + i + '">12</span>';
            html += '</div>';

            html += '<span class="track-clips">' + (track.clipCount || 1) + ' clip' + ((track.clipCount || 1) > 1 ? 's' : '') + '</span>';
            html += '</div>';
        }
        els.trackList.innerHTML = html;

        // Bind per-track sensitivity sliders
        var sensSliders = document.querySelectorAll('[data-track-sens]');
        for (var i = 0; i < sensSliders.length; i++) {
            (function (slider) {
                var trackIdx = parseInt(slider.getAttribute('data-track-sens'));
                slider.addEventListener('input', function () {
                    var val = parseInt(slider.value);
                    document.getElementById('trackSens' + trackIdx).textContent = val;
                    state.perTrackSensitivity[trackIdx] = val;
                });
            })(sensSliders[i]);
        }
    }

    function getSelectedTrackIndices() {
        var checkboxes = els.trackList.querySelectorAll('input[type="checkbox"][data-track]');
        var indices = [];
        for (var i = 0; i < checkboxes.length; i++) {
            if (checkboxes[i].checked) {
                indices.push(parseInt(checkboxes[i].getAttribute('data-track')));
            }
        }
        return indices;
    }

    // =====================
    // Analysis
    // =====================
    els.btnAnalyze.addEventListener('click', runAnalysis);

    function runAnalysis() {
        if (state.isAnalyzing) return;
        state.isAnalyzing = true;

        var selectedIndices = getSelectedTrackIndices();
        if (selectedIndices.length === 0) {
            setStatus('error', 'No tracks selected');
            state.isAnalyzing = false;
            return;
        }

        var params = getParams();
        setStatus('analyzing', 'Analyzing...');
        setProgress(0, 'Starting analysis...');

        var analysisData = {
            trackIndices: selectedIndices,
            params: params
        };

        window.csiBridge.callScript('runAnalysis', analysisData, function (err, result) {
            state.isAnalyzing = false;
            hideProgress();

            if (err) {
                setStatus('error', 'Analysis failed: ' + err);
                return;
            }

            state.analysisResult = result;

            // v2.0: push to undo stack
            if (state.undoStack.length >= state.maxUndoLevels) {
                state.undoStack.shift();
            }
            state.undoStack.push(JSON.parse(JSON.stringify(result)));

            renderResults(result);
            renderWaveform(result);

            var totalSegs = 0;
            for (var i = 0; i < result.tracks.length; i++) {
                totalSegs += result.tracks[i].segmentCount;
            }
            setStatus('success', 'Analysis complete – ' + result.tracks.length + ' tracks, ' + totalSegs + ' segments');

            els.btnPreviewMarkers.disabled = false;
            els.btnApply.disabled = false;
            els.btnReset.disabled = false;
            els.btnSaveAnalysis.disabled = false;
        });
    }

    // =====================
    // Results Display
    // =====================
    function renderResults(result) {
        var html = '';
        for (var i = 0; i < result.tracks.length; i++) {
            var track = result.tracks[i];
            var color = TRACK_COLORS[i % TRACK_COLORS.length];

            // v2.0: gain adjustment badge
            var gainBadge = '';
            if (track.gainAdjustDb !== undefined && track.gainAdjustDb !== 0) {
                var gainClass = track.gainAdjustDb > 0 ? 'gain-boost' : 'gain-cut';
                var gainSign = track.gainAdjustDb > 0 ? '+' : '';
                gainBadge = '<span class="result-gain-badge ' + gainClass + '">' + gainSign + track.gainAdjustDb + ' dB</span>';
            }

            html += '<div class="result-track">';
            html += '<div class="result-track-name" style="color:' + color + '">' + (track.name || 'Track ' + (i + 1)) + gainBadge + '</div>';
            html += '<div class="result-track-stats">' +
                track.segmentCount + ' segments · ' +
                track.activePercent + '% active · ' +
                'Floor: ' + track.noiseFloorDb + ' dBFS' +
                '</div>';
            html += '</div>';
        }

        if (result.alignment && result.alignment.warning) {
            html += '<div class="result-warning">' + result.alignment.warning + '</div>';
        }

        els.resultsContent.innerHTML = html;
        els.resultsSection.style.display = 'block';
    }

    // =====================
    // v2.0: Waveform Preview
    // =====================
    function renderWaveform(result) {
        if (!result.waveform || !result.waveform.pointsPerTrack) {
            els.waveformSection.style.display = 'none';
            return;
        }

        var html = '';
        for (var t = 0; t < result.waveform.pointsPerTrack.length; t++) {
            var trackName = (result.tracks[t] ? result.tracks[t].name : 'Track ' + (t + 1));
            var color = TRACK_COLORS[t % TRACK_COLORS.length];
            html += '<div class="waveform-track">';
            html += '<div class="waveform-track-label">' + trackName + '</div>';
            html += '<canvas class="waveform-canvas" id="waveCanvas' + t + '" data-track="' + t + '" data-color="' + color + '"></canvas>';
            html += '</div>';
        }
        els.waveformContainer.innerHTML = html;
        els.waveformSection.style.display = 'block';

        // Draw waveforms
        for (var t = 0; t < result.waveform.pointsPerTrack.length; t++) {
            drawWaveform(
                document.getElementById('waveCanvas' + t),
                result.waveform.pointsPerTrack[t],
                result.segments[t] || [],
                TRACK_COLORS[t % TRACK_COLORS.length],
                result.waveform.timeStep
            );
        }
    }

    function drawWaveform(canvas, points, segments, color, timeStep) {
        if (!canvas || !points.length) return;

        var ctx = canvas.getContext('2d');
        var w = canvas.parentElement.clientWidth - 12;
        var h = 32;
        canvas.width = w;
        canvas.height = h;

        // Find max for normalization
        var maxVal = 0;
        for (var i = 0; i < points.length; i++) {
            if (points[i] > maxVal) maxVal = points[i];
        }
        if (maxVal === 0) maxVal = 1;

        // Draw active segment backgrounds
        ctx.fillStyle = color.replace(')', ', 0.1)').replace('rgb', 'rgba').replace('#', '');
        // Convert hex to rgba
        var r = parseInt(color.slice(1, 3), 16);
        var g = parseInt(color.slice(3, 5), 16);
        var b = parseInt(color.slice(5, 7), 16);

        for (var s = 0; s < segments.length; s++) {
            if (segments[s].state === 'active') {
                var x1 = (segments[s].start / (timeStep * points.length)) * w;
                var x2 = (segments[s].end / (timeStep * points.length)) * w;
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.15)';
                ctx.fillRect(x1, 0, x2 - x1, h);
            }
        }

        // Draw waveform bars
        var barWidth = Math.max(1, w / points.length);
        for (var i = 0; i < points.length; i++) {
            var normalized = points[i] / maxVal;
            var barHeight = Math.max(1, normalized * (h - 2));
            var x = (i / points.length) * w;
            var y = (h - barHeight) / 2;

            ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.3 + normalized * 0.7) + ')';
            ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
        }
    }

    // =====================
    // Action Buttons
    // =====================
    els.btnPreviewMarkers.addEventListener('click', function () {
        if (!state.analysisResult) return;
        setStatus('analyzing', 'Setting markers...');

        window.csiBridge.callScript('applyMarkers', {
            segments: state.analysisResult.segments,
            tracks: state.analysisResult.tracks
        }, function (err) {
            if (err) {
                setStatus('error', 'Marker error: ' + err);
            } else {
                setStatus('success', 'Preview markers set');
            }
        });
    });

    els.btnApply.addEventListener('click', function () {
        if (!state.analysisResult) return;
        setStatus('analyzing', 'Applying keyframes...');

        window.csiBridge.callScript('applyKeyframes', {
            keyframes: state.analysisResult.keyframes
        }, function (err) {
            if (err) {
                setStatus('error', 'Apply error: ' + err);
            } else {
                setStatus('success', 'Keyframes applied – ' +
                    state.analysisResult.keyframes.reduce(function (s, k) { return s + k.length; }, 0) + ' keyframes');
            }
        });
    });

    els.btnReset.addEventListener('click', function () {
        setStatus('analyzing', 'Removing keyframes...');

        window.csiBridge.callScript('resetKeyframes', {}, function (err) {
            if (err) {
                setStatus('error', 'Reset error: ' + err);
            } else {
                setStatus('idle', 'Keyframes removed');

                // v2.0: Restore previous state from undo stack
                if (state.undoStack.length > 1) {
                    state.undoStack.pop(); // Remove current
                    state.analysisResult = state.undoStack[state.undoStack.length - 1];
                } else {
                    state.analysisResult = null;
                    els.resultsSection.style.display = 'none';
                    els.waveformSection.style.display = 'none';
                    els.btnPreviewMarkers.disabled = true;
                    els.btnApply.disabled = true;
                    els.btnSaveAnalysis.disabled = true;
                }
            }
        });
    });

    // =====================
    // v2.0: Save/Load Analysis
    // =====================
    if (els.btnSaveAnalysis) {
        els.btnSaveAnalysis.addEventListener('click', function () {
            if (!state.analysisResult) return;
            var json = JSON.stringify(state.analysisResult, null, 2);

            // Try native file save if available, otherwise use download
            if (window.csiBridge && window.csiBridge.isInPremiere) {
                window.csiBridge.callScript('saveFile', {
                    content: json,
                    filename: 'autocast_analysis.json'
                }, function (err) {
                    if (err) setStatus('error', 'Save failed');
                    else setStatus('success', 'Analysis saved');
                });
            } else {
                // Browser fallback: download
                var blob = new Blob([json], { type: 'application/json' });
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'autocast_analysis.json';
                a.click();
                setStatus('success', 'Analysis downloaded');
            }
        });
    }

    if (els.btnLoadAnalysis) {
        els.btnLoadAnalysis.addEventListener('click', function () {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function (e) {
                var file = e.target.files[0];
                if (!file) return;

                var reader = new FileReader();
                reader.onload = function (e) {
                    try {
                        var result = JSON.parse(e.target.result);
                        state.analysisResult = result;
                        renderResults(result);
                        renderWaveform(result);
                        setStatus('success', 'Analysis loaded from file');
                        els.btnPreviewMarkers.disabled = false;
                        els.btnApply.disabled = false;
                        els.btnReset.disabled = false;
                        els.btnSaveAnalysis.disabled = false;
                    } catch (err) {
                        setStatus('error', 'Invalid analysis file');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

    // =====================
    // v2.0: Keyboard Shortcuts
    // =====================
    document.addEventListener('keydown', function (e) {
        // Ctrl+Enter: Analyze
        if (e.ctrlKey && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!state.isAnalyzing) runAnalysis();
        }
        // Ctrl+Shift+Enter: Apply
        if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            if (state.analysisResult && !els.btnApply.disabled) {
                els.btnApply.click();
            }
        }
        // Ctrl+S: Save analysis
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (state.analysisResult && els.btnSaveAnalysis) {
                els.btnSaveAnalysis.click();
            }
        }
        // Ctrl+Z: Undo (reset)
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (!els.btnReset.disabled) {
                els.btnReset.click();
            }
        }
    });

    // =====================
    // Mode Detection
    // =====================
    if (els.modeIndicator) {
        if (typeof CSInterface !== 'undefined' && !(window.CSInterface && window.CSInterface._isMock)) {
            els.modeIndicator.textContent = 'Premiere Pro';
        } else {
            els.modeIndicator.textContent = '🌐 Browser Mode';
        }
    }

    // =====================
    // Mock Analysis (for browser testing)
    // =====================
    if (window.csiBridge && window.csiBridge._isMock) {
        // Override analysis to use mock data
        window.csiBridge.callScript = function (method, params, callback) {
            console.log('[Mock] callScript:', method, params);

            if (method === 'getTrackInfo') {
                setTimeout(function () {
                    callback(null, {
                        tracks: [
                            { name: 'Host', clipCount: 1, mediaPath: 'host.wav' },
                            { name: 'Guest 1', clipCount: 1, mediaPath: 'guest1.wav' },
                            { name: 'Guest 2', clipCount: 1, mediaPath: 'guest2.wav' }
                        ]
                    });
                }, 300);
            } else if (method === 'runAnalysis') {
                // Simulate progress
                var step = 0;
                var interval = setInterval(function () {
                    step += 10;
                    setProgress(step, 'Analyzing... ' + step + '%');
                    if (step >= 100) {
                        clearInterval(interval);
                        callback(null, generateMockResult());
                    }
                }, 200);
            } else {
                setTimeout(function () { callback(null, { ok: true }); }, 200);
            }
        };
    }

    function generateMockResult() {
        var trackCount = state.tracks.length || 3;
        var duration = 900; // 15 min
        var tracks = [];
        var segments = [];
        var keyframes = [];
        var waveformPoints = [];

        for (var t = 0; t < trackCount; t++) {
            var segCount = 40 + Math.floor(Math.random() * 80);
            var active = 20 + Math.floor(Math.random() * 40);
            var gainAdj = Math.round((Math.random() * 8 - 4) * 10) / 10;

            tracks.push({
                name: state.tracks[t] ? state.tracks[t].name : 'Track ' + (t + 1),
                segmentCount: segCount,
                activePercent: active,
                noiseFloorDb: -50 - Math.round(Math.random() * 10),
                gainAdjustDb: gainAdj
            });

            // Generate mock segments
            var trackSegs = [];
            var time = 0;
            for (var s = 0; s < segCount; s++) {
                var gap = 1 + Math.random() * 15;
                var len = 0.5 + Math.random() * 8;
                var start = time + gap;
                var end = start + len;
                if (end > duration) break;
                trackSegs.push({ start: start, end: end, trackIndex: t, state: 'active' });
                time = end;
            }
            segments.push(trackSegs);
            keyframes.push([{ time: 0, gainDb: -24 }, { time: duration, gainDb: -24 }]);

            // Generate mock waveform
            var points = [];
            for (var p = 0; p < 500; p++) {
                points.push(Math.random() * 0.5 + 0.05);
            }
            waveformPoints.push(points);
        }

        return {
            version: '2.0.0',
            totalDurationSec: duration,
            tracks: tracks,
            segments: segments,
            keyframes: keyframes,
            waveform: {
                pointsPerTrack: waveformPoints,
                timeStep: duration / 500,
                totalDurationSec: duration
            },
            alignment: { aligned: true, maxDriftSec: 0.01, warning: null },
            gainMatching: { gains: tracks.map(function () { return 1; }), gainsDb: tracks.map(function (t) { return t.gainAdjustDb; }) }
        };
    }

    console.log('AutoCast v2.0 initialized');

})();
