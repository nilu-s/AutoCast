'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SOFT_LINE_LIMIT = 150;
var HARD_LINE_LIMIT = 220;
var SUITES = ['unit', 'integration', 'e2e'];

var HARD_LIMIT_EXEMPTIONS = {};

function toPosix(relPath) {
    return String(relPath || '').replace(/\\/g, '/');
}

function walkFiles(baseDir, out) {
    if (!fs.existsSync(baseDir)) return;
    var entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var abs = path.join(baseDir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.git' || entry.name === 'node_modules') continue;
            walkFiles(abs, out);
            continue;
        }
        if (entry.isFile()) out.push(abs);
    }
}

function countLines(absPath) {
    var source = fs.readFileSync(absPath, 'utf8');
    if (!source) return 0;
    return source.split(/\r?\n/).length;
}

function isPanelTestFile(relPath) {
    return /^apps\/panel\/src\/.+\/tests\/[^/]+\.test\.js$/.test(relPath);
}

function isPanelMisplacedTest(relPath) {
    if (!/^apps\/panel\/src\/.+\.test\.js$/.test(relPath)) return false;
    return !isPanelTestFile(relPath);
}

function isAnalyzerColocatedTestFile(relPath) {
    return /^packages\/analyzer\/src\/.+\/tests\/.+\.test\.js$/.test(relPath);
}

function isAnalyzerDeprecatedTestFile(relPath) {
    if (!/^packages\/analyzer\/test\/.+\.js$/.test(relPath)) return false;
    var base = path.basename(relPath);
    if (base === 'test_runner.js' || base === 'run_all_tests.js' || base === 'run_single_test.js') return false;
    if (base === 'generate_test_wav.js' || base === 'suite_manifest.js') return false;
    return /^test_.+\.js$/.test(base);
}

function loadManifestEntries() {
    var manifestEntries = [];
    var missingEntries = [];
    var duplicateEntries = [];
    var seen = {};
    var manifestBaseDir = path.join(ROOT, 'packages', 'analyzer', 'test');

    for (var s = 0; s < SUITES.length; s++) {
        var suiteName = SUITES[s];
        var manifestAbs = path.join(ROOT, 'packages', 'analyzer', 'test', suiteName, 'suite_manifest.js');
        var manifest;
        try {
            manifest = require(manifestAbs);
        } catch (e) {
            throw new Error('Could not load suite manifest "' + suiteName + '": ' + e.message);
        }

        if (!Array.isArray(manifest)) {
            throw new Error('Invalid suite manifest "' + suiteName + '": expected array.');
        }

        for (var i = 0; i < manifest.length; i++) {
            var rel = manifest[i];
            var abs = path.resolve(manifestBaseDir, rel);
            var key = toPosix(path.relative(ROOT, abs));
            if (seen[key]) {
                duplicateEntries.push({
                    file: key,
                    suites: [seen[key], suiteName]
                });
            } else {
                seen[key] = suiteName;
            }
            if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
                missingEntries.push({
                    suite: suiteName,
                    entry: rel
                });
                continue;
            }
            manifestEntries.push(key);
        }
    }

    return {
        manifestEntries: manifestEntries,
        missingEntries: missingEntries,
        duplicateEntries: duplicateEntries
    };
}

function run() {
    var allFiles = [];
    walkFiles(path.join(ROOT, 'apps', 'panel', 'src'), allFiles);
    walkFiles(path.join(ROOT, 'packages', 'analyzer', 'src'), allFiles);
    walkFiles(path.join(ROOT, 'packages', 'analyzer', 'test'), allFiles);

    var panelTests = [];
    var analyzerTests = [];
    var deprecatedAnalyzerTests = [];
    var misplacedPanelTests = [];

    for (var i = 0; i < allFiles.length; i++) {
        var rel = toPosix(path.relative(ROOT, allFiles[i]));
        if (isPanelMisplacedTest(rel)) {
            misplacedPanelTests.push(rel);
        }
        if (isPanelTestFile(rel)) {
            panelTests.push(rel);
            continue;
        }
        if (isAnalyzerColocatedTestFile(rel)) {
            analyzerTests.push(rel);
            continue;
        }
        if (isAnalyzerDeprecatedTestFile(rel)) {
            deprecatedAnalyzerTests.push(rel);
        }
    }

    var manifestData = loadManifestEntries();
    var manifestSet = {};
    for (i = 0; i < manifestData.manifestEntries.length; i++) {
        manifestSet[manifestData.manifestEntries[i]] = true;
    }

    var governanceTargets = panelTests.concat(analyzerTests).sort();
    var unregisteredTests = [];
    var hardLineViolations = [];
    var softLineWarnings = [];
    var exemptHardWarnings = [];

    for (i = 0; i < governanceTargets.length; i++) {
        var relPath = governanceTargets[i];
        if (!manifestSet[relPath]) {
            unregisteredTests.push(relPath);
        }

        var lines = countLines(path.join(ROOT, relPath));
        if (lines > HARD_LINE_LIMIT) {
            if (HARD_LIMIT_EXEMPTIONS[relPath]) {
                exemptHardWarnings.push({ file: relPath, lines: lines });
            } else {
                hardLineViolations.push({ file: relPath, lines: lines });
            }
            continue;
        }
        if (lines > SOFT_LINE_LIMIT) {
            softLineWarnings.push({ file: relPath, lines: lines });
        }
    }

    var failed = false;

    if (misplacedPanelTests.length > 0) {
        failed = true;
        console.error('LLM requirements check failed: Panel tests must live in apps/panel/src/**/tests/*.test.js');
        for (i = 0; i < misplacedPanelTests.length; i++) {
            console.error('- ' + misplacedPanelTests[i]);
        }
    }

    if (deprecatedAnalyzerTests.length > 0) {
        failed = true;
        console.error('LLM requirements check failed: Analyzer tests must be colocated in packages/analyzer/src/**/tests/*.test.js');
        for (i = 0; i < deprecatedAnalyzerTests.length; i++) {
            console.error('- ' + deprecatedAnalyzerTests[i]);
        }
    }

    if (manifestData.missingEntries.length > 0) {
        failed = true;
        console.error('LLM requirements check failed: Suite manifests contain missing file entries:');
        for (i = 0; i < manifestData.missingEntries.length; i++) {
            console.error(
                '- [' + manifestData.missingEntries[i].suite + '] ' + manifestData.missingEntries[i].entry
            );
        }
    }

    if (manifestData.duplicateEntries.length > 0) {
        failed = true;
        console.error('LLM requirements check failed: Duplicate test files in suite manifests:');
        for (i = 0; i < manifestData.duplicateEntries.length; i++) {
            console.error(
                '- ' +
                manifestData.duplicateEntries[i].file +
                ' (' +
                manifestData.duplicateEntries[i].suites.join(' + ') +
                ')'
            );
        }
    }

    if (unregisteredTests.length > 0) {
        failed = true;
        console.error('LLM requirements check failed: Test files not registered in any suite_manifest.js:');
        for (i = 0; i < unregisteredTests.length; i++) {
            console.error('- ' + unregisteredTests[i]);
        }
    }

    if (hardLineViolations.length > 0) {
        failed = true;
        console.error('LLM requirements check failed: Hard test size limit exceeded (> ' + HARD_LINE_LIMIT + ' lines):');
        for (i = 0; i < hardLineViolations.length; i++) {
            console.error('- ' + hardLineViolations[i].file + ' (' + hardLineViolations[i].lines + ' lines)');
        }
    }

    if (softLineWarnings.length > 0) {
        console.warn('LLM requirements warning: Soft test size limit exceeded (> ' + SOFT_LINE_LIMIT + ' lines):');
        for (i = 0; i < softLineWarnings.length; i++) {
            console.warn('- ' + softLineWarnings[i].file + ' (' + softLineWarnings[i].lines + ' lines)');
        }
    }

    if (exemptHardWarnings.length > 0) {
        console.warn('LLM requirements warning: Hard-limit exemptions still present:');
        for (i = 0; i < exemptHardWarnings.length; i++) {
            console.warn('- ' + exemptHardWarnings[i].file + ' (' + exemptHardWarnings[i].lines + ' lines)');
        }
    }

    if (failed) {
        process.exit(1);
    }

    console.log(
        'LLM requirements check passed for ' +
        governanceTargets.length +
        ' test file(s).'
    );
}

try {
    run();
} catch (e) {
    console.error('LLM requirements check failed:', e.message);
    process.exit(1);
}
