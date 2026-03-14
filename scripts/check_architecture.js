'use strict';

var fs = require('fs');
var path = require('path');

var DEFAULT_ROOT = path.resolve(__dirname, '..');
var PANEL_DIRS = [
    path.join('apps', 'panel', 'js'),
    path.join('apps', 'panel', 'src'),
    path.join('apps', 'panel', 'jsx')
];
var SUPPORTED_EXTENSIONS = {
    '.js': true,
    '.jsx': true
};

function normalizeImportPath(importPath) {
    return String(importPath || '').replace(/\\/g, '/').toLowerCase();
}

function isForbiddenImport(importPath) {
    return normalizeImportPath(importPath).indexOf('packages/analyzer/src/') !== -1;
}

function walk(dir, outFiles) {
    if (!fs.existsSync(dir)) return;
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.git' || entry.name === 'node_modules') continue;
            walk(fullPath, outFiles);
            continue;
        }
        if (!entry.isFile()) continue;
        var ext = path.extname(fullPath).toLowerCase();
        if (SUPPORTED_EXTENSIONS[ext]) {
            outFiles.push(fullPath);
        }
    }
}

function toLineNumber(source, index) {
    var prefix = source.slice(0, index);
    var parts = prefix.split(/\r?\n/);
    return parts.length;
}

function findForbiddenImportsInSource(source) {
    var findings = [];
    var patterns = [
        /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
        /import\s+[^'"\n]+?\s+from\s+['"`]([^'"`]+)['"`]/g,
        /import\s*['"`]([^'"`]+)['"`]/g
    ];

    for (var p = 0; p < patterns.length; p++) {
        var pattern = patterns[p];
        var match;
        while ((match = pattern.exec(source)) !== null) {
            var importPath = match[1];
            if (!isForbiddenImport(importPath)) continue;
            findings.push({
                line: toLineNumber(source, match.index),
                importPath: importPath,
                statement: match[0]
            });
        }
    }

    return findings;
}

function getPanelSourceFiles(rootDir) {
    var files = [];
    for (var i = 0; i < PANEL_DIRS.length; i++) {
        walk(path.join(rootDir, PANEL_DIRS[i]), files);
    }
    files.sort();
    return files;
}

function findArchitectureViolations(options) {
    options = options || {};
    var rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
    var files = getPanelSourceFiles(rootDir);
    var violations = [];

    for (var i = 0; i < files.length; i++) {
        var absPath = files[i];
        var source = fs.readFileSync(absPath, 'utf8');
        var findings = findForbiddenImportsInSource(source);
        for (var f = 0; f < findings.length; f++) {
            violations.push({
                file: path.relative(rootDir, absPath),
                line: findings[f].line,
                importPath: findings[f].importPath,
                statement: findings[f].statement
            });
        }
    }

    return {
        rootDir: rootDir,
        filesChecked: files.length,
        violations: violations
    };
}

function parseRootArg(argv) {
    var args = Array.isArray(argv) ? argv : [];
    for (var i = 0; i < args.length; i++) {
        if (args[i] !== '--root') continue;
        if (i + 1 < args.length) return args[i + 1];
        throw new Error('Missing value for --root');
    }
    return null;
}

function runCli(argv) {
    var rootArg = parseRootArg(argv || process.argv.slice(2));
    var result = findArchitectureViolations({
        rootDir: rootArg || DEFAULT_ROOT
    });

    if (result.violations.length > 0) {
        console.error('Architecture check failed. Forbidden panel -> analyzer internal dependencies found:');
        for (var i = 0; i < result.violations.length; i++) {
            var violation = result.violations[i];
            console.error(
                '- ' + violation.file + ':' + violation.line +
                ' imports "' + violation.importPath + '"'
            );
        }
        return 1;
    }

    console.log(
        'Architecture check passed for ' + result.filesChecked + ' panel file(s).'
    );
    return 0;
}

if (require.main === module) {
    try {
        var code = runCli(process.argv.slice(2));
        process.exit(code);
    } catch (e) {
        console.error('Architecture check failed:', e.message);
        process.exit(1);
    }
}

module.exports = {
    isForbiddenImport: isForbiddenImport,
    findForbiddenImportsInSource: findForbiddenImportsInSource,
    findArchitectureViolations: findArchitectureViolations,
    runCli: runCli
};
