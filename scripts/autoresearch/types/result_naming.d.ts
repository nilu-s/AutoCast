/**
 * result_naming.mjs - Phase 1.2
 * Generiert konsistente Namen für Method-Ergebnisse (ES Modules)
 */

/**
 * Generiert einen eindeutigen Job-Key aus Task-Agent, Method-ID und Index
 * @param taskAgent - Name des Task-Agents (z.B. 'review-calibrator')
 * @param methodId - ID der Methode (z.B. 'adjust_threshold')
 * @param index - Laufender Index (1-basiert)
 * @returns Eindeutiger Job-Key
 */
export function generateJobKey(taskAgent: string, methodId: string, index: number): string;

/**
 * Generiert den Pfad für ein Method-Ergebnis
 * @param resultsDir - Basis-Verzeichnis für Ergebnisse
 * @param jobKey - Eindeutiger Job-Key
 * @returns Vollständiger Pfad zur Ergebnis-JSON-Datei
 */
export function generateResultPath(resultsDir: string, jobKey: string): string;

/**
 * Parst einen Job-Key in seine Komponenten
 * @param jobKey - Der Job-Key
 * @returns Komponenten oder null bei ungültigem Format
 */
export function parseJobKey(jobKey: string): { taskAgent: string; methodId: string; index: number } | null;

/**
 * Validiert einen Job-Key
 * @param jobKey - Der zu validierende Job-Key
 * @returns True wenn gültig
 */
export function isValidJobKey(jobKey: string): boolean;
