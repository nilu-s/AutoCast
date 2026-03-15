1. Kurzfazit
Größte Schwäche: In der Snippet-Bewertung werden Evidenz-Metriken und Entscheidungs-/Postprocess-Artefakte stark vermischt, besonders im Preview-Decision-Stack.
Größte Chance: Ein separater Snippet-Metrics-Builder (evidence-only) plus ein getrenntes State-Modell würde Robustheit, Erklärbarkeit und Bleed/Noise-Precision deutlich erhöhen, ohne die Pipeline neu zu bauen.
npm run check wurde ausgeführt und ist grün (123/123 Tests).

2. Relevante Dateien und Komponenten
analyzer_pipeline.js – End-to-End Stage-Flow (analyze).
vad_stage.js – Gate-Bildung, Spectral/Speaker/Laughter-Rescue, Bleed-Suppression.
segment_stage.js – Segmentbildung und Padding/Trim.
overlap_resolver.js – Overlap-/Bleed-Entscheidung auf Segmentebene.
postprocess_stage.js – Reihenfolge der Cleanup-/Continuity-/Prune-Pässe.
postprocess_continuity_passes.js – Handover, Gap-Merge, Stickiness, Peak-Anchor.
postprocess_prune_passes.js – Low-significance, residual snippets, absolute peak floor.
cut_preview_builder.js – Snippet-Spans, State-/Type-Zuweisung, Output-Modell.
cut_preview_decision_engine.js – Metrikberechnung + Decision-Heuristik.
cut_preview_model_helpers.js – Normalisierte Decision-/Content-/Origin-Modelle.
cut_preview_state_feature.js – Panel-seitige State-Normalisierung/Legacy-Mapping.
analyzer_defaults.js – gesamte Parametrik/Threshold-Landschaft.
3. Bestehende Metriken
Acoustic / Signal Evidence (vorhanden)
RMS/Peak pro Frame (calculateRMS) in rms_calculator.js.
Noise floor / dynamic range (estimateNoiseFloor) in rms_calculator.js.
VAD-Thresholds pro Frame (open/close, adaptive floor, smoothed RMS) in vad_gate.js.
Spectral confidence aus speech ratio + flatness, plus spectral flux in spectral_vad.js.
Spectral fingerprint (8 Bänder), Speaker-Profile-Match in spectral_vad.js.
Laughter-Features: rms, zcr, crest, spread, modulation, continuity, transientPenalty, confidence in laughter_detector.js.
Segment-RMS-Stats (peakDb, meanDb) in postprocess_shared_utils.js.
Interaction / Cross-Track Evidence (vorhanden)
Dominanz über RMS im Overlap-Fenster in overlap_resolver.js.
Cross-track spectral similarity (computeCrossTrackSimilarity) in spectral_vad.js.
Frame-level bleed suppression mit dB-Ratio + fingerprint similarity in vad_stage.js.
Snippet-overlap stats (overlapRatio, strongerRatio, dominantTrackIndex) in cut_preview_decision_engine.js.
Heuristic / Decision Metrics (vorhanden)
postprocessPenalty, speechEvidence, laughterEvidence, bleedEvidence, noiseEvidence, classMargin in cut_preview_decision_engine.js.
keepLikelihood, suppressLikelihood, decisionMargin, bleedHighConfidence in cut_preview_decision_engine.js.
score/scoreLabel, typeLabel/typeConfidence, reasons in cut_preview_decision_engine.js.
Coverage-basierte Vorentscheidung (inferCoverageDecision) in cut_preview_decision_engine.js.
Postprocess / Diagnostic Metrics (vorhanden)
Track-counters wie preTriggerDropped, sameTrackGapMerged, residualSnippetsPruned, peakAnchorClusters, handoverStartDelayedMs usw. in postprocess_stage.js plus Pass-Modulen.
VAD/Gate snapshots (afterVad, afterSpectral, afterSpeakerLock, afterLaughter, afterBleed, debug-Objekte) in vad_stage.js.
Debug-frame timeline + suppression reasons in debug_timeline_builder.js.
uninterestingGap als Timeline-Gap-Markierung in cut_preview_model_helpers.js.
4. Hauptprobleme im aktuellen Ansatz
Vermischung von Evidenz und Entscheidung.
Implementierung: computePostprocessPenalty hängt direkt vom aktuellen state ab; computeClassEvidence boostet bei state === 'suppressed' zusätzlich bleed (cut_preview_decision_engine.js).
Interpretation: Das erzeugt Label-Leakage; Metriken sind nicht mehr “messende Evidenz”, sondern bereits zirkulär.

State-Logik trägt mehrere Semantiken gleichzeitig.
Implementierung: kept/near_miss/suppressed mischen Content, Decision und Prozessstufe; filled_gap existiert nur als decisionState; Panel mappt vieles zurück auf kept (cut_preview_model_helpers.js, cut_preview_state_feature.js).
Interpretation: Semantische Unschärfe erschwert Lernbarkeit, Debugbarkeit und Evaluation je Ursache.

Snippet-Metriken verlieren zeitliche Struktur.
Implementierung: Snippet-Scoring nutzt primär Mittelwert/Peak über den gesamten Span (meanOverThreshold, peakOverThreshold, gemittelte spectral/laughter confidence) (cut_preview_decision_engine.js).
Interpretation: Interne Dynamik (Onset, Dropouts, Burst-Charakter, intra-snippet Gaps) geht weitgehend verloren.

Metrikquelle teilweise debug-abhängig.
Implementierung: speakerLockScore kommt aus gateSnapshots[*].speakerDebug.similarity; ohne debugMode wird auf spectralConfidence zurückgefallen (vad_stage.js, cut_preview_decision_engine.js, Default debugMode: false in analyzer_defaults.js).
Interpretation: Ein diagnostischer Pfad beeinflusst Klassifikationssignalqualität inkonsistent.

Merge- und Coverage-Heuristiken dominieren Klassifikation.
Implementierung: buildConsolidatedPreviewSpans merged spans mit fixem Gap; später beeinflussen keptSourceRatio, Coverage und Decision-Heuristiken stark den finalen State (cut_preview_builder.js).
Interpretation: Strukturmetriken werden durch Prozessartefakte überlagert, besonders bei langen merged spans.

Unklare Trennung zwischen normalisiertem und absolutem Pegel in Preview-Metriken.
Implementierung: Preview-Metriken nutzen rmsProfiles (ggf. auto-gain-normalisiert), nicht rawRmsProfiles (finalize_stage.js, cut_preview_builder.js).
Interpretation: Absolute Noise/Bleed-Indikatoren werden im Snippet-Scoring geschwächt.

Unsicherheit: Es gibt keinen separaten “always-on speaker similarity output” außerhalb des Debug-Pfads sichtbar im Repo; falls extern gesetzt, relativiert sich Problem 4.

5. Vorschlag für bessere Metriken
Name	Zweck	Benötigte Eingaben	Warum hilfreich	Wo berechnen
voiceFrameRatio	Anteil starker Speech-Frames im Snippet	vadResults.gateOpen, openThresholdLinearByFrame, Snippet-Frames	Trennt kompakte Sprache von aufgeblasenen Merge-Spans	neuer snippet_metrics_builder unter modules/preview, aufgerufen aus buildCutPreview
inSnippetDropoutRatio	interne Unterbrechungen messen	gateSnapshots.afterBleed, Snippet-Frames	erkennt instabile Near-Miss-Segmente besser als nur Mittelwert/Peak	gleicher Builder
onsetStrengthDb / offsetStrengthDb	Übergangsqualität erfassen	RMS um Snippet-Ränder, Track-threshold	verbessert Handover-/Pretrigger-Bewertung	gleicher Builder
dominanceMarginP50Db	mittlere Dominanz gegen andere Tracks	RMS aller Tracks im Snippetfenster	robustere Bleed-Abgrenzung als binäre overlap stats	gleicher Builder
crossTrackSpectralDivergenceP50	Sprechertrennung im Overlap	Fingerprints aller Tracks + Overlap-Frames	reduziert False-Positive-Bleed bei echten Simultansprechern	gleicher Builder (nutzt fingerprintResults)
speakerMatchP10 / speakerMatchMedian	Speaker-Lock-Stabilität	per-frame similarity unabhängig von Debug	trennt echte Sprechersegmente von Leakage	in vad_stage similarity immer berechnen (kompakt), dann im Builder aggregieren
laughterSupportCoverage + transientRiskCoverage	Laughter vs impulsive Noise sauberer	laughter.confidence, laughter.transientPenalty	verhindert Laughter/Noise-Verwechslung	gleicher Builder
rawPeakDbFs / rawMeanDbFs	absolute Pegelstärke erhalten	rawRmsProfiles, Snippet-Frames	macht Noise-Floor-Entscheidungen stabil bei Auto-Gain	finalize_stage an cutPreviewBuilder weiterreichen, Builder nutzt beide RMS-Quellen
mergeHeterogeneity	misst, ob Merge inhaltlich homogen ist	source-subsegments je merged span	reduziert Fehlklassifikation bei heterogenen Sammelspans	buildConsolidatedPreviewSpans + Builder
6. Vorschlag für ein besseres State-Modell
Vorhanden: state mischt Entscheidung und teils Prozesshistorie; contentClass ist nachgelagert/heuristisch.
Vorschlag (additiv, rückwärtskompatibel):

contentState: speech, laughter, mixed, bleed, noise, silence_fill, unknown
decisionState: keep, review, suppress, filled_gap, uninteresting
quality: { score0to100, confidence0to1, margin0to1 }
provenance: { stage, origin, passesTouched[] }
Warum besser:

Content-Semantik wird entkoppelt von Action-State.
Review-Fälle (near_miss) werden als echte Decision-Kategorie statt “halb suppressed” modelliert.
filled_gap bleibt explizit bis ins Panel (nicht zurück auf kept gemappt).
Evaluation pro Dimension wird möglich (Content-Precision vs Decision-Precision).
7. Konkrete Refactoring-Vorschläge
Evidence-Building von Decision trennen.
computeMetrics/computeClassEvidence/decidePreviewState in cut_preview_decision_engine.js aufspalten in buildEvidenceMetrics und applyDecisionPolicy.

Neuen snippet_metrics_builder.js einführen.
Aufruf in cut_preview_builder.js vor State-Entscheidung; liefert ausschließlich evidence-only Felder.

speaker similarity nicht an Debug koppeln.
In vad_stage.js zusätzlich kompakte similarity-Statistik immer erzeugen (z. B. median/p10 pro Snippet später), Debug-Arrays optional lassen.

rawRmsProfiles bis Preview durchreichen.
finalize_stage.js → buildCutPreview um rawRmsProfiles erweitern; absolute Metriken ergänzen.

Merge-Span-Heterogenität explizit machen.
In cut_preview_builder.js Merge nicht blind “ein Snippet = eine Evidenzwolke”; stattdessen Teilsegment-Merkmale aggregieren und Variabilität speichern.

Panel-Normalisierung nicht “unknown -> kept”.
In cut_preview_state_feature.js fallback konservativer gestalten (review/suppressed) und filled_gap separat visualisieren.

8. Minimal-invasive Umsetzungsstrategie
Phase 1: Nur neue evidence-only Metriken addieren, ohne bestehende Entscheidung zu ändern (feature flag, z. B. useSnippetMetricsV2=false).
Phase 2: decidePreviewState parallel dual ausführen (alt vs neu), Unterschiede nur in Debug/Inspector ausgeben.
Phase 3: Für always_open_fill und bleed_high_confidence zuerst V2 aktivieren (höchster Nutzen, geringes Risiko).
Phase 4: Vollständige State-Entkopplung im Output ergänzen (contentState, decisionState, quality, provenance), Legacy-Felder weiterliefern.
Phase 5: Panel auf neue Felder umstellen, dann alte Heuristikpfade schrittweise entfernen.
9. Test- und Evaluationsplan
Unit Tests.
Neue Tests für snippet_metrics_builder (Onset/Dropout/Dominanz/Spectral-Divergenz/Raw-vs-Normalized).

Golden Snippet Sets.
Kuratiertes Set mit Labels speech/laughter/bleed/noise/fill + keep/review/suppress; Replay über gesamte Pipeline.

Precision/Recall je State.
Metriken getrennt für decisionState und contentState; nicht nur kept-Rate.

False Positives gezielt messen.
Separate FP-Statistik für bleed und noise, inklusive always_open_fill-Sonderfälle.

Review-/Debug-Ausgaben.
Pro Snippet vollständige Evidence vs Decision nebeneinander speichern (JSON), inkl. “alt vs neu”-Differenzbericht.

Evidence-only snippet_metrics_builder einführen und Decision-Leakage aus Metriken entfernen.

speakerLockScore von Debug-Pfaden entkoppeln und stabilen Similarity-Output bereitstellen.

rawRmsProfiles in die Preview-Metrikberechnung integrieren (absolute Pegel wieder verfügbar machen).

State-Modell in contentState + decisionState + quality trennen, Legacy-Mapping beibehalten.

Merge-Span-Heterogenität und interne Zeitstruktur (Dropouts/Onset) als Kernmetriken ergänzen.