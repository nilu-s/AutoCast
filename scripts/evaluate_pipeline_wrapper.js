'use strict';

/**
 * Wrapper around evaluate_pipeline.js that uses test data for evaluation
 * while preserving the original segments.json
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SEGMENTS_ORIGINAL = path.join(ROOT, 'docs', 'segments.json');
const SEGMENTS_EVAL = path.join(ROOT, 'docs', 'segments_eval.json');
const EVAL_SCRIPT = path.join(ROOT, 'scripts', 'evaluate_pipeline.js');

function main() {
    // Check if eval segments exist
    if (!fs.existsSync(SEGMENTS_EVAL)) {
        console.error('[wrapper] segments_eval.json not found at', SEGMENTS_EVAL);
        console.error('[wrapper] Please create it with test data references');
        process.exit(1);
    }

    // Check if original segments exists
    const hasOriginal = fs.existsSync(SEGMENTS_ORIGINAL);
    let originalBackup = null;

    // Backup original if it exists
    if (hasOriginal) {
        originalBackup = fs.readFileSync(SEGMENTS_ORIGINAL, 'utf8');
    }

    // Swap in eval segments
    const evalData = fs.readFileSync(SEGMENTS_EVAL, 'utf8');
    fs.writeFileSync(SEGMENTS_ORIGINAL, evalData, 'utf8');

    console.log('[wrapper] Using segments_eval.json for evaluation...');

    try {
        // Run the actual evaluation
        const result = childProcess.spawnSync('node', [EVAL_SCRIPT], {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Print output
        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);

        // Restore original segments
        if (originalBackup !== null) {
            fs.writeFileSync(SEGMENTS_ORIGINAL, originalBackup, 'utf8');
        } else {
            fs.unlinkSync(SEGMENTS_ORIGINAL);
        }

        process.exit(result.status || 0);
    } catch (err) {
        // Restore on error
        if (originalBackup !== null) {
            fs.writeFileSync(SEGMENTS_ORIGINAL, originalBackup, 'utf8');
        }
        throw err;
    }
}

main();
