/**
 * result_naming.mjs - Phase 1.2
 * Generiert konsistente Namen für Method-Ergebnisse (ES Modules)
 */

import path from 'path';

/**
 * Generiert einen eindeutigen Job-Key aus Task-Agent, Method-ID und Index
 * @param {string} taskAgent - Name des Task-Agents (z.B. 'review-calibrator')
 * @param {string} methodId - ID der Methode (z.B. 'adjust_threshold')
 * @param {number} index - Laufender Index (1-basiert)
 * @returns {string} Eindeutiger Job-Key
 */
export function generateJobKey(taskAgent, methodId, index) {
    // Sanitize: nur alphanumerisch, Unterstrich und Bindestrich erlaubt
    const sanitizedAgent = String(taskAgent || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedMethod = String(methodId || 'method').replace(/[^a-zA-Z0-9_-]/g, '_');
    const paddedIndex = String(index).padStart(3, '0');

    return sanitizedAgent + '__' + sanitizedMethod + '__' + paddedIndex;
}

/**
 * Generiert den Pfad für ein Method-Ergebnis
 * @param {string} resultsDir - Basis-Verzeichnis für Ergebnisse
 * @param {string} jobKey - Eindeutiger Job-Key
 * @returns {string} Vollständiger Pfad zur Ergebnis-JSON-Datei
 */
export function generateResultPath(resultsDir, jobKey) {
    return path.join(resultsDir, jobKey + '.result.json');
}

/**
 * Parst einen Job-Key in seine Komponenten
 * @param {string} jobKey - Der Job-Key
 * @returns {object|null} Komponenten oder null bei ungültigem Format
 */
export function parseJobKey(jobKey) {
    if (!jobKey || typeof jobKey !== 'string') {
        return null;
    }

    const parts = jobKey.split('__');
    if (parts.length !== 3) {
        return null;
    }

    return {
        taskAgent: parts[0],
        methodId: parts[1],
        index: parseInt(parts[2], 10)
    };
}

/**
 * Validiert einen Job-Key
 * @param {string} jobKey - Der zu validierende Job-Key
 * @returns {boolean} True wenn gültig
 */
export function isValidJobKey(jobKey) {
    if (!jobKey || typeof jobKey !== 'string') {
        return false;
    }

    // Format: taskAgent__methodId__index (z.B. review-calibrator__adjust_threshold__001)
    const pattern = /^[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+__\d{3}$/;
    return pattern.test(jobKey);
}

export default { generateJobKey, generateResultPath, parseJobKey, isValidJobKey };
