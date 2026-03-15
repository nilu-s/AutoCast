'use strict';

(function (root) {
    function createReviewState() {
        return {
            reviewDecisions: {},
            excludedSnippetIds: []
        };
    }

    function getReviewDecision(state, snippetId) {
        return state.reviewDecisions[snippetId] || null;
    }

    function setReviewDecision(state, snippetId, decision) {
        if (!snippetId) return state;
        
        if (decision === 'excluded') {
            state.reviewDecisions[snippetId] = 'excluded';
            if (state.excludedSnippetIds.indexOf(snippetId) === -1) {
                state.excludedSnippetIds.push(snippetId);
            }
        } else if (decision === 'included') {
            state.reviewDecisions[snippetId] = 'included';
            var idx = state.excludedSnippetIds.indexOf(snippetId);
            if (idx !== -1) {
                state.excludedSnippetIds.splice(idx, 1);
            }
        } else {
            delete state.reviewDecisions[snippetId];
            var idx2 = state.excludedSnippetIds.indexOf(snippetId);
            if (idx2 !== -1) {
                state.excludedSnippetIds.splice(idx2, 1);
            }
        }
        
        return state;
    }

    function isSnippetExcluded(state, snippetId) {
        return state.reviewDecisions[snippetId] === 'excluded';
    }

    function isSnippetIncluded(state, snippetId) {
        return state.reviewDecisions[snippetId] === 'included';
    }

    function getReviewItems(cutPreview, state) {
        if (!cutPreview || !cutPreview.items) return { pending: [], included: [], excluded: [] };
        
        var pending = [];
        var included = [];
        var excluded = [];
        
        for (var i = 0; i < cutPreview.items.length; i++) {
            var item = cutPreview.items[i];
            if (item.decisionState !== 'review') continue;
            
            var decision = state.reviewDecisions[item.id];
            var enrichedItem = {
                id: item.id,
                trackIndex: item.trackIndex,
                trackName: item.trackName,
                start: item.start,
                end: item.end,
                durationMs: item.durationMs,
                score: item.score,
                scoreLabel: item.scoreLabel,
                contentState: item.contentState,
                selected: item.selected,
                decision: decision
            };
            
            if (decision === 'excluded') {
                excluded.push(enrichedItem);
            } else if (decision === 'included') {
                included.push(enrichedItem);
            } else {
                pending.push(enrichedItem);
            }
        }
        
        return { pending: pending, included: included, excluded: excluded };
    }

    function resetReviewState(state) {
        state.reviewDecisions = {};
        state.excludedSnippetIds = [];
        return state;
    }

    function applyReviewDecisionsToSnippets(cutPreview, state) {
        if (!cutPreview || !cutPreview.items) return cutPreview;
        
        for (var i = 0; i < cutPreview.items.length; i++) {
            var item = cutPreview.items[i];
            if (item.decisionState !== 'review') continue;
            
            var decision = state.reviewDecisions[item.id];
            if (decision === 'included') {
                item.selected = true;
                item.decisionState = 'keep';
            } else if (decision === 'excluded') {
                item.selected = false;
                item.decisionState = 'suppress';
            }
        }
        
        return cutPreview;
    }

    root.AutoCastPanelCutPreviewReviewStore = {
        createReviewState: createReviewState,
        getReviewDecision: getReviewDecision,
        setReviewDecision: setReviewDecision,
        isSnippetExcluded: isSnippetExcluded,
        isSnippetIncluded: isSnippetIncluded,
        getReviewItems: getReviewItems,
        resetReviewState: resetReviewState,
        applyReviewDecisionsToSnippets: applyReviewDecisionsToSnippets
    };
})(this);