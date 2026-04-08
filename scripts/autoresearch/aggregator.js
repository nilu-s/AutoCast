#!/usr/bin/env node
/**
 * aggregator.js - Phase 3.4: Aggregation & Reporting
 * Aggregiert alle Ergebnisse eines AutoResearch Runs und generiert CYCLE_REPORT.md
 * 
 * CLI-Usage:
 *   node aggregator.js --runDir <path/to/run>
 *   node aggregator.js --runDir <path> --baseline <score>
 * 
 * @version 3.4.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
║           AutoCast Research Aggregator                             ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Verwendung:                                                       ║
║    node aggregator.js [Optionen]                                   ║
║                                                                    ║
║  Optionen:                                                         ║
║    --runDir <path>      Pfad zum Run-Verzeichnis (z.B. runs/...) ║
║    --baseline <score>   Optional: Baseline Score (Default: 0)    ║
║    --output <path>      Optional: Output Pfad für Report         ║
║    --json               Optional: Zusätzlich JSON-Output         ║
║    --help, -h           Hilfe anzeigen                           ║
║                                                                    ║
║  Beispiel:                                                         ║
║    node aggregator.js \\\n║      --runDir reports/autoresearch/runs/20260325_021955 \\\n║      --baseline 0.2670                                             ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Lädt die STATUS.json eines Runs
 * @param {string} runDir - Pfad zum Run-Verzeichnis
 * @returns {object|null} Status-Objekt oder null
 */
export function loadStatus(runDir) {
    const statusPath = join(runDir, 'STATUS.json');
    
    if (!existsSync(statusPath)) {
        console.error(`❌ STATUS.json nicht gefunden: ${statusPath}`);
        return null;
    }
    
    try {
        const content = readFileSync(statusPath, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`❌ Fehler beim Laden von STATUS.json: ${err.message}`);
        return null;
    }
}

/**
 * Extrahiert Metriken aus einem Method-Result-Objekt
 * @param {object} result - Result-Objekt aus STATUS.json
 * @returns {object} Extrahierte Metriken
 */
export function extractMetrics(result) {
    if (!result) {
        return {
            objectiveScore: null,
            speechRecall: null,
            reviewRecall: null,
            ignoreRecall: null,
            durationGoodOrNearRatio: null
        };
    }
    
    return {
        objectiveScore: result.objectiveScore ?? result.metrics?.objectiveScore ?? null,
        speechRecall: result.speechRecall ?? result.metrics?.speechRecall ?? null,
        reviewRecall: result.reviewRecall ?? result.metrics?.reviewRecall ?? null,
        ignoreRecall: result.ignoreRecall ?? result.metrics?.ignoreRecall ?? null,
        durationGoodOrNearRatio: result.durationGoodOrNearRatio ?? result.metrics?.durationGoodOrNearRatio ?? null,
        decision: result.decision ?? null,
        improvement: result.improvement ?? null
    };
}

/**
 * Aggregiert alle Ergebnisse eines Runs
 * @param {string} runDir - Pfad zum Run-Verzeichnis
 * @returns {object|null} Aggregierte Ergebnisse
 */
export function aggregateRun(runDir) {
    const status = loadStatus(runDir);
    
    if (!status) {
        return null;
    }
    
    const runId = basename(runDir);
    const jobs = status.jobs || {};
    const jobEntries = Object.entries(jobs);
    
    // Zähle verschiedene Status
    const summary = {
        totalJobs: jobEntries.length,
        keepCount: 0,
        rejectCount: 0,
        failedCount: 0,
        pendingCount: 0,
        runningCount: 0,
        unknownCount: 0
    };
    
    // Sammle Job-Details
    const jobDetails = jobEntries.map(([jobId, job], index) => {
        const metrics = extractMetrics(job.result);
        
        // Zähle nach Entscheidung
        const decision = job.result?.decision || job.status;
        if (decision === 'KEEP') summary.keepCount++;
        else if (decision === 'REJECT') summary.rejectCount++;
        else if (decision === 'FAILED' || job.status === 'FAILED') summary.failedCount++;
        else if (job.status === 'PENDING') summary.pendingCount++;
        else if (job.status === 'RUNNING') summary.runningCount++;
        else summary.unknownCount++;
        
        return {
            index: index + 1,
            jobId,
            methodId: job.methodId,
            methodTitle: job.methodTitle,
            taskAgent: job.taskAgent,
            status: job.status,
            decision: decision,
            before: job.result?.before ?? metrics.objectiveScore ?? 'N/A',
            after: job.result?.after ?? metrics.objectiveScore ?? 'N/A',
            metrics,
            error: job.error,
            createdAt: job.createdAt,
            completedAt: job.completedAt
        };
    });
    
    // Extrahiere Score-Verlauf
    const scoreHistory = getScoreHistory(jobDetails);
    
    return {
        runId,
        timestamp: status.updatedAt || new Date().toISOString(),
        schemaVersion: status.schemaVersion,
        summary,
        jobs: jobDetails,
        scoreHistory,
        status: {
            overallStatus: determineOverallStatus(jobDetails),
            completedAt: new Date().toISOString()
        }
    };
}

/**
 * Extrahiert den Score-Verlauf aus Job-Ergebnissen
 * @param {array} jobs - Liste der Job-Details
 * @returns {array} Score-Verlauf
 */
export function getScoreHistory(jobs) {
    const history = [];
    let currentScore = null;
    
    for (const job of jobs) {
        const before = parseFloat(job.before);
        const after = parseFloat(job.after);
        
        // Initialer Score
        if (currentScore === null && !isNaN(before)) {
            currentScore = before;
            history.push({
                step: 'baseline',
                methodId: 'initial',
                score: before
            });
        }
        
        // Nach dem Job
        if (!isNaN(after)) {
            currentScore = after;
            history.push({
                step: job.methodId,
                methodId: job.methodId,
                decision: job.decision,
                score: after,
                change: !isNaN(before) ? after - before : null
            });
        }
    }
    
    return history;
}

/**
 * Bestimmt den Gesamt-Status eines Runs
 * @param {array} jobs - Liste der Job-Details
 * @returns {string} Gesamt-Status
 */
function determineOverallStatus(jobs) {
    const hasPending = jobs.some(j => j.status === 'PENDING');
    const hasRunning = jobs.some(j => j.status === 'RUNNING');
    const hasFailed = jobs.some(j => j.status === 'FAILED');
    
    if (hasPending) return 'PENDING';
    if (hasRunning) return 'RUNNING';
    if (hasFailed) return 'COMPLETED_WITH_ERRORS';
    return 'COMPLETED';
}

/**
 * Berechnet die Verbesserung
 * @param {number} baseline - Baseline-Score
 * @param {number} final - Finaler Score
 * @returns {string} Formatierte Verbesserung
 */
export function calculateImprovement(baseline, final) {
    if (baseline === null || final === null || isNaN(baseline) || isNaN(final)) {
        return 'N/A';
    }
    
    const improvement = ((final - baseline) / Math.abs(baseline)) * 100;
    const sign = improvement >= 0 ? '+' : '';
    return `${sign}${improvement.toFixed(2)}`;
}

/**
 * Generiert den CYCLE_REPORT.md Content
 * @param {object} results - Aggregierte Ergebnisse
 * @param {number} baselineScore - Optionaler Baseline-Score
 * @returns {string} Markdown-Content
 */
export function generateCycleReport(results, baselineScore = null) {
    const { runId, timestamp, summary, jobs, scoreHistory } = results;
    
    // Bestimme Scores
    const firstJob = jobs[0];
    const lastCompletedJob = [...jobs].reverse().find(j => j.decision === 'KEEP' || j.decision === 'REJECT');
    
    const baseline = baselineScore !== null ? baselineScore : 
                     (firstJob ? parseFloat(firstJob.before) : null);
    const final = lastCompletedJob ? parseFloat(lastCompletedJob.after) : 
                  (scoreHistory.length > 0 ? scoreHistory[scoreHistory.length - 1].score : null);
    
    const baselineStr = baseline !== null && !isNaN(baseline) ? baseline.toFixed(4) : 'N/A';
    const finalStr = final !== null && !isNaN(final) ? final.toFixed(4) : 'N/A';
    const improvement = calculateImprovement(baseline, final);
    
    // Formatierter Timestamp
    const formattedDate = new Date(timestamp).toLocaleString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Score History als Text
    const scoreHistoryText = scoreHistory.length > 0
        ? scoreHistory.map(h => {
            const scoreStr = typeof h.score === 'number' ? h.score.toFixed(4) : h.score;
            const changeStr = h.change !== null && h.change !== undefined 
                ? ` (${h.change >= 0 ? '+' : ''}${h.change.toFixed(4)})` 
                : '';
            return `- ${h.step}: ${scoreStr}${changeStr}`;
        }).join('\n')
        : 'Keine Score-Historie verfügbar';
    
    // Job Details
    const jobDetailsText = jobs.map(job => {
        const beforeStr = job.before !== 'N/A' && typeof job.before === 'number' ? job.before.toFixed(4) : job.before;
        const afterStr = job.after !== 'N/A' && typeof job.after === 'number' ? job.after.toFixed(4) : job.after;
        const decisionEmoji = job.decision === 'KEEP' ? '✅' : 
                             job.decision === 'REJECT' ? '❌' : 
                             job.status === 'FAILED' ? '💥' : '⏳';
        
        return `### Job ${job.index}: ${job.methodId}
- **Task Agent:** ${job.taskAgent}
- **Decision:** ${decisionEmoji} ${job.decision || job.status}
- **Score:** ${beforeStr} → ${afterStr}
- **Duration:** ${job.createdAt && job.completedAt ? formatDuration(job.createdAt, job.completedAt) : 'N/A'}
${job.error ? `- **Error:** \`${job.error}\`` : ''}`;
    }).join('\n\n');
    
    return `# AutoCast AutoResearch Cycle Report

## Run Metadata
- **Run ID:** ${runId}
- **Timestamp:** ${formattedDate}
- **Baseline Score:** ${baselineStr}
- **Final Score:** ${finalStr}
- **Improvement:** ${improvement}%
- **Overall Status:** ${results.status.overallStatus}

## Summary
| Metric | Count |
|--------|-------|
| Total Jobs | ${summary.totalJobs} |
| ✅ KEEP | ${summary.keepCount} |
| ❌ REJECT | ${summary.rejectCount} |
| 💥 FAILED | ${summary.failedCount} |
| ⏳ PENDING | ${summary.pendingCount} |
| 🔄 RUNNING | ${summary.runningCount} |

## Job Details

${jobDetailsText}

## Score History

${scoreHistoryText}

## Method Performance

| Method | Decision | Score Change | Impact |
|--------|----------|--------------|--------|
${jobs.filter(j => j.decision === 'KEEP' || j.decision === 'REJECT').map(job => {
    const before = parseFloat(job.before);
    const after = parseFloat(job.after);
    const change = !isNaN(before) && !isNaN(after) ? after - before : null;
    const impact = change !== null ? (change > 0 ? '📈 +' : '📉 ') + change.toFixed(4) : 'N/A';
    return `| ${job.methodId} | ${job.decision} | ${change !== null ? (change >= 0 ? '+' : '') + change.toFixed(4) : 'N/A'} | ${impact} |`;
}).join('\n')}

---

*Generated by AutoCast Aggregator v3.4.0*
`;
}

/**
 * Formatiert die Dauer zwischen zwei Timestamps
 * @param {string} start - Start-Zeit
 * @param {string} end - End-Zeit
 * @returns {string} Formatierte Dauer
 */
function formatDuration(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate - startDate;
    
    if (isNaN(diffMs)) return 'N/A';
    
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

/**
 * Aktualisiert die STATUS.json mit der Zusammenfassung
 * @param {string} runDir - Pfad zum Run-Verzeichnis
 * @param {object} summary - Zusammenfassungsobjekt
 * @param {object} options - Zusätzliche Optionen
 * @returns {boolean} Erfolg
 */
export function updateStatusWithSummary(runDir, summary, options = {}) {
    const statusPath = join(runDir, 'STATUS.json');
    
    if (!existsSync(statusPath)) {
        console.error(`❌ STATUS.json nicht gefunden: ${statusPath}`);
        return false;
    }
    
    try {
        const content = readFileSync(statusPath, 'utf-8');
        const status = JSON.parse(content);
        
        // Füge Summary hinzu
        status.summary = {
            ...summary,
            generatedAt: new Date().toISOString(),
            ...options
        };
        
        // Update overallStatus
        status.overallStatus = options.overallStatus || 'COMPLETED';
        status.updatedAt = new Date().toISOString();
        
        // Speichere finalen Objective Score
        if (options.finalObjectiveScore !== undefined) {
            status.finalObjectiveScore = options.finalObjectiveScore;
        }
        
        writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf-8');
        console.log(`✅ STATUS.json aktualisiert: ${statusPath}`);
        return true;
    } catch (err) {
        console.error(`❌ Fehler beim Aktualisieren von STATUS.json: ${err.message}`);
        return false;
    }
}

/**
 * Speichert aggregierte Ergebnisse als JSON
 * @param {string} runDir - Pfad zum Run-Verzeichnis
 * @param {object} results - Aggregierte Ergebnisse
 * @returns {boolean} Erfolg
 */
export function saveResultsAsJson(runDir, results) {
    const outputPath = join(runDir, 'aggregation_result.json');
    
    try {
        writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
        console.log(`✅ Aggregation JSON gespeichert: ${outputPath}`);
        return true;
    } catch (err) {
        console.error(`❌ Fehler beim Speichern der JSON: ${err.message}`);
        return false;
    }
}

/**
 * Hauptfunktion
 * @param {string[]} args - Prozess-Argumente
 * @returns {Promise<number>} Exit-Code
 */
export async function main(args) {
    const parsed = parseArgs(args);
    
    if (parsed.help) {
        showHelp();
        return 0;
    }
    
    if (!parsed.runDir) {
        console.error('❌ Fehler: --runDir ist erforderlich');
        showHelp();
        return 1;
    }
    
    const runDir = resolve(parsed.runDir);
    
    if (!existsSync(runDir)) {
        console.error(`❌ Run-Verzeichnis nicht gefunden: ${runDir}`);
        return 1;
    }
    
    console.log(`📊 Aggregiere Run: ${runDir}\n`);
    
    // Aggregiere Ergebnisse
    const results = aggregateRun(runDir);
    
    if (!results) {
        console.error('❌ Aggregation fehlgeschlagen');
        return 1;
    }
    
    // Parse Baseline
    const baselineScore = parsed.baseline !== undefined ? parseFloat(parsed.baseline) : null;
    
    // Generiere Report
    const reportContent = generateCycleReport(results, baselineScore);
    const reportPath = parsed.output ? resolve(parsed.output) : join(runDir, 'CYCLE_REPORT.md');
    
    try {
        writeFileSync(reportPath, reportContent, 'utf-8');
        console.log(`✅ CYCLE_REPORT.md erstellt: ${reportPath}`);
    } catch (err) {
        console.error(`❌ Fehler beim Erstellen des Reports: ${err.message}`);
        return 1;
    }
    
    // Optional: JSON-Output
    if (parsed.json) {
        saveResultsAsJson(runDir, results);
    }
    
    // Update STATUS.json
    const finalScore = results.scoreHistory.length > 0 ? 
        results.scoreHistory[results.scoreHistory.length - 1].score : null;
    
    updateStatusWithSummary(runDir, results.summary, {
        overallStatus: results.status.overallStatus,
        finalObjectiveScore: finalScore,
        runId: results.runId,
        reportPath: reportPath
    });
    
    // Zusammenfassung anzeigen
    console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`║                    Aggregation Complete                          ║`);
    console.log(`╠══════════════════════════════════════════════════════════════════╣`);
    console.log(`║  Total Jobs:     ${String(results.summary.totalJobs).padEnd(47)} ║`);
    console.log(`║  ✅ KEEP:         ${String(results.summary.keepCount).padEnd(47)} ║`);
    console.log(`║  ❌ REJECT:       ${String(results.summary.rejectCount).padEnd(47)} ║`);
    console.log(`║  💥 FAILED:       ${String(results.summary.failedCount).padEnd(47)} ║`);
    console.log(`║  Final Status:    ${String(results.status.overallStatus).padEnd(47)} ║`);
    if (finalScore !== null) {
        console.log(`║  Final Score:     ${String(finalScore.toFixed(4)).padEnd(47)} ║`);
    }
    console.log(`╚══════════════════════════════════════════════════════════════════╝`);
    
    return 0;
}

// CLI-Execution
if (import.meta.url === `file://${process.argv[1]}`) {
    main(process.argv.slice(2)).then(code => process.exit(code));
}