'use strict';

(function (root) {
    function getAnalysisStatusComponent() {
        return root.AutoCastPanelAnalysisStatusComponent || null;
    }

    function setStatus(els, type, text) {
        if (els.statusBar) els.statusBar.className = 'status-bar status-' + type;
        if (els.statusText) els.statusText.textContent = text;
    }

    function setProgress(options) {
        options = options || {};
        var els = options.els || {};
        if (!els.progressContainer || !els.progressFill || !els.progressText) return;

        els.progressContainer.style.display = 'flex';
        els.progressFill.style.width = options.percent + '%';

        var component = getAnalysisStatusComponent();
        if (component && typeof component.formatProgressLabel === 'function') {
            els.progressText.textContent = component.formatProgressLabel(options.percent, options.message);
        } else {
            els.progressText.textContent = options.percent + '%';
        }

        if (options.message && typeof options.setStatus === 'function') {
            options.setStatus('analyzing', options.message);
        }
    }

    function hideProgress(els) {
        if (els.progressContainer) {
            els.progressContainer.style.display = 'none';
        }
    }

    function setButtonsDisabled(els, disabled) {
        if (els.btnApply) els.btnApply.disabled = disabled;
        if (els.btnAnalyze) els.btnAnalyze.disabled = disabled;
        if (els.btnReset) els.btnReset.disabled = disabled;
        if (els.cutPreviewApplyBtn) els.cutPreviewApplyBtn.disabled = disabled;
    }

    function setPanelPageMode(state, els, mode) {
        var reviewMode = mode === 'review';
        state.panelPageMode = reviewMode ? 'review' : 'setup';
        if (els.panelRoot && els.panelRoot.classList) {
            els.panelRoot.classList.toggle('is-review-mode', reviewMode);
        }
        if (els.cutPreviewSection) {
            els.cutPreviewSection.style.display = reviewMode ? 'block' : 'none';
        }
        updateTabNav(els, mode);
    }

    function updateTabNav(els, mode) {
        if (!els.tabNav) return;
        els.tabNav.style.display = 'flex';
        var setupTab = els.tabSetup;
        var reviewTab = els.tabReview;
        if (setupTab) {
            setupTab.classList.toggle('is-active', mode === 'setup');
            setupTab.classList.toggle('is-completed', mode === 'review');
            setupTab.disabled = mode === 'review';
        }
        if (reviewTab) {
            reviewTab.classList.toggle('is-active', mode === 'review');
            reviewTab.disabled = mode === 'setup';
        }
    }

    function bindTabNavigation(els, onTabClick) {
        if (!els.tabNav) return;
        els.tabNav.addEventListener('click', function(evt) {
            var btn = evt.target.closest('.tab-btn');
            if (!btn || btn.disabled) return;
            var tab = btn.getAttribute('data-tab');
            if (tab && typeof onTabClick === 'function') {
                onTabClick(tab);
            }
        });
    }

    function hideCutPreview(options) {
        options = options || {};
        var state = options.state || {};
        var els = options.els || {};
        if (typeof options.setPanelPageMode === 'function') {
            options.setPanelPageMode('setup');
        }
        if (typeof options.cancelPendingCutPreviewRender === 'function') {
            options.cancelPendingCutPreviewRender();
        }
        state.navigatorDrag = null;
        if (els.cutPreviewMeta) els.cutPreviewMeta.textContent = '';
        if (els.cutPreviewAnalysisMini) els.cutPreviewAnalysisMini.innerHTML = '';
        if (els.cutPreviewTimeline) els.cutPreviewTimeline.innerHTML = '';
        if (els.cutPreviewNavigator) els.cutPreviewNavigator.innerHTML = '';
        if (els.cutPreviewInspector) els.cutPreviewInspector.innerHTML = '';
    }

    function updateModeIndicator(els) {
        if (!els.modeIndicator) return;
        els.modeIndicator.textContent = 'Mode: Cut Preview';
    }

    function bindSlider(slider, display, suffix) {
        if (!slider || !display) return;
        slider.addEventListener('input', function () {
            display.textContent = suffix ? (slider.value + ' ' + suffix) : String(slider.value);
        });
    }

    root.AutoCastPanelUiRuntimeFeature = {
        setStatus: setStatus,
        setProgress: setProgress,
        hideProgress: hideProgress,
        setButtonsDisabled: setButtonsDisabled,
        setPanelPageMode: setPanelPageMode,
        hideCutPreview: hideCutPreview,
        updateModeIndicator: updateModeIndicator,
        bindSlider: bindSlider,
        bindTabNavigation: bindTabNavigation
    };
})(this);
