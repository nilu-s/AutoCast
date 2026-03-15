# Engineering Guardrails

Diese Regeln gelten fuer Architekturpflege, Refactors und Strukturarbeiten.

## Harte Invarianten

1. Keine unbeabsichtigten Verhaltensaenderungen in reinen Split-/Move-Phasen.
2. Panel darf Analyzer-Interna nicht direkt importieren.
3. Kommunikation nur ueber Adapter, API und Vertraege.
4. Runtime-Entry-Points stabil halten:
   - `apps/panel/js/main.js`
   - `packages/analyzer/src/analyzer.js`
5. Vor Abschluss immer `npm run check`.

## Empfohlene Refactor-Reihenfolge

1. Zuerst pure Helper extrahieren.
2. Dann State/Komponenten trennen.
3. Danach Orchestrierung vereinfachen.
4. Abschliessend Tests nachziehen/haerten.

## Legacy-Abbau (verbindlich)

1. Bei neuen Loesungsansaetzen standardmaessig den alten Ansatz ersetzen, nicht parallel mitfuehren.
2. Alte Heuristiken/Fallbacks entfernen, wenn sie durch den neuen Ansatz fachlich ersetzt sind.
3. Rueckwaertskompatibilitaet nur dort halten, wo ein konkreter Runtime- oder API-Vertrag sie erzwingt.
4. Falls Legacy verbleibt:
   - Grund benennen (z. B. externer Vertrag, Migrationsfenster)
   - isoliert halten (kein Durchmischen in neuer Kernlogik)

## Strukturregeln

- Zielstruktur wird durch `scripts/check_structure.js` erzwungen.
- Neue produktive Ordner sollten nicht dauerhaft nur `.gitkeep` enthalten.
- Wenn neue Pflichtordner entstehen, `check_structure.js` aktualisieren.

## Testregeln

- Unit/Integration/E2E via Manifeste steuern.
- Neue Tests immer in passendes Manifest einhaengen.
- Keine stillen Testdateien ohne Runner-Integration.
- Testdateien klein und fokussiert halten:
  - Soft-Limit `<= 150` Zeilen
  - Hard-Limit `<= 220` Zeilen
- Pro Testdatei nur ein Hauptthema; grosse Sammeldateien aufteilen.
- Panel-Tests ko-lokal in `apps/panel/src/**/tests/*.test.js` halten.
- Analyzer-Tests ko-lokal in `packages/analyzer/src/**/tests/*.test.js` halten.
- Gemeinsame Test-Helfer in `packages/analyzer/src/tests/helpers/*` auslagern.

## Dokumentationsregeln

- Architektur- und Prozessdokumente konsistent halten (`README.md`, `docs/architecture.md`, `docs/llm/*`).
- Bei Struktur- oder Workflow-Aenderungen die betroffenen Doku-Einstiege aktualisieren.
