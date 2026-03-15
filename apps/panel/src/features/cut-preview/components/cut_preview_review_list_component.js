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

    function buildReviewItemHtml(item, isActive) {
        var escapeHtml = defaultEscapeHtml;
        var formatClock = defaultFormatClock;
        var formatDuration = defaultFormatDurationMs;
        
        var activeClass = isActive ? ' cpr-item-active' : '';
        var decisionClass = item.decision ? ' cpr-item-' + item.decision : '';
        var scoreClass = getScoreClass(item.score);
        var icon = getContentStateIcon(item.contentState);
        
        var html = '<div class="cpr-item' + activeClass + decisionClass + '" data-review-item-id="' + escapeHtml(item.id) + '">';
        html += '  <div class="cpr-item-header">';
        html += '    <span class="cpr-item-icon">' + icon + '</span>';
        html += '    <span class="cpr-item-track">' + escapeHtml(item.trackName) + '</span>';
        html += '    <span class="cpr-item-time">' + escapeHtml(formatClock(item.start)) + ' - ' + escapeHtml(formatClock(item.end)) + '</span>';
        html += '    <span class="cpr-item-duration">' + escapeHtml(formatDuration(item.durationMs)) + '</span>';
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
        
        // Pending items
        if (pending.length > 0) {
            html += '<div class="cpr-group cpr-group-pending">';
            html += '  <h4 class="cpr-group-title">Pending Review</h4>';
            html += '  <div class="cpr-list">';
            for (var i = 0; i < pending.length; i++) {
                html += buildReviewItemHtml(pending[i], pending[i].id === activeSnippetId);
            }
            html += '  </div>';
            html += '</div>';
        }
        
        // Included items
        if (included.length > 0) {
            html += '<div class="cpr-group cpr-group-included">';
            html += '  <h4 class="cpr-group-title">Included</h4>';
            html += '  <div class="cpr-list">';
            for (var j = 0; j < included.length; j++) {
                html += buildReviewItemHtml(included[j], included[j].id === activeSnippetId);
            }
            html += '  </div>';
            html += '</div>';
        }
        
        // Excluded items
        if (excluded.length > 0) {
            html += '<div class="cpr-group cpr-group-excluded">';
            html += '  <h4 class="cpr-group-title">Excluded</h4>';
            html += '  <div class="cpr-list">';
            for (var k = 0; k < excluded.length; k++) {
                html += buildReviewItemHtml(excluded[k], excluded[k].id === activeSnippetId);
            }
            html += '  </div>';
            html += '</div>';
        }
        
        html += '</div>';
        
        return html;
    }

    root.AutoCastPanelCutPreviewReviewListComponent = {
        buildReviewSectionHtml: buildReviewSectionHtml,
        buildReviewItemHtml: buildReviewItemHtml
    };
})(this);