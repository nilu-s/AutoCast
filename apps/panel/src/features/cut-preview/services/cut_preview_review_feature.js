'use strict';

(function (root) {
    function getReviewStoreFromContext(context) {
        if (context && context.reviewStore) return context.reviewStore;
        if (root.AutoCastPanelCutPreviewReviewStore) return root.AutoCastPanelCutPreviewReviewStore;
        return null;
    }

    function getReviewListComponentFromContext(context) {
        if (context && context.reviewListComponent) return context.reviewListComponent;
        if (root.AutoCastPanelCutPreviewReviewListComponent) return root.AutoCastPanelCutPreviewReviewListComponent;
        return null;
    }

    function initializeReviewState(context) {
        var store = getReviewStoreFromContext(context);
        if (!store) return null;
        return store.createReviewState();
    }

    function getReviewItemsForDisplay(cutPreview, reviewState, context) {
        var store = getReviewStoreFromContext(context);
        if (!store || !reviewState) return { pending: [], included: [], excluded: [] };
        return store.getReviewItems(cutPreview, reviewState);
    }

    function includeSnippet(reviewState, snippetId, context) {
        var store = getReviewStoreFromContext(context);
        if (!store || !reviewState) return reviewState;
        return store.setReviewDecision(reviewState, snippetId, 'included');
    }

    function excludeSnippet(reviewState, snippetId, context) {
        var store = getReviewStoreFromContext(context);
        if (!store || !reviewState) return reviewState;
        return store.setReviewDecision(reviewState, snippetId, 'excluded');
    }

    function resetSnippetDecision(reviewState, snippetId, context) {
        var store = getReviewStoreFromContext(context);
        if (!store || !reviewState) return reviewState;
        return store.setReviewDecision(reviewState, snippetId, null);
    }

    function isSnippetReviewed(reviewState, snippetId, context) {
        var store = getReviewStoreFromContext(context);
        if (!store || !reviewState) return false;
        return store.getReviewDecision(reviewState, snippetId) !== null;
    }

    function resetAllReviewDecisions(reviewState, context) {
        var store = getReviewStoreFromContext(context);
        if (!store || !reviewState) return reviewState;
        return store.resetReviewState(reviewState);
    }

    function applyReviewDecisions(cutPreview, reviewState, context) {
        var store = getReviewStoreFromContext(context);
        if (!store || !reviewState || !cutPreview) return cutPreview;
        return store.applyReviewDecisionsToSnippets(cutPreview, reviewState);
    }

    function renderReviewSection(containerEl, cutPreview, reviewState, activeSnippetId, context) {
        var component = getReviewListComponentFromContext(context);
        if (!component || !containerEl) return;
        
        var reviewItems = getReviewItemsForDisplay(cutPreview, reviewState, context);
        var activeTrackIndex = context && context.activeTrackIndex !== undefined ? context.activeTrackIndex : 0;
        var html = component.buildReviewSectionHtml({
            reviewItems: reviewItems,
            activeSnippetId: activeSnippetId,
            activeTrackIndex: activeTrackIndex
        });
        
        containerEl.innerHTML = html;
    }

    function closestPolyfill(el, selector) {
        if (!el) return null;
        if (typeof el.closest === 'function') {
            return el.closest(selector);
        }
        // Fallback for older browsers
        var cur = el;
        while (cur && cur !== document.body) {
            if (cur.matches && cur.matches(selector)) return cur;
            if (cur.msMatchesSelector && cur.msMatchesSelector(selector)) return cur;
            cur = cur.parentNode;
        }
        return null;
    }

    function bindReviewControls(options) {
        options = options || {};
        var containerEl = options.containerEl;
        var state = options.state || {};
        var reviewState = options.reviewState;
        var onSelectSnippet = options.onSelectSnippet;
        var onIncludeSnippet = options.onIncludeSnippet;
        var onExcludeSnippet = options.onExcludeSnippet;
        var onResetSnippet = options.onResetSnippet;
        var onSelectTrack = options.onSelectTrack;
        var renderCallback = options.renderCallback;
        
        if (!containerEl) return;
        
        // Track active tab
        if (!state.reviewActiveTrackIndex) {
            state.reviewActiveTrackIndex = 0;
        }
        
        containerEl.addEventListener('click', function (evt) {
            var target = evt.target;
            if (!target) return;
            
            // Do not intercept clicks on interactive children that need default/bubble behavior
            if (closestPolyfill(target, '.temp-category-select') || 
                closestPolyfill(target, '[data-item-play]')) {
                return;
            }
            
            // Handle track tab selection
            var trackTab = closestPolyfill(target, '[data-review-track]');
            if (trackTab) {
                evt.stopPropagation();
                var trackIndex = parseInt(trackTab.getAttribute('data-review-track'), 10);
                if (!isNaN(trackIndex)) {
                    state.reviewActiveTrackIndex = trackIndex;
                    if (onSelectTrack) {
                        onSelectTrack(trackIndex);
                    }
                    if (renderCallback) renderCallback();
                }
                return;
            }
            
            // Handle include button first (higher priority)
            var includeBtn = closestPolyfill(target, '[data-review-include]');
            if (includeBtn) {
                evt.stopPropagation();
                var includeId = includeBtn.getAttribute('data-review-include');
                if (onIncludeSnippet && includeId) {
                    onIncludeSnippet(includeId);
                    if (renderCallback) renderCallback();
                }
                return;
            }
            
            // Handle exclude button
            var excludeBtn = closestPolyfill(target, '[data-review-exclude]');
            if (excludeBtn) {
                evt.stopPropagation();
                var excludeId = excludeBtn.getAttribute('data-review-exclude');
                if (onExcludeSnippet && excludeId) {
                    onExcludeSnippet(excludeId);
                    if (renderCallback) renderCallback();
                }
                return;
            }
            
            // Handle item selection (click on item itself, but not on buttons)
            var itemEl = closestPolyfill(target, '[data-review-item-id]');
            if (itemEl) {
                evt.stopPropagation();
                var itemId = itemEl.getAttribute('data-review-item-id');
                if (onSelectSnippet && itemId) {
                    onSelectSnippet(itemId);
                }
                return;
            }
        });
    }

    function getPendingReviewCount(cutPreview, reviewState, context) {
        var items = getReviewItemsForDisplay(cutPreview, reviewState, context);
        return items.pending ? items.pending.length : 0;
    }

    function getReviewSummary(cutPreview, reviewState, context) {
        var items = getReviewItemsForDisplay(cutPreview, reviewState, context);
        return {
            total: (items.pending ? items.pending.length : 0) + 
                   (items.included ? items.included.length : 0) + 
                   (items.excluded ? items.excluded.length : 0),
            pending: items.pending ? items.pending.length : 0,
            included: items.included ? items.included.length : 0,
            excluded: items.excluded ? items.excluded.length : 0
        };
    }

    root.AutoCastPanelCutPreviewReviewFeature = {
        initializeReviewState: initializeReviewState,
        getReviewItemsForDisplay: getReviewItemsForDisplay,
        includeSnippet: includeSnippet,
        excludeSnippet: excludeSnippet,
        resetSnippetDecision: resetSnippetDecision,
        isSnippetReviewed: isSnippetReviewed,
        resetAllReviewDecisions: resetAllReviewDecisions,
        applyReviewDecisions: applyReviewDecisions,
        renderReviewSection: renderReviewSection,
        bindReviewControls: bindReviewControls,
        getPendingReviewCount: getPendingReviewCount,
        getReviewSummary: getReviewSummary
    };
})(this);