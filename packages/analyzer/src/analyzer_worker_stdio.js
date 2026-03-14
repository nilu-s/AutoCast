'use strict';

var analyzer = require('./analyzer.js');
var stdioJsonWorker = require('./interfaces/worker/stdio_json_worker');
var analyzerContracts = require('./core/contracts/analyzer_contracts');

stdioJsonWorker.runJsonWorker(function (msg, progress) {
    var request = analyzerContracts.validateAnalyzeRequest(msg);
    var result = analyzer.analyze(request.trackPaths, request.params, progress);
    analyzerContracts.assertAnalyzeResult(result);
    return analyzerContracts.withContract(result, 'analyze_result');
});
