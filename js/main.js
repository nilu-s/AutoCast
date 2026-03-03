/**
 * AutoCast – Main UI Controller
 * 
 * Handles all UI events, parameter management, and orchestrates
 * the analysis pipeline. Works both in Premiere (via CSInterface)
 * and in browser (via mock layer) for testing.
 */

'use strict';

(function () {
    // --- State ---
    var state = {
        trackInfo: null,         // Track data from Premiere
        selectedTracks: [],      // Indices of selected tracks
        analysisResult: null,    // Result from analyzer
        isAnalyzing: false
    };

    // --- DOM References ---
    var dom = {};

    // --- Initialize on DOM ready ---
    document.addEventListener('DOMContentLoaded', function () {
        cacheDom();
        bindEvents();
        AutoCastBridge.init();
        updateModeIndicator();
        setStatus('idle', 'Ready');
    });

    function cacheDom() {
        dom.statusBar = document.getElementById('statusBar');
        dom.statusIcon = document.getElementById('statusIcon');
        dom.statusText = document.getElementById('statusText');
        dom.trackList = document.getElementById('trackList');
        dom.btnLoadTracks = document.getElementById('btnLoadTracks');
        dom.btnAnalyze = document.getElementById('btnAnalyze');
        dom.btnPreviewMarkers = document.getElementById('btnPreviewMarkers');
        dom.btnApply = document.getElementById('btnApply');
        dom.btnReset = document.getElementById('btnReset');
        dom.progressContainer = document.getElementById('progressContainer');
        dom.progressFill = document.getElementById('progressFill');
        dom.progressText = document.getElementById('progressText');
        dom.resultsSection = document.getElementById('resultsSection');
        dom.resultsContent = document.getElementById('resultsContent');
        dom.modeIndicator = document.getElementById('modeIndicator');

        // Parameter sliders
        dom.paramThreshold = document.getElementById('paramThreshold');
        dom.paramHold = document.getElementById('paramHold');
        dom.paramMinSeg = document.getElementById('paramMinSeg');
        dom.paramDucking = document.getElementById('paramDucking');
        dom.paramCrossfade = document.getElementById('paramCrossfade');
        dom.paramOverlap = document.getElementById('paramOverlap');

        // Parameter value displays
        dom.valThreshold = document.getElementById('valThreshold');
        dom.valHold = document.getElementById('valHold');
        dom.valMinSeg = document.getElementById('valMinSeg');
        dom.valDucking = document.getElementById('valDucking');
        dom.valCrossfade = document.getElementById('valCrossfade');
    }

    function bindEvents() {
        dom.btnLoadTracks.addEventListener('click', loadTracks);
        dom.btnAnalyze.addEventListener('click', runAnalysis);
        dom.btnPreviewMarkers.addEventListener('click', previewMarkers);
        dom.btnApply.addEventListener('click', applyEdits);
        dom.btnReset.addEventListener('click', resetEdits);

        // Slider value display updates
        dom.paramThreshold.addEventListener('input', function () {
            dom.valThreshold.textContent = this.value + ' dB';
        });
        dom.paramHold.addEventListener('input', function () {
            dom.valHold.textContent = this.value + ' ms';
        });
        dom.paramMinSeg.addEventListener('input', function () {
            dom.valMinSeg.textContent = this.value + ' ms';
        });
        dom.paramDucking.addEventListener('input', function () {
            dom.valDucking.textContent = this.value + ' dB';
        });
        dom.paramCrossfade.addEventListener('input', function () {
            dom.valCrossfade.textContent = this.value + ' ms';
        });
    }

    // --- Track Loading ---
    function loadTracks() {
        setStatus('analyzing', 'Loading tracks from sequence...');

        AutoCastBridge.getTrackInfo(function (result) {
            if (!result || result.error) {
                setStatus('error', result ? result.error : 'Failed to get track info');
                return;
            }

            state.trackInfo = result;
            renderTrackList(result.tracks);
            setStatus('success', 'Loaded ' + result.audioTrackCount + ' tracks from "' + result.sequenceName + '"');
        });
    }

    function renderTrackList(tracks) {
        dom.trackList.innerHTML = '';
        state.selectedTracks = [];

        for (var i = 0; i < tracks.length; i++) {
            var track = tracks[i];
            var clipCount = track.clips ? track.clips.length : 0;

            var item = document.createElement('div');
            item.className = 'track-item';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true; // Select all by default
            checkbox.dataset.trackIndex = i;
            checkbox.id = 'track-cb-' + i;
            checkbox.addEventListener('change', updateSelectedTracks);

            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'track-name-input';
            nameInput.value = track.name || ('Track ' + (i + 1));
            nameInput.dataset.trackIndex = i;
            nameInput.title = 'Click to rename (optional)';

            var clipInfo = document.createElement('span');
            clipInfo.className = 'track-clips';
            clipInfo.textContent = clipCount + ' clip' + (clipCount !== 1 ? 's' : '');

            item.appendChild(checkbox);
            item.appendChild(nameInput);
            item.appendChild(clipInfo);
            dom.trackList.appendChild(item);

            state.selectedTracks.push(i);
        }
    }

    function updateSelectedTracks() {
        state.selectedTracks = [];
        var checkboxes = dom.trackList.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < checkboxes.length; i++) {
            if (checkboxes[i].checked) {
                state.selectedTracks.push(parseInt(checkboxes[i].dataset.trackIndex));
            }
        }
    }

    // --- Get current parameters ---
    function getParams() {
        var holdMs = parseInt(dom.paramHold.value);
        var frameDurationMs = 10;

        return {
            frameDurationMs: frameDurationMs,
            thresholdAboveFloorDb: parseInt(dom.paramThreshold.value),
            holdFrames: Math.round(holdMs / frameDurationMs),
            releaseFrames: 5,
            attackFrames: 2,
            rmsSmoothing: 5,
            minSegmentMs: parseInt(dom.paramMinSeg.value),
            minGapMs: Math.round(parseInt(dom.paramMinSeg.value) * 0.8),
            duckingLevelDb: parseInt(dom.paramDucking.value),
            rampMs: parseInt(dom.paramCrossfade.value),
            overlapPolicy: dom.paramOverlap.value,
            overlapMarginDb: 6
        };
    }

    // --- Analysis ---
    function runAnalysis() {
        if (state.isAnalyzing) return;

        if (state.selectedTracks.length < 2) {
            setStatus('error', 'Select at least 2 tracks for analysis.');
            return;
        }

        // In mock/browser mode: run a simulated analysis
        if (AutoCastBridge.isInMockMode()) {
            runMockAnalysis();
            return;
        }

        // Real mode: need to get WAV paths from track info
        if (!state.trackInfo) {
            setStatus('error', 'Please load tracks first.');
            return;
        }

        state.isAnalyzing = true;
        setStatus('analyzing', 'Analyzing audio tracks...');
        showProgress(0);
        disableButtons(true);

        // Collect WAV file paths from selected tracks
        var wavPaths = [];
        for (var i = 0; i < state.selectedTracks.length; i++) {
            var tIdx = state.selectedTracks[i];
            var track = state.trackInfo.tracks[tIdx];
            if (track.clips && track.clips.length > 0 && track.clips[0].mediaPath) {
                wavPaths.push(track.clips[0].mediaPath);
            }
        }

        if (wavPaths.length < 2) {
            setStatus('error', 'Could not find media files for selected tracks.');
            state.isAnalyzing = false;
            disableButtons(false);
            hideProgress();
            return;
        }

        // Run analysis via Node.js (require works in CEP)
        try {
            var analyzerPath = AutoCastBridge.getExtensionPath() + '/node/analyzer.js';
            var analyzer = require(analyzerPath);
            var params = getParams();

            var result = analyzer.analyze(wavPaths, params, function (pct, msg) {
                showProgress(pct, msg);
            });

            onAnalysisComplete(result);
        } catch (e) {
            setStatus('error', 'Analysis failed: ' + e.message);
            console.error('[AutoCast] Analysis error:', e);
            state.isAnalyzing = false;
            disableButtons(false);
            hideProgress();
        }
    }

    function runMockAnalysis() {
        state.isAnalyzing = true;
        setStatus('analyzing', 'Simulated analysis (browser mode)...');
        showProgress(0);
        disableButtons(true);

        // Simulate progress
        var steps = [
            { pct: 10, msg: 'Reading audio files...', delay: 300 },
            { pct: 25, msg: 'Calculating RMS energy...', delay: 400 },
            { pct: 50, msg: 'Detecting voice activity...', delay: 500 },
            { pct: 70, msg: 'Resolving overlaps...', delay: 300 },
            { pct: 90, msg: 'Generating ducking map...', delay: 200 },
            { pct: 100, msg: 'Complete!', delay: 100 }
        ];

        var mockResult = generateMockResult();

        var stepIdx = 0;
        function nextStep() {
            if (stepIdx >= steps.length) {
                onAnalysisComplete(mockResult);
                return;
            }
            var step = steps[stepIdx++];
            showProgress(step.pct, step.msg);
            setTimeout(nextStep, step.delay);
        }
        nextStep();
    }

    function generateMockResult() {
        // Generate realistic mock analysis result
        var trackNames = [];
        var nameInputs = dom.trackList.querySelectorAll('.track-name-input');
        for (var i = 0; i < nameInputs.length; i++) {
            if (state.selectedTracks.indexOf(i) >= 0) {
                trackNames.push(nameInputs[i].value);
            }
        }

        return {
            version: '1.0.0',
            totalDurationSec: 3600,
            tracks: state.selectedTracks.map(function (idx, i) {
                return {
                    name: trackNames[i] || ('Track ' + (idx + 1)),
                    durationSec: 3600,
                    noiseFloorDb: -48 - Math.random() * 10,
                    segmentCount: 80 + Math.floor(Math.random() * 40),
                    activePercent: 25 + Math.floor(Math.random() * 20),
                    totalActiveSec: 900 + Math.floor(Math.random() * 600)
                };
            }),
            segments: state.selectedTracks.map(function () {
                var segs = [];
                var t = 0;
                while (t < 3600) {
                    var gap = 5 + Math.random() * 30;
                    var dur = 2 + Math.random() * 15;
                    t += gap;
                    segs.push({ start: t, end: t + dur, state: 'active' });
                    t += dur;
                }
                return segs;
            }),
            keyframes: state.selectedTracks.map(function () {
                return [{ time: 0, gainDb: -24 }, { time: 3600, gainDb: -24 }];
            }),
            alignment: { aligned: true, maxDriftSec: 0.01, warning: null },
            params: getParams()
        };
    }

    function onAnalysisComplete(result) {
        state.analysisResult = result;
        state.isAnalyzing = false;

        showProgress(100, 'Analysis complete!');
        setTimeout(hideProgress, 1500);

        setStatus('success', 'Analysis complete – ' +
            result.tracks.length + ' tracks, ' +
            result.tracks.reduce(function (sum, t) { return sum + t.segmentCount; }, 0) + ' segments');

        renderResults(result);

        // Enable action buttons
        dom.btnPreviewMarkers.disabled = false;
        dom.btnApply.disabled = false;
        dom.btnReset.disabled = false;
    }

    // --- Results Display ---
    function renderResults(result) {
        dom.resultsSection.style.display = 'block';
        var html = '';

        for (var i = 0; i < result.tracks.length; i++) {
            var t = result.tracks[i];
            html += '<div class="result-track">' +
                '<div class="result-track-name">' + escapeHtml(t.name) + '</div>' +
                '<div class="result-track-stats">' +
                t.segmentCount + ' segments · ' +
                t.activePercent + '% active · ' +
                'Floor: ' + (t.noiseFloorDb ? t.noiseFloorDb.toFixed(1) : '?') + ' dBFS' +
                '</div></div>';
        }

        if (result.alignment && result.alignment.warning) {
            html += '<div class="result-warning">⚠ ' + escapeHtml(result.alignment.warning) + '</div>';
        }

        var totalKeyframes = result.keyframes.reduce(function (sum, kf) { return sum + kf.length; }, 0);
        html += '<div class="result-track" style="margin-top: 6px;">' +
            '<div class="result-track-stats">' +
            'Total keyframes to apply: <strong>' + totalKeyframes + '</strong>' +
            '</div></div>';

        dom.resultsContent.innerHTML = html;
    }

    // --- Apply Actions ---
    function previewMarkers() {
        if (!state.analysisResult) return;

        setStatus('analyzing', 'Adding preview markers...');

        var trackNames = getTrackNames();

        AutoCastBridge.addMarkers({
            segments: state.analysisResult.segments,
            trackNames: trackNames,
            ticksPerSecond: 254016000000
        }, function (result) {
            if (result && result.success) {
                setStatus('success', result.markersAdded + ' markers added to timeline.');
            } else {
                setStatus('error', result ? result.error : 'Failed to add markers.');
            }
        });
    }

    function applyEdits() {
        if (!state.analysisResult) return;

        setStatus('analyzing', 'Applying volume keyframes...');

        AutoCastBridge.applyKeyframes({
            keyframes: state.analysisResult.keyframes,
            trackIndices: state.selectedTracks,
            ticksPerSecond: 254016000000
        }, function (result) {
            if (result && result.success) {
                setStatus('success', result.totalKeyframesSet + ' keyframes applied.');
            } else {
                setStatus('error', result ? result.error : 'Failed to apply keyframes.');
            }
        });
    }

    function resetEdits() {
        if (!confirm('Remove all AutoCast keyframes from selected tracks?')) return;

        setStatus('analyzing', 'Removing keyframes...');

        AutoCastBridge.removeKeyframes(state.selectedTracks, function (result) {
            if (result && result.success) {
                setStatus('success', result.clipsReset + ' clips reset to original volume.');
                state.analysisResult = null;
                dom.resultsSection.style.display = 'none';
                dom.btnPreviewMarkers.disabled = true;
                dom.btnApply.disabled = true;
            } else {
                setStatus('error', result ? result.error : 'Failed to reset.');
            }
        });
    }

    // --- UI Helpers ---
    function setStatus(type, message) {
        dom.statusBar.className = 'status-bar status-' + type;
        dom.statusText.textContent = message;
    }

    function showProgress(pct, message) {
        dom.progressContainer.style.display = 'flex';
        dom.progressFill.style.width = pct + '%';
        dom.progressText.textContent = pct + '%';
        if (message) setStatus('analyzing', message);
    }

    function hideProgress() {
        dom.progressContainer.style.display = 'none';
    }

    function disableButtons(disabled) {
        dom.btnAnalyze.disabled = disabled;
        dom.btnLoadTracks.disabled = disabled;
    }

    function updateModeIndicator() {
        if (AutoCastBridge.isInMockMode()) {
            dom.modeIndicator.textContent = '🌐 Browser Mode';
            dom.modeIndicator.title = 'Running outside Premiere Pro – mock data active';
        } else {
            dom.modeIndicator.textContent = '🎬 Premiere';
            dom.modeIndicator.title = 'Connected to Premiere Pro';
        }
    }

    function getTrackNames() {
        var names = [];
        var inputs = dom.trackList.querySelectorAll('.track-name-input');
        for (var i = 0; i < state.selectedTracks.length; i++) {
            var idx = state.selectedTracks[i];
            names.push(inputs[idx] ? inputs[idx].value : 'Track ' + (idx + 1));
        }
        return names;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();
