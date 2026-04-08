/**
 * Method Catalog Validierung
 * Prüft Methoden-IDs auf Format, Eindeutigkeit und Parameter
 */

/** Validierungs-Regeln */
export interface ValidationRules {
  /** Method ID Format: lowercase, alphanumeric, underscore, hyphen */
  methodIdPattern: RegExp;
  /** Maximale Längen */
  maxMethodIdLength: number;
  maxTitleLength: number;
  maxHypothesisLength: number;
  /** Erforderliche Felder */
  requiredFields: string[];
  /** Optionale aber empfohlene Felder */
  recommendedFields: string[];
}

/** Validierungs-Ergebnis für Methoden-ID */
export interface MethodIdValidation {
  valid: boolean;
  errors: string[];
}

/** Validierungs-Ergebnis für eine Methode */
export interface MethodValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Method-Definition */
export interface Method {
  id: string;
  title: string;
  hypothesis: string;
  codeScope?: string[];
  editStrategy?: string[];
  [key: string]: any;
}

/** Method Catalog - Task Agent → Methods Mapping */
export interface MethodCatalog {
  [agentName: string]: Method[];
}

/** Catalog-Validierungs-Ergebnis */
export interface CatalogValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalAgents: number;
    totalMethods: number;
    validMethods: number;
    invalidMethods: number;
  };
  duplicateIds?: string[];
}

/** Laden-und-Validieren Ergebnis */
export interface LoadAndValidateResult {
  valid: boolean;
  catalog: MethodCatalog | null;
  errors: string[];
  warnings: string[];
  stats?: CatalogValidation['stats'];
}

/** Validierungs-Regeln Konstanten */
export const VALIDATION_RULES: ValidationRules;

/**
 * Validiert eine einzelne Methoden-ID
 * @param methodId - Die zu validierende Methoden-ID
 * @returns Validierungsergebnis
 */
export function validateMethodId(methodId: string): MethodIdValidation;

/**
 * Validiert eine einzelne Methode
 * @param method - Die Methoden-Definition
 * @param context - Kontext für Fehlermeldungen (z.B. Task-Agent-Name)
 * @returns Validierungsergebnis mit Warnungen
 */
export function validateMethod(method: Method, context?: string): MethodValidation;

/**
 * Validiert den gesamten Method Catalog
 * @param catalog - Der Method Catalog
 * @returns Validierungsergebnis mit Statistiken
 */
export function validateMethodCatalog(catalog: MethodCatalog): CatalogValidation;

/**
 * Lädt und validiert den Method Catalog aus einer Datei
 * @param catalogPath - Pfad zur Catalog-Datei
 * @returns Lade- und Validierungsergebnis
 */
export function loadAndValidateCatalog(catalogPath: string): LoadAndValidateResult;

/**
 * Schnell-Validierung für den Orchestrator (vor Erstellung)
 * @param catalog - Der Method Catalog
 * @returns true wenn valid
 */
export function quickValidate(catalog: MethodCatalog): boolean;

/**
 * Strict Validierung für den Dispatch (vor Ausführung)
 * @param catalog - Der Method Catalog
 * @throws Bei ungültigem Catalog
 */
export function strictValidate(catalog: MethodCatalog): CatalogValidation;

/** Default export - TypeScript Namespace */
declare namespace _default {
  export { validateMethodId };
  export { validateMethod };
  export { validateMethodCatalog };
  export { loadAndValidateCatalog };
  export { quickValidate };
  export { strictValidate };
  export { VALIDATION_RULES };
}
export default _default;
