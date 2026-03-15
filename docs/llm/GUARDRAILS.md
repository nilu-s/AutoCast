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

## Legacy-Ersatzregel (hart, verbindlich)

1. Standardfall: neuer Ansatz ersetzt alten Ansatz vollstaendig.
2. Nicht erlaubte Standardmuster:
   - parallele Runtime-Pfade fuer alt und neu
   - Fallbacks/Adapter nur zur stillen Legacy-Mitnahme
   - neue APIs, die intern weiter die Altlogik orchestrieren
3. Altlogik darf nur bleiben bei nachweisbarem Zwang:
   - aktiv genutzte externe Schnittstelle
   - echte interne Abhaengigkeit
   - explizit geforderte Rueckwaertskompatibilitaet
4. Entscheidungsregel:
   - Option A: Altlogik teilweise weitertragen, damit mehr Altfaelle laufen.
   - Option B: neuen Ansatz sauber als Primarpfad umsetzen und Code vereinfachen.
   - Vorgabe: standardmaessig Option B waehlen, ausser ein konkreter Zwang verlangt A.

## Nachweispflicht fuer verbleibende Legacy

Wenn Legacy bestehen bleibt, muss kurz dokumentiert werden:

1. Was bleibt konkret bestehen (Datei/Modul/Pfad)?
2. Welcher belegbare Zwang erzwingt das?
3. Warum ist Entfernung jetzt nicht sicher moeglich?
4. Wie ist die Stelle isoliert, damit sie die neue Kernlogik nicht aufblaeht?

Ohne diese Nachweise gilt die Legacy-Stelle als Abloesekandidat und soll entfernt werden.

## Pflicht-Check pro relevanter Aenderung

Vor Finalisierung aktiv pruefen:

1. Macht die Aenderung den Code schlanker?
2. Entfernt sie alte Komplexitaet?
3. Reduziert sie Sonderfaelle?
4. Ersetzt sie Altlogik wirklich?
5. Oder baut sie nur eine neue Schicht um alte Logik?

Wenn Punkt 5 zutrifft, Ansatz anpassen und vereinfachen.

## Empfohlene Refactor-Reihenfolge

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
