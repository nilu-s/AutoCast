# AutoResearch Maintenance Guide

Regelmäßige Wartungsaufgaben für den AutoCast AutoResearch Workflow.

## Täglich

### 1. Run-Status prüfen

```bash
# Aktuellen Status anzeigen
ls -lt reports/autoresearch/runs/ | head -5

# Letzten Run prüfen
latest=$(ls -t reports/autoresearch/runs/ | head -1)
cat reports/autoresearch/runs/$latest/STATUS.json | jq '{overallStatus, completedAt, summary}'
```

### 2. Fehler-Logs checken

```bash
# Letzte Fehler in Runs suchen
grep -r "FAILED" reports/autoresearch/runs/*/STATUS.json 2>/dev/null | tail -10

# Offene (PENDING) Jobs > 1 Stunde
for dir in reports/autoresearch/runs/*/; do
  if [ -f "$dir/STATUS.json" ]; then
    age=$(( ($(date +%s) - $(stat -c %Y "$dir/STATUS.json")) / 3600 ))
    if [ $age -gt 1 ]; then
      pending=$(cat "$dir/STATUS.json" | jq '[.jobs[] | select(.status == "PENDING")] | length')
      if [ "$pending" -gt 0 ]; then
        echo "$dir: ${pending} PENDING jobs (age: ${age}h)"
      fi
    fi
  fi
done
```

## Wöchentlich

### 1. Alte Runs archivieren (>30 Tage)

```bash
#!/bin/bash
# archive_old_runs.sh

ARCHIVE_DIR="reports/autoresearch/archive"
RUNS_DIR="reports/autoresearch/runs"
CUTOFF_DAYS=30

mkdir -p "$ARCHIVE_DIR"

find "$RUNS_DIR" -type d -name "20*" -mtime +$CUTOFF_DAYS | while read dir; do
  if [ -d "$dir" ]; then
    basename=$(basename "$dir")
    echo "Archiving: $basename"
    tar -czf "$ARCHIVE_DIR/${basename}.tar.gz" -C "$RUNS_DIR" "$basename"
    rm -rf "$dir"
  fi
done

echo "Archivierung abgeschlossen."
ls -lh "$ARCHIVE_DIR"
```

### 2. Logs rotieren

```bash
#!/bin/bash
# rotate_logs.sh

LOG_DIR="logs"
MAX_SIZE_MB=100

if [ -f "$LOG_DIR/autoresearch.log" ]; then
  size_mb=$(du -m "$LOG_DIR/autoresearch.log" | cut -f1)
  if [ $size_mb -gt $MAX_SIZE_MB ]; then
    mv "$LOG_DIR/autoresearch.log" "$LOG_DIR/autoresearch_$(date +%Y%m%d).log"
    gzip "$LOG_DIR/autoresearch_$(date +%Y%m%d).log"
    echo "Log rotiert: ${size_mb}MB"
  fi
fi

# Alte Logs löschen (>90 Tage)
find "$LOG_DIR" -name "*.gz" -mtime +90 -delete
```

### 3. Disk-Space überwachen

```bash
#!/bin/bash
# check_disk_space.sh

THRESHOLD=80
USAGE=$(df . | awk 'NR==2 {print $5}' | sed 's/%//')

if [ "$USAGE" -gt "$THRESHOLD" ]; then
  echo "WARNUNG: Disk usage ${USAGE}% > ${THRESHOLD}%"
  
  # Größte Verzeichnisse anzeigen
  echo "Größte Verzeichnisse:"
  du -sh reports/autoresearch/runs/*/ 2>/dev/null | sort -hr | head -10
  
  # Archiv-Größe
  if [ -d "reports/autoresearch/archive" ]; then
    echo "Archiv-Größe: $(du -sh reports/autoresearch/archive | cut -f1)"
  fi
fi
```

## Monatlich

### 1. Backup wichtiger Dateien

```bash
#!/bin/bash
# backup_autoresearch.sh

BACKUP_DIR="backups/$(date +%Y%m)"
mkdir -p "$BACKUP_DIR"

# Konfiguration
cp -r docs/llm/autoresearch/runtime "$BACKUP_DIR/"

# Letzte 10 Runs
ls -t reports/autoresearch/runs/ | head -10 | while read run; do
  cp -r "reports/autoresearch/runs/$run" "$BACKUP_DIR/"
done

# History
if [ -f "reports/autoresearch/history.jsonl" ]; then
  cp "reports/autoresearch/history.jsonl" "$BACKUP_DIR/"
fi

# Tar erstellen
tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

echo "Backup erstellt: ${BACKUP_DIR}.tar.gz"
```

### 2. Performance-Review

```bash
#!/bin/bash
# performance_review.sh

echo "=== AutoResearch Performance Review ==="
echo ""

# Durchschnittliche Run-Dauer
echo "Durchschnittliche Run-Dauer (letzte 30 Tage):"
cat reports/autoresearch/history.jsonl 2>/dev/null | \
  jq -r 'select(.generatedAt > (now - 2592000)) | "\(.runId): \(.objectiveScore)"' | \
  tail -20

# Anzahl Runs pro Woche
echo ""
echo "Runs pro Woche:"
cat reports/autoresearch/history.jsonl 2>/dev/null | \
  jq -r '.generatedAt | split("T")[0]' | \
  sort | uniq -c | tail -10

# Success Rate
echo ""
echo "Success Rate (letzte 30 Runs):"
total=$(ls reports/autoresearch/runs/*/CYCLE_REPORT.md 2>/dev/null | wc -l)
completed=$(grep -l "overallStatus.*COMPLETED" reports/autoresearch/runs/*/STATUS.json 2>/dev/null | wc -l)
if [ $total -gt 0 ]; then
  rate=$((completed * 100 / total))
  echo "${completed}/${total} = ${rate}%"
fi
```

### 3. Dependencies updaten

```bash
# Node.js Dependencies
npm outdated
npm update

# Test nach Update
npm test
npm run check
```

## Bei Problemen

### Cron-Jobs reparieren

```bash
# Status prüfen
node scripts/autoresearch/setup_orchestrator_cron.js --status
node scripts/autoresearch/setup_dispatch_cron.js --status

# Neu initialisieren
node scripts/autoresearch/setup_orchestrator_cron.js --disable
node scripts/autoresearch/setup_orchestrator_cron.js --enable

node scripts/autoresearch/setup_dispatch_cron.js --disable
node scripts/autoresearch/setup_dispatch_cron.js --enable
```

### Stuck Runs bereinigen

```bash
#!/bin/bash
# cleanup_stuck_runs.sh

# Runs > 24h ohne Abschluss
find reports/autoresearch/runs/ -name "STATUS.json" -mtime +1 | while read status; do
  dir=$(dirname "$status")
  overall=$(cat "$status" | jq -r '.overallStatus')
  if [ "$overall" != "COMPLETED" ] && [ "$overall" != "FAILED" ]; then
    echo "Stuck run: $dir (status: $overall)"
    # Option: Als FAILED markieren
    # cat "$status" | jq '.overallStatus = "FAILED" | .completedAt = now' > "$status.tmp" && mv "$status.tmp" "$status"
  fi
done
```

### Disk voll

```bash
# Sofortmaßnahmen

# 1. Alte Runs löschen (>60 Tage)
find reports/autoresearch/runs/ -type d -mtime +60 -exec rm -rf {} + 2>/dev/null

# 2. Logs komprimieren
find logs/ -name "*.log" -size +10M -exec gzip {} \;

# 3. Node Modules bereinigen
npm prune

# 4. Temp-Dateien löschen
find /tmp -name "autoresearch_*" -mtime +1 -delete
```

## Monitoring Dashboard

Erstelle ein einfaches Dashboard:

```bash
#!/bin/bash
# dashboard.sh

clear
echo "╔══════════════════════════════════════════════════════════╗"
echo "║           AutoResearch Dashboard                         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Aktiver Run
latest=$(ls -t reports/autoresearch/runs/ 2>/dev/null | head -1)
if [ -n "$latest" ]; then
  echo "📊 Aktiver Run: $latest"
  cat "reports/autoresearch/runs/$latest/STATUS.json" 2>/dev/null | jq -r '
    "   Status: \(.overallStatus // "N/A")\n" +
    "   Jobs: \(.summary.totalJobs // 0) total, \(.summary.completedJobs // 0) completed\n" +
    "   Erstellt: \(.createdAt // "N/A")[0:19]"
  '
fi
echo ""

# Cron Status
echo "⏰ Cron Jobs:"
if [ -f ".cron/orchestrator_enabled" ]; then
  echo "   Orchestrator: ✅ Enabled"
else
  echo "   Orchestrator: ❌ Disabled"
fi
if [ -f ".cron/dispatch_enabled" ]; then
  echo "   Dispatch:     ✅ Enabled"
else
  echo "   Dispatch:     ❌ Disabled"
fi
echo ""

# Disk Usage
echo "💾 Disk Usage:"
df -h . | awk 'NR==2 {print "   " $5 " used (" $3 "/" $2 ")"}'
echo ""

# Letzte 3 Runs
echo "📈 Letzte 3 Runs:"
ls -t reports/autoresearch/runs/ 2>/dev/null | head -3 | while read run; do
  score=$(cat "reports/autoresearch/runs/$run/CYCLE_REPORT.md" 2>/dev/null | grep -o "objectiveScore: [0-9.]*" | cut -d: -f2 | tr -d ' ')
  status=$(cat "reports/autoresearch/runs/$run/STATUS.json" 2>/dev/null | jq -r '.overallStatus // "UNKNOWN"')
  echo "   $run - $status (Score: ${score:-N/A})"
done
```

## Appendix

### Wichtige Pfade

| Pfad | Zweck |
|------|-------|
| `reports/autoresearch/runs/` | Alle Run-Verzeichnisse |
| `reports/autoresearch/tasks/` | Aktuelle Task-Briefs |
| `reports/autoresearch/history.jsonl` | Historische Metriken |
| `.cron/` | Cron-Status-Dateien |
| `docs/llm/autoresearch/runtime/` | Konfigurationen |

### Nützliche Aliases

```bash
# ~/.bashrc oder ~/.zshrc
alias ar-status='cat reports/autoresearch/runs/latest/STATUS.json 2>/dev/null | jq ".overallStatus"'
alias ar-latest='cat reports/autoresearch/runs/latest/CYCLE_REPORT.md 2>/dev/null | head -20'
alias ar-runs='ls -lt reports/autoresearch/runs/ | head -10'
alias ar-logs='tail -f logs/autoresearch.log 2>/dev/null || echo "No log file"'
alias ar-dashboard='watch -n 30 "bash dashboard.sh"'
```

---

*Maintenance Guide v1.0 | AutoCast AutoResearch*
