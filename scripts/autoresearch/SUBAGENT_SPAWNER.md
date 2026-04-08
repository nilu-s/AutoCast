# SubAgent Spawner - Dokumentation

## Überblick

Der SubAgent Spawner ist das Integrationsmodul zwischen dem AutoCast Dispatch Processor und OpenClaw's `sessions_spawn` API. Er verwaltet das Spawning von Method Executor Sub-Agents und das Polling auf deren Ergebnisse.

## Architektur

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Dispatch Processor │────▶│   SubAgent Spawner   │────▶│  Method Executor │
│   (orchestrator.js) │     │ (subagent_spawner.js)│     │   (Sub-Agent)    │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
                                     │
                                     ▼
                            ┌──────────────────────┐
                            │   OpenClaw Runtime   │
                            │   (sessions_spawn)   │
                            └──────────────────────┘
```

## Installation

```javascript
const subagentSpawner = require('./lib/subagent_spawner.js');
```

## API Referenz

### spawnMethodExecutor(jobConfig)

Spawnt einen Method Executor Sub-Agent für einen Job.

**Parameter:**

| Name | Typ | Beschreibung |
|------|-----|--------------|
| `jobConfig` | `object` | Job Konfiguration |
| `jobConfig.jobId` | `string` | Eindeutige Job ID |
| `jobConfig.taskAgent` | `string` | Task Agent Name (z.B. 'review-calibrator') |
| `jobConfig.methodId` | `string` | Method ID (z.B. 'adjust_threshold') |
| `jobConfig.methodTitle` | `string` | Method Titel |
| `jobConfig.promptFile` | `string` | Pfad zur Prompt-Datei |
| `jobConfig.runId` | `string` | Run ID |
| `jobConfig.runDir` | `string` | Run Verzeichnis |
| `jobConfig.resultPath` | `string` | Pfad für Ergebnis (JSON) |
| `jobConfig.statusPath` | `string` | Pfad zur STATUS.json |

**Rückgabe:**

```javascript
{
  sessionKey: string,    // Eindeutiger Session Key
  mode: 'openclaw' | 'fallback',
  promptPath?: string,     // Nur im Fallback-Modus
  instructionsPath?: string  // Nur im Fallback-Modus
}
```

**Beispiel:**

```javascript
const result = subagentSpawner.spawnMethodExecutor({
  jobId: 'review-calibrator__adjust_threshold__001',
  taskAgent: 'review-calibrator',
  methodId: 'adjust_threshold',
  methodTitle: 'Adjust Threshold for Speech Detection',
  promptFile: '/path/to/method.md',
  runId: '20260324_163705',
  runDir: '/path/to/run',
  resultPath: '/path/to/result.json',
  statusPath: '/path/to/STATUS.json'
});

console.log('Spawned with session key:', result.sessionKey);
```

### waitForSubAgent(sessionKey, options)

Wartet auf Abschluss eines Sub-Agents.

**Parameter:**

| Name | Typ | Beschreibung |
|------|-----|--------------|
| `sessionKey` | `string` | Session Key vom spawn |
| `options` | `object` | Optionen |
| `options.timeout` | `number` | Timeout in Millisekunden (default: 600000 = 10 Min) |
| `options.resultPath` | `string` | Pfad zur Ergebnisdatei (für Polling) |

**Rückgabe:** `Promise<object>`

```javascript
{
  status: 'completed',
  result: object,        // Geparstes Result-JSON
  duration: number,      // Dauer in ms
  attempts: number       // Anzahl Poll-Versuche
}
```

**Beispiel:**

```javascript
const completion = await subagentSpawner.waitForSubAgent(
  result.sessionKey,
  {
    timeout: 10 * 60 * 1000,  // 10 Minuten
    resultPath: '/path/to/result.json'
  }
);

console.log('Completed after', completion.duration, 'ms');
console.log('Decision:', completion.result.decision);
```

### getSubAgentResult(sessionKey, resultPath)

Holt das Ergebnis eines Sub-Agents (nicht-blockierend).

**Parameter:**

| Name | Typ | Beschreibung |
|------|-----|--------------|
| `sessionKey` | `string` | Session Key |
| `resultPath` | `string` | Pfad zur Ergebnisdatei |

**Rückgabe:** `object|null`

**Beispiel:**

```javascript
const result = subagentSpawner.getSubAgentResult(
  sessionKey,
  '/path/to/result.json'
);

if (result) {
  console.log('Decision:', result.decision);
} else {
  console.log('Result not yet available');
}
```

### spawnBatch(jobConfigs)

Spawnt mehrere Sub-Agents in einem Batch.

**Parameter:**

| Name | Typ | Beschreibung |
|------|-----|--------------|
| `jobConfigs` | `array` | Array von Job Konfigurationen |

**Rückgabe:** `array`

```javascript
[
  {
    jobId: string,
    success: boolean,
    spawnResult?: object,
    error?: string
  }
]
```

**Beispiel:**

```javascript
const jobs = [
  { jobId: 'job1', /* ... */ },
  { jobId: 'job2', /* ... */ }
];

const spawnResults = subagentSpawner.spawnBatch(jobs);
```

### waitForBatch(spawnResults, timeout)

Wartet auf alle Sub-Agents in einem Batch.

**Parameter:**

| Name | Typ | Beschreibung |
|------|-----|--------------|
| `spawnResults` | `array` | Array von Spawn-Ergebnissen |
| `timeout` | `number` | Timeout pro Job in ms |

**Rückgabe:** `Promise<array>`

**Beispiel:**

```javascript
const results = await subagentSpawner.waitForBatch(spawnResults, 600000);

results.forEach(r => {
  if (r.success) {
    console.log(r.jobId, 'completed:', r.result.result.decision);
  } else {
    console.log(r.jobId, 'failed:', r.error);
  }
});
```

### configure(config)

Konfiguriert den Spawner.

**Parameter:**

| Name | Typ | Beschreibung |
|------|-----|--------------|
| `defaultTimeout` | `number` | Default Timeout in ms |
| `pollInterval` | `number` | Intervall zwischen Polls in ms |
| `maxPollAttempts` | `number` | Maximale Poll-Versuche |
| `fallbackMode` | `boolean` | Immer Fallback-Modus verwenden |
| `fallbackDir` | `string` | Verzeichnis für Fallback-Dateien |

**Beispiel:**

```javascript
subagentSpawner.configure({
  defaultTimeout: 15 * 60 * 1000,  // 15 Minuten
  pollInterval: 3000,               // 3 Sekunden
  maxPollAttempts: 300
});
```

### isSessionsSpawnAvailable()

Prüft ob OpenClaw sessions_spawn verfügbar ist.

**Rückgabe:** `boolean`

**Beispiel:**

```javascript
if (subagentSpawner.isSessionsSpawnAvailable()) {
  console.log('Running in OpenClaw environment');
} else {
  console.log('Running in fallback mode');
}
```

## Integration mit Dispatch Processor

### Beispiel-Integration

```javascript
// In orchestrator.js oder dispatch_processor.js

const subagentSpawner = require('./lib/subagent_spawner.js');
const statusManager = require('./lib/status_manager.js');

async function dispatchMethods(tasks, artifacts, config, runId, runDir) {
  const methodResultsDir = path.join(runDir, 'method_results');
  ensureDir(methodResultsDir);
  
  // Initialisiere Status
  const statusPath = path.join(runDir, 'STATUS.json');
  const status = statusManager.createStatus(statusPath);
  
  // Erstelle Jobs
  const jobs = artifacts.methodQueue.map((item, index) => {
    const jobKey = resultNaming.generateJobKey(
      item.taskAgent,
      item.methodId,
      index + 1
    );
    
    return {
      jobId: jobKey,
      taskAgent: item.taskAgent,
      methodId: item.methodId,
      methodTitle: item.methodTitle,
      promptFile: item.promptFile,
      runId: runId,
      runDir: runDir,
      resultPath: resultNaming.generateResultPath(methodResultsDir, jobKey),
      statusPath: statusPath
    };
  });
  
  // Füge Jobs zum Status hinzu
  jobs.forEach(job => {
    statusManager.addJob(status, {
      jobId: job.jobId,
      taskAgent: job.taskAgent,
      methodId: job.methodId,
      methodTitle: job.methodTitle
    });
  });
  statusManager.saveStatus(status);
  
  // Spawne alle Jobs
  console.log(`[dispatch] Spawning ${jobs.length} sub-agents...`);
  const spawnResults = subagentSpawner.spawnBatch(jobs);
  
  // Aktualisiere Status zu RUNNING
  spawnResults
    .filter(r => r.success)
    .forEach(r => {
      statusManager.updateJobStatus(status, r.jobId, 'RUNNING');
    });
  statusManager.saveStatus(status);
  
  // Warte auf alle Ergebnisse
  console.log('[dispatch] Waiting for completion...');
  const results = await subagentSpawner.waitForBatch(
    spawnResults,
    10 * 60 * 1000  // 10 Minuten Timeout
  );
  
  // Aktualisiere Status mit Ergebnissen
  results.forEach(r => {
    if (r.success) {
      const decision = r.result.result?.decision || 'REJECT';
      const finalStatus = decision === 'KEEP' ? 'COMPLETED' : 
                          decision === 'FAILED' ? 'FAILED' : 'REJECTED';
      statusManager.updateJobStatus(status, r.jobId, finalStatus, {
        result: r.result.result
      });
    } else {
      statusManager.updateJobStatus(status, r.jobId, 'FAILED', {
        error: r.error
      });
    }
  });
  statusManager.saveStatus(status);
  
  return {
    totalJobs: jobs.length,
    completed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  };
}
```

## Fallback-Modus

Wenn `sessions_spawn` nicht verfügbar ist (z.B. in Tests oder außerhalb von OpenClaw), wird automatisch der Fallback-Modus aktiviert.

### Fallback-Verhalten

1. **Prompt Speicherung**: Der Prompt wird in eine Datei gespeichert
2. **Anweisungen**: Eine Markdown-Datei mit Ausführungsanweisungen wird erstellt
3. **Polling**: Das System pollt auf die Ergebnisdatei
4. **Timeout**: Nach dem konfigurierten Timeout wird abgebrochen

### Fallback-Dateien

Im Fallback-Modus werden folgende Dateien erstellt:

```
method_results/
├── {jobId}.prompt.txt       # Der vollständige Prompt
├── {jobId}.instructions.md  # Anweisungen zur manuellen Ausführung
├── {jobId}.result.json      # Erwartete Ergebnisdatei
└── .debug/                  # Debug-Dateien
    └── {jobId}.prompt.txt   # Kopie des Prompts
```

### Manuelle Ausführung (Fallback)

Wenn im Fallback-Modus:

1. Lies die Anweisungen:
   ```bash
   cat method_results/review-calibrator__adjust_threshold__001.instructions.md
   ```

2. Führe den Prompt aus (als Sub-Agent oder manuell)

3. Schreibe das Ergebnis:
   ```bash
   cat > method_results/review-calibrator__adjust_threshold__001.result.json << 'EOF'
   {
     "schemaVersion": "1.0.0",
     "jobId": "review-calibrator__adjust_threshold__001",
     "methodId": "adjust_threshold",
     "runId": "20260324_163705",
     "status": "COMPLETED",
     "decision": "KEEP",
     ...
   }
   EOF
   ```

4. Das System erkennt die Datei automatisch (Polling)

## Troubleshooting

### Problem: "Timeout waiting for sub-agent"

**Ursache:**
- Sub-Agent hat das Zeitlimit überschritten
- Ergebnisdatei wurde nicht erstellt

**Lösung:**
- Timeout erhöhen: `subagentSpawner.configure({ defaultTimeout: 20 * 60 * 1000 })`
- Prüfe ob der Sub-Agent läuft
- Manuell verifizieren und Ergebnisdatei erstellen

### Problem: "Error reading result"

**Ursache:**
- Ergebnisdatei ist ungültiges JSON
- Datei wurde während des Schreibens gelesen

**Lösung:**
- Validiere JSON: `cat result.json | jq`
- Lösche defekte Datei und lasse Sub-Agent neu laufen

### Problem: "sessions_spawn not available"

**Ursache:**
- Code läuft außerhalb der OpenClaw Umgebung

**Lösung:**
- Das ist normal außerhalb von OpenClaw
- Fallback-Modus wird automatisch verwendet
- Für Tests: Setze Umgebungsvariable `OPENCLAW_RUNTIME=true`

### Problem: Status bleibt auf "RUNNING"

**Ursache:**
- Sub-Agent ist abgestürzt
- Ergebnis wurde nicht geschrieben

**Lösung:**
- Prüfe Sub-Agent Logs
- STATUS.json manuell aktualisieren:
  ```javascript
  statusManager.updateJobStatus(status, jobId, 'FAILED', {
    error: 'Sub-agent crashed'
  });
  ```

### Problem: Git-Konflikte nach REJECT

**Ursache:**
- Stash wurde nicht korrekt gepoppt
- Änderungen wurden nicht vollständig zurückgesetzt

**Lösung:**
- Manuell bereinigen:
  ```bash
  git stash list
  git stash drop stash@{0}  # oder: git stash pop
  git checkout -- .
  ```

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung |
|----------|--------------|
| `OPENCLAW_RUNTIME` | Setze auf `true` um OpenClaw Modus zu simulieren |
| `SUBAGENT_TIMEOUT` | Default Timeout in Sekunden |
| `SUBAGENT_POLL_INTERVAL` | Poll-Intervall in Millisekunden |

### Default-Werte

```javascript
{
  defaultTimeout: 600000,    // 10 Minuten
  pollInterval: 2000,        // 2 Sekunden
  maxPollAttempts: 300,      // 300 * 2s = 10 Minuten
  fallbackMode: false,
  fallbackDir: null
}
```

## Version History

| Version | Datum | Änderungen |
|---------|-------|------------|
| 1.0.0 | 2026-03-25 | Initial release - Phase 3.3 |

## Siehe auch

- [METHOD_EXECUTOR.md](./METHOD_EXECUTOR.md) - Method Executor Dokumentation
- [STATUS_PROTOCOL.md](./STATUS_PROTOCOL.md) - Status Protokoll
- [NAMING_CONVENTION.md](./NAMING_CONVENTION.md) - Naming Konventionen
