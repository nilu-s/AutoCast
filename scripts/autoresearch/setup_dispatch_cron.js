#!/usr/bin/env node
/**
 * setup_dispatch_cron.js - Phase 4.2: Dispatch Cron Setup
 * Verwaltet den Dispatch Processor Cron-Job
 * 
 * CLI-Usage:
 *   node setup_dispatch_cron.js [--enable|--disable|--status]
 *   node setup_dispatch_cron.js --help
 * 
 * @version 4.2.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Konfiguration
const CONFIG = {
    BASE_DIR: resolve(__dirname, '../..'),
    CRON_CONFIG_PATH: resolve(__dirname, '../../docs/llm/autoresearch/cron/dispatch_cron_config.json'),
    ORCHESTRATOR_CRON_CONFIG: resolve(__dirname, '../../docs/llm/autoresearch/cron/orchestrator_cron_config.json'),
    CRON_STATE_DIR: resolve(__dirname, '../../.cron'),
    CRON_MARKER_FILE: resolve(__dirname, '../../.cron/dispatch_enabled'),
    DISPATCH_PROCESSOR: resolve(__dirname, '../autoresearch/dispatch_processor.js'),
    POLL_INTERVAL_MS: 900000  // 15 Minuten
};

/**
 * Logger mit einheitlichem Format
 */
class Logger {
    static info(msg) { console.log(`[INFO] ${msg}`); }
    static step(msg) { console.log(`[STEP] ${msg}`); }
    static done(msg) { console.log(`[DONE] ${msg}`); }
    static error(msg) { console.error(`[ERROR] ${msg}`); }
    static succ(msg) { console.log(`[SUCC] ${msg}`); }
    static warn(msg) { console.warn(`[WARN] ${msg}`); }
    static dryRun(msg) { console.log(`[DRY-RUN] ${msg}`); }
}

/**
 * Zeigt Hilfe an
 */
function showHelp() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║        AutoCast Dispatch Cron Setup - Phase 4.2                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Verwaltet den Dispatch Processor Cron-Job (15 Minuten Intervall)║
║                                                                  ║
║  Verwendung:                                                     ║
║    node setup_dispatch_cron.js [Optionen]                          ║
║                                                                  ║
║  Optionen:                                                       ║
║    --enable     Aktiviere Dispatch Cron                          ║
║    --disable    Deaktiviere Dispatch Cron                        ║
║    --status     Zeige aktuellen Status                           ║
║    --dry-run    Simuliere ohne Änderungen                        ║
║    --help, -h   Hilfe anzeigen                                   ║
║                                                                  ║
║  Beispiel:                                                       ║
║    node setup_dispatch_cron.js --status                          ║
║    node setup_dispatch_cron.js --enable                          ║
║    node setup_dispatch_cron.js --disable --dry-run                 ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Parsed Kommandozeilen-Argumente
 */
function parseArgs(args) {
    const result = {};
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--enable') {
            result.enable = true;
        } else if (arg === '--disable') {
            result.disable = true;
        } else if (arg === '--status') {
            result.status = true;
        } else if (arg === '--dry-run') {
            result.dryRun = true;
        }
    }
    
    return result;
}

/**
 * Lädt und validiert die Cron-Konfiguration
 */
function loadCronConfig(path) {
    try {
        const content = readFileSync(path, 'utf-8');
        const config = JSON.parse(content);
        
        // Validiere minimale Struktur
        if (!config.name || !config.schedule || !config.payload) {
            Logger.error(`Ungültige Cron-Konfiguration: ${path}`);
            return null;
        }
        
        return config;
    } catch (err) {
        Logger.error(`Fehler beim Laden der Cron-Konfiguration: ${err.message}`);
        return null;
    }
}

/**
 * Erstellt das Cron-State-Verzeichnis
 */
function ensureCronStateDir(dryRun = false) {
    if (dryRun) {
        Logger.dryRun(`Würde Verzeichnis erstellen: ${CONFIG.CRON_STATE_DIR}`);
        return;
    }
    
    if (!existsSync(CONFIG.CRON_STATE_DIR)) {
        mkdirSync(CONFIG.CRON_STATE_DIR, { recursive: true });
        Logger.info(`Cron-State-Verzeichnis erstellt: ${CONFIG.CRON_STATE_DIR}`);
    }
}

/**
 * Prüft den aktuellen Cron-Status
 */
function checkCronStatus() {
    const dispatchConfig = loadCronConfig(CONFIG.CRON_CONFIG_PATH);
    const orchestratorConfig = loadCronConfig(CONFIG.ORCHESTRATOR_CRON_CONFIG);
    
    const status = {
        dispatch: {
            configExists: existsSync(CONFIG.CRON_CONFIG_PATH),
            configValid: dispatchConfig !== null,
            name: dispatchConfig?.name || 'N/A',
            schedule: dispatchConfig?.schedule || null,
            enabled: existsSync(CONFIG.CRON_MARKER_FILE)
        },
        orchestrator: {
            configExists: existsSync(CONFIG.ORCHESTRATOR_CRON_CONFIG),
            configValid: orchestratorConfig !== null,
            name: orchestratorConfig?.name || 'N/A'
        },
        dispatchProcessor: {
            exists: existsSync(CONFIG.DISPATCH_PROCESSOR),
            path: CONFIG.DISPATCH_PROCESSOR
        }
    };
    
    return status;
}

/**
 * Zeigt den Cron-Status an
 */
function showStatus() {
    Logger.step('Prüfe Cron-Status...\n');
    
    const status = checkCronStatus();
    
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    DISPATCH CRON STATUS                          ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    
    // Dispatch Cron
    console.log(`║  Dispatch Cron:`);
    console.log(`║    Name:        ${status.dispatch.name}`);
    console.log(`║    Config:      ${status.dispatch.configExists ? '✅' : '❌'} ${CONFIG.CRON_CONFIG_PATH}`);
    console.log(`║    Valid:       ${status.dispatch.configValid ? '✅' : '❌'}`);
    console.log(`║    Schedule:     ${status.dispatch.schedule ? JSON.stringify(status.dispatch.schedule) : 'N/A'}`);
    console.log(`║    Enabled:      ${status.dispatch.enabled ? '✅ AKTIV' : '⚠️ INAKTIV'}`);
    
    // Orchestrator Cron
    console.log(`║  `);
    console.log(`║  Orchestrator Cron:`);
    console.log(`║    Name:        ${status.orchestrator.name}`);
    console.log(`║    Config:      ${status.orchestrator.configExists ? '✅' : '❌'}`);
    console.log(`║    Valid:       ${status.orchestrator.configValid ? '✅' : '❌'}`);
    
    // Dispatch Processor
    console.log(`║  `);
    console.log(`║  Dispatch Processor:`);
    console.log(`║    Script:      ${status.dispatchProcessor.exists ? '✅' : '❌'} ${status.dispatchProcessor.path}`);
    
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    
    // Integration Status
    if (status.dispatch.enabled && status.orchestrator.configValid) {
        Logger.succ('✅ Integration: Orchestrator & Dispatch Cron aktiv');
        Logger.info('   - Orchestrator läuft stündlich (erstellt Dispatch-Requests)');
        Logger.info('   - Dispatch Cron prüft alle 15 Minuten auf pending Jobs');
    } else if (!status.dispatch.enabled) {
        Logger.warn('⚠️  Dispatch Cron ist deaktiviert');
    }
    
    if (!status.dispatch.configValid) {
        Logger.error('❌ Dispatch Cron-Konfiguration ist ungültig');
    }
    
    return status;
}

/**
 * Aktiviert den Dispatch Cron
 */
function enableCron(dryRun = false) {
    Logger.step('Aktiviere Dispatch Cron...\n');
    
    // Validiere zuerst
    const status = checkCronStatus();
    
    if (!status.dispatch.configExists) {
        Logger.error(`Cron-Konfiguration nicht gefunden: ${CONFIG.CRON_CONFIG_PATH}`);
        return false;
    }
    
    if (!status.dispatch.configValid) {
        Logger.error('Cron-Konfiguration ist ungültig');
        return false;
    }
    
    if (!status.dispatchProcessor.exists) {
        Logger.error(`Dispatch Processor nicht gefunden: ${CONFIG.DISPATCH_PROCESSOR}`);
        return false;
    }
    
    // Prüfe Orchestrator Integration
    if (!status.orchestrator.configExists) {
        Logger.warn('Orchestrator Cron-Konfiguration nicht gefunden');
        Logger.warn('Dispatch Cron benötigt Orchestrator für neue Runs');
    }
    
    ensureCronStateDir(dryRun);
    
    // Erstelle Marker-File
    if (dryRun) {
        Logger.dryRun(`Würde Marker-File erstellen: ${CONFIG.CRON_MARKER_FILE}`);
        Logger.dryRun(`Würde Schedule schreiben: 15 Minuten (900000ms)`);
    } else {
        const markerContent = {
            enabledAt: new Date().toISOString(),
            schedule: 'every 15 minutes',
            configPath: CONFIG.CRON_CONFIG_PATH,
            integration: {
                orchestrator: status.orchestrator.configExists
            }
        };
        
        writeFileSync(CONFIG.CRON_MARKER_FILE, JSON.stringify(markerContent, null, 2), 'utf8');
        Logger.succ(`✅ Dispatch Cron aktiviert: ${CONFIG.CRON_MARKER_FILE}`);
        Logger.info(`   Schedule: Alle 15 Minuten`);
        Logger.info(`   Config:   ${CONFIG.CRON_CONFIG_PATH}`);
    }
    
    // Zeige finalen Status
    Logger.info('\nCron-Konfiguration:');
    const config = loadCronConfig(CONFIG.CRON_CONFIG_PATH);
    Logger.info(`   Name:     ${config.name}`);
    Logger.info(`   Payload:  ${config.payload.kind} → ${config.delivery.channel}`);
    
    return true;
}

/**
 * Deaktiviert den Dispatch Cron
 */
function disableCron(dryRun = false) {
    Logger.step('Deaktiviere Dispatch Cron...\n');
    
    if (!existsSync(CONFIG.CRON_MARKER_FILE)) {
        Logger.warn('Dispatch Cron ist bereits deaktiviert');
        return true;
    }
    
    if (dryRun) {
        Logger.dryRun(`Würde Marker-File entfernen: ${CONFIG.CRON_MARKER_FILE}`);
    } else {
        try {
            unlinkSync(CONFIG.CRON_MARKER_FILE);
            Logger.succ('✅ Dispatch Cron deaktiviert');
        } catch (err) {
            Logger.error(`Fehler beim Deaktivieren: ${err.message}`);
            return false;
        }
    }
    
    return true;
}

/**
 * Führt Dry-Run durch
 */
function runDryRun() {
    Logger.step('DRY RUN - Simuliere Setup...\n');
    
    Logger.info('Konfiguration:');
    Logger.info(`   Cron Config: ${CONFIG.CRON_CONFIG_PATH}`);
    Logger.info(`   Processor:   ${CONFIG.DISPATCH_PROCESSOR}`);
    Logger.info(`   State Dir:   ${CONFIG.CRON_STATE_DIR}`);
    Logger.info(`   Marker File: ${CONFIG.CRON_MARKER_FILE}`);
    Logger.info(`   Poll Interval: ${CONFIG.POLL_INTERVAL_MS}ms (15 Minuten)`);
    
    Logger.info('\nValidierung:');
    const status = checkCronStatus();
    
    Logger.info(`   Dispatch Config: ${status.dispatch.configExists ? '✅' : '❌'}`);
    Logger.info(`   Config Valid:    ${status.dispatch.configValid ? '✅' : '❌'}`);
    Logger.info(`   Processor:       ${status.dispatchProcessor.exists ? '✅' : '❌'}`);
    Logger.info(`   Orchestrator:    ${status.orchestrator.configExists ? '✅' : '❌'}`);
    
    if (status.dispatch.configValid && status.dispatchProcessor.exists) {
        Logger.succ('\n✅ Dry-Run erfolgreich - Alle Abhängigkeiten vorhanden');
        return true;
    } else {
        Logger.error('\n❌ Dry-Run fehlgeschlagen - Fehlende Abhängigkeiten');
        return false;
    }
}

/**
 * Hauptfunktion
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }
    
    const parsedArgs = parseArgs(args);
    const dryRun = parsedArgs.dryRun || false;
    
    // Zeige Header
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║     AutoCast Dispatch Cron Setup - Phase 4.2                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    
    // Status anzeigen
    if (parsedArgs.status) {
        showStatus();
        process.exit(0);
    }
    
    // Aktivieren
    if (parsedArgs.enable) {
        if (dryRun) {
            runDryRun();
            Logger.step('\nSimuliere Aktivierung...');
        }
        const success = enableCron(dryRun);
        process.exit(success ? 0 : 1);
    }
    
    // Deaktivieren
    if (parsedArgs.disable) {
        if (dryRun) {
            Logger.step('Simuliere Deaktivierung...');
        }
        const success = disableCron(dryRun);
        process.exit(success ? 0 : 1);
    }
    
    // Dry-Run ohne andere Aktionen
    if (dryRun && !parsedArgs.enable && !parsedArgs.disable) {
        runDryRun();
        process.exit(0);
    }
    
    // Default: Zeige Status
    showStatus();
}

// Export für Tests
export {
    parseArgs,
    loadCronConfig,
    checkCronStatus,
    enableCron,
    disableCron,
    runDryRun
};

// Starte wenn direkt ausgeführt
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        Logger.error(`Unerwarteter Fehler: ${err.message}`);
        console.error(err);
        process.exit(1);
    });
}
