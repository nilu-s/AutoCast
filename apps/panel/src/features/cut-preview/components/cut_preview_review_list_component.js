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

    function getDecisionClass(decision) {
        if (decision === 'included') return 'cpr-decision-included';
        if (decision === 'excluded') return 'cpr-decision-excluded';
        return 'cpr-decision-pending';
    }

    function buildReviewCardHtml(item, isActive) {
        var escapeHtml = defaultEscapeHtml;
        var formatClock = defaultFormatClock;
        var formatDuration = defaultFormatDurationMs;
        
        var activeClass = isActive ? ' cpr-card-active' : '';
        var decisionClass = getDecisionClass(item.decision);
        var scoreClass = getScoreClass(item.score);
        var icon = getContentStateIcon(item.contentState);
        var decisionIcon = getDecisionIcon(item.decision);
        
        var isCategorized = !!(item.contentType && item.contentType !== '');
        var cardStyle = isCategorized ? 'opacity: 0.45; filter: grayscale(100%); transition: opacity 0.2s;' : 'transition: opacity 0.2s;';
        
        var html = '<div class="cpr-card ' + decisionClass + activeClass + '" data-review-item-id="' + escapeHtml(item.id) + '" style="' + cardStyle + '">';
        
        // Card header with time and decision
        html += '  <div class="cpr-card-header">';
        html += '    <span class="cpr-card-time">' + escapeHtml(formatClock(item.start)) + '</span>';
        html += '    <div style="display: flex; align-items: center; gap: 6px;">';
        html += '      <button type="button" data-item-play="' + escapeHtml(item.id) + '" style="background:transparent; border:none; color:inherit; cursor:pointer; font-size: 10px;" title="Play Segment">▶</button>';
        html += '    </div>';
        html += '  </div>';
        
        // Card body with icon and duration
        html += '  <div class="cpr-card-body">';
        html += '    <span class="cpr-card-icon">' + icon + '</span>';
        html += '    <span class="cpr-card-duration">' + escapeHtml(formatDuration(item.durationMs)) + '</span>';
        html += '  </div>';
        
        // Card footer with score and content type
        var contentVal = item.contentType || '';
        html += '  <div class="cpr-card-footer" style="flex-wrap: wrap; gap: 4px;">';
        html += '    <span class="cpr-card-score ' + scoreClass + '">' + escapeHtml(String(item.score)) + '</span>';
        html += '    <select class="temp-category-select" data-item-id="' + escapeHtml(item.id) + '" style="background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; font-size: 11px; max-width: 80px; outline: none;" title="Assign category">';
        html += '      <option value=""' + (contentVal === '' ? ' selected' : '') + '>None</option>';
        html += '      <option value="speech"' + (contentVal === 'speech' ? ' selected' : '') + '>Speech</option>';
        html += '      <option value="review"' + (contentVal === 'review' ? ' selected' : '') + '>Review</option>';
        html += '      <option value="ignore"' + (contentVal === 'ignore' ? ' selected' : '') + '>Ignore</option>';
        html += '    </select>';
        html += '  </div>';
        
        // Temporary: Actions overlay disabled since we only categorize cuts
        // html += '  <div class="cpr-card-actions">';
        // ...
        // html += '  </div>';
        
        html += '</div>';
        
        return html;
    }

    function getTracksWithReviewItems(reviewItems) {
        var tracks = {};
        var allItems = (reviewItems.pending || [])
            .concat(reviewItems.included || [])
            .concat(reviewItems.excluded || []);
        
        for (var i = 0; i < allItems.length; i++) {
            var item = allItems[i];
            var trackKey = item.trackIndex;
            if (!tracks[trackKey]) {
                tracks[trackKey] = {
                    trackIndex: item.trackIndex,
                    trackName: item.trackName || 'Track ' + (item.trackIndex + 1),
                    items: [],
                    pendingCount: 0,
                    includedCount: 0,
                    excludedCount: 0
                };
            }
            tracks[trackKey].items.push(item);
            if (item.decision === 'included') tracks[trackKey].includedCount++;
            else if (item.decision === 'excluded') tracks[trackKey].excludedCount++;
            else tracks[trackKey].pendingCount++;
        }
        
        // Convert to array and sort by track index
        var result = [];
        for (var key in tracks) {
            if (Object.prototype.hasOwnProperty.call(tracks, key)) {
                result.push(tracks[key]);
            }
        }
        result.sort(function(a, b) {
            return a.trackIndex - b.trackIndex;
        });
        return result;
    }

    function buildTrackTabs(tracks, activeTrackIndex) {
        var escapeHtml = defaultEscapeHtml;
        var html = '<div class="cpr-track-tabs">';
        
        for (var i = 0; i < tracks.length; i++) {
            var track = tracks[i];
            var isActive = track.trackIndex === activeTrackIndex;
            var activeClass = isActive ? ' is-active' : '';
            var hasPending = track.pendingCount > 0;
            var badgeClass = hasPending ? ' cpr-tab-badge-pending' : '';
            
            html += '<button type="button" class="cpr-track-tab' + activeClass + '" data-review-track="' + track.trackIndex + '">';
            html += '<span class="cpr-tab-name">' + escapeHtml(track.trackName) + '</span>';
            html += '<span class="cpr-tab-badge' + badgeClass + '">' + track.items.length + '</span>';
            if (hasPending) {
                html += '<span class="cpr-tab-pending-indicator">⏳</span>';
            }
            html += '</button>';
        }
        
        html += '</div>';
        return html;
    }

    function buildReviewSectionHtml(input) {
        var reviewItems = input && input.reviewItems ? input.reviewItems : { pending: [], included: [], excluded: [] };
        var activeSnippetId = input && input.activeSnippetId ? input.activeSnippetId : null;
        var activeTrackIndex = input && input.activeTrackIndex !== undefined ? input.activeTrackIndex : 0;
        var escapeHtml = defaultEscapeHtml;
        
        var pending = reviewItems.pending || [];
        var included = reviewItems.included || [];
        var excluded = reviewItems.excluded || [];
        var totalCount = pending.length + included.length + excluded.length;
        
        if (totalCount === 0) {
            return '<div class="cpr-empty">No review items available.</div>';
        }
        
        var tracks = getTracksWithReviewItems(reviewItems);
        
        // Ensure active track index is valid
        if (activeTrackIndex >= tracks.length) {
            activeTrackIndex = 0;
        }
        
        var html = '<div class="cpr-section">';
        
        // Header with stats
        html += '<div class="cpr-header">';
        html += '  <h3 class="cpr-title">Review</h3>';
        html += '  <div class="cpr-stats">';
        html += '    <span class="cpr-stat cpr-stat-pending">⏳ ' + pending.length + '</span>';
        html += '    <span class="cpr-stat cpr-stat-included">✓ ' + included.length + '</span>';
        html += '    <span class="cpr-stat cpr-stat-excluded">✕ ' + excluded.length + '</span>';
        html += '  </div>';
        html += '</div>';
        
        // Track tabs
        html += buildTrackTabs(tracks, activeTrackIndex);
        
        // Items grid for active track
        html += '<div class="cpr-grid">';
        var activeTrack = tracks[activeTrackIndex];
        if (activeTrack && activeTrack.items.length > 0) {
            // Group by decision status within the track
            var trackPending = [];
            var trackIncluded = [];
            var trackExcluded = [];
            
            for (var i = 0; i < activeTrack.items.length; i++) {
                var item = activeTrack.items[i];
                if (item.decision === 'included') trackIncluded.push(item);
                else if (item.decision === 'excluded') trackExcluded.push(item);
                else trackPending.push(item);
            }
            
            // Show pending first, then included, then excluded
            var orderedItems = trackPending.concat(trackIncluded).concat(trackExcluded);
            
            // Sort to push categorized items to the end, then by start time
            orderedItems.sort(function(a, b) {
                var aCat = !!(a.contentType && a.contentType !== '') ? 1 : 0;
                var bCat = !!(b.contentType && b.contentType !== '') ? 1 : 0;
                if (aCat !== bCat) return aCat - bCat;
                return a.start - b.start;
            });
            
            for (var j = 0; j < orderedItems.length; j++) {
                html += buildReviewCardHtml(orderedItems[j], orderedItems[j].id === activeSnippetId);
            }
        } else {
            html += '<div class="cpr-empty">No items for this track.</div>';
        }
        html += '</div>';
        
        html += '</div>';
        
        return html;
    }

    root.AutoCastPanelCutPreviewReviewListComponent = {
        buildReviewSectionHtml: buildReviewSectionHtml,
        buildReviewCardHtml: buildReviewCardHtml,
        getTracksWithReviewItems: getTracksWithReviewItems
    };
})(this);
