# Domain Glossary

Kurze Begriffe fuer LLM-Assistenten, damit Entscheidungen konsistent bleiben.

## AutoCast

CEP-Plugin fuer Premiere Pro, das Podcast-Mehrspurmaterial analysiert und Schnittvorschlaege erstellt.

## Track

Eine Audiospur aus der Sequenz. Kann selektiert/deaktiviert werden.

## Analyzer

Backend-Analysemodul, das aus Track-Audio Segmentdaten und Diagnostik erzeugt.

## Segment

Zeitbereich mit erkannter Aktivitaet in einer Spur.

## Cut Preview

UI-Ansicht im Panel, die Segmente als timeline-nahe Snippets darstellt und Auswahl/Preview ermoeglicht.

## Snippet State

- `kept`: bleibt in finaler Auswahl
- `near_miss`: grenzwertig, meist nicht final
- `suppressed`: unterdrueckt
- `uninteresting`: absichtlich uninteressante Luecke

## Always Open Fill

Kontinuitaets-Fill-Abschnitt, der Lueckenflaechen fuellt, damit der Dialogfluss nicht zu hart abreisst.

## Bleed

Uebersprechen anderer Spuren (Mikrofon-Leakage), das nicht als primaere Stimme gelten soll.

## Overlap Resolution

Regeln fuer gleichzeitige Aktivitaet mehrerer Tracks (zum Beispiel dominant, keep-both, bleed-safe).

## Postprocess

Spaete Korrekturen nach der Kernklassifikation (Smoothing, Schutzlogiken, Kontinuitaet).

## Contracts

Versionierte Request/Response-Validierung zwischen Panel, Worker, CLI und Analyzer.
