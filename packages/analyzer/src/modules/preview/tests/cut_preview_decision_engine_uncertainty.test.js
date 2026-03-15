'use strict';

var decisionEngine = require('../cut_preview_decision_engine');

function makeMetricOverrides(overrides) {
    return Object.assign({
        peakOverThreshold: 4.2,
        meanOverThreshold: 2.4,
        rawPeakDbFs: -44,
        rawMeanDbFs: -48,
        spectralConfidence: 0.57,
        laughterConfidence: 0.10,
        overlapPenalty: 0.52,
        overlapTrust: 0.60,
        speakerLockScore: 0.62,
        speakerMatchP10: 0.48,
        speakerMatchMedian: 0.61,
        voiceFrameRatio: 0.58,
        inSnippetDropoutRatio: 0.08,
        mergeHeterogeneity: 0.18,
        speechEvidence: 0.63,
        laughterEvidence: 0.12,
        bleedEvidence: 0.48,
        bleedConfidence: 0.50,
        noiseEvidence: 0.12,
        classMargin: 0.28
    }, overrides || {});
}

describe('Cut Preview Decision Engine - Uncertainty Corridor', function () {
    it('should route keep+bleed uncertainty to review via explicit gate', function () {
        var result = decisionEngine.evaluatePreviewDecision({
            metrics: makeMetricOverrides({ classMargin: 0.07 }),
            keepCoverage: 0.94,
            keptSourceRatio: 0.90,
            sourceSuppressedCoverage: 0.04,
            sourceActiveCoverage: 0.96,
            durationSec: 1.0
        });

        assert(result.decisionState === 'review', 'Expected uncertainty corridor to force review');
        assert(result.stage === 'uncertainty_bleed_gate', 'Expected explicit keep+bleed uncertainty stage');
        assert(result.hardReviewCorridor === true, 'Expected hard review corridor marker');
        assert(result.uncertaintyBleedGate === true, 'Expected uncertainty bleed gate marker');
        assert((result.reasons || []).join(' ').indexOf('Hard review corridor') >= 0, 'Expected corridor reason visibility');
    });

    it('should stay stable for small overlap perturbations without state jump', function () {
        var context = {
            keepCoverage: 0.92,
            keptSourceRatio: 0.85,
            sourceSuppressedCoverage: 0.08,
            sourceActiveCoverage: 0.90,
            durationSec: 1.1,
            metrics: makeMetricOverrides({
                classMargin: 0.44,
                bleedEvidence: 0.30,
                bleedConfidence: 0.34,
                overlapPenalty: 0.30,
                overlapTrust: 0.34,
                speechEvidence: 0.66
            })
        };

        var first = decisionEngine.evaluatePreviewDecision(context);
        var second = decisionEngine.evaluatePreviewDecision({
            keepCoverage: context.keepCoverage,
            keptSourceRatio: context.keptSourceRatio,
            sourceSuppressedCoverage: context.sourceSuppressedCoverage,
            sourceActiveCoverage: context.sourceActiveCoverage,
            durationSec: context.durationSec,
            metrics: makeMetricOverrides({
                classMargin: 0.42,
                bleedEvidence: 0.31,
                bleedConfidence: 0.35,
                overlapPenalty: 0.33,
                overlapTrust: 0.36,
                speechEvidence: 0.65
            })
        });

        assert(first.decisionState === second.decisionState, 'Expected stable decision state for small signal changes');
        assert(!(first.decisionState === 'keep' && second.decisionState === 'suppress'), 'Expected no hard keep->suppress jump');
        assert(Math.abs(first.keepLikelihood - second.keepLikelihood) < 0.09, 'Expected bounded keep-likelihood drift');
    });
});
