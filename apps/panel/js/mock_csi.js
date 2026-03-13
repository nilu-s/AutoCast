/**
 * AutoCast – Mock CSInterface
 * 
 * Simulates Adobe's CSInterface for browser-based development & testing.
 * When opened in Chrome (not inside Premiere), this provides dummy data
 * so the UI can be fully tested without Premiere Pro.
 */

'use strict';

(function () {
    // Only activate if real CEP environment is not available (i.e., running in browser)
    if (typeof window.__adobe_cep__ !== 'undefined') {
        console.log('[AutoCast] Running inside CEP – mock disabled.');
        return;
    }

    console.log('[AutoCast] Running in BROWSER MODE – mock CSInterface active.');

    // Mock track data
    var mockTrackInfo = {
        sequenceName: 'Podcast_Episode_42',
        sequenceId: 'mock-seq-001',
        framerate: '24',
        audioTrackCount: 3,
        tracks: [
            {
                index: 0,
                name: 'Audio 1',
                muted: false,
                clips: [
                    {
                        name: 'Host_Recording.wav',
                        startTicks: '0',
                        endTicks: '914457600000000',
                        inPointTicks: '0',
                        outPointTicks: '914457600000000',
                        mediaPath: 'packages/analyzer/test/test_data/track_a_host.wav'
                    }
                ]
            },
            {
                index: 1,
                name: 'Audio 2',
                muted: false,
                clips: [
                    {
                        name: 'Guest1_Recording.wav',
                        startTicks: '0',
                        endTicks: '914457600000000',
                        inPointTicks: '0',
                        outPointTicks: '914457600000000',
                        mediaPath: 'packages/analyzer/test/test_data/track_b_guest1.wav'
                    }
                ]
            },
            {
                index: 2,
                name: 'Audio 3',
                muted: false,
                clips: [
                    {
                        name: 'Guest2_Recording.wav',
                        startTicks: '0',
                        endTicks: '914457600000000',
                        inPointTicks: '0',
                        outPointTicks: '914457600000000',
                        mediaPath: 'packages/analyzer/test/test_data/track_c_guest2.wav'
                    }
                ]
            }
        ]
    };

    // Mock ExtendScript responses
    var mockResponses = {
        'autocast_ping()': JSON.stringify({ status: 'ok', version: '2.2.0', host: 'Mock Browser' }),
        'autocast_getTrackInfo()': JSON.stringify(mockTrackInfo)
    };

    /**
     * Mock CSInterface constructor
     */
    window.CSInterface = function () { };

    window.CSInterface.prototype.evalScript = function (script, callback) {
        console.log('[Mock CSInterface] evalScript:', script);

        // Check for static mock responses
        if (mockResponses[script]) {
            if (callback) setTimeout(function () { callback(mockResponses[script]); }, 100);
            return;
        }

        // Unknown script
        console.warn('[Mock CSInterface] Unknown script:', script);
        if (callback) setTimeout(function () { callback('null'); }, 100);
    };

    window.CSInterface.prototype.getSystemPath = function (pathId) {
        // SystemPath constants
        var paths = {
            0: '/mock/extension/path',  // EXTENSION
            1: '/mock/user/data',       // USER_DATA
            2: '/mock/common/files',    // COMMON_FILES
            3: '/mock/host/path'        // HOST_APPLICATION
        };
        return paths[pathId] || '/mock/unknown';
    };

    // Also expose that we're in mock mode
    window.__AUTOCAST_MOCK_MODE__ = true;

})();
