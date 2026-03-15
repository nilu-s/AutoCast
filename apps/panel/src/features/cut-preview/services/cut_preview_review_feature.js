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
        var expandedState = context && context.expandedState ? context.expandedState : { groups: {}, tracks: {} };
        var html = component.buildReviewSectionHtml({
            reviewItems: reviewItems,
            activeSnippetId: activeSnippetId,
            expandedState: expandedState
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
        var renderCallback = options.renderCallback;
        
        if (!containerEl) return;
        
        // Track expanded state for groups and tracks
        if (!state.reviewExpandedState) {
            state.reviewExpandedState = {
                groups: { pending: true, included: false, excluded: false },
                tracks: {}
            };
        }
        
        containerEl.addEventListener('click', function (evt) {
            var target = evt.target;
            if (!target) return;
            
            // Handle group toggle (Pending/Included/Excluded headers)
            var groupToggle = closestPolyfill(target, '[data-group-toggle]');
            if (groupToggle) {
                evt.stopPropagation();
                var groupName = groupToggle.getAttribute('data-group-toggle');
                var contentEl = containerEl.querySelector('[data-group-content="' + groupName + '"]');
                if (contentEl) {
                    var isCollapsed = contentEl.classList.toggle('is-collapsed');
                    groupToggle.classList.toggle('is-collapsed', isCollapsed);
                    if (state.reviewExpandedState && state.reviewExpandedState.groups) {
                        state.reviewExpandedState.groups[groupName] = !isCollapsed;
                    }
                }
                return;
            }
            
            // Handle track toggle
            var trackToggle = closestPolyfill(target, '[data-track-toggle]');
            if (trackToggle) {
                evt.stopPropagation();
                var trackIndex = trackToggle.getAttribute('data-track-toggle');
                var itemsEl = containerEl.querySelector('[data-track-items="' + trackIndex + '"]');
                if (itemsEl) {
                    var isCollapsed = itemsEl.classList.toggle('is-collapsed');
                    trackToggle.classList.toggle('is-collapsed', isCollapsed);
                    if (state.reviewExpandedState && state.reviewExpandedState.tracks) {
                        state.reviewExpandedState.tracks[trackIndex] = !isCollapsed;
                    }
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