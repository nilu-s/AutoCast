'use strict';

(function (root) {
    function defaultParseNum(value, fallback) {
        var num = parseFloat(value);
        return isFinite(num) ? num : fallback;
    }

    function defaultClamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
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

    function defaultGetContentCssClass(contentState) {
        var key = contentState ? String(contentState).toLowerCase() : 'unknown';
        key = key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!key) key = 'unknown';
        return 'cp-content-' + key;
    }

    function getFn(input, key, fallback) {
        return input && typeof input[key] === 'function' ? input[key] : fallback;
    }

    function buildNavigatorHtml(input) {
        var clamp = getFn(input, 'clamp', defaultClamp);
        var escapeHtml = getFn(input, 'escapeHtml', defaultEscapeHtml);
        var formatClock = getFn(input, 'formatClock', defaultFormatClock);
        var getContentCssClassFn = getFn(input, 'getContentCssClass', defaultGetContentCssClass);
        var isAlwaysOpenFillFn = getFn(input, 'isAlwaysOpenFillSnippet', function () { return false; });
        var isUninterestingFn = getFn(input, 'isUninterestingSnippet', function () { return false; });

        var viewport = input && input.viewport ? input.viewport : null;
        var items = Array.isArray(input && input.items) ? input.items : [];
        if (!viewport || !items.length) {
            return '<div class="cp-empty">No navigator data available.</div>';
        }

        var totalDuration = Math.max(0.0001, defaultParseNum(viewport.totalDurationSec, 0.0001));
        var html = '';
        html += '<div class="cp-nav-track">';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var leftPct = clamp((item.start / totalDuration) * 100, 0, 100);
            var widthPct = clamp(((item.end - item.start) / totalDuration) * 100, 0.1, 100);
            var navClass = 'cp-nav-snippet cp-state-' + item.decisionState;
            navClass += ' ' + getContentCssClassFn(item.contentState);
            if (isAlwaysOpenFillFn(item)) navClass += ' cp-nav-always-open-fill';
            if (isUninterestingFn(item)) navClass += ' cp-nav-uninteresting';
            html += '<div class="' + navClass + '" style="left:' + leftPct + '%;width:' + widthPct + '%;"></div>';
        }
        var windowLeftPct = clamp((viewport.viewStartSec / totalDuration) * 100, 0, 100);
        var windowWidthPct = clamp((viewport.visibleDurationSec / totalDuration) * 100, 1, 100);
        html += '<div class="cp-nav-window" data-nav-drag="move" style="left:' + windowLeftPct + '%;width:' + windowWidthPct + '%;">';
        html += '  <div class="cp-nav-handle cp-nav-handle-left" data-nav-drag="left"></div>';
        html += '  <div class="cp-nav-handle cp-nav-handle-right" data-nav-drag="right"></div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="cp-nav-caption">' + escapeHtml(formatClock(viewport.viewStartSec) + ' - ' + formatClock(viewport.viewEndSec) + ' / ' + formatClock(viewport.totalDurationSec)) + '</div>';
        return html;
    }

    root.AutoCastPanelCutPreviewNavigatorComponent = {
        buildNavigatorHtml: buildNavigatorHtml
    };
})(this);
