# AutoCast Result Naming Convention

## Übersicht

Diese Dokumentation definiert die **strikte Namenskonvention** für Result-Dateien im AutoCast-Projekt.

## Format

```
{methodId}_result.json
```

## Regeln

### 1. methodId

- **Erlaubte Zeichen:** Buchstaben (a-z, A-Z), Zahlen (0-9), Unterstrich (_), Bindestrich (-)
- **Nicht erlaubt:** Leerzeichen, Sonderzeichen (außer _ und -), Punkte, Slashes
- **Case-sensitive:** `GoogleSearch` ≠ `googlesearch`

### 2. Suffix

- **Fest:** `_result.json`
- **Keine Variationen:** Keine anderen Suffixe wie `_data.json`, `_output.json`, etc.

### 3. Extension

- **Fest:** `.json`
- **Keine anderen Extensions:** `.txt`, `.yaml`, `.xml`, etc. sind nicht erlaubt

## Gültige Beispiele

| methodId | Dateiname |
|----------|-----------|
| `google_search` | `google_search_result.json` |
| `web-fetch` | `web-fetch_result.json` |
| `method123` | `method123_result.json` |
| `a` | `a_result.json` |

## Ungültige Beispiele

| Ungültiger Name | Grund |
|-----------------|-------|
| `google search_result.json` | Leerzeichen in methodId |
| `google@search_result.json` | Sonderzeichen (@) in methodId |
| `google.search_result.json` | Punkt (.) in methodId |
| `google/search_result.json` | Slash (/) in methodId |
| `google_search_data.json` | Falsches Suffix (_data statt _result) |
| `google_search_result.txt` | Falsche Extension (.txt statt .json) |
| `google_search.json` | Fehlendes Suffix (_result) |
| `_result.json` | Leere methodId |
| `google_search_result.json` | methodId endet mit "_result" (erlaubt, aber nicht empfohlen) |

## API-Referenz

### `getResultFileName(methodId)`

Generiert den Dateinamen für eine Result-Datei.

```javascript
const { getResultFileName } = require('./result_naming');

getResultFileName('google_search');
// → 'google_search_result.json'
```

**Parameter:**
- `methodId` (string): Die Methoden-ID

**Returns:** `string` - Der generierte Dateiname

**Throws:**
- `Error` wenn methodId ungültig ist (leer, null, ungültige Zeichen)

---

### `parseResultFileName(filename)`

Extrahiert die methodId aus einem Dateinamen.

```javascript
const { parseResultFileName } = require('./result_naming');

parseResultFileName('google_search_result.json');
// → 'google_search'

parseResultFileName('/path/to/google_search_result.json');
// → 'google_search'

parseResultFileName('invalid_name.json');
// → null
```

**Parameter:**
- `filename` (string): Der Dateiname (kann Pfad enthalten)

**Returns:** `string|null` - Die extrahierte methodId oder null wenn ungültig

---

### `validateResultFileName(filename)`

Validiert ob ein Dateiname der Konvention entspricht.

```javascript
const { validateResultFileName } = require('./result_naming');

validateResultFileName('google_search_result.json');
// → true

validateResultFileName('invalid_name.json');
// → false
```

**Parameter:**
- `filename` (string): Der zu validierende Dateiname

**Returns:** `boolean` - true wenn gültig, false sonst

---

### `findResultFile(methodResultsDir, methodId)`

Sucht nach einer Result-Datei im angegebenen Verzeichnis.

```javascript
const { findResultFile } = require('./result_naming');

findResultFile('/path/to/results', 'google_search');
// → '/path/to/results/google_search_result.json' (wenn existiert)
// → null (wenn nicht existiert)
```

**Parameter:**
- `methodResultsDir` (string): Das Verzeichnis in dem gesucht werden soll
- `methodId` (string): Die Methoden-ID

**Returns:** `string|null` - Der vollständige Pfad oder null wenn nicht gefunden

**Throws:**
- `Error` wenn methodResultsDir kein gültiges Verzeichnis ist

## Implementierung

Die Implementierung befindet sich in:
```
/home/node/.openclaw/workspace/AutoCast/scripts/autoresearch/lib/result_naming.js
```

Unit-Tests:
```
/home/node/.openclaw/workspace/AutoCast/scripts/autoresearch/lib/result_naming.test.js
```

## Regex-Referenz

Die strikte Validierung verwendet folgenden Regex:

```regex
/^([a-zA-Z0-9_-]+)_result\.json$/
```

- `^` - Start der Zeichenkette
- `([a-zA-Z0-9_-]+)` - Capture-Group für methodId (1+ erlaubte Zeichen)
- `_result\.json` - Literales Suffix (Punkt escaped)
- `$` - Ende der Zeichenkette

## Änderungen

Diese Konvention ist **stabil**. Änderungen sollten vermieden werden, da sie bestehende Dateien ungültig machen würden.

Bei Bedarf an neuen Features:
1. Erweitere die Utility-Funktionen
2. Dokumentiere die Änderung
3. Führe Migrationen für bestehende Dateien durch
