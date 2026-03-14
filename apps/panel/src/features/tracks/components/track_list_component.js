'use strict';

(function (root) {
    function escapeHtml(str) {
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

    function render(options) {
        options = options || {};
        var tracks = Array.isArray(options.tracks) ? options.tracks : [];
        var trackColors = Array.isArray(options.trackColors) ? options.trackColors : [];
        var perTrackSensitivity = options.perTrackSensitivity || {};
        var globalThreshold = parseInt(options.globalThreshold, 10);
        if (!isFinite(globalThreshold)) globalThreshold = 0;

        if (tracks.length === 0) {
            return '<div class="empty-state">No tracks loaded.</div>';
        }

        var html = '';
        for (var i = 0; i < tracks.length; i++) {
            var track = tracks[i] || {};
            var color = trackColors.length ? trackColors[i % trackColors.length] : '#4ea1f3';
            var threshold = perTrackSensitivity[i] !== undefined
                ? perTrackSensitivity[i]
                : globalThreshold;

            if (track.selected === undefined) track.selected = true;

            html += ''
                + '<div class="track-item" data-track-index="' + i + '">'
                + '  <div class="track-color" style="background:' + color + ';"></div>'
                + '  <div class="track-select" style="margin-right: 8px;"><input type="checkbox" class="track-cb" data-track-index="' + i + '" ' + (track.selected ? 'checked' : '') + '></div>'
                + '  <div class="track-meta">'
                + '    <div class="track-title">Track ' + (i + 1) + (track.name ? ' - ' + escapeHtml(track.name) : '') + '</div>'
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
        return html;
    }

    root.AutoCastPanelTrackListComponent = {
        escapeHtml: escapeHtml,
        render: render
    };
})(this);
