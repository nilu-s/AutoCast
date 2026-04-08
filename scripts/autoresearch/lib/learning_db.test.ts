import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, recordRun, recordMethodRun, closeDb, Run, MethodRun } from './learning_db';
import Database from 'better-sqlite3';
import fs from 'fs';

describe('learning_db', () => {
  let db: Database.Database;
  const TEST_DB_PATH = './test_learning_temp.db';

  beforeEach(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    db = initDb(TEST_DB_PATH);
  });

  afterEach(() => {
    closeDb(db);
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('should initialize database', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('runs');
    expect(tableNames).toContain('method_runs');
  });

  it('should record a run', () => {
    const run: Run = {
      run_id: 'test_run_001',
      timestamp: '2026-03-25T03:00:00Z',
      baseline_score: 0.267,
      final_score: null,
      status: 'RUNNING'
    };
    
    recordRun(db, run);
    
    const result = db.prepare('SELECT * FROM runs WHERE run_id = ?').get('test_run_001') as Run;
    expect(result.run_id).toBe('test_run_001');
    expect(result.baseline_score).toBe(0.267);
    expect(result.status).toBe('RUNNING');
  });

  it('should record a method run', () => {
    // First record a run (foreign key)
    recordRun(db, {
      run_id: 'test_run_002',
      timestamp: '2026-03-25T03:00:00Z',
      baseline_score: 0.267,
      final_score: null,
      status: 'RUNNING'
    });

    const methodRun: MethodRun = {
      method_id: 'test_method',
      run_id: 'test_run_002',
      decision: 'KEEP',
      improvement: 0.05,
      duration_ms: 120000
    };
    
    recordMethodRun(db, methodRun);
    
    const result = db.prepare('SELECT * FROM method_runs WHERE method_id = ?').get('test_method') as MethodRun;
    expect(result.method_id).toBe('test_method');
    expect(result.decision).toBe('KEEP');
    expect(result.improvement).toBe(0.05);
  });
});
