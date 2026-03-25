#!/usr/bin/env node
/**
 * dispatch_processor.js - Phase 3.1: Dispatch Processor Core
 * Verarbeitet pending Dispatch-Requests sequentiell
 * 
 * CLI-Usage:
 *   node dispatch_processor.js [--runId <id>]
 *   node dispatch_processor.js --help
 * 
 * @version 3.1.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Abhängigkeiten aus Phase 1
import resultNaming from './lib/result_naming.mjs';
import statusManager from './lib/status_manager.mjs';

// ChromaDB Bridge Client (optional)
let ChromaBridgeClient;
let chromaClient = null;

/**
 * Initialize ChromaDB client if enabled
 */
async function initChromaClient() {
    const enabled = process.env.CHROMA_DB_ENABLED === 'true' || process.env.CHROMA_DB_ENABLED === '1';
    if (!enabled) {
        return;
    }
    
    try {
        const { ChromaBridgeClient: Client } = await import('./chroma_bridge_client.js');
        ChromaBridgeClient = Client;
        chromaClient = new ChromaBridgeClient({
            host: process.env.CHROMA_BRIDGE_HOST || 'localhost',
            port: parseInt(process.env.CHROMA_BRIDGE_PORT, 10) || 8765,
            timeoutMs: 5000,
            retries: 2
        });
        
        const healthy = await chromaClient.isHealthy(5000);
        if (healthy) {
            Logger.info('ChromaDB Bridge connected');
        } else {
            Logger.warn('ChromaDB Bridge not healthy - continuing without ChromaDB');
            chromaClient = null;
        }
    } catch (err) {
        Logger.warn(`ChromaDB Bridge not available: ${err.message}`);
        chromaClient = null;
    }
}

// Konfiguration
const CONFIG = {
    BASE_DIR: resolve(__dirname, '../..'),
    RUNS_DIR: resolve(__dirname, '../../reports/autoresearch/runs'),
    POLL_INTERVAL_MS: 10000,      // 10 Sekunden
    MAX_WAIT_MS: 600000,          // 10 Minuten
    LOG_INTERVAL_MS: 30000,       // 30 Sekunden
    DEFAULT_TEMPLATE_PATH: resolve(__dirname, '../../docs/llm/autoresearch/runtime/method_executor_prompt_template.md'),
    CHROMA_DB_ENABLED: process.env.CHROMA_DB_ENABLED === 'true' || process.env.CHROMA_DB_ENABLED === '1'
};

/**
 * Logger mit einheitlichem Format
 */
class Logger {
    static info(msg) { console.log(`[INFO] ${msg}`); }
    static step(msg) { console.log(`[STEP] ${msg}`); }
    static job(msg) { console.log(`[JOB] ${msg}`); }
    static wait(msg) { console.log(`[WAIT] ${msg}`); }
    static done(msg) { console.log(`[DONE] ${msg}`); }
    static error(msg) { console.error(`[ERROR] ${msg}`); }
    static succ(msg) { console.log(`[SUCC] ${msg}`); }
    static warn(msg) { console.warn(`[WARN] ${msg}`); }
}

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
║           AutoCast Dispatch Processor Core                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Verarbeitet pending Dispatch-Requests sequentiell.              ║
║  Spawnt Method Executor Sub-Agents, wartet auf Ergebnisse.     ║
║                                                                  ║
║  Verwendung:                                                     ║
║    node dispatch_processor.js [Optionen]                         ║
║                                                                  ║
║  Optionen:                                                       ║
║    --runId <id>         Optional: Spezifische Run-ID             ║
║    --dry-run            Simuliere ohne Ausführung                ║
║    --help, -h           Hilfe anzeigen                         ║
║                                                                  ║
║  Environment:                                                    ║
║    CHROMA_DB_ENABLED    ChromaDB Integration aktivieren         ║
║    CHROMA_BRIDGE_HOST   ChromaDB Bridge Host (default: local)   ║
║    CHROMA_BRIDGE_PORT   ChromaDB Bridge Port (default: 8765)    ║
║                                                                  ║
║  Beispiel:                                                       ║
║    node dispatch_processor.js                                    ║
║    node dispatch_processor.js --runId 20260325_002306          ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Finde den neuesten Run mit STATUS.json
 * @param {string|null} specificRunId - Optional: spezifische Run-ID
 * @returns {object|null} Run-Info oder null
 */
export function findLatestRun(specificRunId = null) {
    Logger.step('Suche aktiven Run...');
    
    if (!existsSync(CONFIG.RUNS_DIR)) {
        Logger.error(`Runs-Verzeichnis nicht gefunden: ${CONFIG.RUNS_DIR}`);
        return null;
    }
    
    // Wenn spezifische Run-ID angegeben
    if (specificRunId) {
        const runDir = join(CONFIG.RUNS_DIR, specificRunId);
        const statusPath = join(runDir, 'STATUS.json');
        
        if (existsSync(statusPath)) {
            Logger.info(`Verwende spezifischen Run: ${specificRunId}`);
            return {
                runId: specificRunId,
                runDir: runDir,
                statusPath: statusPath
            };
        }
        Logger.error(`Run nicht gefunden: ${specificRunId}`);
        return null;
    }
    
    // Suche neuesten Run
    const entries = readdirSync(CONFIG.RUNS_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => /^\d{8}_\d{6}$/.test(name))  // Format: YYYYMMDD_HHMMSS
        .sort((a, b) => b.localeCompare(a));  // Absteigend = neueste zuerst
    
    for (const runId of entries) {
        const runDir = join(CONFIG.RUNS_DIR, runId);
        const statusPath = join(runDir, 'STATUS.json');
        
        if (existsSync(statusPath)) {
            Logger.info(`Gefundener Run: ${runId}`);
            return {
                runId: runId,
                runDir: runDir,
                statusPath: statusPath
            };
        }
    }
    
    Logger.error('Kein Run mit STATUS.json gefunden');
    return null;
}

/**
 * Lädt den Status aus einer Datei
 * @param {string} statusPath - Pfad zur STATUS.json
 * @returns {object|null} Status-Container oder null
 */
export function loadStatus(statusPath) {
    try {
        const status = statusManager.loadStatus(statusPath);
        if (!status) {
            Logger.error(`Konnte STATUS.json nicht laden: ${statusPath}`);
            return null;
        }
        return status;
    } catch (err) {
        Logger.error(`Fehler beim Laden von STATUS.json: ${err.message}`);
        return null;
    }
}

/**
 * Prüft den overallStatus und entscheidet weiteres Vorgehen
 * @param {object} status - Status-Container
 * @returns {boolean} true = fortfahren, false = exit
 */
export function checkOverallStatus(status) {
    const overallStatus = status.data?.overallStatus;
    
    Logger.step(`Prüfe overallStatus: ${overallStatus || 'N/A'}`);
    
    if (overallStatus === 'COMPLETED') {
        Logger.info('Run bereits COMPLETED - nichts zu tun');
        return false;
    }
    
    if (overallStatus === 'FAILED') {
        Logger.error('Run ist FAILED - breche ab');
        return false;
    }
    
    if (!overallStatus || overallStatus === 'IN_PROGRESS') {
        if (!overallStatus) {
            status.data.overallStatus = 'IN_PROGRESS';
            status.data.createdAt = status.data.createdAt || new Date().toISOString();
            statusManager.saveStatus(status);
            Logger.info('overallStatus auf IN_PROGRESS gesetzt');
        }
        return true;
    }
    
    Logger.warn(`Unbekannter overallStatus: ${overallStatus}`);
    return true;
}

/**
 * Extrahiert Job-Index aus jobId
 * @param {string} jobId - Job-ID (z.B. "method-executor__silence_overlap__001")
 * @returns {number} Index
 */
function extractJobIndex(jobId) {
    const match = jobId.match(/__(\d{3})$/);
    return match ? parseInt(match[1], 10) : 1;
}

/**
 * Findet den ersten PENDING Job
 * @param {object} status - Status-Container
 * @returns {object|null} Job-Info oder null
 */
export function findPendingJob(status) {
    Logger.step('Suche PENDING Job...');
    
    const jobs = status.data?.jobs;
    if (!jobs || Object.keys(jobs).length === 0) {
        Logger.info('Keine Jobs im Status gefunden');
        return null;
    }
    
    // Sortiere Jobs nach methodId für deterministische Reihenfolge
    const sortedJobIds = Object.keys(jobs).sort((a, b) => {
        const jobA = jobs[a];
        const jobB = jobs[b];
        return (jobA.methodId || '').localeCompare(jobB.methodId || '');
    });
    
    for (const jobId of sortedJobIds) {
        const job = jobs[jobId];
        if (job.status === statusManager.STATUS.PENDING) {
            const jobIndex = extractJobIndex(jobId);
            const resultsDir = join(dirname(status.path), 'method_results');  // FIXED: Einheitlich 'method_results'
            const jobKey = resultNaming.generateJobKey('method-executor', job.methodId, jobIndex);
            const resultPath = resultNaming.generateResultPath(resultsDir, jobKey);
            
            Logger.info(`PENDING Job gefunden: ${job.methodId} (${jobId})`);
            
            return {
                jobId: jobId,
                methodId: job.methodId,
                methodTitle: job.methodTitle || job.methodId,
                runId: status.data.runId || basename(dirname(status.path)),
                jobIndex: jobIndex,
                promptFile: job.promptFile || null,
                resultPath: resultPath,
                statusPath: status.path,
                runDir: dirname(status.path)
            };
        }
    }
    
    Logger.info('Keine PENDING Jobs gefunden');
    return null;
}

/**
 * Aktualisiert Job-Status auf RUNNING
 * @param {object} status - Status-Container
 * @param {string} jobId - Job-ID
 * @returns {boolean} Erfolg
 */
export function updateJobToRunning(status, jobId) {
    try {
        // FIXED: Verwende atomaren Update für Transaktionssicherheit
        statusManager.updateJobStatusAtomic(status, jobId, statusManager.STATUS.RUNNING);
        Logger.job(`🚀 Starte: ${jobId}`);
        return true;
    } catch (err) {
        Logger.error(`Fehler beim Status-Update: ${err.message}`);
        return false;
    }
}

/**
 * Lädt das Method Executor Prompt-Template
 * @returns {string|null} Template oder null
 */
function loadPromptTemplate() {
    try {
        if (!existsSync(CONFIG.DEFAULT_TEMPLATE_PATH)) {
            Logger.error(`Template nicht gefunden: ${CONFIG.DEFAULT_TEMPLATE_PATH}`);
            return null;
        }
        return readFileSync(CONFIG.DEFAULT_TEMPLATE_PATH, 'utf-8');
    } catch (err) {
        Logger.error(`Fehler beim Laden des Templates: ${err.message}`);
        return null;
    }
}

/**
 * Füllt Platzhalter im Template
 * @param {string} template - Das Template
 * @param {object} params - Parameter
 * @returns {string} Gefülltes Template
 */
function fillTemplate(template, params) {
    let result = template;
    
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        const stringValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        result = result.replace(regex, stringValue);
    }
    
    return result;
}

/**
 * Generiert Sub-Agent Task Content
 * @param {object} job - Job-Info
 * @param {string} filledPrompt - Gefüllter Prompt
 * @returns {string} Task Content
 */
function generateTaskContent(job, filledPrompt) {
    return `# Method Executor Task

## Parameters
- **Method ID**: ${job.methodId}
- **Method Title**: ${job.methodTitle}
- **Run ID**: ${job.runId}
- **Job ID**: ${job.jobId}
- **Job Index**: ${job.jobIndex}
- **Result Path**: ${job.resultPath}
- **Status Path**: ${job.statusPath}

## STRICT WORKFLOW

1. Führe die Methode aus
2. Schreibe Result-JSON nach: \`${job.resultPath}\`
3. Aktualisiere STATUS.json: \`${job.statusPath}\`

## Instructions

${filledPrompt}

## Result Schema

\`\`\`json
{
  "schemaVersion": "1.0.0",
  "methodId": "${job.methodId}",
  "runId": "${job.runId}",
  "status": "completed",
  "decision": "KEEP|REJECT|FAILED",
  "timestamp": "ISO-8601",
  "metrics": {
    "before": { "objectiveScore": number },
    "after": { "objectiveScore": number }
  },
  "changedFiles": [],
  "git": { "commitHash": "...", "commitMessage": "..." },
  "notes": "..."
}
\`\`\`
`;
}

/**
 * Spawnt einen Method Executor Sub-Agent
 * @param {object} job - Job-Info
 * @returns {Promise<string>} Pfad zur Task-Datei
 */
export async function spawnMethodExecutor(job) {
    Logger.step(`Spawne Method Executor für ${job.methodId}...`);
    
    // Lade und fülle Template
    const template = loadPromptTemplate();
    if (!template) {
        throw new Error('Konnte Prompt-Template nicht laden');
    }
    
    const filledPrompt = fillTemplate(template, {
        methodId: job.methodId,
        methodTitle: job.methodTitle,
        runId: job.runId,
        runDir: job.runDir,
        resultPath: job.resultPath,
        statusPath: job.statusPath,
        promptFile: job.promptFile || 'N/A',
        baselineMetrics: '{}'
    });
    
    // Erstelle Sub-Agent Task Directory
    const subAgentDir = join(job.runDir, 'subagent-tasks');
    if (!existsSync(subAgentDir)) {
        mkdirSync(subAgentDir, { recursive: true });
    }
    
    // Erstelle Task-File
    const taskFileName = `dispatch_${job.methodId}.task.md`;
    const taskFile = join(subAgentDir, taskFileName);
    
    const taskContent = generateTaskContent(job, filledPrompt);
    writeFileSync(taskFile, taskContent, 'utf8');
    
    Logger.info(`Sub-Agent Task erstellt: ${taskFile}`);
    
    return taskFile;
}

/**
 * Wartet auf das Ergebnis (Polling)
 * @param {string} resultPath - Pfad zur Result-Datei
 * @param {string} methodId - Methoden-ID für Logging
 * @param {number} maxWaitMs - Maximale Wartezeit
 * @returns {Promise<boolean>} true = Ergebnis gefunden, false = Timeout
 */
export async function pollForResult(resultPath, methodId, maxWaitMs = CONFIG.MAX_WAIT_MS) {
    Logger.wait(`Warte auf Ergebnis für ${methodId}...`);
    
    const startTime = Date.now();
    let lastLogTime = startTime;
    
    while (Date.now() - startTime < maxWaitMs) {
        // Prüfe ob Result existiert
        if (existsSync(resultPath)) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            Logger.done(`Ergebnis gefunden nach ${elapsed}s: ${methodId}`);
            return true;
        }
        
        // Logge Fortschritt alle 30 Sekunden
        const now = Date.now();
        if (now - lastLogTime >= CONFIG.LOG_INTERVAL_MS) {
            const elapsed = Math.floor((now - startTime) / 1000);
            Logger.wait(`⏳ Warte auf ${methodId}... (${elapsed}s)`);
            lastLogTime = now;
        }
        
        // Warte 10 Sekunden
        await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL_MS));
    }
    
    // Timeout
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    Logger.error(`⏰ Timeout nach ${elapsed}s für ${methodId}`);
    return false;
}

/**
 * Verarbeitet das Ergebnis
 * @param {string} resultPath - Pfad zur Result-Datei
 * @returns {object|null} Result-Daten oder null bei Fehler
 */
export function processResult(resultPath) {
    Logger.step('Verarbeite Ergebnis...');
    
    try {
        const content = readFileSync(resultPath, 'utf-8');
        const result = JSON.parse(content);
        
        // Validiere minimale Struktur
        if (!result.decision || !['KEEP', 'REJECT', 'FAILED'].includes(result.decision)) {
            Logger.error(`Ungültige decision im Result: ${result.decision}`);
            return null;
        }
        
        Logger.done(`Decision: ${result.decision}`);
        return result;
    } catch (err) {
        Logger.error(`Fehler beim Verarbeiten des Ergebnisses: ${err.message}`);
        return null;
    }
}

/**
 * Markiert einen Job als FAILED
 * @param {object} status - Status-Container
 * @param {string} jobId - Job-ID
 * @param {string} reason - Fehlergrund
 */
function markJobFailed(status, jobId, reason) {
    try {
        // FIXED: Verwende atomaren Update für Transaktionssicherheit
        statusManager.updateJobStatusAtomic(status, jobId, statusManager.STATUS.FAILED, {
            error: reason
        });
        Logger.error(`Job ${jobId} als FAILED markiert: ${reason}`);
    } catch (err) {
        Logger.error(`Fehler beim Markieren als FAILED: ${err.message}`);
    }
}

/**
 * Führt Aggregation durch
 * @param {object} status - Status-Container
 * @param {string} runDir - Run-Verzeichnis
 */
async function runAggregation(status, runDir) {
    Logger.step('Starte Aggregation...');
    
    const summary = statusManager.getSummary(status);
    const timestamp = new Date().toISOString();
    
    // Zähle KEEP Entscheidungen
    let keepCount = 0;
    const jobs = status.data?.jobs || {};
    for (const jobId in jobs) {
        const job = jobs[jobId];
        if (job.result?.decision === 'KEEP') {
            keepCount++;
        }
    }
    
    // Generiere CYCLE_REPORT.md
    const reportContent = `# CYCLE_REPORT

## Run Summary

- **Run ID**: ${status.data.runId || basename(runDir)}
- **Completed At**: ${timestamp}
- **Total Jobs**: ${summary.total}
- **Completed**: ${summary.completed}
- **Failed**: ${summary.failed}
- **Rejected**: ${summary.rejected}
- **Kept (KEEP)**: ${keepCount}

## Jobs

| Job ID | Method | Status | Decision |
|--------|--------|--------|----------|
${Object.entries(jobs).map(([jobId, job]) => {
    const decision = job.result?.decision || '-';
    return `| ${jobId} | ${job.methodId} | ${job.status} | ${decision} |`;
}).join('\n')}

## Notes

Generated by Dispatch Processor v3.1.0
`;
    
    const reportPath = join(runDir, 'CYCLE_REPORT.md');
    writeFileSync(reportPath, reportContent, 'utf8');
    Logger.info(`CYCLE_REPORT.md erstellt: ${reportPath}`);
    
    // Update STATUS.json
    status.data.overallStatus = 'COMPLETED';
    status.data.completedAt = timestamp;
    status.data.summary = {
        totalJobs: summary.total,
        completedJobs: summary.completed,
        failedJobs: summary.failed,
        rejectedJobs: summary.rejected,
        keepCount: keepCount
    };
    statusManager.saveStatus(status);
    
    Logger.succ(`🎉 Aggregation abgeschlossen! ${summary.completed}/${summary.total} Jobs erfolgreich`);
}

/**
 * Haupt-Workflow
 */
export async function main() {
    Logger.info('🚀 AutoCast Dispatch Processor v3.1.0\n');
    
    const args = process.argv.slice(2);
    
    // Hilfe anzeigen
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }
    
    const parsedArgs = parseArgs(args);
    const dryRun = parsedArgs.dryRun || false;
    
    if (dryRun) {
        Logger.warn('DRY RUN MODUS - Keine Ausführung\n');
    }
    
    // Schritt 1: Finde aktiven Run
    const runInfo = findLatestRun(parsedArgs.runId || null);
    if (!runInfo) {
        Logger.error('Kein aktiver Run gefunden - EXIT');
        process.exit(1);
    }
    
    // Schritt 2: Lade Status
    const status = loadStatus(runInfo.statusPath);
    if (!status) {
        Logger.error('Konnte STATUS.json nicht laden - EXIT');
        process.exit(1);
    }
    
    // Schritt 3: Prüfe overallStatus
    if (!checkOverallStatus(status)) {
        process.exit(0);
    }
    
    // Füge runId zum Status hinzu falls nicht vorhanden
    if (!status.data.runId) {
        status.data.runId = runInfo.runId;
    }
    
    Logger.info(`\n📋 Run: ${runInfo.runId}`);
    Logger.info(`📁 Verzeichnis: ${runInfo.runDir}`);
    
    // Initialize ChromaDB client if enabled
    await initChromaClient();
    
    Logger.info('');
    
    // Hauptschleife für Jobs
    let hasMoreJobs = true;
    let processedCount = 0;
    const MAX_ITERATIONS = 100; // Schutz gegen Endlosschleife
    let iterations = 0;
    
    while (hasMoreJobs && iterations < MAX_ITERATIONS) {
        iterations++;
        
        // WICHTIG: Status vor jedem Durchlauf neu laden
        // um aktuelle Job-Status zu sehen
        const freshStatus = loadStatus(runInfo.statusPath);
        if (!freshStatus) {
            Logger.error('Konnte Status nicht neu laden - breche ab');
            break;
        }
        Object.assign(status, freshStatus);
        
        // Schritt 3: Finde PENDING Job
        const job = findPendingJob(status);
        
        if (!job) {
            Logger.info('Keine weiteren PENDING Jobs');
            hasMoreJobs = false;
            break;
        }
        
        processedCount++;
        Logger.info(`\n--- Job ${processedCount} ---`);
        Logger.info(`Method: ${job.methodId}`);
        Logger.info(`Job ID: ${job.jobId}`);
        Logger.info(`Result: ${job.resultPath}`);
        
        if (dryRun) {
            Logger.info('[DRY RUN] Überspringe Ausführung');
            continue;
        }
        
        // Schritt 4: Update Status auf RUNNING
        if (!updateJobToRunning(status, job.jobId)) {
            Logger.error(`Konnte Job nicht auf RUNNING setzen - überspringe`);
            markJobFailed(status, job.jobId, 'Status-Update fehlgeschlagen');
            continue;
        }
        
        // Schritt 5: Spawne Method Executor
        let taskFile;
        try {
            taskFile = await spawnMethodExecutor(job);
        } catch (err) {
            Logger.error(`Fehler beim Spawnen: ${err.message}`);
            markJobFailed(status, job.jobId, `Spawn fehlgeschlagen: ${err.message}`);
            continue;
        }
        
        // Schritt 6: Warte auf Ergebnis
        const hasResult = await pollForResult(job.resultPath, job.methodId);
        
        if (!hasResult) {
            // Timeout
            markJobFailed(status, job.jobId, 'Timeout (10 Minuten)');
            continue;
        }
        
        // Schritt 7: Verarbeite Ergebnis
        const result = processResult(job.resultPath);

        if (!result) {
            markJobFailed(status, job.jobId, 'Invalid Result-JSON');
            continue;
        }

        // Update Status mit Decision - FIXED: decision ist KEIN Status, sondern Metadaten
        try {
            const decision = result.decision;  // KEEP, REJECT, FAILED (Entscheidung, nicht Status)
            const jobStatus = decision === 'FAILED' ? statusManager.STATUS.FAILED : statusManager.STATUS.COMPLETED;

            // FIXED: Verwende atomaren Update für Transaktionssicherheit
            statusManager.updateJobStatusAtomic(status, jobId, jobStatus, {
                result: result,
                decision: decision  // Decision als eigenes Feld speichern
            });
            Logger.done(`Job ${job.jobId} abgeschlossen: Status=${jobStatus}, Decision=${decision}`);
        } catch (err) {
            Logger.error(`Fehler beim Final-Update: ${err.message}`);
        }
        
        // Schritt 8: Nächster Job (while-Schleife fährt fort)
    }
    
    // Schritt 9: Aggregation
    if (!dryRun) {
        await runAggregation(status, runInfo.runDir);
    } else {
        Logger.info('[DRY RUN] Überspringe Aggregation');
    }
    
    Logger.succ('\n✨ Dispatch Processor abgeschlossen!');
    return processedCount;
}

// Skript ausführen (nur wenn direkt aufgerufen)
if (import.meta.url === `file://${process.argv[1]}`) {
    main().then(count => {
        console.log(`\n[SUCC] Insgesamt verarbeitet: ${count} Jobs`);
        process.exit(0);
    }).catch(err => {
        Logger.error(`Unerwarteter Fehler: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    });
}
