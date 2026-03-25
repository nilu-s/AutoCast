#!/usr/bin/env node
/**
 * monitor.js - Phase 5.3: Monitoring & Alerting
 * Überwachung und Benachrichtigungen für den AutoResearch Produktivbetrieb
 * 
 * CLI-Usage:
 *   node monitor.js [--check] [--report] [--alert]
 *   node monitor.js --help
 * 
 * @version 5.3.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, appendFileSync } from 'fs';
import { resolve, join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Konfiguration
const CONFIG = {
    BASE_DIR: resolve(__dirname, '../..'),
    RUNS_DIR: resolve(__dirname, '../../reports/autoresearch/runs'),
    REPORTS_DIR: resolve(__dirname, '../../reports/autoresearch'),
    HISTORY_PATH: resolve(__dirname, '../../reports/autoresearch/history.jsonl'),
    LAST_ORCHESTRATION_PATH: resolve(__dirname, '../../reports/autoresearch/last_orchestration.json'),
    ALERT_LOG_PATH: resolve(__dirname, '../../reports/autoresearch/alerts.jsonl'),
    DASHBOARD_PATH: resolve(__dirname, '../../reports/autoresearch/dashboard.html'),
    // Alert Thresholds
    PENDING_WARN_THRESHOLD: 5,      // WARN wenn > 5 PENDING über 24h
    PENDING_ERROR_THRESHOLD: 10,    // ERROR wenn > 10 PENDING
    FAILED_ERROR_THRESHOLD: 1,      // ERROR wenn >= 1 FAILED
    STAGNATION_RUNS: 3,             // WARN wenn Score stagniert über 3 Runs
    ORCHESTRATOR_TIMEOUT_HOURS: 2,  // ERROR wenn kein neuer Run seit 2h
    // Score-Tracking
    SCORE_HISTORY_LIMIT: 10
};

// Alert Levels
const ALERT_LEVEL = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR'
};

/**
 * Logger mit einheitlichem Format
 */
class Logger {
    static info(msg) { console.log(`[INFO] ${msg}`); }
    static warn(msg) { console.warn(`[WARN] ${msg}`); }
    static error(msg) { console.error(`[ERROR] ${msg}`); }
    static succ(msg) { console.log(`[SUCC] ${msg}`); }
}

/**
 * Parsed Kommandozeilen-Argumente
 */
function parseArgs(args) {
    const result = { check: false, report: false, alert: false };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') result.help = true;
        else if (arg === '--check') result.check = true;
        else if (arg === '--report') result.report = true;
        else if (arg === '--alert') result.alert = true;
    }
    
    // Wenn keine Flags gesetzt, alle aktivieren
    if (!result.check && !result.report && !result.alert && !result.help) {
        result.check = true;
        result.report = true;
        result.alert = true;
    }
    
    return result;
}

/**
 * Zeigt die Hilfe an
 */
function showHelp() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           AutoCast Monitoring & Alerting                           ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Überwacht AutoResearch Runs und sendet Alerts bei Problemen.    ║
║                                                                    ║
║  Verwendung:                                                       ║
║    node monitor.js [Optionen]                                      ║
║                                                                    ║
║  Optionen:                                                         ║
║    --check       Führe Health-Checks durch                        ║
║    --report      Generiere Health-Report                          ║
║    --alert       Sende Alerts bei kritischen Problemen            ║
║    --help, -h    Hilfe anzeigen                                   ║
║                                                                    ║
║  Beispiele:                                                        ║
║    node monitor.js --check          # Nur Checks                   ║
║    node monitor.js --report         # Nur Report generieren       ║
║    node monitor.js --alert           # Alerts senden (nur WARN/ERROR) ║
║    node monitor.js                   # Alle Operationen             ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Lädt alle Run-Verzeichnisse (neueste zuerst)
 */
function getAllRuns() {
    if (!existsSync(CONFIG.RUNS_DIR)) {
        return [];
    }
    
    return readdirSync(CONFIG.RUNS_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => /^\d{8}_\d{6}$/.test(name))
        .sort((a, b) => b.localeCompare(a));
}

/**
 * Lädt die STATUS.json eines Runs
 */
function loadStatus(runId) {
    const statusPath = join(CONFIG.RUNS_DIR, runId, 'STATUS.json');
    
    if (!existsSync(statusPath)) {
        return null;
    }
    
    try {
        const content = readFileSync(statusPath, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        Logger.error(`Fehler beim Laden von STATUS.json für ${runId}: ${err.message}`);
        return null;
    }
}

/**
 * Lädt die Run-Metadaten (run_plan.json oder openclaw_cycle_report.md)
 */
function loadRunMetadata(runId) {
    const planPath = join(CONFIG.RUNS_DIR, runId, 'run_plan.json');
    
    if (existsSync(planPath)) {
        try {
            const content = readFileSync(planPath, 'utf-8');
            return JSON.parse(content);
        } catch (err) {
            return null;
        }
    }
    return null;
}

/**
 * Prüft den neuesten Run auf Fehler
 */
export function checkLatestRun() {
    const runs = getAllRuns();
    if (runs.length === 0) {
        return { healthy: false, error: 'Keine Runs gefunden', runId: null };
    }
    
    const latestRunId = runs[0];
    const status = loadStatus(latestRunId);
    
    if (!status) {
        return { healthy: false, error: 'STATUS.json nicht gefunden', runId: latestRunId };
    }
    
    const jobs = status.jobs || {};
    const jobEntries = Object.entries(jobs);
    
    // Zähle Job-Status
    const counts = {
        total: jobEntries.length,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0
    };
    
    const failedJobs = [];
    
    for (const [jobId, job] of jobEntries) {
        const jobStatus = job.status || 'UNKNOWN';
        switch (jobStatus) {
            case 'PENDING': counts.pending++; break;
            case 'RUNNING': counts.running++; break;
            case 'COMPLETED': counts.completed++; break;
            case 'FAILED': 
                counts.failed++; 
                failedJobs.push({ jobId, taskAgent: job.taskAgent, error: job.error });
                break;
        }
    }
    
    // Prüfe auf Fehler
    const hasFailedJobs = counts.failed > 0;
    const allCompleted = counts.completed === counts.total && counts.total > 0;
    
    return {
        healthy: !hasFailedJobs,
        runId: latestRunId,
        timestamp: status.updatedAt,
        counts,
        failedJobs,
        allCompleted,
        summary: `${counts.completed}/${counts.total} Jobs abgeschlossen, ${counts.failed} FAILED`
    };
}

/**
 * Zählt PENDING Jobs über alle Runs
 */
export function checkPendingJobs() {
    const runs = getAllRuns();
    let totalPending = 0;
    let pendingByRun = [];
    let oldPendingCount = 0; // PENDING älter als 24h
    
    const now = new Date();
    const cutoff = new Date(now - 24 * 60 * 60 * 1000); // 24h zurück
    
    for (const runId of runs) {
        const status = loadStatus(runId);
        if (!status) continue;
        
        const jobs = status.jobs || {};
        const pendingInRun = Object.entries(jobs).filter(([_, job]) => job.status === 'PENDING');
        
        if (pendingInRun.length > 0) {
            const runPending = {
                runId,
                count: pendingInRun.length,
                createdAt: status.createdAt
            };
            pendingByRun.push(runPending);
            totalPending += pendingInRun.length;
            
            // Prüfe ob älter als 24h
            const runDate = new Date(status.createdAt);
            if (runDate < cutoff) {
                oldPendingCount += pendingInRun.length;
            }
        }
    }
    
    return {
        totalPending,
        oldPendingCount,
        pendingByRun,
        warning: oldPendingCount > CONFIG.PENDING_WARN_THRESHOLD,
        critical: oldPendingCount > CONFIG.PENDING_ERROR_THRESHOLD
    };
}

/**
 * Zählt FAILED Jobs über alle Runs
 */
export function checkFailedJobs() {
    const runs = getAllRuns();
    let totalFailed = 0;
    let failedByRun = [];
    const latestRun = runs[0];
    let failedInLatest = 0;
    
    for (const runId of runs) {
        const status = loadStatus(runId);
        if (!status) continue;
        
        const jobs = status.jobs || {};
        const failedInRun = Object.entries(jobs)
            .filter(([_, job]) => job.status === 'FAILED')
            .map(([jobId, job]) => ({ jobId, taskAgent: job.taskAgent, error: job.error }));
        
        if (failedInRun.length > 0) {
            failedByRun.push({
                runId,
                count: failedInRun.length,
                jobs: failedInRun
            });
            totalFailed += failedInRun.length;
            
            if (runId === latestRun) {
                failedInLatest = failedInRun.length;
            }
        }
    }
    
    return {
        totalFailed,
        failedInLatest,
        failedByRun,
        hasFailed: totalFailed > 0,
        error: failedInLatest > 0 // ERROR wenn FAILED im letzten Run
    };
}

/**
 * Vergleicht Scores über Zeit
 */
export function checkScoreTrend() {
    const runs = getAllRuns().slice(0, CONFIG.SCORE_HISTORY_LIMIT);
    const scores = [];
    
    for (const runId of runs) {
        const metadata = loadRunMetadata(runId);
        if (metadata && metadata.metricsSnapshot && metadata.metricsSnapshot.objectiveScore !== undefined) {
            scores.push({
                runId,
                score: metadata.metricsSnapshot.objectiveScore,
                timestamp: metadata.generatedAt
            });
        }
    }
    
    if (scores.length < 2) {
        return { trend: 'insufficient_data', scores, stagnation: false };
    }
    
    // Prüfe auf Stagnation (gleicher Score über mehrere Runs)
    const recentScores = scores.slice(0, CONFIG.STAGNATION_RUNS);
    const uniqueScores = [...new Set(recentScores.map(s => s.score.toFixed(4)))];
    const stagnation = uniqueScores.length === 1 && recentScores.length >= CONFIG.STAGNATION_RUNS;
    
    // Berechne Trend
    const firstScore = scores[scores.length - 1].score;
    const lastScore = scores[0].score;
    const change = lastScore - firstScore;
    
    let trend = 'stable';
    if (change > 0.01) trend = 'improving';
    else if (change < -0.01) trend = 'declining';
    
    return {
        trend,
        change,
        scores,
        stagnation,
        currentScore: lastScore,
        previousScore: firstScore
    };
}

/**
 * Prüft ob der Orchestrator noch läuft (neue Runs werden erstellt)
 */
export function checkOrchestratorHealth() {
    const runs = getAllRuns();
    if (runs.length === 0) {
        return { healthy: false, error: 'Keine Runs gefunden', lastRunId: null, lastRunTime: null };
    }
    
    const latestRunId = runs[0];
    const status = loadStatus(latestRunId);
    
    if (!status) {
        return { healthy: false, error: 'STATUS.json nicht gefunden', lastRunId: latestRunId, lastRunTime: null };
    }
    
    const lastRunTime = new Date(status.createdAt);
    const now = new Date();
    const hoursSinceLastRun = (now - lastRunTime) / (1000 * 60 * 60);
    
    return {
        healthy: hoursSinceLastRun < CONFIG.ORCHESTRATOR_TIMEOUT_HOURS,
        lastRunId: latestRunId,
        lastRunTime: status.createdAt,
        hoursSinceLastRun: hoursSinceLastRun.toFixed(2),
        overdue: hoursSinceLastRun >= CONFIG.ORCHESTRATOR_TIMEOUT_HOURS
    };
}

/**
 * Generiert einen Health-Report
 */
export function generateHealthReport() {
    const latestRun = checkLatestRun();
    const pending = checkPendingJobs();
    const failed = checkFailedJobs();
    const trend = checkScoreTrend();
    const orchestrator = checkOrchestratorHealth();
    
    const report = {
        generatedAt: new Date().toISOString(),
        overall: {
            status: 'HEALTHY',
            issues: []
        },
        latestRun,
        pendingJobs: pending,
        failedJobs: failed,
        scoreTrend: trend,
        orchestrator: orchestrator
    };
    
    // Bestimme Overall-Status
    if (failed.error || orchestrator.overdue) {
        report.overall.status = 'CRITICAL';
        if (failed.error) report.overall.issues.push('FAILED Jobs im letzten Run');
        if (orchestrator.overdue) report.overall.issues.push('Orchestrator überfällig');
    } else if (pending.warning || trend.stagnation) {
        report.overall.status = 'WARNING';
        if (pending.warning) report.overall.issues.push('Zu viele PENDING Jobs');
        if (trend.stagnation) report.overall.issues.push('Score stagniert');
    }
    
    return report;
}

/**
 * Sendet einen Alert via Telegram Bot
 */
export async function sendAlert(level, message, details = {}) {
    const timestamp = new Date().toISOString();
    
    // Alert in Log schreiben
    const alertEntry = {
        timestamp,
        level,
        message,
        details
    };
    
    try {
        if (!existsSync(CONFIG.ALERT_LOG_PATH)) {
            mkdirSync(dirname(CONFIG.ALERT_LOG_PATH), { recursive: true });
        }
        appendFileSync(CONFIG.ALERT_LOG_PATH, JSON.stringify(alertEntry) + '\n');
    } catch (err) {
        Logger.error(`Konnte Alert-Log nicht schreiben: ${err.message}`);
    }
    
    // Emoji für Alert-Level
    const emoji = {
        [ALERT_LEVEL.INFO]: 'ℹ️',
        [ALERT_LEVEL.WARN]: '⚠️',
        [ALERT_LEVEL.ERROR]: '🔴'
    }[level] || '❓';
    
    // Formatierte Nachricht
    const formattedMessage = `${emoji} *[AutoCast ${level}]*
${message}`;
    
    // In Produktion: Telegram Bot API call
    // const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    // const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    // if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    //     await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify({
    //             chat_id: TELEGRAM_CHAT_ID,
    //             text: formattedMessage,
    //             parse_mode: 'Markdown'
    //         })
    //     });
    // }
    
    // Für jetzt: Nur Console-Output
    if (level === ALERT_LEVEL.ERROR) {
        Logger.error(`ALERT: ${message}`);
    } else if (level === ALERT_LEVEL.WARN) {
        Logger.warn(`ALERT: ${message}`);
    } else {
        Logger.info(`ALERT: ${message}`);
    }
    
    return alertEntry;
}

/**
 * Führt Alerts basierend auf Checks aus
 */
export async function runAlertChecks() {
    const alerts = [];
    
    // Check 1: FAILED Jobs
    const failed = checkFailedJobs();
    if (failed.error) {
        const alert = await sendAlert(
            ALERT_LEVEL.ERROR,
            `${failed.failedInLatest} FAILED Jobs im letzten Run (${failed.failedByRun[0]?.runId})`,
            { failedByRun: failed.failedByRun }
        );
        alerts.push(alert);
    }
    
    // Check 2: PENDING Jobs (älter als 24h)
    const pending = checkPendingJobs();
    if (pending.critical) {
        const alert = await sendAlert(
            ALERT_LEVEL.ERROR,
            `${pending.oldPendingCount} PENDING Jobs älter als 24h - System möglicherweise blockiert`,
            { pendingByRun: pending.pendingByRun }
        );
        alerts.push(alert);
    } else if (pending.warning) {
        const alert = await sendAlert(
            ALERT_LEVEL.WARN,
            `${pending.oldPendingCount} PENDING Jobs älter als 24h - Dispatch-Queue verzögert`,
            { pendingByRun: pending.pendingByRun }
        );
        alerts.push(alert);
    }
    
    // Check 3: Orchestrator Health
    const orchestrator = checkOrchestratorHealth();
    if (orchestrator.overdue) {
        const alert = await sendAlert(
            ALERT_LEVEL.ERROR,
            `Orchestrator läuft nicht - Letzter Run vor ${orchestrator.hoursSinceLastRun}h`,
            { lastRunId: orchestrator.lastRunId, lastRunTime: orchestrator.lastRunTime }
        );
        alerts.push(alert);
    }
    
    // Check 4: Score Trend
    const trend = checkScoreTrend();
    if (trend.stagnation) {
        const alert = await sendAlert(
            ALERT_LEVEL.WARN,
            `Score stagniert bei ${trend.currentScore?.toFixed(4)} über ${CONFIG.STAGNATION_RUNS} Runs`,
            { scores: trend.scores?.slice(0, CONFIG.STAGNATION_RUNS) }
        );
        alerts.push(alert);
    }
    
    return alerts;
}

/**
 * Generiert ein HTML-Dashboard
 */
export function generateDashboard() {
    const report = generateHealthReport();
    const runs = getAllRuns().slice(0, 20);
    
    // Lade Alert-History
    let alerts = [];
    if (existsSync(CONFIG.ALERT_LOG_PATH)) {
        try {
            const content = readFileSync(CONFIG.ALERT_LOG_PATH, 'utf-8');
            alerts = content.trim().split('\n').slice(-50).map(line => JSON.parse(line)).reverse();
        } catch (err) {
            // Ignore parse errors
        }
    }
    
    // Generiere Run-History Daten
    const runHistory = [];
    for (const runId of runs) {
        const status = loadStatus(runId);
        const metadata = loadRunMetadata(runId);
        if (status && metadata) {
            const jobs = status.jobs || {};
            const jobEntries = Object.values(jobs);
            const completed = jobEntries.filter(j => j.status === 'COMPLETED').length;
            const failed = jobEntries.filter(j => j.status === 'FAILED').length;
            const pending = jobEntries.filter(j => j.status === 'PENDING').length;
            
            runHistory.push({
                runId,
                timestamp: metadata.generatedAt,
                score: metadata.metricsSnapshot?.objectiveScore || 0,
                totalJobs: jobEntries.length,
                completed,
                failed,
                pending
            });
        }
    }
    
    // Scores für Chart
    const scoresData = runHistory.map(r => ({
        x: r.runId,
        y: r.score
    })).reverse();
    
    const html = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AutoCast Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        h1 { color: #58a6ff; margin-bottom: 20px; font-size: 28px; }
        h2 { color: #8b949e; margin: 30px 0 15px; font-size: 18px; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .card-title { font-size: 14px; color: #8b949e; text-transform: uppercase; }
        .status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
        }
        .status-healthy { background: #238636; color: #fff; }
        .status-warning { background: #f0883e; color: #fff; }
        .status-critical { background: #da3633; color: #fff; }
        .metric { font-size: 32px; font-weight: bold; margin: 10px 0; }
        .metric-label { font-size: 12px; color: #8b949e; }
        .chart-container { position: relative; height: 300px; margin: 20px 0; }
        .alert-list { max-height: 300px; overflow-y: auto; }
        .alert-item {
            padding: 10px;
            border-left: 3px solid;
            margin-bottom: 10px;
            background: #0d1117;
            font-size: 13px;
        }
        .alert-INFO { border-color: #58a6ff; }
        .alert-WARN { border-color: #f0883e; }
        .alert-ERROR { border-color: #da3633; }
        .alert-time { color: #8b949e; font-size: 11px; }
        .alert-level {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            margin-right: 8px;
            font-weight: bold;
        }
        .alert-level-INFO { background: #1f6feb; }
        .alert-level-WARN { background: #f0883e; }
        .alert-level-ERROR { background: #da3633; }
        .run-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .run-table th, .run-table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #30363d;
        }
        .run-table th { color: #8b949e; font-weight: normal; }
        .run-table tr:hover { background: #21262d; }
        .score { font-family: monospace; }
        .score-good { color: #3fb950; }
        .score-bad { color: #f85149; }
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            margin-right: 5px;
        }
        .badge-completed { background: #238636; }
        .badge-failed { background: #da3633; }
        .badge-pending { background: #f0883e; }
        .footer {
            text-align: center;
            padding: 20px;
            color: #8b949e;
            font-size: 12px;
            border-top: 1px solid #30363d;
            margin-top: 40px;
        }
        .refresh-btn {
            background: #238636;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover { background: #2ea043; }
    </style>
</head>
<body>
    <div class="container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h1>🎬 AutoCast Dashboard</h1>
            <button class="refresh-btn" onclick="location.reload()">↻ Aktualisieren</button>
        </div>
        
        <!-- Status Cards -->
        <div class="grid">
            <div class="card">
                <div class="card-header">
                    <span class="card-title">System Status</span>
                    <span class="status status-${report.overall.status.toLowerCase()}">${report.overall.status}</span>
                </div>
                <div class="metric">${report.latestRun?.runId || 'N/A'}</div>
                <div class="metric-label">Letzter Run</div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Score Trend</span>
                    <span class="badge ${report.scoreTrend.trend === 'improving' ? 'badge-completed' : report.scoreTrend.trend === 'declining' ? 'badge-failed' : 'badge-pending'}">${report.scoreTrend.trend}</span>
                </div>
                <div class="metric score ${report.scoreTrend.currentScore > 0.5 ? 'score-good' : 'score-bad'}">${report.scoreTrend.currentScore?.toFixed(4) || 'N/A'}</div>
                <div class="metric-label">Aktueller Objective Score</div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">PENDING Jobs</span>
                    <span class="badge ${report.pendingJobs.oldPendingCount > 5 ? 'badge-failed' : report.pendingJobs.oldPendingCount > 0 ? 'badge-pending' : 'badge-completed'}">${report.pendingJobs.totalPending}</span>
                </div>
                <div class="metric">${report.pendingJobs.oldPendingCount}</div>
                <div class="metric-label">Älter als 24h</div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span class="card-title">FAILED Jobs</span>
                    <span class="badge ${report.failedJobs.totalFailed > 0 ? 'badge-failed' : 'badge-completed'}">${report.failedJobs.totalFailed}</span>
                </div>
                <div class="metric">${report.failedJobs.failedInLatest}</div>
                <div class="metric-label">Im letzten Run</div>
            </div>
        </div>
        
        <!-- Score History Chart -->
        <h2>📈 Score History</h2>
        <div class="card">
            <div class="chart-container">
                <canvas id="scoreChart"></canvas>
            </div>
        </div>
        
        <!-- Recent Alerts -->
        <h2>🔔 Letzte Alerts</h2>
        <div class="card">
            <div class="alert-list">
                ${alerts.length === 0 ? '<p style="color: #8b949e; text-align: center;">Keine Alerts vorhanden</p>' : ''}
                ${alerts.map(a => `
                    <div class="alert-item alert-${a.level}">
                        <div>
                            <span class="alert-level alert-level-${a.level}">${a.level}</span>
                            <span class="alert-time">${new Date(a.timestamp).toLocaleString('de-DE')}</span>
                        </div>
                        <div style="margin-top: 5px;">${a.message}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <!-- Run History -->
        <h2>📋 Run History</h2>
        <div class="card">
            <table class="run-table">
                <thead>
                    <tr>
                        <th>Run ID</th>
                        <th>Zeit</th>
                        <th>Score</th>
                        <th>Jobs</th>
                        <th>✓</th>
                        <th>✗</th>
                        <th>⏳</th>
                    </tr>
                </thead>
                <tbody>
                    ${runHistory.map(r => `
                        <tr>
                            <td>${r.runId}</td>
                            <td>${new Date(r.timestamp).toLocaleString('de-DE')}</td>
                            <td class="score ${r.score > 0.5 ? 'score-good' : 'score-bad'}">${r.score.toFixed(4)}</td>
                            <td>${r.totalJobs}</td>
                            <td><span class="badge badge-completed">${r.completed}</span></td>
                            <td><span class="badge ${r.failed > 0 ? 'badge-failed' : 'badge-completed'}">${r.failed}</span></td>
                            <td><span class="badge ${r.pending > 0 ? 'badge-pending' : 'badge-completed'}">${r.pending}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            AutoCast Monitoring Dashboard | Generiert: ${new Date().toLocaleString('de-DE')}
        </div>
    </div>
    
    <script>
        const ctx = document.getElementById('scoreChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(scoresData.map(d => d.x))},
                datasets: [{
                    label: 'Objective Score',
                    data: ${JSON.stringify(scoresData.map(d => d.y))},
                    borderColor: '#58a6ff',
                    backgroundColor: 'rgba(88, 166, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#58a6ff',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#c9d1d9' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8b949e', maxRotation: 45 },
                        grid: { color: '#30363d' }
                    },
                    y: {
                        ticks: { color: '#8b949e' },
                        grid: { color: '#30363d' },
                        min: 0,
                        max: 1
                    }
                }
            }
        });
    </script>
</body>
</html>`;
    
    // Dashboard speichern
    try {
        writeFileSync(CONFIG.DASHBOARD_PATH, html, 'utf-8');
        Logger.succ(`Dashboard gespeichert: ${CONFIG.DASHBOARD_PATH}`);
    } catch (err) {
        Logger.error(`Fehler beim Speichern des Dashboards: ${err.message}`);
    }
    
    return html;
}

/**
 * Hauptfunktion
 */
async function main() {
    const args = parseArgs(process.argv.slice(2));
    
    if (args.help) {
        showHelp();
        return;
    }
    
    Logger.info('=== AutoCast Monitoring ===');
    
    // Health Checks
    if (args.check) {
        Logger.info('\n--- Health Checks ---');
        
        const latestRun = checkLatestRun();
        Logger.info(`Latest Run: ${latestRun.runId || 'N/A'} - ${latestRun.summary}`);
        Logger.info(`  Status: ${latestRun.healthy ? '✓ HEALTHY' : '✗ UNHEALTHY'}`);
        
        const pending = checkPendingJobs();
        Logger.info(`PENDING Jobs: ${pending.totalPending} total, ${pending.oldPendingCount} >24h`);
        if (pending.warning) Logger.warn('  ⚠ PENDING Warnung aktiv');
        if (pending.critical) Logger.error('  🔴 PENDING CRITICAL');
        
        const failed = checkFailedJobs();
        Logger.info(`FAILED Jobs: ${failed.totalFailed} total, ${failed.failedInLatest} im letzten Run`);
        if (failed.error) Logger.error('  🔴 FAILED ERROR');
        
        const trend = checkScoreTrend();
        Logger.info(`Score Trend: ${trend.trend} (${trend.change?.toFixed(4) || 'N/A'})`);
        if (trend.stagnation) Logger.warn('  ⚠ Score stagniert');
        
        const orchestrator = checkOrchestratorHealth();
        Logger.info(`Orchestrator: Letzter Run vor ${orchestrator.hoursSinceLastRun}h`);
        if (orchestrator.overdue) Logger.error('  🔴 Orchestrator überfällig');
    }
    
    // Report Generierung
    if (args.report) {
        Logger.info('\n--- Generiere Report ---');
        const report = generateHealthReport();
        Logger.info(`Overall Status: ${report.overall.status}`);
        if (report.overall.issues.length > 0) {
            report.overall.issues.forEach(issue => Logger.warn(`  Issue: ${issue}`));
        }
        
        // Dashboard generieren
        generateDashboard();
    }
    
    // Alerts senden
    if (args.alert) {
        Logger.info('\n--- Prüfe und Sende Alerts ---');
        const alerts = await runAlertChecks();
        Logger.info(`${alerts.length} Alerts ausgelöst`);
    }
    
    Logger.info('\n=== Monitoring abgeschlossen ===');
}

// Exporte für Module-Importe
export {
    CONFIG,
    ALERT_LEVEL,
    Logger,
    parseArgs,
    showHelp,
    getAllRuns,
    loadStatus,
    loadRunMetadata
};

// Starten wenn direkt ausgeführt
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        Logger.error(`Fatal error: ${err.message}`);
        process.exit(1);
    });
}
