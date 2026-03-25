/**
 * status_manager.mjs - Phase 1.3
 * Zentraler Status-Manager für Method-Jobs (ES Modules)
 */

/** Status-Werte für Jobs */
export const STATUS: {
  PENDING: 'PENDING';
  RUNNING: 'RUNNING';
  COMPLETED: 'COMPLETED';
  FAILED: 'FAILED';
  REJECTED: 'REJECTED';
};

/** Job-Definition für addJob */
export interface JobDefinition {
  jobId: string;
  taskAgent?: string;
  methodId?: string;
  methodTitle?: string;
}

/** Einzelner Job im Status */
export interface Job {
  status: string;
  taskAgent: string;
  methodId: string;
  methodTitle: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: any;
  error: any;
  decision?: string;
}

/** Status-Datenstruktur */
export interface StatusData {
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  jobs: Record<string, Job>;
}

/** Status-Container */
export interface Status {
  path: string;
  data: StatusData;
}

/** Zusammenfassung aller Jobs */
export interface StatusSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  rejected: number;
}

/**
 * Erstellt einen neuen Status-Container
 * @param statusPath - Pfad zur STATUS.json Datei
 * @returns Status-Container
 */
export function createStatus(statusPath: string): Status;

/**
 * Lädt einen bestehenden Status
 * @param statusPath - Pfad zur STATUS.json Datei
 * @returns Status-Container oder null bei Fehler
 */
export function loadStatus(statusPath: string): Status | null;

/**
 * Speichert den Status in die Datei
 * @param status - Status-Container
 */
export function saveStatus(status: Status): void;

/**
 * Fügt einen Job zum Status hinzu
 * @param status - Status-Container
 * @param job - Job-Definition
 */
export function addJob(status: Status, job: JobDefinition): void;

/**
 * Aktualisiert den Status eines Jobs atomar (mit sofortigem Speichern)
 * @param status - Status-Container
 * @param jobId - Job-ID
 * @param newStatus - Neuer Status
 * @param metadata - Zusätzliche Metadaten (z.B. decision, result, error)
 * @returns Aktualisierter Status-Container
 * @throws Bei ungültigem Status oder Job
 */
export function updateJobStatusAtomic(
  status: Status,
  jobId: string,
  newStatus: string,
  metadata?: Record<string, any>
): Status;

/**
 * Aktualisiert den Status eines Jobs
 * @param status - Status-Container
 * @param jobId - Job-ID
 * @param newStatus - Neuer Status
 * @param options - Zusätzliche Optionen
 * @deprecated Verwende updateJobStatusAtomic für Transaktionssicherheit
 */
export function updateJobStatus(
  status: Status,
  jobId: string,
  newStatus: string,
  options?: Record<string, any>
): void;

/**
 * Holt die Zusammenfassung aller Jobs
 * @param status - Status-Container
 * @returns Zusammenfassung
 */
export function getSummary(status: Status): StatusSummary;

/**
 * Prüft, ob alle Jobs abgeschlossen sind
 * @param status - Status-Container
 * @returns True wenn alle Jobs fertig
 */
export function isComplete(status: Status): boolean;

/**
 * Holt alle Jobs mit einem bestimmten Status
 * @param status - Status-Container
 * @param filterStatus - Zu filternder Status
 * @returns Liste der Jobs
 */
export function getJobsByStatus(status: Status, filterStatus: string): Array<{ jobId: string } & Job>;

/** Default export - TypeScript Namespace */
declare namespace _default {
    export { STATUS };
    export { createStatus };
    export { loadStatus };
    export { saveStatus };
    export { addJob };
    export { updateJobStatus };
    export { updateJobStatusAtomic };
    export { getSummary };
    export { isComplete };
    export { getJobsByStatus };
}
export default _default;
