'use strict';

var path = require('path');
var cutPreviewApply = require(path.join(__dirname, '..', '..', '..', '..', 'js', 'cut_preview_apply'));

describe('Cut Preview Apply Payload', function () {
    it('should apply only selected snippets and merge touching ranges per track', function () {
        var tracks = [
            { index: 2, selected: true },
            { index: 5, selected: true },
            { index: 8, selected: false }
        ];

        var cutPreview = {
            items: [
                { trackIndex: 0, selected: true, start: 0.00, end: 1.00, alwaysOpenFill: true },
                { trackIndex: 0, selected: false, start: 1.10, end: 1.60 },
                { trackIndex: 0, selected: true, start: 1.90, end: 3.00 },
                { trackIndex: 1, selected: true, start: 0.50, end: 1.20, origin: 'always_open_fill' },
                { trackIndex: 1, selected: true, start: 1.20, end: 1.40, metrics: { alwaysOpenFill: 1 } },
                { trackIndex: 2, selected: true, start: 0.20, end: 0.90 }
            ]
        };

        var analysisResult = { segments: [[], [], []] };
        var payload = cutPreviewApply.buildApplyCutsPayloadFromState(tracks, cutPreview, analysisResult);

        assert(payload && payload.trackIndices.length === 2, 'Expected 2 selected tracks');
        assert(payload.trackIndices[0] === 2 && payload.trackIndices[1] === 5, 'Expected original track indices');
        assert(payload.segments.length === 2, 'Expected segments for two selected tracks');

        assert(payload.segments[0].length === 2, 'Track 0 should have two selected islands');
        assertApprox(payload.segments[0][0].start, 0.00, 0.0001);
        assertApprox(payload.segments[0][0].end, 1.00, 0.0001);
        assertApprox(payload.segments[0][1].start, 1.90, 0.0001);
        assertApprox(payload.segments[0][1].end, 3.00, 0.0001);

        assert(payload.segments[1].length === 1, 'Track 1 touching snippets should merge');
        assertApprox(payload.segments[1][0].start, 0.50, 0.0001);
        assertApprox(payload.segments[1][0].end, 1.40, 0.0001);

        assert(payload.fillSegments && payload.fillSegments.length === 2, 'Expected fill segments for selected tracks');
        assert(payload.fillSegments[0].length === 1, 'Track 0 should have one fill range');
        assertApprox(payload.fillSegments[0][0].start, 0.00, 0.0001);
        assertApprox(payload.fillSegments[0][0].end, 1.00, 0.0001);
        assert(payload.fillSegments[1].length === 1, 'Track 1 touching fill ranges should merge');
        assertApprox(payload.fillSegments[1][0].start, 0.50, 0.0001);
        assertApprox(payload.fillSegments[1][0].end, 1.40, 0.0001);
    });

    it('should return empty segments when cutPreview is missing', function () {
        var tracks = [
            { index: 0, selected: true }
        ];
        var analysisResult = {
            segments: [[
                { start: 0.00, end: 0.80, state: 'active' },
                { start: 0.80, end: 1.10, state: 'suppressed' },
                { start: 1.30, end: 1.90, state: 'active' },
                { start: 2.00, end: 2.40, state: 'active', origin: 'always_open_fill' }
            ]]
        };

        var payload = cutPreviewApply.buildApplyCutsPayloadFromState(tracks, null, analysisResult);
        assert(payload && payload.segments.length === 1, 'Expected single track payload');
        assert(payload.segments[0].length === 0, 'Expected no cut segments without cutPreview items');
        assert(payload.fillSegments && payload.fillSegments[0].length === 0, 'Expected no fill segments without cutPreview items');
    });
});
