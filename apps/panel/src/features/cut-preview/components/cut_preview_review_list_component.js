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
        if (num >= 1000) {
            return defaultRound(num / 1000, 1) + 's';
        }
        return num + 'ms';
    }

    function getContentStateIcon(contentState) {
        var icons = {
            'speech': '💬',
            'laughter': '😄',
            'mixed': '🎭',
            'bleed': '🔊',
            'noise': '📢',
            'silence_fill': '⏸️',
            'unknown': '❓'
        };
        return icons[contentState] || icons['unknown'];
    }

    function getScoreClass(score) {
        if (score >= 70) return 'cpr-score-strong';
        if (score >= 45) return 'cpr-score-borderline';
        return 'cpr-score-weak';
    }

    function getDecisionIcon(decision) {
        if (decision === 'included') return '✓';
        if (decision === 'excluded') return '✕';
        return '⏳';
    }

    function buildReviewItemHtml(item, isActive) {
        var escapeHtml = defaultEscapeHtml;
        var formatClock = defaultFormatClock;
        var formatDuration = defaultFormatDurationMs;
        
        var activeClass = isActive ? ' cpr-item-active' : '';
        var decisionClass = item.decision ? ' cpr-item-' + item.decision : '';
        var scoreClass = getScoreClass(item.score);
        var icon = getContentStateIcon(item.contentState);
        var decisionIcon = getDecisionIcon(item.decision);
        
        var html = '<div class="cpr-item' + activeClass + decisionClass + '" data-review-item-id="' + escapeHtml(item.id) + '">';
        html += '  <div class="cpr-item-header">';
        html += '    <span class="cpr-item-icon">' + icon + '</span>';
        html += '    <span class="cpr-item-time">' + escapeHtml(formatClock(item.start)) + ' - ' + escapeHtml(formatClock(item.end)) + '</span>';
        html += '    <span class="cpr-item-duration">' + escapeHtml(formatDuration(item.durationMs)) + '</span>';
        html += '    <span class="cpr-item-decision-icon">' + decisionIcon + '</span>';
        html += '  </div>';
        html += '  <div class="cpr-item-meta">';
        html += '    <span class="cpr-item-score ' + scoreClass + '">' + escapeHtml(String(item.score)) + ' (' + escapeHtml(item.scoreLabel) + ')</span>';
        html += '    <span class="cpr-item-content">' + escapeHtml(item.contentState || 'unknown') + '</span>';
        html += '  </div>';
        html += '  <div class="cpr-item-actions">';
        
        if (item.decision !== 'included') {
            html += '    <button type="button" class="btn btn-sm btn-primary cpr-btn-include" data-review-include="' + escapeHtml(item.id) + '" title="Include in final cut">✓ Include</button>';
        } else {
            html += '    <button type="button" class="btn btn-sm btn-secondary cpr-btn-include cpr-btn-active" data-review-include="' + escapeHtml(item.id) + '" title="Already included">✓ Included</button>';
        }
        
        if (item.decision !== 'excluded') {
            html += '    <button type="button" class="btn btn-sm btn-danger cpr-btn-exclude" data-review-exclude="' + escapeHtml(item.id) + '" title="Exclude from final cut">✕ Exclude</button>';
        } else {
            html += '    <button type="button" class="btn btn-sm btn-secondary cpr-btn-exclude cpr-btn-inactive" data-review-exclude="' + escapeHtml(item.id) + '" title="Already excluded">✕ Excluded</button>';
        }
        
        html += '  </div>';
        html += '</div>';
        
        return html;
    }

    function groupItemsByTrack(items) {
        var groups = {};
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var trackKey = item.trackIndex + '_' + (item.trackName || 'Track ' + (item.trackIndex + 1));
            if (!groups[trackKey]) {
                groups[trackKey] = {
                    trackIndex: item.trackIndex,
                    trackName: item.trackName || 'Track ' + (item.trackIndex + 1),
                    items: []
                };
            }
            groups[trackKey].items.push(item);
        }
        
        // Convert to array and sort by track index
        var result = [];
        for (var key in groups) {
            if (Object.prototype.hasOwnProperty.call(groups, key)) {
                result.push(groups[key]);
            }
        }
        result.sort(function(a, b) {
            return a.trackIndex - b.trackIndex;
        });
        return result;
    }

    function buildTrackSection(trackGroup, activeSnippetId) {
        var escapeHtml = defaultEscapeHtml;
        var items = trackGroup.items || [];
        
        if (items.length === 0) return '';
        
        var html = '<div class="cpr-track-section">';
        html += '  <div class="cpr-track-header">';
        html += '    <span class="cpr-track-color" style="background-color: var(--accent);"></span>';
        html += '    <span class="cpr-track-name">' + escapeHtml(trackGroup.trackName) + '</span>';
        html += '    <span class="cpr-track-count">' + items.length + '</span>';
        html += '  </div>';
        html += '  <div class="cpr-track-items">';
        
        for (var i = 0; i < items.length; i++) {
            html += buildReviewItemHtml(items[i], items[i].id === activeSnippetId);
        }
        
        html += '  </div>';
        html += '</div>';
        
        return html;
    }

    function buildReviewSectionHtml(input) {
        var reviewItems = input && input.reviewItems ? input.reviewItems : { pending: [], included: [], excluded: [] };
        var activeSnippetId = input && input.activeSnippetId ? input.activeSnippetId : null;
        var escapeHtml = defaultEscapeHtml;
        
        var pending = reviewItems.pending || [];
        var included = reviewItems.included || [];
        var excluded = reviewItems.excluded || [];
        var totalCount = pending.length + included.length + excluded.length;
        
        if (totalCount === 0) {
            return '<div class="cpr-empty">No review items available.</div>';
        }
        
        var html = '<div class="cpr-section">';
        
        // Header with stats
        html += '<div class="cpr-header">';
        html += '  <h3 class="cpr-title">Review Queue</h3>';
        html += '  <div class="cpr-stats">';
        html += '    <span class="cpr-stat cpr-stat-pending">⏳ ' + pending.length + ' pending</span>';
        html += '    <span class="cpr-stat cpr-stat-included">✓ ' + included.length + ' included</span>';
        html += '    <span class="cpr-stat cpr-stat-excluded">✕ ' + excluded.length + ' excluded</span>';
        html += '  </div>';
        html += '</div>';
        
        // Pending items grouped by track
        if (pending.length > 0) {
            var pendingByTrack = groupItemsByTrack(pending);
            html += '<div class="cpr-group cpr-group-pending">';
            html += '  <h4 class="cpr-group-title">⏳ Pending Review</h4>';
            for (var i = 0; i < pendingByTrack.length; i++) {
                html += buildTrackSection(pendingByTrack[i], activeSnippetId);
            }
            html += '</div>';
        }
        
        // Included items grouped by track
        if (included.length > 0) {
            var includedByTrack = groupItemsByTrack(included);
            html += '<div class="cpr-group cpr-group-included">';
            html += '  <h4 class="cpr-group-title">✓ Included</h4>';
            for (var j = 0; j < includedByTrack.length; j++) {
                html += buildTrackSection(includedByTrack[j], activeSnippetId);
            }
            html += '</div>';
        }
        
        // Excluded items grouped by track
        if (excluded.length > 0) {
            var excludedByTrack = groupItemsByTrack(excluded);
            html += '<div class="cpr-group cpr-group-excluded">';
            html += '  <h4 class="cpr-group-title">✕ Excluded</h4>';
            for (var k = 0; k < excludedByTrack.length; k++) {
                html += buildTrackSection(excludedByTrack[k], activeSnippetId);
            }
            html += '</div>';
        }
        
        html += '</div>';
        
        return html;
    }

    root.AutoCastPanelCutPreviewReviewListComponent = {
        buildReviewSectionHtml: buildReviewSectionHtml,
        buildReviewItemHtml: buildReviewItemHtml,
        groupItemsByTrack: groupItemsByTrack
    };
})(this);
