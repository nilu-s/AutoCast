'use strict';

var path = require('path');
var analyzerContracts = require('../analyzer_contracts');
var fixtures = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers', 'analyzer_contract_test_fixtures'));

describe('Analyzer Contracts', function () {
    it('should normalize empty track entries to null', function () {
        var normalized = analyzerContracts.normalizeTrackPaths([
            'C:/audio/track_1.wav',
            '',
            null,
            undefined
        ]);
        assert(normalized.length === 4, 'Expected all track entries to be preserved');
        assert(normalized[0] === 'C:/audio/track_1.wav', 'Expected first path to stay unchanged');
        assert(normalized[1] === null, 'Expected empty string to normalize to null');
        assert(normalized[2] === null, 'Expected null to stay null');
        assert(normalized[3] === null, 'Expected undefined to normalize to null');
    });

    it('should reject non-string track path values', function () {
        assertThrows(function () {
            analyzerContracts.normalizeTrackPaths(['C:/audio/track_1.wav', 42]);
        }, 'Expected number track path to throw');
    });

    it('should validate analyze request and keep params object', function () {
        var request = analyzerContracts.validateAnalyzeRequest({
            trackPaths: ['A.wav', '', null],
            params: { threshold: 0.3 }
        });
        assert(Array.isArray(request.trackPaths), 'Expected normalized track paths');
        assert(request.trackPaths[1] === null, 'Expected second track to normalize to null');
        assert(request.params && request.params.threshold === 0.3, 'Expected params to stay intact');
    });

    it('should reject analyze request without track paths', function () {
        assertThrows(function () {
            analyzerContracts.validateAnalyzeRequest({ trackPaths: [] });
        }, 'Expected empty analyze request to throw');
    });

    it('should require at least one valid track for quick gain scan', function () {
        assertThrows(function () {
            analyzerContracts.validateQuickGainScanRequest({
                trackPaths: ['', null, undefined]
            });
        }, 'Expected quick gain scan request without real paths to throw');
    });

    it('should accept quick gain scan request with one valid path', function () {
        var request = analyzerContracts.validateQuickGainScanRequest({
            trackPaths: [null, 'B.wav', '']
        });
        assert(Array.isArray(request.trackPaths), 'Expected normalized track paths');
        assert(request.trackPaths[1] === 'B.wav', 'Expected valid path to be kept');
    });

    it('should validate required analyze result shape', function () {
        analyzerContracts.assertAnalyzeResult(fixtures.makeValidAnalyzeResult());
    });

    it('should reject invalid analyze result shape', function () {
        assertThrows(function () {
            analyzerContracts.assertAnalyzeResult({
                tracks: [],
                segments: []
            });
        }, 'Expected missing alignment and waveform to throw');
    });

    it('should reject analyze result with out-of-range preview metric', function () {
        var result = fixtures.makeValidAnalyzeResult();
        result.cutPreview.items[0].metrics.overlapTrust = 1.5;
        assertThrows(function () {
            analyzerContracts.assertAnalyzeResult(result);
        }, 'Expected out-of-range overlapTrust to throw');
    });

    it('should reject previewModel version mismatch', function () {
        var result = fixtures.makeValidAnalyzeResult();
        result.previewModel.metricsVersion = 'preview-metrics.v1';
        assertThrows(function () {
            analyzerContracts.assertAnalyzeResult(result);
        }, 'Expected preview model version mismatch to throw');
    });

    it('should validate quick gain result shape', function () {
        analyzerContracts.assertQuickGainScanResult({ tracks: [] });
    });

    it('should reject quick gain result without tracks array', function () {
        assertThrows(function () {
            analyzerContracts.assertQuickGainScanResult({});
        }, 'Expected quick gain result without tracks to throw');
    });

    it('should attach contract metadata', function () {
        var payload = { tracks: [] };
        var result = analyzerContracts.withContract(payload, 'quick_gain_scan_result');
        assert(result === payload, 'Expected withContract to decorate the original payload object');
        assert(result.contract && result.contract.name === 'quick_gain_scan_result', 'Expected contract name');
        assert(
            result.contract.version === analyzerContracts.ANALYZER_CONTRACT_VERSION,
            'Expected contract version'
        );
    });
});
