/**
 * WAV Loader Utility for Test Data
 * 
 * Provides synchronous helpers to load WAV files from the test_data directory.
 * Uses the existing wav_reader module for parsing.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readWav } = require('../../src/modules/io/wav_reader');

const TEST_DATA_DIR = path.join(__dirname, '..', 'test_data');

/**
 * Load a WAV file from an absolute or relative path.
 * @param {string} filePath - Path to the WAV file (absolute or relative)
 * @returns {{ sampleRate: number, duration: number, channels: number, samples: Float32Array, bitDepth: number }}
 */
function loadWav(filePath) {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    const result = readWav(absolutePath);
    
    return {
        sampleRate: result.sampleRate,
        duration: result.durationSec,
        channels: result.channels,
        samples: result.samples,
        bitDepth: result.bitDepth
    };
}

/**
 * Get all WAV files in a category directory.
 * @param {string} category - Category folder name (e.g., 'Lachen - 1', 'Mhm - 1')
 * @returns {Array<string>} Array of absolute file paths to WAV files
 */
function getFilesByCategory(category) {
    const categoryPath = path.join(TEST_DATA_DIR, category);
    
    if (!fs.existsSync(categoryPath)) {
        return [];
    }
    
    const entries = fs.readdirSync(categoryPath);
    const wavFiles = entries
        .filter(entry => entry.toLowerCase().endsWith('.wav'))
        .map(entry => path.join(categoryPath, entry));
    
    return wavFiles;
}

/**
 * Load all WAV files from a category directory.
 * Returns an array of objects with file info and audio data.
 * @param {string} category - Category folder name (e.g., 'Lachen - 1', 'Mhm - 1')
 * @returns {Array<{ path: string, filename: string, sampleRate: number, duration: number, channels: number, samples: Float32Array, bitDepth: number }>}
 */
function loadTestData(category) {
    const files = getFilesByCategory(category);
    
    return files.map(filePath => {
        const data = loadWav(filePath);
        return {
            path: filePath,
            filename: path.basename(filePath),
            ...data
        };
    });
}

/**
 * List all available categories (subdirectories) in the test_data directory.
 * @returns {Array<string>} Array of category folder names
 */
function listCategories() {
    if (!fs.existsSync(TEST_DATA_DIR)) {
        return [];
    }
    
    const entries = fs.readdirSync(TEST_DATA_DIR, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
}

module.exports = {
    loadWav,
    loadTestData,
    listCategories,
    getFilesByCategory
};
