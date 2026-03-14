'use strict';

function runAnalyzerCli(options) {
    options = options || {};

    var analyze = options.analyze;
    var fs = options.fs;
    var processObj = options.processObj || process;
    var version = options.version || '2.2';

    if (typeof analyze !== 'function') {
        throw new Error('runAnalyzerCli requires options.analyze function.');
    }
    if (!fs || typeof fs.readFileSync !== 'function' || typeof fs.writeFileSync !== 'function') {
        throw new Error('runAnalyzerCli requires options.fs with readFileSync/writeFileSync.');
    }

    var args = processObj.argv.slice(2);

    if (args.length === 0 || args.indexOf('--help') !== -1) {
        console.log('AutoCast Analyzer v' + version + ' CLI');
        console.log('Usage: node analyzer.js --tracks file1.wav file2.wav [--output result.json] [--params params.json]');
        console.log('');
        console.log('Options:');
        console.log('  --tracks    WAV files to analyze (one per speaker)');
        console.log('  --output    Output JSON file (default: stdout)');
        console.log('  --params    JSON file with parameter overrides');
        console.log('  --no-fft    Disable spectral VAD (faster, less accurate)');
        console.log('  --no-gain   Disable auto-gain matching');
        console.log('  --debug     Include diagnostic payload in output');
        console.log('  --help      Show this help');
        processObj.exit(0);
        return;
    }

    var tracks = [];
    var outputPath = null;
    var paramsPath = null;
    var mode = null;
    var cliOverrides = {};

    for (var i = 0; i < args.length; i++) {
        if (args[i] === '--tracks') {
            mode = 'tracks';
        } else if (args[i] === '--output') {
            mode = 'output';
        } else if (args[i] === '--params') {
            mode = 'params';
        } else if (args[i] === '--no-fft') {
            cliOverrides.useSpectralVAD = false;
            mode = null;
        } else if (args[i] === '--no-gain') {
            cliOverrides.autoGain = false;
            mode = null;
        } else if (args[i] === '--debug') {
            cliOverrides.debugMode = true;
            mode = null;
        } else if (mode === 'tracks') {
            tracks.push(args[i]);
        } else if (mode === 'output') {
            outputPath = args[i];
            mode = null;
        } else if (mode === 'params') {
            paramsPath = args[i];
            mode = null;
        }
    }

    if (tracks.length === 0) {
        console.error('Error: No track files specified. Use --tracks file1.wav file2.wav');
        processObj.exit(1);
        return;
    }

    var cliParams = {};
    if (paramsPath) {
        try {
            cliParams = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
        } catch (e) {
            console.error('Error reading params file:', e.message);
            processObj.exit(1);
            return;
        }
    }

    for (var key in cliOverrides) {
        cliParams[key] = cliOverrides[key];
    }

    console.error('AutoCast Analyzer v' + version + ' - analyzing ' + tracks.length + ' track(s)...');

    try {
        var result = analyze(tracks, cliParams, function (pct, msg) {
            processObj.stderr.write('\r[' + pct + '%] ' + msg + '                    ');
        });

        processObj.stderr.write('\n');

        var jsonOutput = JSON.stringify(result, null, 2);

        if (outputPath) {
            fs.writeFileSync(outputPath, jsonOutput, 'utf8');
            console.error('Result written to: ' + outputPath);
        } else {
            console.log(jsonOutput);
        }

        console.error('\n=== Summary ===');
        for (var t = 0; t < result.tracks.length; t++) {
            var ti = result.tracks[t];
            var gainStr = ti.gainAdjustDb ? ' (gain: ' + (ti.gainAdjustDb > 0 ? '+' : '') + ti.gainAdjustDb + 'dB)' : '';
            console.error(
                'Track ' + (t + 1) + ' (' + ti.name + '): ' +
                ti.segmentCount + ' segments, ' +
                ti.activePercent + '% active, ' +
                'floor: ' + ti.noiseFloorDb + ' dBFS' + gainStr
            );
        }
        if (result.alignment.warning) {
            console.error('Warning: ' + result.alignment.warning);
        }
    } catch (e2) {
        console.error('Analysis failed:', e2.message);
        if (e2.stack) console.error(e2.stack);
        processObj.exit(1);
    }
}

module.exports = {
    runAnalyzerCli: runAnalyzerCli
};
