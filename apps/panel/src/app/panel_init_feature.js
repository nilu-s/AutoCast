'use strict';

(function (root) {
    function defaultParseNum(v, fallback) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }

    function defaultClamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function requestLargeStartupPanel(options) {
        options = options || {};
        var hostAdapter = options.hostAdapter || null;
        var parseNum = typeof options.parseNum === 'function' ? options.parseNum : defaultParseNum;
        var clamp = typeof options.clamp === 'function' ? options.clamp : defaultClamp;
        var windowObj = options.windowObj || root;
        var consoleObj = options.consoleObj || (windowObj && windowObj.console ? windowObj.console : null);

        if (!hostAdapter || typeof hostAdapter.resizePanel !== 'function') return;
        if (hostAdapter.isInMockMode && hostAdapter.isInMockMode()) return;

        try {
            var availW = parseNum(windowObj && windowObj.screen && windowObj.screen.availWidth, 0);
            var availH = parseNum(windowObj && windowObj.screen && windowObj.screen.availHeight, 0);
            if (!availW || !availH) return;
            var targetW = clamp(Math.round(availW * 0.95), 1200, 3400);
            var targetH = clamp(Math.round(availH * 0.95), 760, 2200);
            hostAdapter.resizePanel(targetW, targetH);
        } catch (e) {
            if (consoleObj && typeof consoleObj.warn === 'function') {
                consoleObj.warn('[AutoCast] Could not resize panel at startup:', e);
            }
        }
    }

    function initializePanel(options) {
        options = options || {};
        var interactionFeature = options.interactionFeature || null;
        var bindPrimaryActionsOptions = options.bindPrimaryActionsOptions || {};
        var els = options.els || {};
        var windowObj = options.windowObj || root;

        if (interactionFeature && typeof interactionFeature.bindPrimaryActions === 'function') {
            interactionFeature.bindPrimaryActions(bindPrimaryActionsOptions);
        }

        if (typeof options.bindCutPreviewControls === 'function') {
            options.bindCutPreviewControls();
        }
        if (typeof options.updateModeIndicator === 'function') {
            options.updateModeIndicator();
        }
        if (typeof options.hideProgress === 'function') {
            options.hideProgress();
        }
        if (typeof options.hideCutPreview === 'function') {
            options.hideCutPreview();
        }
        if (typeof options.renderTracks === 'function') {
            options.renderTracks();
        }

        if (els.btnApply) els.btnApply.disabled = true;
        if (els.cutPreviewApplyBtn) els.cutPreviewApplyBtn.disabled = true;
        if (els.btnReset) els.btnReset.disabled = true;

        if (typeof options.setStatus === 'function') {
            options.setStatus('idle', 'Ready');
        }

        if (!windowObj || typeof windowObj.setTimeout !== 'function') return;

        windowObj.setTimeout(function () {
            requestLargeStartupPanel({
                hostAdapter: options.hostAdapter,
                parseNum: options.parseNum,
                clamp: options.clamp,
                windowObj: windowObj,
                consoleObj: options.consoleObj
            });
        }, 80);

        windowObj.setTimeout(function () {
            requestLargeStartupPanel({
                hostAdapter: options.hostAdapter,
                parseNum: options.parseNum,
                clamp: options.clamp,
                windowObj: windowObj,
                consoleObj: options.consoleObj
            });
        }, 700);

        windowObj.setTimeout(function () {
            requestLargeStartupPanel({
                hostAdapter: options.hostAdapter,
                parseNum: options.parseNum,
                clamp: options.clamp,
                windowObj: windowObj,
                consoleObj: options.consoleObj
            });
        }, 1800);

        if (typeof options.loadTracksFromHost === 'function') {
            windowObj.setTimeout(options.loadTracksFromHost, 500);
        }
    }

    root.AutoCastPanelInitFeature = {
        requestLargeStartupPanel: requestLargeStartupPanel,
        initializePanel: initializePanel
    };
})(this);
