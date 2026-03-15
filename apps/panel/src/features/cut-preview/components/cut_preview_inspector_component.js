'use strict';

(function (root) {
    function defaultParseNum(value, fallback) {
        var num = parseFloat(value);
        return isFinite(num) ? num : fallback;
    }

    function defaultRound(value, digits) {
        var factor = Math.pow(10, digits || 0);
        return Math.round(value * factor) / factor;
    }

    function defaultEscapeHtml(str) {
        if (root.AutoCastPanelHtmlUtils && typeof root.AutoCastPanelHtmlUtils.escapeHtml === 'function') {
            return root.AutoCastPanelHtmlUtils.escapeHtml(str);
        }
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function defaultFormatClock(sec) {
        var total = Math.max(0, defaultParseNum(sec, 0));
        var minutes = Math.floor(total / 60);
        var seconds = total - minutes * 60;
        var secText = (seconds < 10 ? '0' : '') + defaultRound(seconds, 1).toFixed(1);
        return minutes + ':' + secText;
    }

    function defaultFormatDurationMs(ms) {
        var num = Math.max(0, Math.round(defaultParseNum(ms, 0)));
        return num + ' ms';
    }

    function defaultFormatSigned(value, digits) {
        var num = defaultParseNum(value, 0);
        var rounded = defaultRound(num, digits || 0);
        return (rounded > 0 ? '+' : '') + rounded;
    }

    function defaultTrackDisplayName(trackIndex) {
        return 'Track ' + (parseInt(trackIndex, 10) + 1);
    }

    function buildMetricCard(name, value, options) {
        var escapeHtml = options && typeof options.escapeHtml === 'function'
            ? options.escapeHtml
            : defaultEscapeHtml;
        return '<div class="cp-metric-card"><div class="cp-metric-name">' +
            escapeHtml(name) +
            '</div><div class="cp-metric-value">' +
            escapeHtml(String(value)) +
            '</div></div>';
    }

    function getFn(input, key, fallback) {
        return input && typeof input[key] === 'function' ? input[key] : fallback;
    }

    function buildInspectorHtml(input) {
        var parseNum = getFn(input, 'parseNum', defaultParseNum);
        var round = getFn(input, 'round', defaultRound);
        var escapeHtml = getFn(input, 'escapeHtml', defaultEscapeHtml);
        var formatClock = getFn(input, 'formatClock', defaultFormatClock);
        var formatDurationMs = getFn(input, 'formatDurationMs', defaultFormatDurationMs);
        var formatSigned = getFn(input, 'formatSigned', defaultFormatSigned);
        var getTrackDisplayName = getFn(input, 'getTrackDisplayName', defaultTrackDisplayName);
        var isAlwaysOpenFillFn = getFn(input, 'isAlwaysOpenFillSnippet', function () { return false; });
        var isUninterestingFn = getFn(input, 'isUninterestingSnippet', function () { return false; });
        var buildMetricCardFn = getFn(input, 'buildMetricCard', function (name, value) {
            return buildMetricCard(name, value, { escapeHtml: escapeHtml });
        });

        var item = input && input.item ? input.item : null;
        if (!item) {
            return '<div class="cp-inspector-empty">Click a snippet to inspect details.</div>';
        }

        var metrics = item.metrics || {};
        var reasons = item.reasons || [];
        var isPlaying = !!(input && input.isPlaying);
        var previewPlan = input && input.previewPlan ? input.previewPlan : null;
        var isAlwaysOpenFill = isAlwaysOpenFillFn(item);
        var isUninteresting = isUninterestingFn(item);
        var statePillClass = 'cp-pill cp-pill-' + item.decisionState;
        var selectedLabel = item.selectable ? (item.selected ? 'Selected' : 'Unselected') : 'Locked';
        var inspectorPlayLabel = isPlaying ? 'Stop Preview' : 'Play Preview';
        var quality = item.quality || {};

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
        html += '  <span class="' + statePillClass + '">' + escapeHtml('decision: ' + (isUninteresting ? 'uninteresting' : item.decisionState)) + '</span>';
        html += '  <span class="cp-pill">' + escapeHtml('score: ' + item.score + ' (' + item.scoreLabel + ')') + '</span>';
        html += '  <span class="cp-pill">' + escapeHtml('content: ' + (item.contentState || 'unknown')) + '</span>';
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
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Decision</span><span class="cp-inspector-value">' + escapeHtml(isUninteresting ? 'uninteresting' : item.decisionState) + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Content</span><span class="cp-inspector-value">' + escapeHtml(item.contentState || 'unknown') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Score</span><span class="cp-inspector-value">' + escapeHtml(String(item.score) + ' (' + item.scoreLabel + ')') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Confidence</span><span class="cp-inspector-value">' + escapeHtml(round(parseNum(quality.confidence0to1, 0) * 100, 1) + '%') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Duration</span><span class="cp-inspector-value">' + escapeHtml(formatDurationMs(item.durationMs)) + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Decision Stage</span><span class="cp-inspector-value">' + escapeHtml(item.decisionStage || '-') + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Track</span><span class="cp-inspector-value">' + escapeHtml(getTrackDisplayName(item.trackIndex)) + '</span></div>';
        html += '  <div class="cp-inspector-row"><span class="cp-inspector-label">Preview Source</span><span class="cp-inspector-value">' + escapeHtml((previewPlan && previewPlan.approximate ? 'Approximate' : 'Exact') + (previewPlan && previewPlan.totalParts > 1 ? (' (' + previewPlan.usedParts + '/' + previewPlan.totalParts + ' parts)') : '')) + '</span></div>';
        html += '</div>';

        html += '<details class="cp-inspector-extra" open>';
        html += '  <summary>Class Signals</summary>';
        html += '  <div class="cp-metrics-grid cp-metrics-grid-tight">';
        html += buildMetricCardFn('Speech', round(parseNum(metrics.speechEvidence, 0), 3));
        html += buildMetricCardFn('Laughter', round(parseNum(metrics.laughterEvidence, 0), 3));
        html += buildMetricCardFn('Bleed', round(parseNum(metrics.bleedEvidence, 0), 3));
        html += buildMetricCardFn('Noise', round(parseNum(metrics.noiseEvidence, 0), 3));
        html += buildMetricCardFn('Bleed Conf', round(parseNum(metrics.bleedConfidence, 0), 3));
        html += buildMetricCardFn('Margin', round(parseNum(metrics.classMargin, 0), 3));
        html += buildMetricCardFn('Kept Src', round(parseNum(metrics.keptSourceRatio, 0), 3));
        html += buildMetricCardFn('Keep Likelihood', round(parseNum(metrics.keepLikelihood, 0), 3));
        html += buildMetricCardFn('Suppress Likelihood', round(parseNum(metrics.suppressLikelihood, 0), 3));
        html += buildMetricCardFn('Decision Margin', round(parseNum(metrics.decisionMargin, 0), 3));
        html += buildMetricCardFn('Bleed Safety Gate', parseNum(metrics.bleedHighConfidence, 0) >= 0.5 ? 'on' : 'off');
        html += buildMetricCardFn('Always-Open Fill', parseNum(metrics.alwaysOpenFill, 0) >= 0.5 ? 'yes' : 'no');
        html += '  </div>';
        html += '</details>';

        html += '<details class="cp-inspector-extra">';
        html += '  <summary>Audio Metrics</summary>';
        html += '  <div class="cp-metrics-grid cp-metrics-grid-tight">';
        html += buildMetricCardFn('Mean > Thresh', formatSigned(parseNum(metrics.meanOverThreshold, 0), 2) + ' dB');
        html += buildMetricCardFn('Peak > Thresh', formatSigned(parseNum(metrics.peakOverThreshold, 0), 2) + ' dB');
        html += buildMetricCardFn('Spectral', round(parseNum(metrics.spectralConfidence, 0), 3));
        html += buildMetricCardFn('Laughter Conf', round(parseNum(metrics.laughterConfidence, 0), 3));
        html += buildMetricCardFn('Overlap', round(parseNum(metrics.overlapPenalty, 0), 3));
        html += buildMetricCardFn('Speaker Lock', round(parseNum(metrics.speakerLockScore, 0), 3));
        html += buildMetricCardFn('Postprocess', round(parseNum(metrics.postprocessPenalty, 0), 3));
        html += buildMetricCardFn('Merged Snippets', Math.max(1, Math.round(parseNum(metrics.mergedSegmentCount, 1))));
        html += buildMetricCardFn('Max Merge Gap', round(parseNum(metrics.maxMergedGapMs, 0), 0) + ' ms');
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

        return html;
    }

    root.AutoCastPanelCutPreviewInspectorComponent = {
        buildInspectorHtml: buildInspectorHtml,
        buildMetricCard: buildMetricCard
    };
})(this);
