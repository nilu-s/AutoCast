import Database from 'better-sqlite3';
export interface Run {
    run_id: string;
    timestamp: string;
    baseline_score: number | null;
    final_score: number | null;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}
export interface MethodRun {
    method_id: string;
    run_id: string;
    decision: 'KEEP' | 'REJECT' | 'FAILED' | null;
    improvement: number | null;
    duration_ms: number | null;
}
export declare function initDb(dbPath: string): Database.Database;
export declare function recordRun(db: Database.Database, run: Run): void;
export declare function recordMethodRun(db: Database.Database, methodRun: MethodRun): void;
export declare function closeDb(db: Database.Database): void;
//# sourceMappingURL=learning_db.d.ts.map