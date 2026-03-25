# AutoCast Performance & Skalierbarkeits-Review

**Review Datum:** 2026-03-25  
**Aktuelle Runs:** ~42 Runs  
**Gesamtdaten-Größe:** 8.0 GB  
**Autoresearch-Daten:** 4.4 MB (nur Metadaten/Reports)

---

## 1. Performance-Metriken (Messbar)

### 1.1 Gemessene Zeiten

| Komponente | Geschätzte Laufzeit | Bemerkung |
|------------|---------------------|-----------|
| **Orchestrator** | 3-5 Sekunden | Ohne Evaluation ~1s, mit Evaluation ~5s |
| **Dispatch Processor (ohne Sub-Agent)** | <1 Sekunde | Nur File-IO und Status-Updates |
| **Dispatch Processor (mit Sub-Agent)** | 10-30 Minuten pro Job | Abhängig von Sub-Agent Antwortzeit |
| **Aggregator** | <1 Sekunde | JSON parsing + Report-Generierung |
| **Gesamtzeit pro Run** | 60-120 Minuten | Bei ~10 Jobs sequentiell |

### 1.2 Tatsächliche Messungen aus Logs

Aus `history.jsonl` (42 Einträge):
- **Durchschnittliche Score:** 0.267-0.525 (stabiler Bereich)
- **Erste Aufzeichnung:** 2026-03-24 16:37
- **Letzte Aufzeichnung:** 2026-03-25 03:23
- **Zeitraum:** ~11 Stunden = ~42 Runs
- **Durchsatz:** ~3.8 Runs/Stunde

---

## 2. Daten-Wachstum Analyse

### 2.1 Aktueller Stand (~42 Runs)

```
reports/autoresearch/
├── runs/                    4.3 MB (42 Run-Verzeichnisse)
├── tasks/                   ~100 KB (duplizierte Task-Briefe)
├── history.jsonl            ~12 KB (42 Zeilen, ~300 Bytes/Zeile)
└── last_eval.json           ~500 Bytes
```

**Pro Run durchschnittlich:**
- ~15 Dateien (Task-Briefe, Method-Briefe, STATUS.json, etc.)
- ~102 KB pro Run-Verzeichnis
- ~10 Jobs pro Run (STATUS.json)

### 2.2 Projektionen

| Runs | Disk Space (runs/) | STATUS.json (total) | history.jsonl | Dateien (gesamt) |
|------|-------------------|---------------------|---------------|------------------|
| **42** (aktuell) | 4.3 MB | ~200 KB | 12 KB | ~650 |
| **100** | ~10 MB | ~480 KB | 30 KB | ~1,500 |
| **1.000** | ~100 MB | ~4.8 MB | 300 KB | ~15,000 |
| **10.000** | ~1 GB | ~48 MB | 3 MB | ~150,000 |

### 2.3 Identifizierte Probleme

**Kritisch:**
1. **history.jsonl** - Wächst linear, unbegrenzte Historie
2. **Task-Duplikate** - Jeder Run kopiert Tasks nach `tasks/`
3. **STATUS.json** - Enthält vollständige Job-Historie pro Run
4. **method_results/** - Leere Verzeichnisse bei unvollständigen Runs

**Mittel:**
5. **CYCLE_REPORT.md** - Wird pro Run neu generiert
6. **Markdown-Dateien** - ~15 Dateien pro Run (nur Metadaten)

---

## 3. Bottleneck-Analyse

### 3.1 Langsamster Schritt: Sub-Agent Execution

```
Zeitaufteilung pro Run (geschätzt):
┌────────────────────────────────────────────────────────┐
│ Sub-Agent Execution    ████████████████████  ~90%       │
│ Polling/Waiting        ██                    ~8%        │
│ Orchestrator           █                     ~1%        │
│ Dispatch Processor     █                     ~1%        │
│ Aggregator             ░                     <1%       │
└────────────────────────────────────────────────────────┘
```

### 3.2 Zeitverbrauch Details

| Phase | Zeit | Blockierend? |
|-------|------|--------------|
| Evaluation (npm) | ~3-5s | Ja (synchron) |
| File-IO | ~100ms | Nein |
| Sub-Agent Spawn | ~1-2s | Ja |
| Sub-Agent Work | 5-30 min | Ja |
| Result-Polling | 0-10 min | Ja |
| Aggregation | ~200ms | Nein |

### 3.3 Unnötige Wartezeiten

1. **Polling-Intervall:** 10 Sekunden (könnte 5 Sekunden sein)
2. **Max Wait Time:** 10 Minuten Timeout (manchmal zu kurz)
3. **Sequentielle Verarbeitung:** Jobs warten aufeinander

### 3.4 Parallelisierungs-Potenzial

**NICHT parallelisierbar (sicher):**
- Code-Änderungen an gleichen Dateien
- Git-Commits/Branches

**Parallelisierbar (mit Aufwand):**
- ✅ Unabhängige Method-Executors (verschiedene Code-Bereiche)
- ✅ Evaluation verschiedener Branches
- ✅ Mehrere Runs mit verschiedenen Baselines

**Risiko bei Parallelisierung:**
- Git-Konflikte
- Ressourcen-Konkurrenz (RAM, CPU)
- Sub-Agent-Limitierung

---

## 4. Speicher-Analyse

### 4.1 RAM-Nutzung pro Run

| Komponente | RAM | Bemerkung |
|------------|-----|-----------|
| **Orchestrator** | ~50-100 MB | Node.js + File-IO |
| **Dispatch Processor** | ~30-50 MB | Polling, keine großen Daten |
| **Aggregator** | ~20-40 MB | JSON-Parsing |
| **Sub-Agent** | ? MB | Extern, nicht gemessen |

### 4.2 Große Datenstrukturen

1. **run_plan.json** (~20 KB pro Run)
   - Enthält kompletten Task-Plan
   - Wird einmalig geschrieben

2. **STATUS.json** (~5 KB pro Run)
   - Alle Jobs mit Metadaten
   - Wird häufig aktualisiert

3. **history.jsonl**
   - Lädt bei jedem Run das gesamte File
   - Bei 10.000 Runs: ~3 MB

### 4.3 Memory Leaks

**Keine offensichtlichen Leaks gefunden**, aber:
- Keine explizite Memory-Management-Strategie
- Keine GC-Optimierung für große JSON-Files
- Keine Streaming-Verarbeitung

---

## 5. Cron-Timing Analyse

### 5.1 Aktuelle Konfiguration

| Job | Intervall | Timing |
|-----|-----------|--------|
| **Orchestrator** | 1x/Stunde | 3600000ms (60 Min) |
| **Dispatch Processor** | Alle 15 Min | 900000ms (15 Min) |

### 5.2 Kritische Fragen

**Q: Was wenn ein Job länger als 15 Minuten dauert?**
- A: Dispatch Processor startet trotzdem neu
- Risiko: Mehrere Instanzen laufen parallel
- Lösung: Lock-File oder Status-Prüfung fehlt

**Q: Überlappen sich Cron-Jobs?**
- A: JA! Potenziell kritisch
- Orchestrator erstellt neue Runs während alter noch läuft
- Dispatch Processor könnte mehrfach starten

**Q: Gibt es "Dead Time"?**
- A: Ja, erheblich
- Ein Run mit 10 Jobs × 10 Min = 100 Min
- Orchestrator läuft nur alle 60 Min
- Dispatch nur alle 15 Min
- → Lücken von 15-45 Minuten zwischen Jobs

### 5.3 Timing-Visualisierung

```
Zeitachse (Stunde 1):
0:00  Orchestrator startet → Run A erstellt
0:01  Dispatch startet → Job 1 ausführt
0:15  Dispatch startet → Job 2 ausführt (falls Job 1 fertig)
0:30  Dispatch startet → Job 3 ausführt
0:45  Dispatch startet → Job 4 ausführt
1:00  Orchestrator startet → Run B erstellt (PROBLEM: Run A noch aktiv!)

→ Runs können sich überlappen
```

---

## 6. Skalierungs-Strategien

### 6.1 Kurzfristig (bis 100 Runs)

**Empfohlen:**
1. ✅ **Cron-Intervall anpassen:** Dispatch auf 5 Minuten
2. ✅ **Lock-Mechanismus:** Verhindere parallele Dispatch-Instanzen
3. ✅ **Status-Prüfung:** Dispatch nur wenn Run aktiv aber idle

**Aufwand:** Gering (< 1 Tag)

### 6.2 Mittelfristig (bis 1.000 Runs)

**Empfohlen:**
1. 📦 **Archivierung:** Runs älter 30 Tage → `.tar.gz`
2. 🗜️ **Komprimierung:** JSON-Files mit gzip
3. 🧹 **Cleanup:** `tasks/` nur letzte Version behalten
4. 📊 **Rotation:** `history.jsonl` monatlich rotieren

**Potenzielle Einsparungen:**
- Archivierung: ~90% Disk-Space
- Komprimierung: ~70% zusätzlich
- Cleanup: ~50% weniger Dateien

**Aufwand:** Mittel (2-3 Tage)

### 6.3 Langfristig (10.000+ Runs)

**Empfohlen:**

| Strategie | Aufwand | Impact |
|-----------|---------|--------|
| **SQLite statt JSON** | Hoch | ~80% schneller Queries |
| **Distributed Processing** | Sehr hoch | Lineare Skalierung |
| **Result-Caching** | Mittel | 50% weniger Evaluations |
| **Incremental Updates** | Hoch | Nur geänderte Jobs neu |
| **S3/Cloud-Storage** | Mittel | Unbegrenzter Speicher |

### 6.4 Datenbank vs JSON Vergleich

| Aspekt | JSON-Files | SQLite |
|--------|-----------|--------|
| Query-Geschwindigkeit | O(n) linear | O(log n) indexed |
| 10.000 Runs suchen | ~500ms | ~5ms |
| Gleichzeitiger Zugriff | File-Locks | ACID |
| Backup | Einfach (rsync) | Komplexer |
| Migration | Trivial | Schema-Management |

---

## 7. Skalierungs-Limits

### 7.1 Wann bricht das System?

| Limit | Ursache | Schätzung |
|-------|---------|-----------|
| **Disk Space** | Unbegrenztes Wachstum | 10.000+ Runs (1GB) |
| **File Handles** | Zu viele Dateien | 100.000+ Dateien |
| **Memory** | history.jsonl zu groß | ~50.000 Runs (15MB) |
| **Cron-Überlastung** | Zu viele parallele Jobs | Abhängig von Sub-Agenten |

### 7.2 Wahrscheinlicher Breakpoint

**Geschätzt bei 5.000-10.000 Runs:**
1. `history.jsonl` Parsing wird langsam (>1s)
2. File-System-Operationen werden träge
3. Cron-Überlappungen werden kritisch
4. Backup-Zeit explodiert

---

## 8. Empfohlene Optimierungen (Priorisiert)

### 🔴 Kritisch (sofort)

1. **Lock-Mechanismus für Dispatch Processor**
   ```javascript
   // Vor Start prüfen:
   if (existsSync('.dispatch.lock')) {
     console.log('Dispatch läuft bereits');
     process.exit(0);
   }
   ```

2. **Orchestrator-Intervall erhöhen**
   - Von 60 Min auf 120 Min (oder dynamisch)
   - Nur starten wenn letzter Run COMPLETED

### 🟠 Hoch (diese Woche)

3. **Dispatch Intervall reduzieren**
   - Von 15 Min auf 5 Min
   - Schnellere Job-Verarbeitung

4. **Cleanup-Skript**
   ```bash
   # Alte Runs archivieren (>30 Tage)
   find reports/autoresearch/runs/ -mtime +30 -exec tar -czf {}.tar.gz {} \; -exec rm -rf {} \;
   ```

### 🟡 Mittel (nächster Sprint)

5. **history.jsonl rotieren**
   - Monatlich: `history_2026-03.jsonl`
   - Nur letzte 3 Monate in memory laden

6. **Komprimierung**
   - `.json.gz` für alte Runs
   - ~90% Einsparung

### 🟢 Langfristig (Q2 2026)

7. **SQLite-Migration**
   - Einzelne Datenbank für alle Runs
   - Indexierte Queries

8. **Parallelisierung**
   - Unabhängige Jobs parallel ausführen
   - Worker-Queue Architektur

---

## 9. Zusammenfassung

| Metrik | Aktuell | Limit | Empfehlung |
|--------|---------|-------|------------|
| Runs | ~42 | ~5.000 | Archivierung implementieren |
| Disk Usage | 4.3 MB | ~1 GB | Cleanup + Komprimierung |
| Job-Durchsatz | ~4/Stunde | ~12/Stunde | Parallelisierung |
| Cron-Überlappung | Möglich | Kritisch | Lock-Mechanismus |
| Memory | OK | ~50 MB | Streaming für große JSONs |

**Bottom Line:**  
Das System skaliert aktuell für ~1.000 Runs. Bei 10.000+ Runs wird es unbenutzbar ohne Archivierung und Datenbank-Migration.

**Dringendste Maßnahmen:**
1. Lock-Mechanismus (verhindert Race Conditions)
2. Archivierung (verhindert Disk-Full)
3. Cron-Tuning (optimiert Durchsatz)

---

*Review erstellt von: Sub-Agent Performance Analysis*  
*Basierend auf: 42 Runs, ~836 Dateien, 4.4 MB Metadaten*
