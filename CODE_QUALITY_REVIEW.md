# AutoCast AutoResearch - Code Quality Review

**Review Datum:** 2026-03-25  
**Reviewer:** Sub-Agent Code-Quality-Review  
**Scope:** Alle Komponenten der AutoResearch Pipeline

---

## 🐛 BUGS GEFUNDEN

### 1. CRITICAL: Ungültiger Status-Update in dispatch_processor.js
**Datei:** `scripts/autoresearch/dispatch_processor.js`  
**Zeilen:** 320-330

```javascript
// BUG: updateJobStatus wird mit 'KEEP', 'REJECT', 'FAILED' aufgerufen
// aber STATUS-Enum hat nur: PENDING, RUNNING, COMPLETED, FAILED, REJECTED
// 'KEEP' ist kein gültiger Status-Wert!
statusManager.updateJobStatus(status, job.jobId, decision, {
    result: result
});
```

**Problem:** Die Methode `updateJobStatus` akzeptiert `decision` (KEEP/REJECT/FAILED) als Status, aber der Status-Manager definiert nur: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `REJECTED`. `KEEP` ist kein gültiger Status!

**Fix:**
```javascript
const finalStatus = decision === 'KEEP' ? statusManager.STATUS.COMPLETED : decision;
statusManager.updateJobStatus(status, job.jobId, finalStatus, {
    result: { ...result, decision }
});
```

---

### 2. HIGH: `generateRunPaths` überschreibt `resultsDir` falsch
**Datei:** `scripts/autoresearch/execute_method.js`  
**Zeilen:** 138-156

```javascript
export function generateRunPaths(runId, methodId, jobIndex = 1) {
    const baseDir = resolve(__dirname, '../../reports/autoresearch/runs');
    const runDir = join(baseDir, runId);
    const resultsDir = join(runDir, 'results');  // <-- 'results'
    // ...
}
```

**Problem:** In `dispatch_processor.js` wird `method_results` als Verzeichnis erwartet (siehe Zeile 195), aber `execute_method.js` verwendet `results`. Das führt zu Inkonsistenzen beim Dateizugriff.

**Fix:**
```javascript
const resultsDir = join(runDir, 'method_results'); // Konsistent mit dispatch_processor.js
```

---

### 3. HIGH: `pollForResult` gibt Promise zurück, wird aber nicht awaitet bei Fehlern
**Datei:** `scripts/autoresearch/dispatch_processor.js`  
**Zeilen:** 420-430

```javascript
const hasResult = await pollForResult(job.resultPath, job.methodId);

if (!hasResult) {
    // Timeout
    markJobFailed(status, job.jobId, 'Timeout (10 Minuten)');
    continue; // <-- Status wird nicht neu geladen, Job als FAILED markiert aber Loop geht weiter
}
```

**Problem:** Nach einem Timeout wird der Job als FAILED markiert, aber der Loop läuft mit veraltetem Status weiter. Das führt zu Race Conditions bei gleichzeitigen Updates.

---

### 4. MEDIUM: `buildOpenClawDispatchRequest` doppelt `methodResultsDir`
**Datei:** `scripts/autoresearch/orchestrator.js`  
**Zeilen:** 400-450

```javascript
// In dispatchMethods():
var methodResultsDir = path.join(runDir, 'method_results'); // Zeile ~340

// In buildOpenClawDispatchRequest():
function buildOpenClawDispatchRequest(...) {
    // methodResultsDir wird als Parameter übergeben, aber...
    var resultsDir = join(dirname(status.path), 'results'); // Zeile ~408 in findPendingJob
```

**Problem:** Inkonsistente Verzeichnisnamen: `method_results` vs `results`

---

### 5. MEDIUM: Fehlende Validierung von `methodCatalog` Einträgen
**Datei:** `scripts/autoresearch/orchestrator.js`  
**Zeilen:** 250-270

```javascript
function selectMethods(methodCatalog, agent, maxMethodsPerTask) {
    var methods = methodCatalog[agent];
    if (!Array.isArray(methods) || methods.length === 0) {
        return [{...}] // Fallback
    }
    return methods.slice(0, Math.max(1, maxMethodsPerTask)); // Keine Validierung der Method-Struktur
}
```

**Problem:** Method-Einträge werden nicht auf Pflichtfelder (id, title, hypothesis) validiert.

---

### 6. MEDIUM: `updateJobStatus` speichert nicht automatisch
**Datei:** `scripts/autoresearch/lib/status_manager.mjs`  
**Zeilen:** 90-120

```javascript
export function updateJobStatus(status, jobId, newStatus, options = {}) {
    // ...
    job.status = newStatus;
    job.updatedAt = now;
    // ...
    // KEIN automatisches saveStatus()!
}
```

**Problem:** Caller müssen explizit `saveStatus()` aufrufen, was leicht vergessen werden kann.

---

### 7. LOW: `resultNaming.generateResultPath` nutzt falschen Separator
**Datei:** `scripts/autoresearch/lib/result_naming.mjs`  
**Zeile:** 24

```javascript
export function generateResultPath(resultsDir, jobKey) {
    return path.join(resultsDir, jobKey + '.result.json');
}
```

**Problem:** In `dispatch_processor.js` Zeile 197-198 wird erwartet:
```javascript
const resultsDir = join(dirname(status.path), 'results');
```

Aber `orchestrator.js` erstellt `method_results` (Zeile 336).

---

## ⚠️ SCHWACHSTELLEN (Severity)

### CRITICAL

#### 1. Keine Lock-Mechanismen für STATUS.json
**Beschreibung:** Mehrere Prozesse können gleichzeitig auf STATUS.json schreiben.
**Betroffen:** `status_manager.mjs`, `dispatch_processor.js`
**Konsequenz:** Datenkorruption, verlorene Updates, Race Conditions
**Fix:** File-basiertes Locking implementieren:
```javascript
async function withLock(statusPath, operation) {
    const lockPath = statusPath + '.lock';
    // Atomic check-and-set mit fs.writeFileSync(flags: 'wx')
}
```

#### 2. Keine Transaktionssicherheit bei Status-Updates
**Beschreibung:** Wenn ein Prozess zwischen `updateJobStatus` und `saveStatus` abstürzt, geht der Status verloren.
**Betroffen:** Alle Module
**Fix:** Write-ahead-logging oder atomic rename Pattern verwenden.

---

### HIGH

#### 3. Keine Git-Dirty-Prüfung vor Run-Start
**Datei:** `orchestrator.js` - `main()`
**Beschreibung:** Orchestrator startet Evaluierung ohne zu prüfen, ob das Repo dirty ist.
**Konsequenz:** Metriken werden mit uncommitted Changes berechnet.
**Fix:**
```javascript
function checkGitStatus() {
    const result = childProcess.spawnSync('git', ['status', '--porcelain'], { cwd: ROOT });
    if (result.stdout.trim()) {
        throw new Error('Repository has uncommitted changes. Commit or stash first.');
    }
}
```

#### 4. Keine Validierung von korruptem STATUS.json
**Datei:** `status_manager.mjs` - `loadStatus()`
**Beschreibung:** Bei SyntaxError wird null zurückgegeben, aber keine Recovery-Strategie.
**Fix:**
```javascript
export function loadStatus(statusPath) {
    try {
        const content = fs.readFileSync(statusPath, 'utf8');
        const data = JSON.parse(content);
        return { path: statusPath, data };
    } catch (err) {
        if (err instanceof SyntaxError) {
            // Backup erstellen und neu initialisieren
            const backupPath = statusPath + '.corrupted.' + Date.now();
            fs.copyFileSync(statusPath, backupPath);
            return createStatus(statusPath);
        }
        return null;
    }
}
```

#### 5. Endlosschleife nur teilweise gefixt
**Datei:** `dispatch_processor.js` - `main()`
**Zeilen:** 355-360

```javascript
while (hasMoreJobs && iterations < MAX_ITERATIONS) {
    iterations++;
    // ...
}
```

**Problem:** `MAX_ITERATIONS = 100` ist ein hartes Limit, aber es gibt keine Warnung wenn es erreicht wird.
**Fix:**
```javascript
if (iterations >= MAX_ITERATIONS) {
    Logger.error(`MAX_ITERATIONS (${MAX_ITERATIONS}) erreicht - möglicherweise unendliche Schleife`);
    // Alert senden
}
```

#### 6. Keine Validierung von Sub-Agent Ergebnissen
**Datei:** `dispatch_processor.js` - `processResult()`
**Beschreibung:** Nur `decision` wird validiert, aber keine Prüfung auf:
- Gültige Metriken
- Pfad-Injection (path traversal in `changedFiles`)
- Timestamp-Format
**Fix:** JSON Schema Validierung implementieren.

---

### MEDIUM

#### 7. Race Condition bei `ensureDir`
**Datei:** `orchestrator.js` - `ensureDir()`
**Code:**
```javascript
function ensureDir(dirPath) {
    if (fs.existsSync(dirPath)) return;
    fs.mkdirSync(dirPath, { recursive: true });
}
```

**Problem:** Nicht atomar - TOCTOU Race Condition.
**Fix:**
```javascript
function ensureDir(dirPath) {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }
}
```

#### 8. `writeFileSync` ohne Error Handling
**Beschreibung:** Viele Stellen nutzen `writeFileSync` ohne try-catch.
**Betroffen:** `orchestrator.js`, `aggregator.js`, `dispatch_processor.js`
**Konsequenz:** Bei voller Disk oder Permission-Denied crasht der Prozess ungraceful.

#### 9. Keine Timeout-Überwachung für einzelne Jobs
**Beschreibung:** Jedes Job hat 10 Minuten Timeout, aber bei 10 Jobs = 100 Minuten Gesamtzeit ohne Überwachung.
**Fix:** Gesamtlaufzeit-Tracking implementieren.

#### 10. `parseArgs` behandelt `--flag=value` nicht
**Datei:** Mehrere Dateien
**Beschreibung:** `--runId=test` wird nicht erkannt, nur `--runId test`.

#### 11. Polling-Logik blockiert Event Loop
**Datei:** `polling.mjs`
**Code:**
```javascript
while (Date.now() - startTime < timeout) {
    if (fs.existsSync(filePath)) { ... }
    await sleep(interval); // Gut
}
```
**Problem:** `fs.existsSync` blockiert, sollte `fs.promises.access` sein.

---

### LOW

#### 12. Unnötige `Object.assign` bei Status-Reload
**Datei:** `dispatch_processor.js` - Zeile 365
```javascript
Object.assign(status, freshStatus); // Mutiert bestehendes Objekt
```
**Besser:**
```javascript
status = freshStatus; // Oder komplett neu zuweisen
```

#### 13. Konsole-Output nicht zentralisiert
**Beschreibung:** Mix aus `console.log`, `console.warn`, `console.error` statt konsistentem Logger.

#### 14. Keine Umgebungsvariablen-Validierung
**Beschreibung:** `process.env` Werte werden nicht auf Existenz/Format geprüft.

#### 15. Magische Zahlen nicht konstantisiert
**Beispiele:**
- `1500` in `trimOutput()` (orchestrator.js)
- `100` für `MAX_ITERATIONS`
- `600000` für 10 Minuten Timeout

---

## 🔧 EMPFOHLENE FIXES (Priorisiert)

### Sofort (CRITICAL)
1. **File Locking für STATUS.json implementieren**
   - Atomic writes mit temp file + rename
   - Lock-File Mechanismus für parallele Prozesse

2. **Status-Werte konsistent machen**
   - `KEEP` → `COMPLETED` + decision Feld
   - Alle Status-Updates validieren

3. **Verzeichnisnamen vereinheitlichen**
   - Entweder `results` oder `method_results` überall

### Kurzfristig (HIGH)
4. **Git-Dirty-Check vor Run-Start**
5. **Korrupte JSON Recovery**
6. **Sub-Agent Ergebnis-Validierung**
7. **Graceful Disk-Full Handling**

### Mittelfristig (MEDIUM)
8. **Schema-Validierung für alle Inputs**
9. **Async File-Operations statt Sync**
10. **Zentraler Logger mit Levels**

---

## 📊 TEST-ABDECKUNG BEWERTUNG

### Aktuelle Test-Abdeckung: **NIEDRIG (~15%)**

| Komponente | Tests | Abdeckung | Bewertung |
|------------|-------|-----------|-----------|
| `orchestrator.js` | ❌ Keine | 0% | 🔴 CRITICAL |
| `dispatch_processor.js` | ❌ Keine | 0% | 🔴 CRITICAL |
| `execute_method.js` | ✅ Eine Datei existiert | ~10% | 🟠 MEDIUM |
| `aggregator.js` | ❌ Keine | 0% | 🔴 CRITICAL |
| `result_naming.mjs` | ❌ Keine | 0% | 🟡 LOW |
| `status_manager.mjs` | ❌ Keine | 0% | 🔴 CRITICAL |
| `polling.mjs` | ❌ Keine | 0% | 🟡 LOW |
| `subagent_spawner.mjs` | ❌ Keine | 0% | 🟡 LOW |

### Empfohlene Test-Strategie:

1. **Unit Tests für Lib-Module**
   ```javascript
   // status_manager.test.mjs
   test('createStatus initializes with PENDING jobs', () => {
       const status = createStatus('/tmp/test.json');
       expect(status.data.jobs).toEqual({});
   });
   ```

2. **Integration Tests für Core-Skripte**
   - Mock filesystem mit `mock-fs`
   - Mock child_process für Git/GitHub
   - Teste gesamte Workflows

3. **Error-Injection Tests**
   - Korrupte JSON
   - Permission denied
   - Disk full
   - Network timeouts

4. **Concurrency Tests**
   - Zwei Dispatch-Prozessoren gleichzeitig
   - Status-Update während Polling

---

## 🎯 ZUSAMMENFASSUNG

### Kritische Probleme (sofort fixen):
1. ⚠️ **Race Conditions** bei parallelem STATUS.json Zugriff
2. ⚠️ **Ungültige Status-Werte** (KEEP vs COMPLETED)
3. ⚠️ **Inkonsistente Verzeichnisnamen**
4. ⚠️ **Keine Recovery** bei korruptem STATUS.json
5. ⚠️ **Keine Git-Dirty-Prüfung**

### Architektur-Probleme:
- Fehlende Lock-Mechanismen
- Keine Transaktionssicherheit
- Blockierende I/O-Operationen
- Unzureichende Test-Abdeckung

### Empfohlene nächste Schritte:
1. File-Locking implementieren
2. Tests für `status_manager.mjs` schreiben
3. Verzeichnisstruktur konsistent machen
4. Error-Recovery für alle File-Operationen
5. Integrationstests für gesamte Pipeline

---

**Gesamtbewertung:**
- Code-Qualität: **C** (funktional aber fragil)
- Robustheit: **D** (keine Concurrency-Sicherheit)
- Wartbarkeit: **B** (gute Struktur, klare Trennung)
- Test-Abdeckung: **F** (fast keine Tests)

**Empfohlung:** Produktivbetrieb erst nach Fix der CRITICAL Issues.
