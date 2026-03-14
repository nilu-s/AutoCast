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

    function defaultFormatSummaryDuration(sec) {
        var total = Math.max(0, defaultParseNum(sec, 0));
        if (total >= 60) {
            return defaultRound(total / 60, 1) + ' min';
        }
        return defaultRound(total, 1) + ' s';
    }

    function getFn(input, key, fallback) {
        return input && typeof input[key] === 'function' ? input[key] : fallback;
    }

    function shortStateLabel(stateLabel) {
        if (stateLabel === 'kept') return 'keep';
        if (stateLabel === 'near_miss') return 'near';
        if (stateLabel === 'suppressed') return 'supp';
        return stateLabel || '';
    }

    function shortTypeLabel(typeLabel) {
        if (!typeLabel) return '';
        if (typeLabel === 'primary_speech') return 'primary';
        if (typeLabel === 'borderline_speech') return 'borderline';
        if (typeLabel === 'mixed_speech_laughter') return 'mix';
        if (typeLabel === 'laughter_candidate') return 'laugh';
        if (typeLabel === 'bleed_candidate') return 'bleed*';
        if (typeLabel === 'overlap_candidate') return 'overlap';
        if (typeLabel === 'suppressed_bleed') return 'bleed';
        if (typeLabel === 'weak_voice') return 'weak';
        if (typeLabel === 'uninteresting_gap') return 'idle';
        return typeLabel;
    }

    function getTypeCssClass(typeLabel) {
        var key = typeLabel ? String(typeLabel).toLowerCase() : 'unknown';
        key = key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!key) key = 'unknown';
        return 'cp-type-' + key;
    }

    function isAlwaysOpenFillSnippet(item, options) {
        var parseNum = getFn(options, 'parseNum', defaultParseNum);
        if (!item) return false;
        if (item.alwaysOpenFill) return true;
        if (item.origin === 'always_open_fill') return true;
        return !!(item.metrics && parseNum(item.metrics.alwaysOpenFill, 0) >= 0.5);
    }

    function isUninterestingSnippet(item, options) {
        var parseNum = getFn(options, 'parseNum', defaultParseNum);
        if (!item) return false;
        if (item.isUninteresting) return true;
        if (item.origin === 'timeline_gap') return true;
        if (item.typeLabel === 'uninteresting_gap') return true;
        return !!(item.metrics && parseNum(item.metrics.uninterestingGap, 0) >= 0.5);
    }

    function isGenericDecisionReasonText(text) {
        var t = String(text || '').toLowerCase();
        return t === 'kept in final decision' ||
            t === 'pruned in postprocess pass' ||
            t === 'suppressed in overlap resolution' ||
            t === 'kept in legacy segment output' ||
            t === 'suppressed by legacy overlap result';
    }

    function firstInformativeReason(item) {
        if (!item || !item.reasons || !item.reasons.length) return '';
        for (var i = 0; i < item.reasons.length; i++) {
            var reasonText = String(item.reasons[i] || '').replace(/\s+/g, ' ').trim();
            if (!reasonText) continue;
            if (isGenericDecisionReasonText(reasonText)) continue;
            return reasonText;
        }
        return '';
    }

    function compactReasonText(item, maxChars) {
        var text = firstInformativeReason(item);
        if (!text) return '';
        var len = parseInt(maxChars, 10);
        if (!isFinite(len) || len < 8) len = 28;
        if (text.length <= len) return text;
        return text.substring(0, len - 3) + '...';
    }

    function buildSnippetInlineLabel(item, widthPx, options) {
        var stateText = isUninterestingSnippet(item, options) ? 'idle' : shortStateLabel(item && item.state);
        var typeText = shortTypeLabel(item && item.typeLabel);
        var reason = compactReasonText(item, widthPx >= 260 ? 34 : 20);
        var fillHint = isAlwaysOpenFillSnippet(item, options) ? 'main-fill' : '';
        if (widthPx >= 260) {
            return stateText + ' | ' + typeText + ' | ' + item.score + ' ' + item.scoreLabel +
                (fillHint ? ' | ' + fillHint : '') +
                (reason ? ' | ' + reason : '');
        }
        if (widthPx >= 190) {
            return stateText + ' | ' + typeText + ' | ' + item.score + (fillHint ? ' | ' + fillHint : '');
        }
        if (widthPx >= 120) {
            return stateText + ' | ' + item.score + (fillHint ? ' | ' + fillHint : '');
        }
        if (widthPx >= 74) {
            return stateText;
        }
        return '';
    }

    function buildMetricCard(name, value, options) {
        var escapeHtml = getFn(options, 'escapeHtml', defaultEscapeHtml);
        return '<div class="cp-metric-card"><div class="cp-metric-name">' +
            escapeHtml(name) +
            '</div><div class="cp-metric-value">' +
            escapeHtml(String(value)) +
            '</div></div>';
    }

    function defaultIsOverviewZoom(viewport) {
        if (!viewport) return false;
        return viewport.pixelsPerSec <= (viewport.fitPixelsPerSec * 1.45);
    }

    function buildControlsViewModel(input) {
        var parseNum = getFn(input, 'parseNum', defaultParseNum);
        var round = getFn(input, 'round', defaultRound);
        var clamp = getFn(input, 'clamp', defaultClamp);
        var escapeHtml = getFn(input, 'escapeHtml', defaultEscapeHtml);
        var formatSummaryDuration = getFn(input, 'formatSummaryDuration', defaultFormatSummaryDuration);
        var isOverviewZoom = getFn(input, 'isOverviewZoom', defaultIsOverviewZoom);

        var summary = input && input.summary ? input.summary : null;
        var viewport = input && input.viewport ? input.viewport : null;
        if (!summary || !viewport) return null;

        var viewModeText = isOverviewZoom(viewport) ? 'overview' : 'detail';
        var metaText =
            summary.totalItems + ' snippets | selected ' + summary.selectedCount +
            ' | kept ' + summary.keptCount +
            ' | near miss ' + summary.nearMissCount +
            ' | suppressed ' + summary.suppressedCount +
            ' | uninteresting ' + (summary.uninterestingCount || 0) +
            ' | avg score ' + summary.avgScore +
            ' | view ' + viewModeText;

        var tracksInfo = Array.isArray(input && input.tracksInfo) ? input.tracksInfo : [];
        var tracks = Array.isArray(input && input.tracks) ? input.tracks : [];
        var lanes = Array.isArray(input && input.lanes) ? input.lanes : [];

        var totalTracks = Math.max(tracksInfo.length, tracks.length, lanes.length);
        var selectedTracks = 0;
        for (var ti = 0; ti < tracks.length; ti++) {
            if (tracks[ti] && tracks[ti].selected !== false) selectedTracks++;
        }
        if (selectedTracks === 0 && totalTracks > 0) selectedTracks = totalTracks;

        var totalSegments = 0;
        var activePercentSum = 0;
        var activePercentCount = 0;
        for (ti = 0; ti < tracksInfo.length; ti++) {
            totalSegments += Math.max(0, parseNum(tracksInfo[ti] && tracksInfo[ti].segmentCount, 0));
            if (tracksInfo[ti] && isFinite(parseNum(tracksInfo[ti].activePercent, NaN))) {
                activePercentSum += parseNum(tracksInfo[ti].activePercent, 0);
                activePercentCount++;
            }
        }
        var avgActive = activePercentCount > 0 ? round(activePercentSum / activePercentCount, 1) : 0;
        var timelineDuration = parseNum(input && input.timelineDurationSec, 0);

        return {
            metaText: metaText,
            analysisMiniHtml: ''
                + '<span class="cp-summary-chip">Tracks ' + escapeHtml(String(selectedTracks + '/' + totalTracks)) + '</span>'
                + '<span class="cp-summary-chip">Duration ' + escapeHtml(formatSummaryDuration(timelineDuration)) + '</span>'
                + '<span class="cp-summary-chip">Final Segments ' + escapeHtml(String(totalSegments)) + '</span>'
                + '<span class="cp-summary-chip">Avg Active ' + escapeHtml(String(avgActive)) + '%</span>',
            zoomValue: String(parseInt(input && input.cutPreviewZoom, 10) || 0),
            zoomLabelText: Math.round((viewport.pixelsPerSec / viewport.fitPixelsPerSec) * 100) + '%',
            masterVolumeValue: String(Math.round(clamp(parseNum(input && input.previewMasterGain, 1), 0, 3) * 100)),
            masterVolumeLabelText: Math.round(clamp(parseNum(input && input.previewMasterGain, 1), 0, 3) * 100) + '%'
        };
    }

    function requireComponent(componentRef, componentName) {
        if (!componentRef) {
            throw new Error('[AutoCast] Required cut-preview component missing: ' + componentName);
        }
        return componentRef;
    }

    function getTimelineComponent() {
        return requireComponent(root.AutoCastPanelCutPreviewTimelineComponent, 'AutoCastPanelCutPreviewTimelineComponent');
    }

    function getNavigatorComponent() {
        return requireComponent(root.AutoCastPanelCutPreviewNavigatorComponent, 'AutoCastPanelCutPreviewNavigatorComponent');
    }

    function getInspectorComponent() {
        return requireComponent(root.AutoCastPanelCutPreviewInspectorComponent, 'AutoCastPanelCutPreviewInspectorComponent');
    }

    function buildTimelineHtml(input) {
        return getTimelineComponent().buildTimelineHtml(input);
    }

    function buildNavigatorHtml(input) {
        return getNavigatorComponent().buildNavigatorHtml(input);
    }

    function buildInspectorHtml(input) {
        var enriched = input || {};
        if (typeof enriched.buildMetricCard !== 'function') {
            enriched = {};
            var key;
            for (key in (input || {})) {
                if (Object.prototype.hasOwnProperty.call(input, key)) {
                    enriched[key] = input[key];
                }
            }
            enriched.buildMetricCard = function (name, value) {
                return buildMetricCard(name, value, { escapeHtml: input && input.escapeHtml });
            };
        }
        return getInspectorComponent().buildInspectorHtml(enriched);
    }

    root.AutoCastPanelCutPreviewRenderFeature = {
        shortStateLabel: shortStateLabel,
        shortTypeLabel: shortTypeLabel,
        getTypeCssClass: getTypeCssClass,
        isAlwaysOpenFillSnippet: isAlwaysOpenFillSnippet,
        isUninterestingSnippet: isUninterestingSnippet,
        isGenericDecisionReasonText: isGenericDecisionReasonText,
        firstInformativeReason: firstInformativeReason,
        compactReasonText: compactReasonText,
        buildSnippetInlineLabel: buildSnippetInlineLabel,
        buildMetricCard: buildMetricCard,
        buildControlsViewModel: buildControlsViewModel,
        buildTimelineHtml: buildTimelineHtml,
        buildNavigatorHtml: buildNavigatorHtml,
        buildInspectorHtml: buildInspectorHtml
    };
})(this);
