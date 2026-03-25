/**
 * method_validator.mjs - Method Catalog Validierung
 * Prüft Methoden-IDs auf Format, Eindeutigkeit und Parameter
 * 
 * @version 1.0.0
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validierungs-Regeln
const VALIDATION_RULES = {
    // Method ID Format: lowercase, alphanumeric, underscore, hyphen
    methodIdPattern: /^[a-z][a-z0-9_-]*$/,
    
    // Maximale Längen
    maxMethodIdLength: 64,
    maxTitleLength: 128,
    maxHypothesisLength: 500,
    
    // Erforderliche Felder
    requiredFields: ['id', 'title', 'hypothesis'],
    
    // Optionale aber empfohlene Felder
    recommendedFields: ['codeScope', 'editStrategy']
};

/**
 * Validiert eine einzelne Methoden-ID
 * @param {string} methodId - Die zu validierende Methoden-ID
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateMethodId(methodId) {
    const errors = [];
    
    if (!methodId || typeof methodId !== 'string') {
        errors.push('Method ID is required and must be a string');
        return { valid: false, errors };
    }
    
    if (methodId.length > VALIDATION_RULES.maxMethodIdLength) {
        errors.push(`Method ID too long: ${methodId.length} > ${VALIDATION_RULES.maxMethodIdLength}`);
    }
    
    if (!VALIDATION_RULES.methodIdPattern.test(methodId)) {
        errors.push(`Invalid Method ID format: "${methodId}". Must start with lowercase letter and contain only a-z, 0-9, _, -`);
    }
    
    return { valid: errors.length === 0, errors };
}

/**
 * Validiert eine einzelne Methode
 * @param {object} method - Die Methoden-Definition
 * @param {string} [context] - Kontext für Fehlermeldungen (z.B. Task-Agent-Name)
 * @returns {object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateMethod(method, context = '') {
    const errors = [];
    const warnings = [];
    const prefix = context ? `[${context}] ` : '';
    
    if (!method || typeof method !== 'object') {
        errors.push(`${prefix}Method must be an object`);
        return { valid: false, errors, warnings };
    }
    
    // Prüfe erforderliche Felder
    for (const field of VALIDATION_RULES.requiredFields) {
        if (!method[field]) {
            errors.push(`${prefix}Missing required field: ${field}`);
        }
    }
    
    // Validiere Method ID
    if (method.id) {
        const idValidation = validateMethodId(method.id);
        if (!idValidation.valid) {
            errors.push(...idValidation.errors.map(e => `${prefix}${e}`));
        }
    }
    
    // Prüfe Title
    if (method.title && method.title.length > VALIDATION_RULES.maxTitleLength) {
        warnings.push(`${prefix}Title very long: ${method.title.length} chars`);
    }
    
    // Prüfe Hypothesis
    if (method.hypothesis && method.hypothesis.length > VALIDATION_RULES.maxHypothesisLength) {
        warnings.push(`${prefix}Hypothesis very long: ${method.hypothesis.length} chars`);
    }
    
    // Prüfe codeScope
    if (method.codeScope) {
        if (!Array.isArray(method.codeScope)) {
            errors.push(`${prefix}codeScope must be an array`);
        } else if (method.codeScope.length === 0) {
            warnings.push(`${prefix}codeScope is empty`);
        } else {
            // Prüfe ob Dateien existieren (relative Pfade)
            for (const filePath of method.codeScope) {
                if (typeof filePath !== 'string') {
                    errors.push(`${prefix}codeScope entry must be a string: ${filePath}`);
                }
            }
        }
    } else {
        warnings.push(`${prefix}Missing codeScope - method has no target files`);
    }
    
    // Prüfe editStrategy
    if (method.editStrategy) {
        if (!Array.isArray(method.editStrategy)) {
            errors.push(`${prefix}editStrategy must be an array`);
        } else if (method.editStrategy.length === 0) {
            warnings.push(`${prefix}editStrategy is empty`);
        }
    } else {
        warnings.push(`${prefix}Missing editStrategy`);
    }
    
    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validiert den gesamten Method Catalog
 * @param {object} catalog - Der Method Catalog
 * @returns {object} { valid: boolean, errors: string[], warnings: string[], stats: object }
 */
export function validateMethodCatalog(catalog) {
    const errors = [];
    const warnings = [];
    const stats = {
        totalAgents: 0,
        totalMethods: 0,
        validMethods: 0,
        invalidMethods: 0
    };
    
    if (!catalog || typeof catalog !== 'object') {
        errors.push('Catalog must be an object');
        return { valid: false, errors, warnings, stats };
    }
    
    const seenIds = new Set();
    const duplicateIds = [];
    
    for (const [agentName, methods] of Object.entries(catalog)) {
        stats.totalAgents++;
        
        if (!Array.isArray(methods)) {
            errors.push(`Agent "${agentName}" methods must be an array`);
            continue;
        }
        
        for (const method of methods) {
            stats.totalMethods++;
            
            const validation = validateMethod(method, agentName);
            
            if (!validation.valid) {
                stats.invalidMethods++;
                errors.push(...validation.errors);
            } else {
                stats.validMethods++;
            }
            
            warnings.push(...validation.warnings);
            
            // Prüfe auf Duplikate
            if (method.id) {
                if (seenIds.has(method.id)) {
                    duplicateIds.push(method.id);
                    errors.push(`Duplicate method ID: ${method.id}`);
                } else {
                    seenIds.add(method.id);
                }
            }
        }
    }
    
    return { valid: errors.length === 0, errors, warnings, stats, duplicateIds };
}

/**
 * Lädt und validiert den Method Catalog aus einer Datei
 * @param {string} catalogPath - Pfad zur Catalog-Datei
 * @returns {object} { valid: boolean, catalog: object|null, errors: string[], warnings: string[] }
 */
export function loadAndValidateCatalog(catalogPath) {
    const errors = [];
    const warnings = [];
    
    if (!existsSync(catalogPath)) {
        errors.push(`Catalog file not found: ${catalogPath}`);
        return { valid: false, catalog: null, errors, warnings };
    }
    
    let catalog;
    try {
        const content = readFileSync(catalogPath, 'utf-8');
        catalog = JSON.parse(content);
    } catch (err) {
        errors.push(`Failed to parse catalog JSON: ${err.message}`);
        return { valid: false, catalog: null, errors, warnings };
    }
    
    const validation = validateMethodCatalog(catalog);
    
    return {
        valid: validation.valid,
        catalog,
        errors: [...errors, ...validation.errors],
        warnings: [...warnings, ...validation.warnings],
        stats: validation.stats
    };
}

/**
 * Schnell-Validierung für den Orchestrator (vor Erstellung)
 * @param {object} catalog - Der Method Catalog
 * @returns {boolean} true wenn valid
 */
export function quickValidate(catalog) {
    const result = validateMethodCatalog(catalog);
    return result.valid;
}

/**
 * Strict Validierung für den Dispatch (vor Ausführung)
 * @param {object} catalog - Der Method Catalog
 * @throws {Error} Bei ungültigem Catalog
 */
export function strictValidate(catalog) {
    const result = validateMethodCatalog(catalog);
    
    if (!result.valid) {
        const errorMsg = result.errors.join('; ');
        throw new Error(`Method Catalog validation failed: ${errorMsg}`);
    }
    
    if (result.warnings.length > 0) {
        console.warn('Method Catalog warnings:', result.warnings);
    }
    
    return result;
}

export default {
    validateMethodId,
    validateMethod,
    validateMethodCatalog,
    loadAndValidateCatalog,
    quickValidate,
    strictValidate,
    VALIDATION_RULES
};