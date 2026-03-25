#!/usr/bin/env node
/**
 * setup_monitor_cron.js - Setup für Monitoring Cron-Job
 * 
 * Usage:
 *   node setup_monitor_cron.js [--enable|--disable|--status]
 * 
 * @version 5.3.0
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKSPACE_ROOT = '/home/node/.openclaw/workspace/AutoCast';
const CRON_STATE_DIR = resolve(WORKSPACE_ROOT, '.autocast/cron');
const CRON_STATE_FILE = resolve(CRON_STATE_DIR, 'monitor_state.json');
const CRON_CONFIG_PATH = resolve(WORKSPACE_ROOT, 'docs/llm/autoresearch/cron/monitor_cron_config.json');

// Logging
function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'SUCCESS' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

// State Management
function loadState() {
  try {
    if (existsSync(CRON_STATE_FILE)) {
      return JSON.parse(readFileSync(CRON_STATE_FILE, 'utf8'));
    }
  } catch (err) {
    log('WARN', `Konnte State nicht laden: ${err.message}`);
  }
  return {
    enabled: false,
    createdAt: null,
    lastRun: null,
    alertCount: 0
  };
}

function saveState(state) {
  try {
    mkdirSync(CRON_STATE_DIR, { recursive: true });
    writeFileSync(CRON_STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (err) {
    log('ERROR', `Konnte State nicht speichern: ${err.message}`);
    return false;
  }
}

// Cron-Config erstellen
function createCronConfig() {
  const config = {
    name: 'autocast-monitor',
    description: 'AutoCast Monitoring - Prüft alle 30 Minuten auf WARN/ERROR',
    schedule: {
      type: 'interval',
      minutes: 30
    },
    payload: {
      type: 'subagent',
      label: 'autocast-monitoring-check',
      instructions: 'cd /home/node/.openclaw/workspace/AutoCast && node scripts/autoresearch/monitor.js --alert 2>&1'
    },
    delivery: {
      target: 'telegram',
      channel: process.env.TELEGRAM_CHAT_ID || 'default'
    },
    options: {
      enabled: true,
      timeoutMinutes: 5,
      retryPolicy: {
        maxRetries: 2,
        retryDelayMinutes: 1
      }
    }
  };
  
  try {
    const cronDir = dirname(CRON_CONFIG_PATH);
    if (!existsSync(cronDir)) {
      mkdirSync(cronDir, { recursive: true });
    }
    writeFileSync(CRON_CONFIG_PATH, JSON.stringify(config, null, 2));
    log('SUCCESS', `Cron-Config erstellt: ${CRON_CONFIG_PATH}`);
    return true;
  } catch (err) {
    log('ERROR', `Fehler beim Erstellen der Config: ${err.message}`);
    return false;
  }
}

// Cron-Job Status prüfen
function checkCronStatus() {
  const state = loadState();
  
  log('INFO', '\n📊 Monitoring Cron-Job Status:');
  log('INFO', `  Status: ${state.enabled ? '✅ AKTIV' : '❌ INAKTIV'}`);
  log('INFO', `  Erstellt: ${state.createdAt || 'N/A'}`);
  log('INFO', `  Letzter Run: ${state.lastRun || 'N/A'}`);
  log('INFO', `  Alerts gesendet: ${state.alertCount || 0}`);
  
  if (existsSync(CRON_CONFIG_PATH)) {
    log('INFO', `  Config: ${CRON_CONFIG_PATH}`);
  } else {
    log('WARN', '  Config: Nicht vorhanden');
  }
}

// Manuelle Cron-Config für crontab
function getCrontabLine() {
  // Alle 30 Minuten: Prüfe auf Alerts
  return `# AutoCast Monitoring - alle 30 Minuten Alerts prüfen
*/30 * * * * cd ${WORKSPACE_ROOT} && node scripts/autoresearch/monitor.js --alert >> /tmp/autocast_monitor.log 2>&1`;
}

// Hauptfunktion
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  log('INFO', '=== AutoCast Monitoring Cron Setup ===\n');
  
  switch (command) {
    case '--enable':
      log('INFO', 'Aktiviere Monitoring Cron-Job...');
      
      // Erstelle Config
      createCronConfig();
      
      // Update State
      const state = loadState();
      state.enabled = true;
      state.createdAt = new Date().toISOString();
      saveState(state);
      
      log('SUCCESS', 'Monitoring Cron-Job aktiviert');
      log('INFO', '\nFüge folgende Zeile zu crontab hinzu:');
      log('INFO', getCrontabLine());
      log('INFO', '\nOder führe aus: crontab -e');
      break;
      
    case '--disable':
      log('INFO', 'Deaktiviere Monitoring Cron-Job...');
      
      const disableState = loadState();
      disableState.enabled = false;
      saveState(disableState);
      
      log('SUCCESS', 'Monitoring Cron-Job deaktiviert');
      log('INFO', '\nEntferne die Zeile aus crontab:');
      log('INFO', getCrontabLine().split('\n')[1]);
      break;
      
    case '--status':
      checkCronStatus();
      break;
      
    case '--crontab':
      log('INFO', 'Zeige crontab-Eintrag:');
      console.log('\n' + getCrontabLine() + '\n');
      break;
      
    default:
      log('INFO', 'Usage: node setup_monitor_cron.js [--enable|--disable|--status|--crontab]');
      log('INFO', '');
      log('INFO', 'Optionen:');
      log('INFO', '  --enable    Aktiviert den Monitoring Cron-Job');
      log('INFO', '  --disable   Deaktiviert den Monitoring Cron-Job');
      log('INFO', '  --status    Zeigt aktuellen Status');
      log('INFO', '  --crontab   Zeigt crontab-Zeile zum manuellen Eintrag');
      break;
  }
}

main();
