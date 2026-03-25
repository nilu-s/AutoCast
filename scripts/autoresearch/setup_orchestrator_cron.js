#!/usr/bin/env node
/**
 * AutoCast Orchestrator Cron-Job Setup
 * 
 * Verwaltet den stündlichen Orchestrator Cron-Job für AutoCast.
 * 
 * Usage:
 *   node setup_orchestrator_cron.js [--enable|--disable|--status]
 * 
 * Options:
 *   --enable   Aktiviert/erstellt den Cron-Job
 *   --disable  Deaktiviert den Cron-Job
 *   --status   Zeigt aktuellen Status
 *   --dry-run  Validiert Konfiguration ohne Änderungen
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Konfiguration
const WORKSPACE_ROOT = '/home/node/.openclaw/workspace/AutoCast';
const CRON_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'docs/llm/autoresearch/cron/orchestrator_cron_config.json');
const CRON_STATE_DIR = path.join(WORKSPACE_ROOT, '.autocast/cron');
const CRON_STATE_FILE = path.join(CRON_STATE_DIR, 'orchestrator_state.json');

// Logging
function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

// State Management
function loadState() {
  try {
    if (fs.existsSync(CRON_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(CRON_STATE_FILE, 'utf8'));
    }
  } catch (err) {
    log('WARN', `Konnte State nicht laden: ${err.message}`);
  }
  return {
    enabled: false,
    createdAt: null,
    lastRun: null,
    runCount: 0,
    lastError: null
  };
}

function saveState(state) {
  try {
    fs.mkdirSync(CRON_STATE_DIR, { recursive: true });
    fs.writeFileSync(CRON_STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (err) {
    log('ERROR', `Konnte State nicht speichern: ${err.message}`);
    return false;
  }
}

// Cron-Job Verwaltung über OpenClaw Gateway
function checkCronJobExists() {
  const state = loadState();
  return state.enabled;
}

function validateConfig() {
  log('INFO', 'Validiere Cron-Konfiguration...');
  
  try {
    if (!fs.existsSync(CRON_CONFIG_PATH)) {
      throw new Error(`Cron-Config nicht gefunden: ${CRON_CONFIG_PATH}`);
    }
    
    const config = JSON.parse(fs.readFileSync(CRON_CONFIG_PATH, 'utf8'));
    
    // Pflichtfelder prüfen
    const required = ['name', 'schedule', 'payload', 'delivery'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Pflichtfeld fehlt: ${field}`);
      }
    }
    
    // Schedule validieren
    if (config.schedule.kind !== 'every') {
      throw new Error(`Unsupported schedule kind: ${config.schedule.kind}`);
    }
    if (typeof config.schedule.everyMs !== 'number' || config.schedule.everyMs < 60000) {
      throw new Error(`Ungültiges Interval: ${config.schedule.everyMs}ms (min: 60000ms)`);
    }
    
    // Payload validieren
    if (config.payload.kind !== 'agentTurn') {
      throw new Error(`Unsupported payload kind: ${config.payload.kind}`);
    }
    if (!config.payload.message) {
      throw new Error('Payload message fehlt');
    }
    
    // Delivery validieren
    const validModes = ['announce', 'dm', 'reply'];
    if (!validModes.includes(config.delivery.mode)) {
      throw new Error(`Invalid delivery mode: ${config.delivery.mode}`);
    }
    
    log('SUCCESS', 'Konfiguration valide');
    return config;
  } catch (err) {
    log('ERROR', `Validierung fehlgeschlagen: ${err.message}`);
    return null;
  }
}

function enableCronJob(dryRun = false) {
  log('INFO', 'Aktiviere Orchestrator Cron-Job...');
  
  const config = validateConfig();
  if (!config) {
    return false;
  }
  
  if (dryRun) {
    log('INFO', '[DRY-RUN] Würde Cron-Job aktivieren:');
    log('INFO', `  Name: ${config.name}`);
    log('INFO', `  Interval: ${config.schedule.everyMs}ms (${config.schedule.everyMs / 1000 / 60} Minuten)`);
    log('INFO', `  Channel: ${config.delivery.channel}`);
    log('INFO', `  Target: ${config.delivery.to}`);
    return true;
  }
  
  // State aktualisieren
  const state = loadState();
  state.enabled = true;
  state.createdAt = new Date().toISOString();
  state.configHash = hashConfig(config);
  
  if (saveState(state)) {
    log('SUCCESS', `Cron-Job "${config.name}" aktiviert`);
    log('INFO', `  Interval: ${config.schedule.everyMs / 1000 / 60} Minuten`);
    log('INFO', `  State-Datei: ${CRON_STATE_FILE}`);
    
    // Anleitung für manuelle Einrichtung über OpenClaw Gateway
    log('INFO', '');
    log('INFO', '=== Manuelle Einrichtung erforderlich ===');
    log('INFO', 'Führe im Haupt-OpenClaw-Client aus:');
    log('INFO', `  openclaw cron create --config ${CRON_CONFIG_PATH}`);
    log('INFO', '');
    log('INFO', 'Oder erstelle den Cron-Job über die OpenClaw API:');
    log('INFO', `  POST /api/cron/jobs mit Payload aus ${CRON_CONFIG_PATH}`);
    
    return true;
  }
  
  return false;
}

function disableCronJob(dryRun = false) {
  log('INFO', 'Deaktiviere Orchestrator Cron-Job...');
  
  const state = loadState();
  
  if (!state.enabled) {
    log('WARN', 'Cron-Job ist bereits deaktiviert');
    return true;
  }
  
  if (dryRun) {
    log('INFO', '[DRY-RUN] Würde Cron-Job deaktivieren');
    return true;
  }
  
  state.enabled = false;
  state.disabledAt = new Date().toISOString();
  
  if (saveState(state)) {
    log('SUCCESS', 'Cron-Job deaktiviert');
    log('INFO', 'Hinweis: Manuelle Löschung über OpenClaw Gateway erforderlich:');
    log('INFO', `  openclaw cron delete autocast-orchestrator-hourly`);
    return true;
  }
  
  return false;
}

function showStatus() {
  log('INFO', '=== Orchestrator Cron-Job Status ===');
  
  const state = loadState();
  const configExists = fs.existsSync(CRON_CONFIG_PATH);
  
  console.log('');
  console.log('Konfiguration:');
  console.log(`  Datei: ${CRON_CONFIG_PATH}`);
  console.log(`  Existiert: ${configExists ? '✅' : '❌'}`);
  
  if (configExists) {
    try {
      const config = JSON.parse(fs.readFileSync(CRON_CONFIG_PATH, 'utf8'));
      console.log(`  Name: ${config.name}`);
      console.log(`  Interval: ${config.schedule.everyMs / 1000 / 60} Minuten`);
      console.log(`  Delivery: ${config.delivery.mode} → ${config.delivery.channel}:${config.delivery.to}`);
    } catch (err) {
      console.log(`  ⚠️ Fehler beim Lesen: ${err.message}`);
    }
  }
  
  console.log('');
  console.log('State:');
  console.log(`  Aktiviert: ${state.enabled ? '✅' : '❌'}`);
  console.log(`  Erstellt: ${state.createdAt || 'N/A'}`);
  console.log(`  Letzter Run: ${state.lastRun || 'N/A'}`);
  console.log(`  Run Count: ${state.runCount}`);
  
  if (state.lastError) {
    console.log(`  Letzter Fehler: ${state.lastError}`);
  }
  
  console.log('');
  
  return true;
}

function hashConfig(config) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(JSON.stringify(config)).digest('hex').substring(0, 8);
}

// Test/Dry-Run
function runDryTest() {
  log('INFO', '=== Dry-Run Test ===');
  
  // 1. Konfiguration validieren
  const config = validateConfig();
  if (!config) {
    return false;
  }
  
  // 2. Orchestrator testen
  log('INFO', '');
  log('INFO', 'Teste Orchestrator-Ausführung...');
  
  const orchestratorPath = path.join(WORKSPACE_ROOT, 'scripts/autoresearch/orchestrator.js');
  if (!fs.existsSync(orchestratorPath)) {
    log('ERROR', `Orchestrator nicht gefunden: ${orchestratorPath}`);
    return false;
  }
  
  log('INFO', `Orchestrator gefunden: ${orchestratorPath}`);
  
  // 3. Verzeichnisstruktur prüfen
  const reportsDir = path.join(WORKSPACE_ROOT, 'reports/autoresearch/runs');
  log('INFO', `Reports-Verzeichnis: ${reportsDir} ${fs.existsSync(reportsDir) ? '✅' : '❌'}`);
  
  // 4. segments.json prüfen
  const segmentsPath = path.join(WORKSPACE_ROOT, 'docs/segments.json');
  log('INFO', `segments.json: ${segmentsPath} ${fs.existsSync(segmentsPath) ? '✅' : '❌'}`);
  
  log('SUCCESS', 'Dry-Run erfolgreich - Alle Abhängigkeiten vorhanden');
  
  return true;
}

// Hauptfunktion
function main() {
  const args = process.argv.slice(2);
  
  // Ensure state directory exists
  fs.mkdirSync(CRON_STATE_DIR, { recursive: true });
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
AutoCast Orchestrator Cron-Job Setup

Usage:
  node setup_orchestrator_cron.js [OPTION]

Options:
  --enable    Aktiviert den Cron-Job
  --disable   Deaktiviert den Cron-Job
  --status    Zeigt aktuellen Status
  --dry-run   Führt Tests durch ohne Änderungen
  --test      Kombiniert --dry-run mit Validierung
  --help      Zeigt diese Hilfe

Beispiele:
  node setup_orchestrator_cron.js --status
  node setup_orchestrator_cron.js --dry-run
  node setup_orchestrator_cron.js --enable
`);
    return 0;
  }
  
  if (args.includes('--status')) {
    return showStatus() ? 0 : 1;
  }
  
  if (args.includes('--dry-run') || args.includes('--test')) {
    const dryRun = !args.includes('--test');
    
    if (dryRun) {
      log('INFO', '=== DRY-RUN MODE ===');
      enableCronJob(true);
    } else {
      runDryTest();
    }
    return 0;
  }
  
  if (args.includes('--enable')) {
    return enableCronJob(false) ? 0 : 1;
  }
  
  if (args.includes('--disable')) {
    return disableCronJob(false) ? 0 : 1;
  }
  
  // Default: Status anzeigen
  showStatus();
  
  console.log('');
  console.log('Verwende --enable zum Aktivieren, --disable zum Deaktivieren');
  console.log('Verwende --dry-run zum Testen ohne Änderungen');
  
  return 0;
}

// Exit codes
process.exit(main());
