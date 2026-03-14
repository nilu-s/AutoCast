'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');
var architectureCheck = require(path.join(ROOT, 'scripts', 'check_architecture.js'));

function writeFile(absPath, content) {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
}

function makeTempProject() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'autocast-arch-'));
}

function cleanupTempProject(tempDir) {
    if (!tempDir) return;
    fs.rmSync(tempDir, { recursive: true, force: true });
}

describe('Architecture Rules', function () {
    it('should reject panel imports from packages/analyzer/src internals', function () {
        var tempDir = makeTempProject();
        try {
            writeFile(
                path.join(tempDir, 'apps', 'panel', 'src', 'app', 'panel_params_feature.js'),
                "var defaultsModule = require('../../packages/analyzer/src/defaults/analyzer_defaults.js');\n"
            );

            var result = architectureCheck.findArchitectureViolations({ rootDir: tempDir });
            assert(result.violations.length === 1, 'Expected one architecture violation');
            assert(
                result.violations[0].importPath.indexOf('packages/analyzer/src/defaults/analyzer_defaults.js') !== -1,
                'Expected violation to mention analyzer internals import'
            );
        } finally {
            cleanupTempProject(tempDir);
        }
    });

    it('should allow panel imports that do not target analyzer internals', function () {
        var tempDir = makeTempProject();
        try {
            writeFile(
                path.join(tempDir, 'apps', 'panel', 'src', 'app', 'panel_params_feature.js'),
                "var sdk = require('../../packages/analyzer/api/index.js');\n"
            );

            var result = architectureCheck.findArchitectureViolations({ rootDir: tempDir });
            assert(result.violations.length === 0, 'Expected no architecture violations');
        } finally {
            cleanupTempProject(tempDir);
        }
    });

    it('should pass for the current repository panel sources', function () {
        var result = architectureCheck.findArchitectureViolations({ rootDir: ROOT });
        assert(result.violations.length === 0, 'Expected no panel -> analyzer internal imports in repository');
    });
});
