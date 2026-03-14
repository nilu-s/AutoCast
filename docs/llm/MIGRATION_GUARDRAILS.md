# Migration Guardrails

Diese Regeln gelten waehrend der laufenden Architektur-Transformation.

## Harte Invarianten

1. Keine funktionalen Verhaltensaenderungen in reinen Split-/Move-Phasen.
2. Panel darf Analyzer-Interna nicht direkt importieren.
3. Kommunikation nur ueber Adapter, API und Vertraege.
4. Runtime-Entry-Points stabil halten:
   - `apps/panel/js/main.js`
   - `packages/analyzer/src/analyzer.js`
5. Vor Abschluss immer `npm run check`.

## Migrationsreihenfolge

1. Zuerst pure Helper extrahieren.
2. Dann State/Komponenten trennen.
3. Danach Orchestrierung vereinfachen.
4. Abschliessend Tests nachziehen/haerten.

## Strukturregeln

- Zielstruktur wird durch `scripts/check_structure.js` erzwungen.
- Neue produktive Ordner sollten nicht dauerhaft nur `.gitkeep` enthalten.
- Wenn neue Pflichtordner entstehen, `check_structure.js` aktualisieren.

## Testregeln

- Unit/Integration/E2E via Manifeste steuern.
- Neue Tests immer in passendes Manifest einhaengen.
- Keine stillen Testdateien ohne Runner-Integration.

## Dokumentationsregeln

- Phasenstand in `docs/architecture.md` fortschreiben.
- Neue Migrationsvorhaben in `docs/migration_next_3_phases_todo.md` spiegeln.
