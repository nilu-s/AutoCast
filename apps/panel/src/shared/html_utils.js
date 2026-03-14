'use strict';

(function (root) {
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    root.AutoCastPanelHtmlUtils = {
        escapeHtml: escapeHtml
    };
})(this);
