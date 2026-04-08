# AutoCast Monitoring & Alerting

Dokumentation für das Monitoring-System der AutoResearch Pipeline.

## Überblick

Das Monitoring-System überwacht den Zustand der AutoResearch-Pipeline und benachrichtigt bei kritischen Problemen. Es prüft:

- Status der neuesten Runs
- Anzahl PENDING/FAILED Jobs
- Score-Trends über Zeit
- Orchestrator-Health (läuft er noch?)

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `monitor.js` | Haupt-Monitoring-Skript |
| `dashboard.html` | HTML-Dashboard (automatisch generiert) |
| `alerts.jsonl` | Alert-Log (automatisch generiert) |

## Verwendung

### CLI-Interface

```bash
# Alle Checks durchführen (default)
node scripts/autoresearch/monitor.js

# Nur Checks ohne Alerts/Report
node scripts/autoresearch/monitor.js --check

# Nur Report generieren (inkl. Dashboard)
node scripts/autoresearch/monitor.js --report

# Nur Alerts senden (bei WARN/ERROR)
node scripts/autoresearch/monitor.js --alert

# Hilfe anzeigen
node scripts/autoresearch/monitor.js --help
```

## Alert-Level

### INFO
- Keine automatischen Alerts
- Wird nur im Dashboard und Alert-Log angezeigt
- Beispiele: Neuer Run gestartet, Job erfolgreich abgeschlossen

### WARN
- Wird im Dashboard hervorgehoben
- Sollte überwacht werden, aber kein sofortiges Handeln nötig

**Trigger:**
- Mehr als 5 PENDING Jobs älter als 24h
- Score stagniert über 3 aufeinanderfolgende Runs

### ERROR
- Erfordert sofortige Aufmerksamkeit
- System funktioniert möglicherweise nicht korrekt

**Trigger:**
- FAILED Jobs im letzten Run
- Orchestrator läuft nicht (kein neuer Run seit 2h)
- Mehr als 10 PENDING Jobs älter als 24h

## Dashboard

Das Dashboard wird automatisch in `reports/autoresearch/dashboard.html` generiert und enthält:

- **Status-Karten**: System-Status, Score-Trend, PENDING/FAILED Jobs
- **Score-History**: Chart der letzten 20 Runs
- **Alert-History**: Letzte 50 Alerts mit Level und Zeitstempel
- **Run-Tabelle**: Übersicht aller Runs mit Job-Counts

## Alert-Log

Alle Alerts werden in `reports/autoresearch/alerts.jsonl` gespeichert:

```json
{"timestamp":"2026-03-25T10:30:00.000Z","level":"ERROR","message":"3 FAILED Jobs im letzten Run","details":{}}
```

## Reaktion auf Alerts

### WARN

1. **PENDING Jobs > 24h**
   - Prüfe Dispatch-Processor: `ps aux | grep dispatch`
   - Prüfe Logs: `tail -f reports/autoresearch/tasks/*.log`
   - Restart falls nötig: `node scripts/autoresearch/dispatch_processor.js`

2. **Score stagniert**
   - Normal während Entwicklungsphasen
   - Prüfe ob Methoden korrekt dispatched werden
   - Betrachte Score-Trend im Dashboard

### ERROR

1. **FAILED Jobs**
   - Identifiziere fehlgeschlagene Jobs im Dashboard
   - Prüfe Job-Logs in `reports/autoresearch/runs/{runId}/`
   - Analysiere Fehlermeldungen
   - Repariere und restarte Dispatch-Processor

2. **Orchestrator überfällig**
   - Prüfe Cron-Job: `crontab -l`
   - Prüfe Orchestrator-Logs
   - Manuelles Triggern: `node scripts/autoresearch/orchestrator.js`

## Cron-Job für Monitoring (Optional)

Füge folgende Zeile zu crontab hinzu für automatisches Monitoring alle 30 Minuten:

```bash
# AutoCast Monitoring - alle 30 Minuten
*/30 * * * * cd /home/node/.openclaw/workspace/AutoCast && node scripts/autoresearch/monitor.js --alert >> /tmp/autocast_monitor.log 2>&1
```

Dies sendet nur bei WARN/ERROR Alerts (keine Spam).

## Konfiguration

Thresholds können in `monitor.js` angepasst werden:

```javascript
const CONFIG = {
    PENDING_WARN_THRESHOLD: 5,      // WARN wenn > 5 über 24h
    PENDING_ERROR_THRESHOLD: 10,    // ERROR wenn > 10
    FAILED_ERROR_THRESHOLD: 1,      // ERROR wenn >= 1 FAILED
    STAGNATION_RUNS: 3,             // WARN nach 3 stagnierenden Runs
    ORCHESTRATOR_TIMEOUT_HOURS: 2,  // ERROR nach 2h ohne Run
};
```

## Telegram Integration

Für Produktivbetrieb Telegram-Bot einrichten:

1. Bot erstellen via @BotFather
2. Chat ID ermitteln
3. Environment-Variablen setzen:
   ```bash
   export TELEGRAM_BOT_TOKEN="your-bot-token"
   export TELEGRAM_CHAT_ID="your-chat-id"
   ```

Die `sendAlert()` Funktion in `monitor.js` enthält bereits den kommentierten Code für Telegram.

## Troubleshooting

### Dashboard zeigt keine Daten
- Prüfe ob `reports/autoresearch/runs/` existiert
- Prüfe ob Runs das Format `YYYYMMDD_HHMMSS` haben
- Prüfe Schreibrechte für `reports/autoresearch/`

### Keine Alerts generiert
- Prüfe `--alert` Flag wurde verwendet
- Alerts werden nur bei tatsächlichen Problemen gesendet
- Prüfe Alert-Log: `cat reports/autoresearch/alerts.jsonl`

### Score-Chart ist leer
- Mindestens 2 Runs mit validen Scores nötig
- Prüfe `history.jsonl` im Reports-Verzeichnis
