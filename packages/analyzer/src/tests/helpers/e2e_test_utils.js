'use strict';

var path = require('path');
var fs = require('fs');
var genWav = require('./generate_test_wav');

var testDataDir = path.join(__dirname, '..', '..', '..', 'test', 'test_data');

function ensureTestData() {
    if (!fs.existsSync(path.join(testDataDir, 'track_a_host.wav'))) {
        genWav.generateTestFiles(testDataDir);
    }
}

function getDefaultTracks() {
    ensureTestData();
    return [
        path.join(testDataDir, 'track_a_host.wav'),
        path.join(testDataDir, 'track_b_guest1.wav'),
        path.join(testDataDir, 'track_c_guest2.wav')
    ];
}

module.exports = {
    testDataDir: testDataDir,
    ensureTestData: ensureTestData,
    getDefaultTracks: getDefaultTracks
};
