'use strict';

(function (root) {
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

    function defaultParseNum(value, fallback) {
        var num = parseFloat(value);
        return isFinite(num) ? num : fallback;
    }

    function defaultRound(value, digits) {
        var factor = Math.pow(10, digits || 0);
        return Math.round(value * factor) / factor;
    }

    function defaultFormatClock(sec) {
        var total = Math.max(0, defaultParseNum(sec, 0));
        var minutes = Math.floor(total / 60);
        var seconds = total - minutes * 60;
        var secText = (seconds < 10 ? '0' : '') + defaultRound(seconds, 1).toFixed(1);
        return minutes + ':' + secText;
    }

    function defaultIsOverviewZoom(viewport) {
        if (!viewport) return false;
        return viewport.pixelsPerSec <= (viewport.fitPixelsPerSec * 1.45);
    }

    function defaultGetTimelineTickStep(visibleDurationSec) {
        if (visibleDurationSec <= 6) return 0.5;
        if (visibleDurationSec <= 14) return 1;
        if (visibleDurationSec <= 28) return 2;
        if (visibleDurationSec <= 70) return 5;
        if (visibleDurationSec <= 160) return 10;
        if (visibleDurationSec <= 520) return 30;
        if (visibleDurationSec <= 1800) return 60;
        return 120;
    }

    function defaultGetContentCssClass(contentState) {
        var key = contentState ? String(contentState).toLowerCase() : 'unknown';
        key = key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!key) key = 'unknown';
        return 'cp-content-' + key;
    }

    function defaultShortContentLabel(contentState) {
        return contentState || '';
    }

    function defaultCompactReasonText() {
        return '';
    }

    function defaultBuildSnippetInlineLabel() {
        return '';
    }

    function getFn(input, key, fallback) {
        return input && typeof input[key] === 'function' ? input[key] : fallback;
    }

    function buildTimelineHtml(input) {
        var escapeHtml = getFn(input, 'escapeHtml', defaultEscapeHtml);
        var formatClock = getFn(input, 'formatClock', defaultFormatClock);
        var isOverviewZoom = getFn(input, 'isOverviewZoom', defaultIsOverviewZoom);
        var getTimelineTickStep = getFn(input, 'getTimelineTickStep', defaultGetTimelineTickStep);
        var getContentCssClassFn = getFn(input, 'getContentCssClass', defaultGetContentCssClass);
        var isAlwaysOpenFillFn = getFn(input, 'isAlwaysOpenFillSnippet', function () { return false; });
        var isUninterestingFn = getFn(input, 'isUninterestingSnippet', function () { return false; });
        var buildSnippetInlineLabelFn = getFn(input, 'buildSnippetInlineLabel', defaultBuildSnippetInlineLabel);
        var shortContentLabelFn = getFn(input, 'shortContentLabel', defaultShortContentLabel);
        var compactReasonTextFn = getFn(input, 'compactReasonText', defaultCompactReasonText);
        var getTrackPreviewGain = getFn(input, 'getTrackPreviewGain', function () { return 1; });

        var viewport = input && input.viewport ? input.viewport : null;
        var visibleItems = Array.isArray(input && input.visibleItems) ? input.visibleItems : [];
        var lanes = Array.isArray(input && input.lanes) ? input.lanes.slice() : [];
        var activeSnippetId = input ? input.activeSnippetId : null;
        var currentPlayingPreviewId = input ? input.currentPlayingPreviewId : null;

        if (!viewport || !visibleItems.length) {
            return '<div class="cp-empty">No snippets available.</div>';
        }

        lanes.sort(function (a, b) {
            return a.laneIndex - b.laneIndex;
        });
        if (!lanes.length) {
            return '<div class="cp-empty">No lanes available.</div>';
        }

        var overviewMode = isOverviewZoom(viewport);
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
                var snippetClass = 'cp-snippet cp-state-' + snippet.decisionState;
                snippetClass += ' ' + getContentCssClassFn(snippet.contentState);
                if (snippet.selected) snippetClass += ' cp-selected';
                else snippetClass += ' cp-unselected';
                if (compact) snippetClass += ' cp-snippet-compact';
                if (overviewMode) snippetClass += ' cp-snippet-overview';
                if (minimalMode) snippetClass += ' cp-snippet-minimal';
                if (isAlwaysOpenFillFn(snippet)) snippetClass += ' cp-snippet-always-open';
                if (isUninterestingFn(snippet)) snippetClass += ' cp-snippet-uninteresting';
                if (activeSnippetId === snippet.id) snippetClass += ' cp-focused';
                if (currentPlayingPreviewId === snippet.id) snippetClass += ' cp-playing';
                var inlineLabel = buildSnippetInlineLabelFn(snippet, widthPx);
                var selectClass = 'cp-snippet-select';
                if (snippet.selected) selectClass += ' is-selected';
                var playClass = 'cp-snippet-play';
                if (currentPlayingPreviewId === snippet.id) playClass += ' is-playing';
                var playSymbol = currentPlayingPreviewId === snippet.id ? '&#9632;' : '&#9654;';
                var selectHtml = (snippet.selectable && !minimalMode && widthPx >= 38)
                    ? ('  <button type="button" class="' + selectClass + '" data-item-select="' + escapeHtml(snippet.id) + '" title="Toggle selection">' + (snippet.selected ? '&#10003;' : '') + '</button>')
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
                    + ' title="' + escapeHtml('State ' + (isUninterestingFn(snippet) ? 'uninteresting' : snippet.decisionState) + ' | Score ' + snippet.score + ' | ' + shortContentLabelFn(snippet.contentState) + (isAlwaysOpenFillFn(snippet) ? ' | dominant continuity fill' : '') + ' | ' + compactReasonTextFn(snippet, 42) + ' | ' + formatClock(snippet.start) + '-' + formatClock(snippet.end)) + '"'
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
        return html;
    }

    root.AutoCastPanelCutPreviewTimelineComponent = {
        buildTimelineHtml: buildTimelineHtml
    };
})(this);
