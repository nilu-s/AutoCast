#!/usr/bin/env node
'use strict';

/**
 * AutoResearch Agent Runner
 * 
 * Dieser Runner wird vom Orchestrator aufgerufen, um einzelne Methoden-Jobs
 * auszuführen. Er erstellt eine Markierungsdatei und kann optional einen
 * OpenClaw Sub-Agent triggern.
 */

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var ROOT = path.resolve(__dirname, '..', '..');

function main() {
    var args = parseArgs(process.argv.slice(2));
    
    if (!args['prompt-file']) {
        console.error('[agent_runner] ERROR: --prompt-file required');
        process.exit(1);
    }
    
    var promptFile = args['prompt-file'];
    var taskAgent = args['task-agent'] || 'unknown';
    var methodId = args['method-id'] || 'unknown';
    var methodTitle = args['method-title'] || 'unknown';
    
    // Lese das Prompt
    var promptText;
    try {
        promptText = fs.readFileSync(promptFile, 'utf8');
    } catch (e) {
        console.error('[agent_runner] ERROR: Cannot read prompt file:', e.message);
        process.exit(1);
    }
    
    // Erstelle Job-Markierung
    var jobId = methodId + '_' + Date.now();
    var runId = extractRunId(promptFile);
    var jobMarker = {
        jobId: jobId,
        runId: runId,
        taskAgent: taskAgent,
        methodId: methodId,
        methodTitle: methodTitle,
        promptFile: promptFile,
        status: 'pending',
        createdAt: new Date().toISOString(),
        workdir: ROOT
    };
    
    var markerPath = path.join(ROOT, 'reports', 'autoresearch', 'pending_jobs', jobId + '.json');
    ensureDir(path.dirname(markerPath));
    fs.writeFileSync(markerPath, JSON.stringify(jobMarker, null, 2), 'utf8');
    
    console.log('[agent_runner] Job created:', jobId);
    console.log('[agent_runner] Run ID:', runId);
    console.log('[agent_runner] Task:', taskAgent);
    console.log('[agent_runner] Method:', methodTitle);
    console.log('[agent_runner] Marker:', markerPath);
    
    // Erstelle ausführbaren Task-Text für Sub-Agent
    var taskMessage = buildAgentTask(promptText, taskAgent, methodId, methodTitle, ROOT, promptFile, jobId, markerPath);
    
    // Speichere Task in separater Datei für einfaches Kopieren
    var taskPath = path.join(ROOT, 'reports', 'autoresearch', 'pending_jobs', jobId + '_task.txt');
    fs.writeFileSync(taskPath, taskMessage, 'utf8');
    
    console.log('[agent_runner] Task file:', taskPath);
    console.log('[agent_runner]');
    console.log('[agent_runner] === INSTRUCTIONS FOR OPENCLAW ===');
    console.log('[agent_runner] To execute, send this to OpenClaw:');
    console.log('[agent_runner]');
    console.log('--- START TASK ---');
    console.log(taskMessage);
    console.log('--- END TASK ---');
    
    process.exit(0);
}

function buildAgentTask(promptText, taskAgent, methodId, methodTitle, workdir, promptFile, jobId, markerPath) {
    return `AUTORESEARCH AGENT TASK
========================

Job ID: ${jobId}
Task Agent: ${taskAgent}
Method: ${methodTitle} (${methodId})
Working Directory: ${workdir}
Prompt File: ${promptFile}
Marker File: ${markerPath}

=== CONTEXT ===
Du bist der ${taskAgent} Agent für AutoCast Autoresearch.
Deine Aufgabe ist es, eine spezifische Methode auf dem Code anzuwenden,
das Ergebnis zu evaluieren und zu entscheiden: KEEP oder REJECT.

=== PROMPT ===
${promptText}

=== AUTORESEARCH WORKFLOW ===

1. LIES die Methode und verstehe das Ziel
2. IMPLEMENTIERE die Änderung im Code
3. FÜHRE aus: npm run check
4. FÜHRE aus: node scripts/evaluate_pipeline.js
5. VERGLEICHE den neuen objectiveScore mit dem alten
6. ENTSCHEIDE:
   - Wenn neuer Score > alter Score: KEEP (commit)
   - Wenn neuer Score <= alter Score: REJECT (revert)

7. SCHREIBE Report nach: ${workdir}/reports/autoresearch/runs/{runId}/method_results/${methodId}_result.json

8. UPDATE Marker: ${markerPath}
   - Status: "completed" oder "failed"
   - Ergebnis: score_before, score_after, decision, changed_files

=== REGELN ===
- Arbeite im Verzeichnis: ${workdir}
- Vor Änderungen: git stash oder backup
- Nach Änderungen: IMMER npm run check && evaluate_pipeline.js
- Keine Änderungen behalten, die den Score nicht verbessern
- Dokumentiere alle Entscheidungen ausführlich

=== START ===
Beginne jetzt mit der Ausführung.`;
}

function extractRunId(promptFile) {
    // Extrahiere Run ID aus Pfad wie .../runs/20260324_190815/...
    var match = promptFile.match(/runs\/([^\/]+)/);
    return match ? match[1] : 'unknown';
}

function parseArgs(argv) {
    var args = {};
    for (var i = 0; i < argv.length; i++) {
        var arg = argv[i];
        if (arg.startsWith('--')) {
            var key = arg.slice(2);
            var value = argv[i + 1];
            if (value && !value.startsWith('--')) {
                args[key] = value;
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return args;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

main();
