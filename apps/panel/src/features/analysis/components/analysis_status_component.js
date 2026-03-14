'use strict';

(function (root) {
    function clampPercent(value) {
        var n = parseInt(value, 10);
        if (!isFinite(n)) n = 0;
        return Math.max(0, Math.min(100, n));
    }

    function normalizeMessage(message) {
        if (message === null || message === undefined) return '';
        return String(message).trim();
    }

    function formatProgressLabel(percent, message) {
        var pct = clampPercent(percent);
        var msg = normalizeMessage(message);
        return msg ? (pct + '% - ' + msg) : (pct + '%');
    }

    root.AutoCastPanelAnalysisStatusComponent = {
        clampPercent: clampPercent,
        formatProgressLabel: formatProgressLabel
    };
})(this);
