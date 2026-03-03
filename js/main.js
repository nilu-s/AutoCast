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
    // Initialize Bridge
    // =====================
    AutoCastBridge.init();

    // =====================
    // State
    // =====================
    var state = {
        tracks: [],
        analysisResult: null,
        isAnalyzing: false,
        undoStack: [],
        maxUndoLevels: 5,
        perTrackSensitivity: {},
        mockSamples: null  // Generated once on Load Tracks, reused on Analyze
    };

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
        btnLoadTracks: $('btnLoadTracks'),
        btnAnalyze: $('btnAnalyze'),
        btnPreviewMarkers: $('btnPreviewMarkers'),
        btnApply: $('btnApply'),
        btnReset: $('btnReset'),

        paramThreshold: $('paramThreshold'),
        paramHold: $('paramHold'),
        paramMinSeg: $('paramMinSeg'),
        paramDucking: $('paramDucking'),
        paramCrossfade: $('paramCrossfade'),
        paramOverlap: $('paramOverlap'),
        valThreshold: $('valThreshold'),
        valHold: $('valHold'),
        valMinSeg: $('valMinSeg'),
        valDucking: $('valDucking'),
        valCrossfade: $('valCrossfade'),
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
        return {
            thresholdAboveFloorDb: parseInt(els.paramThreshold.value),
            holdFrames: Math.round(parseInt(els.paramHold.value) / 10),
            minSegmentMs: parseInt(els.paramMinSeg.value),
            duckingLevelDb: parseInt(els.paramDucking.value),
            rampMs: parseInt(els.paramCrossfade.value),
            overlapPolicy: els.paramOverlap.value,
            autoGain: els.toggleAutoGain ? els.toggleAutoGain.checked : true,
            useSpectralVAD: els.toggleSpectralVAD ? els.toggleSpectralVAD.checked : true,
            adaptiveCrossfade: els.toggleAdaptiveCrossfade ? els.toggleAdaptiveCrossfade.checked : true,
            perTrackThresholdDb: getPerTrackSensitivity()
        };
    }

    function getPerTrackSensitivity() {
        var hasPerTrack = false;
        for (var key in state.perTrackSensitivity) { hasPerTrack = true; break; }
        if (!hasPerTrack) return null;

        var arr = [];
        var globalThreshold = parseInt(els.paramThreshold.value);
        for (var i = 0; i < state.tracks.length; i++) {
            arr.push(state.perTrackSensitivity[i] !== undefined ? state.perTrackSensitivity[i] : globalThreshold);
        }
        return arr;
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

        AutoCastBridge.getTrackInfo(function (trackData) {
            if (!trackData || !trackData.tracks) {
                setStatus('error', 'Failed to load tracks');
                return;
            }

            state.tracks = trackData.tracks;

            // In browser mode: generate stable mock audio samples once
            if (AutoCastBridge.isInMockMode()) {
                state.mockSamples = generateMockSamples(trackData.tracks);
            }

            renderTrackList();
            setStatus('idle', state.tracks.length + ' tracks loaded');
        });
    });

    function renderTrackList() {
        var html = '';
        for (var i = 0; i < state.tracks.length; i++) {
            var track = state.tracks[i];
            var color = TRACK_COLORS[i % TRACK_COLORS.length];
            var clipCount = track.clips ? track.clips.length : 1;

            html += '<div class="track-item">';
            html += '<input type="checkbox" checked data-track="' + i + '">';
            html += '<span class="track-name" style="color: ' + color + '">' + (track.name || 'Audio ' + (i + 1)) + '</span>';

            // v2.0: per-track sensitivity slider
            html += '<div class="track-sensitivity" title="Per-Track Sensitivity">';
            html += '<input type="range" class="slider track-sensitivity-slider" min="3" max="30" value="12" step="1" data-track-sens="' + i + '">';
            html += '<span class="track-sensitivity-value" id="trackSens' + i + '">12</span>';
            html += '</div>';

            html += '<span class="track-clips">' + clipCount + ' clip' + (clipCount > 1 ? 's' : '') + '</span>';
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
    // Analysis (Mock in browser, real in Premiere)
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

        setStatus('analyzing', 'Analyzing...');
        setProgress(0, 'Starting analysis...');

        if (AutoCastBridge.isInMockMode()) {
            runMockAnalysis(selectedIndices);
        } else {
            runPremierAnalysis(selectedIndices);
        }
    }

    function runPremierAnalysis(selectedIndices) {
        var params = getParams();

        AutoCastBridge.getTrackInfo(function (trackData) {
            if (!trackData || !trackData.tracks) {
                state.isAnalyzing = false;
                hideProgress();
                setStatus('error', 'Could not read track info');
                return;
            }

            // Collect selected track media paths
            var trackPaths = [];
            for (var i = 0; i < selectedIndices.length; i++) {
                var idx = selectedIndices[i];
                var track = trackData.tracks[idx];
                if (track && track.clips && track.clips[0] && track.clips[0].mediaPath) {
                    trackPaths.push(track.clips[0].mediaPath);
                }
            }

            if (trackPaths.length === 0) {
                state.isAnalyzing = false;
                hideProgress();
                setStatus('error', 'No media files found on selected tracks');
                return;
            }

            // Resolve analyzer path relative to extension root (CEP uses __dirname)
            var analyzerPath;
            try {
                var extensionPath = AutoCastBridge.getExtensionPath();
                analyzerPath = extensionPath + '/node/analyzer';
            } catch (e) {
                analyzerPath = './node/analyzer';
            }

            // Run analysis asynchronously so progress bar can update in CEP
            setTimeout(function () {
                try {
                    var analyzer = require(analyzerPath);
                    var result = analyzer.analyze(trackPaths, params, function (pct, msg) {
                        setProgress(pct, msg);
                    });
                    onAnalysisComplete(result);
                } catch (e) {
                    state.isAnalyzing = false;
                    hideProgress();
                    setStatus('error', 'Analysis failed: ' + e.message);
                    console.error('[AutoCast] Analysis error:', e.stack || e);
                }
            }, 50);
        });
    }

    function runMockAnalysis(selectedIndices) {
        var step = 0;
        var interval = setInterval(function () {
            step += 5;
            var messages = ['Reading audio files...', 'Calculating energy...', 'Matching track volumes...',
                'Running spectral analysis...', 'Detecting voice activity...', 'Resolving overlaps...',
                'Building waveform...', 'Generating ducking map...', 'Finalizing...'];
            var msgIdx = Math.min(Math.floor(step / 12), messages.length - 1);
            setProgress(step, messages[msgIdx]);

            if (step >= 100) {
                clearInterval(interval);
                var result = generateMockResult(selectedIndices);
                onAnalysisComplete(result);
            }
        }, 100);
    }

    function onAnalysisComplete(result) {
        state.isAnalyzing = false;
        hideProgress();
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

    }

    // =====================
    // Results Display
    // =====================
    function renderResults(result) {
        var html = '';
        for (var i = 0; i < result.tracks.length; i++) {
            var track = result.tracks[i];
            var colorIdx = track.colorIndex !== undefined ? track.colorIndex : i;
            var color = TRACK_COLORS[colorIdx % TRACK_COLORS.length];

            var gainBadge = '';
            if (track.gainAdjustDb !== undefined && Math.abs(track.gainAdjustDb) > 0.1) {
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
            var colorIdx = (result.tracks[t] && result.tracks[t].colorIndex !== undefined) ? result.tracks[t].colorIndex : t;
            var color = TRACK_COLORS[colorIdx % TRACK_COLORS.length];
            html += '<div class="waveform-track">';
            html += '<div class="waveform-track-label">' + trackName + '</div>';
            html += '<canvas class="waveform-canvas" id="waveCanvas' + t + '" data-color="' + color + '"></canvas>';
            html += '</div>';
        }
        els.waveformContainer.innerHTML = html;
        els.waveformSection.style.display = 'block';

        // Draw with a small delay so DOM is ready
        setTimeout(function () {
            for (var t = 0; t < result.waveform.pointsPerTrack.length; t++) {
                var cIdx = (result.tracks[t] && result.tracks[t].colorIndex !== undefined) ? result.tracks[t].colorIndex : t;
                drawWaveform(
                    document.getElementById('waveCanvas' + t),
                    result.waveform.pointsPerTrack[t],
                    result.segments[t] || [],
                    TRACK_COLORS[cIdx % TRACK_COLORS.length],
                    result.waveform.timeStep
                );
            }
        }, 50);
    }

    function drawWaveform(canvas, points, segments, color, timeStep) {
        if (!canvas || !points.length) return;

        var ctx = canvas.getContext('2d');
        var w = canvas.parentElement.clientWidth - 12;
        var h = 48;
        canvas.width = w;
        canvas.height = h;

        // Parse hex color to RGB
        var r = parseInt(color.slice(1, 3), 16);
        var g = parseInt(color.slice(3, 5), 16);
        var b = parseInt(color.slice(5, 7), 16);

        var totalTime = timeStep * points.length;

        // Build a lookup: for each point index, is it in an active segment?
        var activeMap = new Uint8Array(points.length);
        for (var s = 0; s < segments.length; s++) {
            if (segments[s].state === 'active') {
                var i1 = Math.floor((segments[s].start / totalTime) * points.length);
                var i2 = Math.ceil((segments[s].end / totalTime) * points.length);
                for (var idx = Math.max(0, i1); idx < Math.min(points.length, i2); idx++) {
                    activeMap[idx] = 1;
                }
            }
        }

        // Find max for normalization
        var maxVal = 0;
        for (var i = 0; i < points.length; i++) {
            if (points[i] > maxVal) maxVal = points[i];
        }
        if (maxVal === 0) maxVal = 1;

        // 1. Draw a dim background for inactive areas and bright bg for active
        for (var s = 0; s < segments.length; s++) {
            if (segments[s].state === 'active') {
                var x1 = (segments[s].start / totalTime) * w;
                var x2 = (segments[s].end / totalTime) * w;
                // Bright background for active segments
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.12)';
                ctx.fillRect(x1, 0, x2 - x1, h - 4);
                // Colored indicator bar at bottom
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.9)';
                ctx.fillRect(x1, h - 3, x2 - x1, 3);
            }
        }

        // 2. Draw waveform bars with clear active/inactive distinction
        var barWidth = Math.max(1, w / points.length);
        var waveH = h - 5; // Leave room for indicator bar

        for (var i = 0; i < points.length; i++) {
            var normalized = points[i] / maxVal;
            var barHeight = Math.max(1, normalized * (waveH - 2));
            var x = (i / points.length) * w;
            var y = (waveH - barHeight) / 2;

            if (activeMap[i]) {
                // Active: bright, saturated color
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.5 + normalized * 0.5) + ')';
            } else {
                // Inactive: very dim gray
                ctx.fillStyle = 'rgba(100,100,100,' + (0.1 + normalized * 0.2) + ')';
            }
            ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
        }
    }

    // =====================
    // Action Buttons
    // =====================
    els.btnPreviewMarkers.addEventListener('click', function () {
        if (!state.analysisResult) return;
        setStatus('analyzing', 'Setting markers...');

        AutoCastBridge.addMarkers({
            segments: state.analysisResult.segments,
            tracks: state.analysisResult.tracks
        }, function (result) {
            if (result && result.success) {
                setStatus('success', 'Preview markers set (' + (result.markersAdded || 0) + ' markers)');
            } else {
                setStatus('error', 'Marker error');
            }
        });
    });

    els.btnApply.addEventListener('click', function () {
        if (!state.analysisResult) return;
        setStatus('analyzing', 'Applying keyframes...');

        AutoCastBridge.applyKeyframes({
            keyframes: state.analysisResult.keyframes
        }, function (result) {
            if (result && result.success) {
                setStatus('success', 'Keyframes applied (' + (result.totalKeyframesSet || 0) + ' keyframes)');
            } else {
                setStatus('error', 'Apply error');
            }
        });
    });

    els.btnReset.addEventListener('click', function () {
        setStatus('analyzing', 'Removing keyframes...');

        AutoCastBridge.removeKeyframes([], function (result) {
            if (result && result.success) {
                setStatus('idle', 'Keyframes removed');
                // v2.0: pop undo stack
                if (state.undoStack.length > 1) {
                    state.undoStack.pop();
                    state.analysisResult = state.undoStack[state.undoStack.length - 1];
                } else {
                    state.analysisResult = null;
                    els.resultsSection.style.display = 'none';
                    els.waveformSection.style.display = 'none';
                    els.btnPreviewMarkers.disabled = true;
                    els.btnApply.disabled = true;

                }
            } else {
                setStatus('error', 'Reset error');
            }
        });
    });


    // =====================
    // v2.0: Keyboard Shortcuts
    // =====================
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!state.isAnalyzing) runAnalysis();
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            if (state.analysisResult && !els.btnApply.disabled) els.btnApply.click();
        }

        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (!els.btnReset.disabled) els.btnReset.click();
        }
    });

    // =====================
    // Mode Indicator
    // =====================
    if (els.modeIndicator) {
        els.modeIndicator.textContent = AutoCastBridge.isInMockMode() ? '🌐 Browser Mode' : 'Premiere Pro';
    }

    // =====================
    // Mock Sample Generator (called once on Load Tracks)
    // =====================
    function seededRandom(seed) {
        // Simple seeded PRNG for deterministic mock data
        var s = seed;
        return function () {
            s = (s * 16807 + 0) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    function generateMockSamples(tracks) {
        var duration = 900; // 15 min
        var wavePoints = 500;
        var timeStep = duration / wavePoints;
        var samples = {};

        for (var t = 0; t < tracks.length; t++) {
            // Each track gets a unique seed based on its index and name
            var seed = 12345 + t * 7919 + (tracks[t].name || '').length * 131;
            var rng = seededRandom(seed);

            // Generate speech segments for this track
            var segments = [];
            var time = rng() * 10;
            var segCount = 15 + Math.floor(rng() * 35);
            for (var s = 0; s < segCount; s++) {
                var gap = 3 + rng() * 20;
                var len = 2 + rng() * 12;
                var start = time + gap;
                var end = start + len;
                if (end > duration) break;
                segments.push({ start: start, end: end });
                time = end;
            }

            // Generate waveform points aligned with segments
            var points = [];
            for (var p = 0; p < wavePoints; p++) {
                var pointTime = p * timeStep;
                var isActive = false;
                for (var ss = 0; ss < segments.length; ss++) {
                    if (pointTime >= segments[ss].start && pointTime <= segments[ss].end) {
                        isActive = true;
                        break;
                    }
                }
                if (isActive) {
                    points.push(0.3 + rng() * 0.5);
                } else {
                    points.push(0.01 + rng() * 0.07);
                }
            }

            samples[t] = {
                segments: segments,
                waveform: points,
                gainAdjustDb: Math.round((rng() * 8 - 4) * 10) / 10,
                noiseFloorDb: -50 - Math.round(rng() * 10)
            };
        }

        samples._duration = duration;
        samples._wavePoints = wavePoints;
        samples._timeStep = timeStep;
        return samples;
    }

    // =====================
    // Mock Analysis (uses pre-generated samples)
    // =====================
    function generateMockResult(selectedIndices) {
        var mockData = state.mockSamples;
        var duration = mockData._duration;
        var timeStep = mockData._timeStep;

        var tracks = [];
        var segments = [];
        var keyframes = [];
        var waveformPoints = [];

        // Get current threshold to adjust segments (simulates parameter sensitivity)
        var threshold = parseInt(els.paramThreshold.value);
        var minSegMs = parseInt(els.paramMinSeg.value);

        for (var i = 0; i < selectedIndices.length; i++) {
            var origIdx = selectedIndices[i];
            var sample = mockData[origIdx];
            if (!sample) continue;

            var trackName = state.tracks[origIdx] ? state.tracks[origIdx].name : 'Track ' + (origIdx + 1);

            // Apply threshold/minSeg to filter segments (simulate parameter effect)
            var filteredSegs = [];
            for (var s = 0; s < sample.segments.length; s++) {
                var seg = sample.segments[s];
                var segDurMs = (seg.end - seg.start) * 1000;
                // Higher threshold = fewer segments kept
                var keepChance = 1.0 - (threshold - 12) * 0.04;
                if (segDurMs >= minSegMs && (keepChance >= 1.0 || segDurMs > minSegMs * 1.5)) {
                    filteredSegs.push({
                        start: seg.start,
                        end: seg.end,
                        trackIndex: i,
                        state: 'active'
                    });
                }
            }
            segments.push(filteredSegs);

            // Reuse stored waveform
            waveformPoints.push(sample.waveform);

            var activeTime = 0;
            for (var s = 0; s < filteredSegs.length; s++) {
                activeTime += filteredSegs[s].end - filteredSegs[s].start;
            }

            tracks.push({
                name: trackName,
                colorIndex: origIdx,
                segmentCount: filteredSegs.length,
                activePercent: Math.round((activeTime / duration) * 100),
                noiseFloorDb: sample.noiseFloorDb,
                gainAdjustDb: sample.gainAdjustDb
            });

            keyframes.push([{ time: 0, gainDb: -24 }, { time: duration, gainDb: -24 }]);
        }

        return {
            version: '2.0.0',
            totalDurationSec: duration,
            tracks: tracks,
            segments: segments,
            keyframes: keyframes,
            waveform: {
                pointsPerTrack: waveformPoints,
                timeStep: timeStep,
                totalDurationSec: duration
            },
            alignment: { aligned: true, maxDriftSec: 0.01, warning: null },
            gainMatching: null
        };
    }

    console.log('AutoCast v2.0 initialized' + (AutoCastBridge.isInMockMode() ? ' (browser mode)' : ''));
})();
