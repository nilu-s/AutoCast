'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

var REQUIRED_DIRS = [
    'apps/panel/src',
    'apps/panel/src/app',
    'apps/panel/src/core',
    'apps/panel/src/shared',
    'apps/panel/src/adapters/host',
    'apps/panel/src/adapters/analyzer',
    'apps/panel/src/adapters/storage',
    'apps/panel/src/features/tracks/components',
    'apps/panel/src/features/tracks/state',
    'apps/panel/src/features/tracks/services',
    'apps/panel/src/features/tracks/tests',
    'apps/panel/src/features/analysis/components',
    'apps/panel/src/features/analysis/state',
    'apps/panel/src/features/analysis/services',
    'apps/panel/src/features/analysis/tests',
    'apps/panel/src/features/cut-preview/components',
    'apps/panel/src/features/cut-preview/state',
    'apps/panel/src/features/cut-preview/services',
    'apps/panel/src/features/cut-preview/tests',
    'apps/panel/src/features/apply-edits/services',
    'apps/panel/src/features/apply-edits/tests',
    'apps/panel/src/features/audio-preview/services',
    'apps/panel/src/features/audio-preview/state',
    'apps/panel/src/features/audio-preview/tests',
    'apps/panel/src/features/settings/components',
    'apps/panel/src/features/settings/state',
    'apps/panel/src/features/settings/tests',
    'packages/analyzer/src/core/pipeline',
    'packages/analyzer/src/core/contracts',
    'packages/analyzer/src/core/utils',
    'packages/analyzer/src/core/contracts/tests',
    'packages/analyzer/src/core/pipeline/tests',
    'packages/analyzer/src/modules/io',
    'packages/analyzer/src/modules/io/tests',
    'packages/analyzer/src/modules/energy',
    'packages/analyzer/src/modules/energy/tests',
    'packages/analyzer/src/modules/vad',
    'packages/analyzer/src/modules/vad/tests',
    'packages/analyzer/src/modules/segmentation',
    'packages/analyzer/src/modules/segmentation/tests',
    'packages/analyzer/src/modules/overlap',
    'packages/analyzer/src/modules/overlap/tests',
    'packages/analyzer/src/modules/preview',
    'packages/analyzer/src/modules/preview/tests',
    'packages/analyzer/src/modules/postprocess',
    'packages/analyzer/src/modules/postprocess/tests',
    'packages/analyzer/src/interfaces/cli',
    'packages/analyzer/src/interfaces/worker',
    'packages/analyzer/src/tests/e2e',
    'packages/analyzer/src/tests/integration',
    'packages/analyzer/src/tests/helpers',
    'packages/analyzer/src/defaults',
    'packages/analyzer/src/extensions',
    'packages/analyzer/test/unit',
    'packages/analyzer/test/integration',
    'packages/analyzer/test/e2e',
    'scripts/tests'
];

var missing = [];
for (var i = 0; i < REQUIRED_DIRS.length; i++) {
    var rel = REQUIRED_DIRS[i];
    var abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
        missing.push(rel);
    }
}

function hasRedundantGitkeep(dirPath) {
    var gitkeepPath = path.join(dirPath, '.gitkeep');
    if (!fs.existsSync(gitkeepPath)) return false;

    var entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.name === '.gitkeep') continue;
        if (entry.isFile()) return true;
    }
    return false;
}

function walkDirs(baseDir, out) {
    var entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.isDirectory()) continue;
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        var abs = path.join(baseDir, entry.name);
        out.push(abs);
        walkDirs(abs, out);
    }
}

if (missing.length > 0) {
    console.error('Structure check failed. Missing directory(ies):');
    for (i = 0; i < missing.length; i++) {
        console.error('- ' + missing[i]);
    }
    process.exit(1);
}

var dirs = [ROOT];
walkDirs(ROOT, dirs);

var redundantGitkeeps = [];
for (i = 0; i < dirs.length; i++) {
    if (hasRedundantGitkeep(dirs[i])) {
        redundantGitkeeps.push(path.relative(ROOT, path.join(dirs[i], '.gitkeep')));
    }
}

if (redundantGitkeeps.length > 0) {
    console.error('Structure check failed. Redundant .gitkeep file(s) found in non-empty directories:');
    for (i = 0; i < redundantGitkeeps.length; i++) {
        console.error('- ' + redundantGitkeeps[i]);
    }
    process.exit(1);
}

console.log(
    'Structure check passed for ' +
    REQUIRED_DIRS.length +
    ' required directories. No redundant .gitkeep files found.'
);
