'use strict';

(function (root) {
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
        var precision = digits || 1;
        var txt = round(num, precision).toFixed(precision);
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

    root.AutoCastPanelMathFormatUtils = {
        parseNum: parseNum,
        clamp: clamp,
        round: round,
        formatSigned: formatSigned,
        formatClock: formatClock,
        formatDurationMs: formatDurationMs,
        formatSummaryDuration: formatSummaryDuration
    };
})(this);
