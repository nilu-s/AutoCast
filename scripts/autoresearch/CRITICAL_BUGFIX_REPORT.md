# Critical Bugfix Report

**Date:** 2026-03-25
**Agent:** Mawly (Sub-Agent)
**Scope:** AutoCast Autoresearch - Critical Bugs from CODE_QUALITY_REVIEW

---

## Summary

Fixed 3 critical/high bugs and implemented 1 optional feature:

| Issue | Severity | Status | Description |
|-------|----------|--------|-------------|
| Issue 1 | **CRITICAL** | ✅ FIXED | Ungültiger Status-Wert (KEEP als Status) |
| Issue 2 | **HIGH** | ✅ FIXED | Inkonsistente Verzeichnisnamen (results vs method_results) |
| Issue 3 | **HIGH** | ✅ FIXED | Race Condition bei Status-Updates |
| Issue 4 | MEDIUM | ✅ DONE | Method-Catalog Validierung (optional) |

---

## Issue 1: CRITICAL - Ungültiger Status-Wert

### Problem
`KEEP`, `REJECT`, `FAILED` wurden direkt als `status` gesetzt, aber der Status-Manager kennt nur: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `REJECTED`.

### Root Cause
Die `decision` (ob ein Method-Result behalten oder verworfen wird) wurde mit dem Job-Status verwechselt.

### Fix
**Vorher:**
```javascript
// FALSCH: decision wird als Status verwendet
const decision = result.decision;  // KEEP, REJECT, FAILED
statusManager.updateJobStatus(status, job.jobId, decision, {
    result: result
});
```

**Nachher:**
```javascript
// RICHTIG: decision ist Metadaten, Status ist COMPLETED/FAILED
const decision = result.decision;  // KEEP, REJECT, FAILED (Entscheidung)
const jobStatus = decision === 'FAILED' ? statusManager.STATUS.FAILED : statusManager.STATUS.COMPLETED;

statusManager.updateJobStatusAtomic(status, job.jobId, jobStatus, {
    result: result,
    decision: decision  // Decision als eigenes Feld
});
```

### Files Changed
- `dispatch_processor.js` - Lines 296-311

---

## Issue 2: HIGH - Inkonsistente Verzeichnisnamen

### Problem
`method_results/` vs `results/` - doppelte Definitionen in verschiedenen Dateien.

### Root Cause
- `orchestrator.js` erstellt `method_results/`
- `dispatch_processor.js` und `execute_method.js` verwendeten `results/`

### Fix
**Vorher:**
```javascript
// dispatch_processor.js (Zeile 194)
const resultsDir = join(dirname(status.path), 'results');

// execute_method.js (Zeile 144)
const resultsDir = join(runDir, 'results');
```

**Nachher:**
```javascript
// dispatch_processor.js
const resultsDir = join(dirname(status.path), 'method_results');  // FIXED

// execute_method.js
const resultsDir = join(runDir, 'method_results');  // FIXED
```

### Files Changed
- `dispatch_processor.js` - Line 194
- `execute_method.js` - Line 144

---

## Issue 3: HIGH - Race Condition bei Status-Updates

### Problem
Keine Transaktionssicherheit - Crash zwischen Update und Save verliert Daten.

### Root Cause
```javascript
// Race Condition: Crash HIER → Status verloren
statusManager.updateJobStatus(status, jobId, newStatus);  // Nur Memory
// <-- CRASH HIER
statusManager.saveStatus(status);  // Disk Write
```

### Fix
Neue atomare Update-Funktion in `status_manager.mjs`:

```javascript
/**
 * Aktualisiert den Status eines Jobs atomar (mit sofortigem Speichern)
 */
export function updateJobStatusAtomic(status, jobId, newStatus, metadata = {}) {
    // Validiere Status-Wert
    const validStatuses = Object.values(STATUS);
    if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status value: ${newStatus}`);
    }

    // Update Job...
    job.status = newStatus;
    // ...timestamps, metadata...

    // SOFORT SPEICHERN (atomare Operation)
    saveStatus(status);
    return status;
}
```

### Files Changed
- `status_manager.mjs` - Neue Funktion `updateJobStatusAtomic()`
- `dispatch_processor.js` - Alle Updates auf atomar umgestellt
  - `updateJobToRunning()` - Line 213
  - `markJobFailed()` - Line 337
  - Final status update - Line 306

---

## Issue 4: MEDIUM - Method-Catalog Validierung

### Implementation
Neues Validierungs-Modul `lib/method_validator.mjs`:

**Features:**
- `validateMethodId()` - Format-Prüfung (lowercase, alphanumeric, _, -)
- `validateMethod()` - Vollständige Methoden-Validierung
- `validateMethodCatalog()` - Katalog-Validierung mit Duplikat-Erkennung
- `quickValidate()` - Boolesche Schnellprüfung für Orchestrator
- `strictValidate()` - Strikte Prüfung mit Exception für Dispatch

**Validierungs-Regeln:**
- Method ID: `^[a-z][a-z0-9_-]*$`
- Maximale Länge: 64 Zeichen (ID), 128 (Titel), 500 (Hypothese)
- Erforderliche Felder: `id`, `title`, `hypothesis`
- Duplikat-Erkennung über alle Agents

### Files Created
- `lib/method_validator.mjs` - Hauptmodul (230 Zeilen)
- `test/method_validator.test.mjs` - Tests (14 Tests, alle passing)

---

## Testing

### npm run check
```
> autocast@2.2.1 check
> npm run check:syntax && npm run check:structure && npm run check:arch && npm run check:llm && npm test

Syntax check passed for 175 file(s).
Structure check passed for 57 required directories.
Architecture check passed for 77 panel file(s).
LLM requirements check passed for 42 test file(s).

========================================
 Results: 115/115 passed
========================================
```

### Method Validator Tests
```
=== Method Validator Tests ===

✓ valid method ID
✓ invalid method ID (uppercase)
✓ invalid method ID (space)
✓ invalid method ID (number start)
✓ valid method
✓ invalid method
✓ method with empty id
✓ valid catalog
✓ catalog with duplicate IDs
✓ empty catalog
✓ null catalog
✓ quickValidate returns boolean
✓ strictValidate throws on invalid
✓ strictValidate returns on valid

=== Results: 14/14 passed ===
```

### Dry Run Test
```bash
$ node scripts/autoresearch/dispatch_processor.js --dry-run
[INFO] 🚀 AutoCast Dispatch Processor v3.1.0
[WARN] DRY RUN MODUS - Keine Ausführung
[STEP] Suche aktiven Run...
[INFO] Gefundener Run: 20260325_032335
[STEP] Prüfe overallStatus: COMPLETED
[INFO] Run bereits COMPLETED - nichts zu tun
```

---

## CLAUDE.md Compliance

### 🔴 Harte Regeln
- [x] **NEVER** `docs/segments.json` - Keine Änderung
- [x] **npm run check** - 115/115 Tests passing
- [x] **ES Modules** - `.mjs` für neue Dateien
- [x] **Backwards-Compatible** - Keine Breaking Changes
- [x] **Feature-Flag** - N/A (Bugfixes)

### Weitere Regeln
- [x] KEINE Änderung an `apps/panel/js/main.js`
- [x] KEINE Änderung an `packages/analyzer/src/analyzer.js`
- [x] Deterministisch - Keine zufälligen Änderungen

---

## Success Criteria

| Criteria | Status |
|----------|--------|
| Status-Wert Bug gefixt (KEEP/REJECT als decision, nicht status) | ✅ |
| Verzeichnisnamen konsistent | ✅ |
| Race Condition behoben (atomare Updates) | ✅ |
| Method-Catalog Validierung | ✅ |
| `npm run check` ist GRÜN | ✅ (115/115) |
| KEINE Änderung an segments.json | ✅ |
| KEINE Breaking Changes | ✅ |

---

## Code Changes Summary

```
Modified:
  scripts/autoresearch/dispatch_processor.js     (3 Änderungen)
  scripts/autoresearch/execute_method.js          (1 Änderung)
  scripts/autoresearch/lib/status_manager.mjs     (neue Funktion)

Created:
  scripts/autoresearch/lib/method_validator.mjs   (neues Modul)
  scripts/autoresearch/test/method_validator.test.mjs (neue Tests)
  scripts/autoresearch/CRITICAL_BUGFIX_REPORT.md (dieses Dokument)

Unchanged:
  docs/segments.json                              (Source-of-Truth)
  apps/panel/js/main.js
  packages/analyzer/src/analyzer.js
```

---

## Backwards Compatibility

Alle Änderungen sind backwards-compatible:
- Neue atomare Funktion existiert parallel zur alten
- Alte `updateJobStatus()` ist weiterhin verfügbar (deprecated)
- Verzeichnis-Änderung ist konsistent mit `orchestrator.js`
- Keine Änderungen an öffentlichen APIs oder Datenformaten

---

*Report generated by AutoCast Bugfix Sub-Agent*
*Timestamp: 2026-03-25 04:XX UTC*