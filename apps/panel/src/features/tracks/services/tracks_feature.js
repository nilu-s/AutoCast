'use strict';

(function (root) {
    function getTrackListComponent() {
        return root.AutoCastPanelTrackListComponent || null;
    }

    function escapeHtml(str) {
        var component = getTrackListComponent();
        if (component && typeof component.escapeHtml === 'function') {
            return component.escapeHtml(str);
        }
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderTracksHtml(options) {
        var component = getTrackListComponent();
        if (component && typeof component.render === 'function') {
            return component.render(options);
        }

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
                + '    <div class="track-title">Track ' + (i + 1) + (track.name ? ' \u2013 ' + escapeHtml(track.name) : '') + '</div>'
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

    function bindTrackSelection(trackListEl, onToggle) {
        if (!trackListEl || typeof onToggle !== 'function') return;
        var checkboxes = trackListEl.querySelectorAll('.track-cb');
        for (var c = 0; c < checkboxes.length; c++) {
            checkboxes[c].addEventListener('change', function () {
                var idx = parseInt(this.getAttribute('data-track-index'), 10);
                onToggle(idx, this.checked);
            });
        }
    }

    function normalizeLoadedTracks(result, ticksPerSecond) {
        var loadedTracks = (result && result.tracks) ? result.tracks : (result || []);
        if (!Array.isArray(loadedTracks)) return [];

        var fallbackTicksPerSecond = parseFloat(ticksPerSecond);
        if (!isFinite(fallbackTicksPerSecond) || fallbackTicksPerSecond <= 0) {
            fallbackTicksPerSecond = 254016000000;
        }

        for (var i = 0; i < loadedTracks.length; i++) {
            var t = loadedTracks[i] || {};
            t.ticksPerSecond = (result && result.ticksPerSecond) || fallbackTicksPerSecond;

            if (!t.path && t.clips && t.clips.length > 0) {
                var foundPath = false;
                for (var c = 0; c < t.clips.length; c++) {
                    if (t.clips[c].mediaPath) {
                        t.path = t.clips[c].mediaPath;
                        foundPath = true;
                        break;
                    } else if (t.clips[c].mediaPathError) {
                        t.path = '[Err] ' + t.clips[c].mediaPathError;
                        foundPath = true;
                    }
                }
                if (!foundPath) t.path = '[Info] No usable media paths found.';
            } else if (!t.clips || t.clips.length === 0) {
                t.path = '[Empty] No clips on this track.';
            }
        }

        return loadedTracks;
    }

    root.AutoCastPanelTracksFeature = {
        escapeHtml: escapeHtml,
        renderTracksHtml: renderTracksHtml,
        bindTrackSelection: bindTrackSelection,
        normalizeLoadedTracks: normalizeLoadedTracks
    };
})(this);
