# Migration TODO: Naechste 3 Phasen

Ziel: Die Strukturmigration mit echten, produktiv nutzbaren Dateien weiterziehen.
Wichtig: Phase 1 und 2 liefern Runtime-Mehrwert. Phase 3 ist ausschliesslich fuer Tests.

## Phase 1: State-Layer fuer Panel-Features (reale Runtime-Dateien)

### Zweck
State-Logik aus grossen Service-Dateien entkoppeln, damit `main.js` und Feature-Services schlanker und wartbarer werden.

### Dateien anlegen
- `apps/panel/src/features/cut-preview/state/cut_preview_store.js`
- `apps/panel/src/features/tracks/state/tracks_store.js`
- `apps/panel/src/features/analysis/state/analysis_store.js`
- `apps/panel/src/features/audio-preview/state/audio_preview_store.js`

### Aufgaben
- In jedem Store ein kleines, klares API anbieten:
  - `createState()`
  - `getState()`
  - `setState(patch)`
  - `resetState()`
- Bestehende Mutable-State-Teile aus Services schrittweise in diese Stores ziehen.
- Stores in `apps/panel/js/main.js` und betroffenen Features als einzige State-Quelle verdrahten.

### Definition of Done
- Keine Placeholder-Dateien, jede neue Datei enthaelt produktive Logik.
- Keine Verhaltensaenderung im UI-Flow.
- `npm run check` bleibt gruen.

---

## Phase 2: Komponenten-Layer fuer Rendering (reale Runtime-Dateien)

### Zweck
HTML-/DOM-Erzeugung aus den Feature-Services in wiederverwendbare Komponenten auslagern.

### Dateien anlegen
- `apps/panel/src/features/cut-preview/components/cut_preview_timeline_component.js`
- `apps/panel/src/features/cut-preview/components/cut_preview_navigator_component.js`
- `apps/panel/src/features/cut-preview/components/cut_preview_inspector_component.js`
- `apps/panel/src/features/tracks/components/track_list_component.js`
- `apps/panel/src/features/settings/components/settings_form_component.js`

### Aufgaben
- Reine Render-Funktionen aus Services in Komponenten verschieben.
- Komponenten nur mit Daten fuettern (keine Analyzer-Calls, keine Host-Bridge-Calls).
- Feature-Services als Orchestrierung belassen, aber Rendering nur noch ueber Komponenten aufrufen.

### Definition of Done
- Komponenten werden in `apps/panel/index.html`/`main.js` indirekt ueber Features genutzt.
- Sichtbares Verhalten bleibt gleich, Code wird modularer.
- `npm run check` bleibt gruen.

---

## Phase 3: Test-Haertung fuer neue Struktur (nur Tests)

### Zweck
Die neuen State- und Komponentenmodule stabil absichern.

### Test-Dateien anlegen/erweitern
- `packages/analyzer/test/unit/test_panel_state_stores.js`
- `packages/analyzer/test/unit/test_panel_components_rendering.js`
- `packages/analyzer/test/unit/test_panel_state_component_integration.js`
- `packages/analyzer/test/unit/suite_manifest.js` erweitern (neue Tests einhaengen)

### Aufgaben
- Unit-Tests fuer Store-APIs:
  - Initialzustand
  - Patch-Updates
  - Reset-Verhalten
- Unit-Tests fuer Komponenten:
  - korrektes HTML fuer typische Eingaben
  - robust bei leeren/ungueltigen Daten
- Integration-nahe Unit-Tests:
  - Feature-Service + Store + Komponente greifen korrekt ineinander

### Definition of Done
- Alle neuen Tests laufen stabil in `npm test`.
- Keine ungenutzten Placeholder-Tests in `apps/panel/src/**/tests`.
- Testabdeckung fuer neue Module ist nachvollziehbar und reproduzierbar.
