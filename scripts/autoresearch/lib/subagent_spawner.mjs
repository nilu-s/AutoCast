/**
 * subagent_spawner.mjs - Phase 3.3
 * Sub-Agent Spawning Integration für OpenClaw (ES Modules)
 */

import fs from 'fs';
import path from 'path';

// Konfiguration
const CONFIG = {
  defaultTimeout: 10 * 60 * 1000, // 10 Minuten
  pollInterval: 2000,
  maxPollAttempts: 300
};

/**
 * Prüft ob OpenClaw sessions_spawn verfügbar ist
 * @returns {boolean}
 */
export function isSessionsSpawnAvailable() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.openclaw) {
      return true;
    }
    if (process.env.OPENCLAW_RUNTIME === 'true') {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Baut den Prompt für den Method Executor Sub-Agent
 * @param {object} jobConfig - Job Konfiguration
 * @returns {string} Der vollständige Prompt
 */
export function buildMethodExecutorPrompt(jobConfig) {
  const lines = [];
  
  lines.push('=== METHOD EXECUTOR SUB-AGENT TASK ===');
  lines.push('');
  lines.push('You are a Method Executor Sub-Agent for AutoCast AutoResearch.');
  lines.push('Your task is to evaluate ONE specific method and make a KEEP or REJECT decision.');
  lines.push('');
  lines.push('## STRICT WORKFLOW (MANDATORY)');
  lines.push('');
  lines.push('### BEFORE the Change:');
  lines.push(`1. Run: \`git stash push -m \"pre-${jobConfig.methodId}\"\``);
  lines.push('2. Run: `node scripts/evaluate_pipeline.js`');
  lines.push('3. Read objectiveScore from evaluate_output.txt');
  lines.push('4. Store baseline score');
  lines.push('');
  lines.push('### AFTER Implementing the Change:');
  lines.push(`5. Read the method brief from: ${jobConfig.promptFile}`);
  lines.push('6. Implement the method (code changes)');
  lines.push('7. Run: `npm run check` - MUST pass (115/115 tests)');
  lines.push('8. Run: `node scripts/evaluate_pipeline.js`');
  lines.push('9. Read new objectiveScore from evaluate_output.txt');
  lines.push('');
  lines.push('### DECISION:');
  lines.push('- objectiveScore > baselineScore: KEEP');
  lines.push('- objectiveScore <= baselineScore: REJECT');
  lines.push('');
  lines.push('### IF KEEP:');
  lines.push('- `git add .`');
  lines.push(`- \`git commit -m \"experiment: ${jobConfig.methodId} - improved objective score\"\``);
  lines.push(`- Write result JSON to: ${jobConfig.resultPath}`);
  lines.push('- Update STATUS.json to COMPLETED + KEEP');
  lines.push('');
  lines.push('### IF REJECT:');
  lines.push('- `git checkout -- .`');
  lines.push('- `git stash pop`');
  lines.push('- Write result JSON with decision: REJECT');
  lines.push('- Update STATUS.json to COMPLETED + REJECT');
  lines.push('');
  lines.push('### IF FAILED (tests fail or error):');
  lines.push('- `git checkout -- .`');
  lines.push('- `git stash pop`');
  lines.push('- Write result JSON with decision: FAILED');
  lines.push('- Update STATUS.json to FAILED');
  lines.push('');
  lines.push('## Job Configuration:');
  lines.push(`- Job ID: ${jobConfig.jobId}`);
  lines.push(`- Task Agent: ${jobConfig.taskAgent}`);
  lines.push(`- Method ID: ${jobConfig.methodId}`);
  lines.push(`- Method Title: ${jobConfig.methodTitle}`);
  lines.push(`- Run ID: ${jobConfig.runId}`);
  lines.push(`- Result Path: ${jobConfig.resultPath}`);
  lines.push(`- Working Directory: ${jobConfig.workdir}`);
  lines.push('');
  lines.push('## RESULT JSON FORMAT:');
  lines.push('```json');
  lines.push('{');
  lines.push('  "schemaVersion": "1.0.0",');
  lines.push(`  "methodId": "${jobConfig.methodId}",`);
  lines.push(`  "runId": "${jobConfig.runId}",`);
  lines.push('  "status": "completed",');
  lines.push('  "decision": "KEEP|REJECT|FAILED",');
  lines.push('  "timestamp": "ISO-8601",');
  lines.push('  "metrics": {');
  lines.push('    "before": { "objectiveScore": X.XXXX },');
  lines.push('    "after": { "objectiveScore": Y.YYYY }');
  lines.push('  },');
  lines.push('  "changedFiles": ["path/to/file"],');
  lines.push('  "git": { "commitHash": "abc123", "commitMessage": "..." },');
  lines.push('  "notes": "..."');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('=== START TASK ===');
  lines.push('Begin execution now.');
  
  return lines.join('\n');
}

/**
 * Spawnt einen Method Executor Sub-Agent
 * @param {object} jobConfig - Job Konfiguration
 * @returns {Promise<object>} Session Info
 */
export async function spawnMethodExecutor(jobConfig) {
  if (!isSessionsSpawnAvailable()) {
    // Fallback: Speichere Prompt in Datei
    const prompt = buildMethodExecutorPrompt(jobConfig);
    const fallbackDir = path.join(jobConfig.workdir, '.autocast', 'pending_tasks');
    
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    
    const taskFile = path.join(fallbackDir, `${jobConfig.methodId}_task.txt`);
    fs.writeFileSync(taskFile, prompt, 'utf8');
    
    return {
      fallback: true,
      taskFile: taskFile,
      message: 'OpenClaw not available. Task saved for manual execution.'
    };
  }
  
  // Hier würde echte sessions_spawn Logik stehen
  // Da wir in Node.js sind, simulieren wir dies
  throw new Error('sessions_spawn not available in Node.js context. Use fallback mode.');
}

/**
 * Wartet auf Sub-Agent Abschluss
 * @param {string} sessionKey - Session Key
 * @param {object} options - Optionen
 * @returns {Promise<object>} Ergebnis
 */
export async function waitForSubAgent(sessionKey, options = {}) {
  const timeout = options.timeout || CONFIG.defaultTimeout;
  const interval = options.pollInterval || CONFIG.pollInterval;
  const maxAttempts = options.maxPollAttempts || CONFIG.maxPollAttempts;
  
  // In echter Umgebung: Poll auf OpenClaw Status
  // Hier: Simuliere durch File-Watching
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const check = () => {
      attempts++;
      
      if (attempts > maxAttempts) {
        reject(new Error(`Timeout after ${timeout}ms`));
        return;
      }
      
      // Prüfe auf Ergebnis-Datei
      // In echter Implementierung: OpenClaw API Call
      setTimeout(check, interval);
    };
    
    check();
  });
}

/**
 * Holt Sub-Agent Ergebnis
 * @param {string} resultPath - Pfad zur Ergebnis-Datei
 * @returns {object|null} Ergebnis
 */
export function getSubAgentResult(resultPath) {
  try {
    if (!fs.existsSync(resultPath)) {
      return null;
    }
    const content = fs.readFileSync(resultPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading result: ${err.message}`);
    return null;
  }
}

export default {
  isSessionsSpawnAvailable,
  buildMethodExecutorPrompt,
  spawnMethodExecutor,
  waitForSubAgent,
  getSubAgentResult,
  CONFIG
};
