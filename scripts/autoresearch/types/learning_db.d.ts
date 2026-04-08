/**
 * Learning Database Module
 * SQLite storage for AutoResearch Learning data
 */

import { Database } from 'better-sqlite3';

/** Run-Record in der Datenbank */
export interface RunRecord {
  run_id: string;
  timestamp: string;
  baseline_score: number | null;
  final_score: number | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

/** Method-Run-Record in der Datenbank */
export interface MethodRunRecord {
  id: number;
  method_id: string;
  run_id: string;
  decision: 'KEEP' | 'REJECT' | 'FAILED';
  improvement: number | null;
  duration_ms: number | null;
}

/** Run-Daten zum Einfügen */
export interface RunData {
  run_id: string;
  timestamp: string;
  baseline_score: number | null;
  final_score: number | null;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

/** Method-Run-Daten zum Einfügen */
export interface MethodRunData {
  method_id: string;
  run_id: string;
  decision: 'KEEP' | 'REJECT' | 'FAILED';
  improvement: number | null;
  duration_ms: number | null;
}

/** Update-Daten für einen Run */
export interface RunUpdate {
  status?: string;
  final_score?: number;
}

/**
 * Initialize database with core schema
 * @param dbPath - Path to SQLite database file
 * @returns Opened database connection
 */
export function initDb(dbPath: string): Database;

/**
 * Record a new research run
 * @param db - Database connection
 * @param runData - Run data
 */
export function recordRun(db: Database, runData: RunData): void;

/**
 * Record a method run
 * @param db - Database connection
 * @param methodRunData - Method run data
 */
export function recordMethodRun(db: Database, methodRunData: MethodRunData): void;

/**
 * Close database connection
 * @param db - Database connection
 */
export function closeDb(db: Database): void;

/**
 * Update run status
 * @param db - Database connection
 * @param run_id - Run identifier
 * @param updates - Fields to update
 */
export function updateRun(db: Database, run_id: string, updates: RunUpdate): void;

/**
 * Get run by ID
 * @param db - Database connection
 * @param run_id - Run identifier
 * @returns Run record or null
 */
export function getRun(db: Database, run_id: string): RunRecord | null;

/**
 * Get method runs for a run
 * @param db - Database connection
 * @param run_id - Run identifier
 * @returns Method run records
 */
export function getMethodRunsForRun(db: Database, run_id: string): MethodRunRecord[];

/** Default export - TypeScript Namespace */
declare namespace _default {
  export { initDb };
  export { recordRun };
  export { recordMethodRun };
  export { closeDb };
  export { updateRun };
  export { getRun };
  export { getMethodRunsForRun };
}
export default _default;
