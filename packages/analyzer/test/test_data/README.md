# Analyzer Test Data

This directory contains categorized audio snippets used for testing the analyzer's detection capabilities. Each folder represents a specific scenario or condition.

## Folder Structure

Scenarios are organized into thematic folders. The folder name often indicates the condition or state of the audio (e.g., `Lachen - gemeinsam` for shared laughter).

### Scenarios

| Category | Description |
| :--- | :--- |
| **Ausschnauben** | Audio of someone blowing their nose. |
| **Bleed** | Audio where sound from one source is "bleeding" into another microphone (e.g., `Bleed - stumpfer Schlag`). |
| **Ja / Ja - absolut** | Brief affirmative responses ("Yes"). |
| **Lachen** | Various types of laughter (`Lachen - 1`, `Lachen - 2`). |
| **Lachen - gemeinsam** | Shared laughter across multiple tracks. |
| **Lachen - SpracheMix** | Combined laughter and speech scenarios. |
| **Mhm** | Filler sounds/agreements (6 different varieties). |
| **SpeakerA / SpeakerB** | Isolated speech and bleed recordings for specific speakers. |
| **Sprecherwechsel** | Scenarios specifically designed to test speaker swaps. |

## Speaker Swap Timings (Sprecherwechsel)

The following timings indicate when each speaker is active in the "Sprecherwechsel" scenarios, as derived from the filenames:

### Sprecherwechsel - 1
- **Track 1:** `speach - 0-7.wav` (Active: 0s - 7s)
- **Track 2:** `speach - 7-12.wav` (Active: 7s - 12s)

### Sprecherwechsel - 2
- **Track 1:** `speach - 0-4.wav` (Active: 0s - 4s)
- **Track 2:** `speach - 5-16.wav` (Active: 5s - 16s)

### Sprecherwechsel - 3
- **Track 1:** `speach - 0-3.wav` (Active: 0s - 3s)
- **Track 2:** `speach - 3-11.wav` (Active: 3s - 11s)
- **Bleed:** `bleed.wav` (Background noise/microphone bleed)

---
*Note: Folder names and filenames are preserved from the original recording session to maintain context.*
