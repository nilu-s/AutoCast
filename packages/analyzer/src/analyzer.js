/**
 * AutoCast - Analyzer entry point.
 *
 * Runtime contract remains stable while the pipeline implementation lives in
 * core/pipeline/analyzer_pipeline.js.
 */
'use strict';

var fs = require('fs');
var analyzerDefaults = require('./defaults/analyzer_defaults');
var analyzerPipeline = require('./core/pipeline/analyzer_pipeline');
var analyzerCli = require('./interfaces/cli/analyzer_cli');

var ANALYSIS_DEFAULTS = analyzerDefaults.ANALYSIS_DEFAULTS;
var analyze = analyzerPipeline.analyze;

/**
 * Save analysis results to JSON file.
 */
function saveAnalysis(result, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
}

/**
 * Load previously saved analysis results.
 */
function loadAnalysis(filePath) {
    var json = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(json);
}

if (require.main === module) {
    analyzerCli.runAnalyzerCli({
        analyze: analyze,
        fs: fs,
        processObj: process,
        version: '2.2'
    });
}

module.exports = {
    analyze: analyze,
    saveAnalysis: saveAnalysis,
    loadAnalysis: loadAnalysis,
    ANALYSIS_DEFAULTS: ANALYSIS_DEFAULTS
};
