#!/usr/bin/env node
/**
 * execute_method.js - Phase 2.2: Method Executor Runner
 * Führt eine einzelne Methode als Sub-Agent Task aus
 *
 * CLI-Usage:
 *   node execute_method.js --methodId <id> --runId <id> [--jobIndex <n>]
 *   node execute_method.js --dispatch <path/to/openclaw_dispatch_request.json>
 *
 * @version 2.2.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Abhängigkeiten aus Phase 1
import resultNaming from './lib/result_naming.mjs';
import statusManager from './lib/status_manager.mjs';

// Standard-Pfade
const DEFAULT_TEMPLATE_PATH = resolve(__dirname, '../../docs/llm/autoresearch/runtime/method_executor_prompt_template.md');

/**
 * Parsed Kommandozeilen-Argumente
 * @param {string[]} args - process.argv.slice(2)
 * @returns {object} Geparste Argumente
 */
export function parseArgs(args) {
    const result = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--dry-run') {
            result.dryRun = true;
        } else if (arg.startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
            const key = arg.replace(/^--/, '');
            result[key] = args[i + 1];
            i++;
        } else if (arg.startsWith('--')) {
            const key = arg.replace(/^--/, '');
            result[key] = true;
        }
    }

    return result;
}

/**
 * Zeigt die Hilfe an
 */
export function showHelp() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           AutoCast Method Executor Runner                        ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Verwendung:                                                     ║
║    node execute_method.js [Optionen]                             ║
║                                                                  ║
║  Optionen:                                                       ║
║    --methodId <id>      Methoden-ID (z.B. silence_overlap_...)   ║
║    --runId <id>         Run-ID (z.B. 20260325_002306)            ║
║    --jobIndex <n>       Optional: Job-Index für Batch-Runs       ║
║    --methodTitle <t>    Optional: Methoden-Titel                   ║
║    --promptFile <path>  Optional: Pfad zur Prompt-Datei           ║
║    --runDir <path>      Optional: Arbeitsverzeichnis             ║
║    --dispatch <path>    Pfad zu openclaw_dispatch_request.json  ║
║    --dry-run            Nur Task-File erstellen, nicht ausführen ║
║    --help, -h           Hilfe anzeigen                           ║
║                                                                  ║
║  Beispiel:                                                       ║
║    node execute_method.js \                                       ║
║      --methodId silence_overlap_bleed_weight \                  ║
║      --runId 20260325_002306                                     ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Lädt einen Dispatch-Request aus JSON-Datei
 * @param {string} dispatchPath - Pfad zur Dispatch-JSON
 * @returns {object|null} Dispatch-Objekt oder null bei Fehler
 */
export function loadDispatchRequest(dispatchPath) {
    try {
        const content = readFileSync(dispatchPath, 'utf-8');
        const dispatch = JSON.parse(content);

        // Validiere erforderliche Felder
        if (!dispatch.methodId && !dispatch.jobs) {
            console.error('❌ Invalid dispatch file: missing methodId or jobs');
            return null;
        }

        return dispatch;
    } catch (err) {
        console.error(`❌ Fehler beim Laden von Dispatch-Request: ${err.message}`);
        return null;
    }
}

/**
 * Lädt das Prompt-Template
 * @param {string} [templatePath] - Optionaler Pfad zum Template
 * @returns {string|null} Template-Content oder null bei Fehler
 */
export function loadPromptTemplate(templatePath) {
    const targetPath = templatePath || DEFAULT_TEMPLATE_PATH;

    try {
        if (!existsSync(targetPath)) {
            console.error(`❌ Prompt-Template nicht gefunden: ${targetPath}`);
            return null;
        }
        return readFileSync(targetPath, 'utf-8');
    } catch (err) {
        console.error(`❌ Fehler beim Laden des Templates: ${err.message}`);
        return null;
    }
}

/**
 * Füllt Platzhalter im Template
 * @param {string} template - Das Template mit {{placeholder}}
 * @param {object} params - Die Parameter zum Einfügen
 * @returns {string} Gefülltes Template
 */
export function fillTemplate(template, params) {
    if (!template || typeof template !== 'string') {
        throw new Error('Template must be a non-empty string');
    }

    let result = template;

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
            continue;
        }
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        const stringValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        result = result.replace(regex, stringValue);
    }

    // Warnung für unersetzte Platzhalter
    const unmatched = result.match(/\{\{\s*[^\}]+\s*\}\}/g);
    if (unmatched) {
        console.warn('⚠️  Unersetzte Platzhalter gefunden:', [...new Set(unmatched)]);
    }

    return result;
}

/**
 * Generiert die Pfade für einen Run
 * @param {string} runId - Die Run-ID
 * @param {string} methodId - Die Method-ID
 * @param {number} jobIndex - Der Job-Index
 * @returns {object} Pfade und generierte Namen
 */
export function generateRunPaths(runId, methodId, jobIndex = 1) {
    const baseDir = resolve(__dirname, '../../reports/autoresearch/runs');
    const runDir = join(baseDir, runId);
    const resultsDir = join(runDir, 'method_results');  // FIXED: Einheitlich 'method_results'

    // Generiere Job-Key mit result_naming
    const taskAgent = 'method-executor';
    const jobKey = resultNaming.generateJobKey(taskAgent, methodId, jobIndex);

    // Generiere Result-Pfad
    const resultPath = resultNaming.generateResultPath(resultsDir, jobKey);
    const statusPath = join(runDir, 'STATUS.json');

    return {
        runDir,
        resultsDir,
        statusPath,
        resultPath,
        jobKey,
        taskAgent
    };
}

/**
 * Generiert den Inhalt der Task-Datei
 * @param {string} prompt - Der gefüllte Prompt
 * @param {object} params - Die Parameter
 * @returns {string} Task-Inhalt
 */
export function generateTaskContent(prompt, params) {
    const { methodId, methodTitle, runId, resultPath, statusPath } = params;

    return `# Method Executor Task

## Parameters
- **Method ID**: ${methodId}
- **Method Title**: ${methodTitle || methodId}
- **Run ID**: ${runId}
- **Result Path**: ${resultPath}
- **Status Path**: ${statusPath}

## Instructions

${prompt}

## Output Requirements

1. Führe den STRICT WORKFLOW aus
2. Schreibe das Result-JSON nach: ${resultPath}
3. Aktualisiere STATUS.json: ${statusPath}

## Result Schema

Das Result-JSON muss exakt diesem Schema folgen:

\`\`\`json
{
  "schemaVersion": "1.0.0",
  "methodId": "${methodId}",
  "runId": "${runId}",
  "status": "completed",
  "decision": "KEEP|REJECT|FAILED",
  "timestamp": "ISO-8601",
  "metrics": {
    "before": { "objectiveScore": number, ... },
    "after": { "objectiveScore": number, ... }
  },
  "changedFiles": [...],
  "git": { "commitHash": "...", "commitMessage": "..." },
  "notes": "..."
}
\`\`\`
`;
}

/**
 * Spawnt einen Sub-Agent mit dem gefüllten Prompt
 * @param {string} prompt - Der gefüllte Prompt
 * @param {object} params - Ausführungsparameter
 * @returns {Promise<string>} Pfad zur Task-Datei
 */
export async function spawnMethodExecutor(prompt, params) {
    const { runDir, methodId } = params;

    // Erstelle Sub-Agent Task Directory
    const subAgentDir = join(runDir, 'subagent-tasks');
    if (!existsSync(subAgentDir)) {
        mkdirSync(subAgentDir, { recursive: true });
    }

    // Erstelle Task-File
    const taskFileName = `method_executor_${methodId}.task.md`;
    const taskFile = join(subAgentDir, taskFileName);

    const taskContent = generateTaskContent(prompt, params);
    writeFileSync(taskFile, taskContent, 'utf8');

    console.log(`✅ Sub-Agent Task erstellt: ${taskFile}`);

    return taskFile;
}

/**
 * Speichert den Prompt in eine Datei für manuelle Ausführung
 * @param {string} prompt - Der gefüllte Prompt
 * @param {string} runDir - Das Run-Verzeichnis
 * @param {string} methodId - Die Method-ID
 * @returns {string} Pfad zur gespeicherten Datei
 */
export function savePromptToFile(prompt, runDir, methodId) {
    const manualDir = join(runDir, 'manual-tasks');
    if (!existsSync(manualDir)) {
        mkdirSync(manualDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${methodId}_prompt_${timestamp}.md`;
    const filePath = join(manualDir, fileName);

    const content = `# Manual Execution Prompt: ${methodId}

Generated: ${new Date().toISOString()}
Method: ${methodId}
Run Directory: ${runDir}

---

${prompt}

---

## Instructions for Manual Execution

1. Copy the prompt above
2. Start a new sub-agent session
3. Paste the prompt
4. Execute the STRICT WORKFLOW
5. Write result JSON to the specified resultPath
6. Update STATUS.json at the specified statusPath
`;

    writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Manuelles Prompt gespeichert: ${filePath}`);

    return filePath;
}

/**
 * Validiert die erforderlichen Parameter
 * @param {object} params - Die zu validierenden Parameter
 * @returns {string[]|null} Array mit fehlenden Parametern oder null wenn OK
 */
export function validateParams(params) {
    const required = ['methodId', 'runId'];
    const missing = required.filter(key => !params[key]);

    return missing.length > 0 ? missing : null;
}

/**
 * Hauptfunktion
 */
async function main() {
    console.log('🚀 AutoCast Method Executor Runner\n');

    const args = process.argv.slice(2);

    // Hilfe anzeigen
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        showHelp();
        process.exit(0);
    }

    // Parse Argumente
    const parsedArgs = parseArgs(args);

    // Parameter-Objekt
    let params = {
        methodId: parsedArgs.methodId || null,
        runId: parsedArgs.runId || null,
        jobIndex: parseInt(parsedArgs.jobIndex || '1', 10),
        methodTitle: parsedArgs.methodTitle || null,
        promptFile: parsedArgs.promptFile || null,
        runDir: parsedArgs.runDir || null,
        dryRun: parsedArgs.dryRun || false
    };

    // Dispatch-Datei Modus
    if (parsedArgs.dispatch) {
        console.log(`📥 Lade Dispatch-Datei: ${parsedArgs.dispatch}`);
        const dispatch = loadDispatchRequest(parsedArgs.dispatch);

        if (!dispatch) {
            console.error('❌ Fehler beim Laden der Dispatch-Datei');
            process.exit(1);
        }

        // Job aus Dispatch holen
        const jobIndex = parseInt(parsedArgs.jobIndex || dispatch.jobIndex || '0', 10);
        const job = dispatch.jobs?.[jobIndex];

        if (!job) {
            console.error(`❌ Kein Job gefunden bei Index ${jobIndex}`);
            process.exit(1);
        }

        // Überschreibe mit Dispatch-Werten
        params.methodId = job.methodId || params.methodId;
        params.runId = dispatch.runId || params.runId;
        params.jobIndex = jobIndex;
        params.methodTitle = job.methodTitle || params.methodTitle;
        params.promptFile = job.promptFile || params.promptFile;
        params.runDir = dispatch.runDir || params.runDir;

        console.log(`✅ Job ${jobIndex} aus Dispatch-Request geladen\n`);
    }

    // Validierung
    const missing = validateParams(params);
    if (missing) {
        console.error(`❌ Fehlende Parameter: ${missing.join(', ')}\n`);
        showHelp();
        process.exit(1);
    }

    // Generiere Pfade
    const paths = generateRunPaths(params.runId, params.methodId, params.jobIndex);

    // Ergänze Pfade zu params
    params.runDir = params.runDir || paths.runDir;
    params.resultPath = paths.resultPath;
    params.statusPath = paths.statusPath;
    params.jobKey = paths.jobKey;
    params.methodTitle = params.methodTitle || params.methodId;

    // Logging
    console.log('📋 Parameter:');
    console.log(`   Method ID:    ${params.methodId}`);
    console.log(`   Method Title: ${params.methodTitle}`);
    console.log(`   Run ID:       ${params.runId}`);
    console.log(`   Job Index:    ${params.jobIndex}`);
    console.log(`   Job Key:      ${params.jobKey}`);
    console.log(`   Run Dir:      ${params.runDir}`);
    console.log(`   Result Path:  ${params.resultPath}`);
    console.log(`   Status Path:  ${params.statusPath}`);
    console.log();

    // Prompt-Template laden
    const template = loadPromptTemplate();
    if (!template) {
        console.error('❌ Fehler beim Laden des Templates');
        process.exit(1);
    }
    console.log('✅ Template geladen\n');

    // Template füllen
    let filledPrompt;
    try {
        console.log('🔧 Fülle Template mit Parametern...');
        filledPrompt = fillTemplate(template, {
            methodId: params.methodId,
            methodTitle: params.methodTitle,
            runId: params.runId,
            runDir: params.runDir,
            resultPath: params.resultPath,
            statusPath: params.statusPath,
            promptFile: params.promptFile || 'N/A',
            baselineMetrics: '{}'
        });
        console.log('✅ Template gefüllt\n');
    } catch (err) {
        console.error(`❌ Fehler beim Füllen des Templates: ${err.message}`);
        process.exit(1);
    }

    // Erstelle Run-Verzeichnis
    if (!existsSync(params.runDir)) {
        mkdirSync(params.runDir, { recursive: true });
    }
    if (!existsSync(paths.resultsDir)) {
        mkdirSync(paths.resultsDir, { recursive: true });
    }

    // Sub-Agent Task erstellen
    let taskFile;
    try {
        taskFile = await spawnMethodExecutor(filledPrompt, params);
    } catch (err) {
        console.error(`❌ Fehler beim Erstellen des Tasks: ${err.message}`);
        process.exit(1);
    }

    // Dry-run: Nur Task-File erstellen
    if (params.dryRun) {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════════╗');
        console.log('║  🔍 DRY RUN MODUS                                                ║');
        console.log('╚══════════════════════════════════════════════════════════════════╝');
        console.log('   Task-Datei erstellt, Ausführung übersprungen.\n');

        // Speichere auch Prompt für manuelle Ausführung
        const manualPath = savePromptToFile(filledPrompt, params.runDir, params.methodId);
        console.log(`   Manuelles Prompt: ${manualPath}\n`);

        console.log(taskFile);
        process.exit(0);
    }

    // Status-Update auf RUNNING (optional)
    try {
        let status = statusManager.loadStatus(params.statusPath);
        if (!status) {
            status = statusManager.createStatus(params.statusPath);
            statusManager.saveStatus(status);
        }

        const jobId = params.jobKey;
        if (!status.data.jobs[jobId]) {
            statusManager.addJob(status, {
                jobId: jobId,
                taskAgent: paths.taskAgent,
                methodId: params.methodId,
                methodTitle: params.methodTitle
            });
        }

        statusManager.updateJobStatus(status, jobId, statusManager.STATUS.RUNNING);
        statusManager.saveStatus(status);
        console.log(`✅ Job-Status auf RUNNING gesetzt: ${jobId}\n`);
    } catch (err) {
        console.warn(`⚠️  Status-Update fehlgeschlagen (nicht kritisch): ${err.message}\n`);
    }

    // Speichere auch manuelles Prompt
    const manualPath = savePromptToFile(filledPrompt, params.runDir, params.methodId);

    // Erfolgsmeldung
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Sub-Agent Task erfolgreich erstellt!                         ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`  Task-Datei:       ${taskFile}`);
    console.log(`  Manuelles Prompt:  ${manualPath}`);
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    console.log('📖 Nächste Schritte:');
    console.log('   1. Lese die Task-Datei');
    console.log('   2. Führe den STRICT WORKFLOW aus');
    console.log('   3. Schreibe Result-JSON nach: ' + params.resultPath);
    console.log('   4. Aktualisiere STATUS.json: ' + params.statusPath);
    console.log();

    // Output das Task File Path für Scripting
    console.log(taskFile);

    return taskFile;
}

// Skript ausführen (nur wenn direkt aufgerufen, nicht bei Import)
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        console.error('❌ Unerwarteter Fehler:', err);
        process.exit(1);
    });
}
