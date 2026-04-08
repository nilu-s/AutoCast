# STATUS.json Protocol

## Overview

Das STATUS.json Protokoll dient dem Tracking von Research-Jobs in AutoCast. Es ermöglicht die Nachverfolgung des Fortschritts einzelner Jobs sowie des Gesamtstatus eines Research-Runs.

## Datei-Struktur

```json
{
  "runId": "string",
  "createdAt": "ISO-8601 timestamp",
  "overallStatus": "RUNNING | COMPLETED | FAILED | PARTIAL",
  "jobs": [
    {
      "index": 0,
      "methodId": "web_search",
      "status": "PENDING | RUNNING | COMPLETED | FAILED",
      "decision": null | { "action": "ACCEPT | REJECT | PARTIAL", "confidence": 0.9 },
      "resultFile": null | "/path/to/result.json",
      "completedAt": null | "ISO-8601 timestamp"
    }
  ]
}
```

## Status-Werte

### Job Status

| Status    | Beschreibung                           |
|-----------|----------------------------------------|
| PENDING   | Job wartet auf Ausführung              |
| RUNNING   | Job wird aktuell ausgeführt            |
| COMPLETED | Job erfolgreich abgeschlossen          |
| FAILED    | Job fehlgeschlagen                     |

### Overall Status

| Status    | Bedingung                                      |
|-----------|------------------------------------------------|
| RUNNING   | Mindestens ein Job ist PENDING oder RUNNING    |
| COMPLETED | Alle Jobs sind COMPLETED                       |
| FAILED    | Alle Jobs sind FAILED                          |
| PARTIAL   | Mischung aus COMPLETED und FAILED              |

## API

### createStatus(runId, jobs, [runDir])

Erstellt ein neues STATUS.json.

```javascript
const { createStatus } = require('./lib/status_manager');

const jobs = [
  { methodId: 'web_search' },
  { methodId: 'arxiv' },
  { methodId: 'news' }
];

const status = createStatus('run-2024-001', jobs, '/path/to/run/dir');
```

### getStatus(runDir)

Liest das aktuelle STATUS.json.

```javascript
const { getStatus } = require('./lib/status_manager');

const status = getStatus('/path/to/run/dir');
console.log(status.overallStatus);
```

### updateJobStatus(runDir, jobIndex, status, [decision], [resultFile])

Aktualisiert den Status eines Jobs.

```javascript
const { updateJobStatus, JobStatus } = require('./lib/status_manager');

// Job starten
updateJobStatus('/run/dir', 0, JobStatus.RUNNING);

// Job abschließen
updateJobStatus('/run/dir', 0, JobStatus.COMPLETED, {
  action: 'ACCEPT',
  confidence: 0.95
}, '/results/job-0.json');
```

### getPendingJob(runDir)

Gibt den ersten PENDING Job zurück.

```javascript
const { getPendingJob } = require('./lib/status_manager');

const nextJob = getPendingJob('/run/dir');
if (nextJob) {
  console.log(`Next: ${nextJob.methodId} (index: ${nextJob.index})`);
}
```

### isRunComplete(runDir)

Prüft ob alle Jobs abgeschlossen sind.

```javascript
const { isRunComplete } = require('./lib/status_manager');

if (isRunComplete('/run/dir')) {
  console.log('All jobs done!');
}
```

## Workflow

```
1. createStatus() → Initialisiert STATUS.json
2. getPendingJob() → Nächsten Job holen
3. updateJobStatus(index, RUNNING) → Job starten
4. [Job ausführen]
5. updateJobStatus(index, COMPLETED/FAILED, decision) → Job beenden
6. isRunComplete() → Prüfen ob fertig
7. Wenn nicht: Goto 2
```

## Beispiel

```javascript
const {
  createStatus,
  getPendingJob,
  updateJobStatus,
  isRunComplete,
  JobStatus
} = require('./lib/status_manager');

async function runResearch(runId, jobs, runDir) {
  // 1. Initialisieren
  createStatus(runId, jobs, runDir);

  // 2. Jobs sequentiell abarbeiten
  while (true) {
    const job = getPendingJob(runDir);
    if (!job) break;

    // Job starten
    updateJobStatus(runDir, job.index, JobStatus.RUNNING);

    try {
      // Job ausführen...
      const result = await executeJob(job);

      // Erfolg
      updateJobStatus(runDir, job.index, JobStatus.COMPLETED, {
        action: 'ACCEPT',
        confidence: result.confidence
      }, result.file);
    } catch (error) {
      // Fehler
      updateJobStatus(runDir, job.index, JobStatus.FAILED);
    }
  }

  // 3. Prüfen
  const complete = isRunComplete(runDir);
  console.log(`Run complete: ${complete}`);
}
```

## Tests

```bash
cd /home/node/.openclaw/workspace/AutoCast/scripts/autoresearch/lib
node --test status_manager.test.js
```
