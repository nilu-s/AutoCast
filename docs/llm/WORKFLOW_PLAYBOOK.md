# Workflow Playbook

Konkrete "wenn Aufgabe X, dann Dateien Y" Regeln fuer LLM-Assistenten.

## Arbeitsregel

Bei jedem Workflow gilt:
- Nur die benoetigten Dateien anfassen.
- Zielstruktur bevorzugen: neue Loesung klar implementieren.
- Keine stille Legacy-Mitnahme.
- Danach immer `npm run check`.
- Neue Tests in das passende `suite_manifest.js` eintragen.

## Abloseregel (Legacy -> Zielansatz, verbindlich)

Bei Refactors und Neudesigns immer in dieser Reihenfolge arbeiten:

1. Zielansatz benennen:
   - Was ist der neue Primarpfad zur Laufzeit?
2. Altlogik markieren:
   - Welche Heuristiken/Fallbacks/Umwege werden dadurch ersetzt?
3. Altlogik klassifizieren:
   - muss bleiben
   - kann entfernt werden
   - wird nur aus Gewohnheit mitgetragen
4. Umsetzung:
   - neuer Ansatz wird der echte Runtime-Pfad
   - keine parallelen Altpfade ohne belegbaren Zwang
5. Bereinigung:
   - ersetzte Logik entfernen, stilllegen oder klar isolieren
6. Abschluss:
   - `npm run check`

## Nicht zulaessig ohne belegbaren Zwang

- Dual-Paths fuer alt und neu im Produktivpfad.
- "just in case"-Kompatibilitaet ohne konkrete Abhaengigkeit.
- neue Abstraktionsschichten, die nur Legacy kaschieren.
- neue oeffentliche APIs, die intern weiterhin Altlogik fahren.

## Zulaessige Gruende fuer verbleibende Legacy

- Aktiv genutzte externe Schnittstelle.
- Echte interne Abhaengigkeit.
- Explizit geforderte Rueckwaertskompatibilitaet.

Ohne einen dieser Gruende gilt Altlogik als Abloesekandidat und soll entfernt werden.

## Pflicht-Output im Abschlussbericht

Bei relevanten Architektur-/Flow-Aenderungen immer explizit nennen:

1. Welche Altlogik entfernt wurde.
2. Welche Altlogik nicht mehr zentral verwendet wird.
3. Welche Uebergangsschichten vermieden wurden.
4. Wo der Code schlanker geworden ist.
5. Welche Legacy-Teile aus zwingenden Gruenden bleiben mussten.
6. Warum diese verbleibenden Teile noch existieren.

## Test-Workflow (systematisch)

Wenn Tests zu gross oder unkoordiniert wirken, in genau dieser Reihenfolge arbeiten:

1. Inventur:
   - Groesste Testdateien identifizieren (Zeilenanzahl, Domaene, Ueberschneidungen).
2. Schnittplan:
   - Pro grosse Datei 2-5 kleinere Ziel-Dateien definieren.
   - Je Ziel-Datei ein klarer Scope (`<modul>.<aspekt>.test.js`).
3. Helper-Auslagerung:
   - Gemeinsame Builder/Fixtures nach `packages/analyzer/src/tests/helpers/*`.
4. Ko-Lokation:
   - Panel-Tests unter `apps/panel/src/**/tests`.
   - Analyzer-Tests unter `packages/analyzer/src/**/tests/*.test.js`.
5. Runner-Integration:
   - Alle neuen Pfade im passenden `suite_manifest.js` registrieren.
6. Abschluss:
   - `npm run check` und erst dann finalisieren.

## 1) Panel-Button oder Flow anpassen

Bearbeite:
- `apps/panel/js/main.js`
- `apps/panel/src/app/panel_flow_runtime_feature.js`
- Betroffenes Feature in `apps/panel/src/features/*/services/*`

Pruefe:
- UI-Status bleibt konsistent (`setStatus`, `setProgress`, `hideProgress`)
- Keine Regression in Analyze, Apply und Reset

## 2) Neue Analyzer-Parameter einbauen

Bearbeite:
- `packages/analyzer/src/core/utils/analyzer_params.js`
- `packages/analyzer/src/defaults/analyzer_defaults.js`
- Betroffene Pipeline-Stage in `packages/analyzer/src/core/pipeline/*`

Optional:
- Panel-Settings und Parameter-Read in `apps/panel/src/app/panel_params_feature.js`

## 3) Payload-Vertrag erweitern

Bearbeite:
- `packages/analyzer/src/core/contracts/analyzer_contracts.js`
- `apps/panel/src/core/contracts/panel_contracts.js`
- Betroffene Adapter, Worker und CLI

Tests:
- Contract-Tests plus betroffene Unit- und Integration-Tests erweitern

## 4) Cut-Preview Darstellung aendern

Bearbeite:
- `apps/panel/src/features/cut-preview/components/*`
- `apps/panel/src/features/cut-preview/services/cut_preview_render_feature.js`
- ggf. Runtime in `cut_preview_runtime_feature.js`

## 5) Track-Laden/Mapping aendern

Bearbeite:
- `apps/panel/src/features/tracks/services/tracks_loader_feature.js`
- `apps/panel/src/features/tracks/services/tracks_feature.js`
- Optional `apps/panel/jsx/get_track_info.jsx`

## 6) Host-Schnittoperationen aendern

Bearbeite:
- `apps/panel/src/adapters/host/csi_bridge_adapter.js`
- `apps/panel/js/csi_bridge.js`
- `apps/panel/jsx/apply_cuts.jsx`
- `apps/panel/jsx/host.jsx`

## 7) Analyzer-Postprocess anpassen

Bearbeite:
- `packages/analyzer/src/modules/postprocess/analyzer_postprocess.js` (Fassade/Exports)
- `packages/analyzer/src/modules/postprocess/postprocess_gap_passes.js`
- `packages/analyzer/src/modules/postprocess/postprocess_continuity_passes.js`
- `packages/analyzer/src/modules/postprocess/postprocess_prune_passes.js`
- `packages/analyzer/src/modules/postprocess/postprocess_shared_utils.js`

Pruefen:
- `packages/analyzer/src/core/pipeline/postprocess_stage.js` bleibt kompatibel
- Keine Aenderung am Verhalten der Pass-Reihenfolge

## Immer am Ende

```bash
npm run check
```

Wenn neue Testdateien entstehen:
- In das passende `suite_manifest.js` eintragen.
