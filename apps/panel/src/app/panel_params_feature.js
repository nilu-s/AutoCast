'use strict';

(function (root) {
    function getSettingsFormComponent() {
        return root.AutoCastPanelSettingsFormComponent || null;
    }

    function getDefaultPanelSettings(els) {
        var component = getSettingsFormComponent();
        if (component && typeof component.getDefaults === 'function') {
            return component.getDefaults({
                threshold: els.paramThreshold ? els.paramThreshold.value : '0',
                minPeak: els.paramMinPeak ? els.paramMinPeak.value : '-52'
            });
        }
        return {
            threshold: els.paramThreshold ? els.paramThreshold.value : '0',
            minPeak: els.paramMinPeak ? els.paramMinPeak.value : '-52'
        };
    }

    function applyPanelSettingsToElements(els, settings) {
        var component = getSettingsFormComponent();
        if (component && typeof component.applyToElements === 'function') {
            component.applyToElements(els, settings);
            return;
        }
        if (els.paramThreshold && settings && settings.threshold !== undefined) {
            els.paramThreshold.value = String(settings.threshold);
            if (els.valThreshold) els.valThreshold.textContent = String(els.paramThreshold.value);
        }
        if (els.paramMinPeak && settings && settings.minPeak !== undefined) {
            els.paramMinPeak.value = String(settings.minPeak);
            if (els.valMinPeak) els.valMinPeak.textContent = String(els.paramMinPeak.value) + ' dB';
        }
    }

    function readPanelSettingsFromElements(els) {
        var component = getSettingsFormComponent();
        if (component && typeof component.readFromElements === 'function') {
            return component.readFromElements(els, getDefaultPanelSettings(els));
        }
        return {
            threshold: els.paramThreshold ? els.paramThreshold.value : '0',
            minPeak: els.paramMinPeak ? els.paramMinPeak.value : '-52'
        };
    }

    function cloneFlatObject(obj) {
        var out = {};
        if (!obj) return out;
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) out[key] = obj[key];
        }
        return out;
    }

    function loadPanelSettings(settingsFeature, els) {
        if (!settingsFeature || typeof settingsFeature.loadSettings !== 'function') return;
        var loaded = settingsFeature.loadSettings(getDefaultPanelSettings(els));
        applyPanelSettingsToElements(els, loaded);
    }

    function savePanelSettings(settingsFeature, els) {
        if (!settingsFeature || typeof settingsFeature.saveSettings !== 'function') return;
        settingsFeature.saveSettings(readPanelSettingsFromElements(els));
    }

    function resolveAnalyzerDefaults(cacheRef, analyzerDefaults) {
        if (cacheRef && cacheRef.value) {
            return cloneFlatObject(cacheRef.value);
        }

        if (analyzerDefaults && typeof analyzerDefaults === 'object') {
            if (cacheRef) cacheRef.value = analyzerDefaults;
            return cloneFlatObject(analyzerDefaults);
        }

        if (cacheRef) cacheRef.value = {};
        return {};
    }

    function getPerTrackSensitivity(options) {
        options = options || {};
        var analysisFeature = options.analysisFeature;
        return analysisFeature.getPerTrackSensitivity(
            options.perTrackSensitivity || {},
            options.trackCount || 0,
            options.globalThreshold || 0
        );
    }

    function getParams(options) {
        options = options || {};
        var analysisFeature = options.analysisFeature;
        var defaults = resolveAnalyzerDefaults(
            options.analyzerDefaultsCacheRef,
            options.analyzerDefaults
        );
        var thresholdValue = parseInt(options.thresholdValue, 10);
        var minPeakValue = parseFloat(options.minPeakValue);
        var debugMode = analysisFeature.getDebugMode(options.windowObj);

        return analysisFeature.buildAnalyzerParams({
            defaults: defaults,
            thresholdValue: thresholdValue,
            minPeakValue: minPeakValue,
            perTrackThresholdDb: options.perTrackThresholdDb,
            debugMode: debugMode
        });
    }

    root.AutoCastPanelParamsFeature = {
        loadPanelSettings: loadPanelSettings,
        savePanelSettings: savePanelSettings,
        resolveAnalyzerDefaults: resolveAnalyzerDefaults,
        getPerTrackSensitivity: getPerTrackSensitivity,
        getParams: getParams
    };
})(this);
