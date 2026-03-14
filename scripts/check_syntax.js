'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var TARGET_DIRS = [
    path.join(ROOT, 'apps', 'panel', 'js'),
    path.join(ROOT, 'apps', 'panel', 'src'),
    path.join(ROOT, 'apps', 'panel', 'jsx'),
    path.join(ROOT, 'packages', 'analyzer', 'src'),
    path.join(ROOT, 'packages', 'analyzer', 'test'),
    path.join(ROOT, 'scripts')
];
var SUPPORTED_EXTENSIONS = {
    '.js': true,
    '.jsx': true
};

function walk(dir, out) {
    if (!fs.existsSync(dir)) return;
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, out);
            continue;
        }
        var ext = path.extname(fullPath).toLowerCase();
        if (entry.isFile() && SUPPORTED_EXTENSIONS[ext]) {
            out.push(fullPath);
        }
    }
}

function checkFileSyntax(filePath) {
    var ext = path.extname(filePath).toLowerCase();
    var res;

    if (ext === '.jsx') {
        var source = fs.readFileSync(filePath, 'utf8');
        res = childProcess.spawnSync(process.execPath, ['--check'], {
            encoding: 'utf8',
            input: source
        });
    } else {
        res = childProcess.spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
    }

    return {
        ok: res.status === 0,
        filePath: filePath,
        stderr: res.stderr || ''
    };
}

var files = [];
for (var i = 0; i < TARGET_DIRS.length; i++) {
    walk(TARGET_DIRS[i], files);
}
files.sort();

var failed = [];
for (i = 0; i < files.length; i++) {
    var result = checkFileSyntax(files[i]);
    if (!result.ok) failed.push(result);
}

if (failed.length > 0) {
    console.error('Syntax check failed in ' + failed.length + ' file(s):');
    for (i = 0; i < failed.length; i++) {
        console.error('- ' + path.relative(ROOT, failed[i].filePath));
        if (failed[i].stderr) console.error(failed[i].stderr.trim());
    }
    process.exit(1);
}

console.log('Syntax check passed for ' + files.length + ' file(s).');
