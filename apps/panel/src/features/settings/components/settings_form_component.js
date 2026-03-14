'use strict';

(function (root) {
    function getDefaults(fallbacks) {
        var src = fallbacks || {};
        return {
            threshold: src.threshold !== undefined ? String(src.threshold) : '0',
            minPeak: src.minPeak !== undefined ? String(src.minPeak) : '-52'
        };
    }

    function applyToElements(els, settings) {
        var values = getDefaults(settings);
        if (els && els.paramThreshold) {
            els.paramThreshold.value = values.threshold;
            if (els.valThreshold) els.valThreshold.textContent = values.threshold;
        }
        if (els && els.paramMinPeak) {
            els.paramMinPeak.value = values.minPeak;
            if (els.valMinPeak) els.valMinPeak.textContent = values.minPeak + ' dB';
        }
    }

    function readFromElements(els, fallbacks) {
        var defaults = getDefaults(fallbacks);
        return {
            threshold: (els && els.paramThreshold && els.paramThreshold.value !== undefined)
                ? String(els.paramThreshold.value)
                : defaults.threshold,
            minPeak: (els && els.paramMinPeak && els.paramMinPeak.value !== undefined)
                ? String(els.paramMinPeak.value)
                : defaults.minPeak
        };
    }

    root.AutoCastPanelSettingsFormComponent = {
        getDefaults: getDefaults,
        applyToElements: applyToElements,
        readFromElements: readFromElements
    };
})(this);
