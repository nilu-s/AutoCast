/**
 * Learning Database Module
 * SQLite storage for AutoResearch Learning data
 * 
 * Core tables:
 * - runs: Track overall research runs
 * - method_runs: Track individual method executions
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Exponential backoff config
const RETRY_DELAYS = [100, 250, 500, 1000, 2000]; // ms
const MAX_RETRIES = 5;

/**
 * Initialize database with core schema
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Database} - Opened database connection
 */
export function initDb(dbPath) {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      baseline_score REAL,
      final_score REAL,
      status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'))
    )
  `);

  // Create method_runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS method_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      decision TEXT CHECK(decision IN ('KEEP', 'REJECT', 'FAILED')),
      improvement REAL,
      duration_ms INTEGER,
      FOREIGN KEY (run_id) REFERENCES runs(run_id)
    )
  `);

  // Prepare statements for reuse
  db.runInsertRun = db.prepare(`
    INSERT INTO runs (run_id, timestamp, baseline_score, final_score, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.runInsertMethodRun = db.prepare(`
    INSERT INTO method_runs (method_id, run_id, decision, improvement, duration_ms)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.runUpdateRun = db.prepare(`
    UPDATE runs SET status = ?, final_score = ? WHERE run_id = ?
  `);

  db.runGetRun = db.prepare(`
    SELECT * FROM runs WHERE run_id = ?
  `);

  db.runGetMethodRuns = db.prepare(`
    SELECT * FROM method_runs WHERE run_id = ? ORDER BY id
  `);

  return db;
}

/**
 * Execute operation with exponential backoff retry
 * @param {Database} db - Database connection
 * @param {Function} operation - Sync operation to execute
 * @returns {*} - Operation result
 */
function withRetry(operation) {
  let lastError;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      
      // Only retry on SQLITE_BUSY errors
      if (error.message?.includes('SQLITE_BUSY') && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        // Use synchronous sleep via busy loop (not ideal but sync required)
        const end = Date.now() + delay;
        while (Date.now() < end) {} // Busy wait
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Record a new research run
 * @param {Database} db - Database connection
 * @param {Object} runData - Run data
 * @param {string} runData.run_id - Unique run identifier
 * @param {string} runData.timestamp - ISO timestamp
 * @param {number|null} runData.baseline_score - Baseline score
 * @param {number|null} runData.final_score - Final score (null if running)
 * @param {string} runData.status - 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
 */
export function recordRun(db, runData) {
  const { run_id, timestamp, baseline_score, final_score, status } = runData;
  
  return withRetry(() => {
    db.runInsertRun.run(run_id, timestamp, baseline_score, final_score, status);
  });
}

/**
 * Record a method run
 * @param {Database} db - Database connection
 * @param {Object} methodRunData - Method run data
 * @param {string} methodRunData.method_id - Method identifier
 * @param {string} methodRunData.run_id - Parent run identifier
 * @param {string} methodRunData.decision - 'KEEP' | 'REJECT' | 'FAILED'
 * @param {number|null} methodRunData.improvement - Score improvement
 * @param {number|null} methodRunData.duration_ms - Execution duration in milliseconds
 */
export function recordMethodRun(db, methodRunData) {
  const { method_id, run_id, decision, improvement, duration_ms } = methodRunData;
  
  return withRetry(() => {
    db.runInsertMethodRun.run(method_id, run_id, decision, improvement, duration_ms);
  });
}

/**
 * Close database connection
 * @param {Database} db - Database connection
 */
export function closeDb(db) {
  // better-sqlite3 doesn't require statement finalization
  // Just close the database connection
  db.close();
}

/**
 * Update run status
 * @param {Database} db - Database connection
 * @param {string} run_id - Run identifier
 * @param {Object} updates - Fields to update
 * @param {string} [updates.status] - New status
 * @param {number} [updates.final_score] - Final score
 */
export function updateRun(db, run_id, updates) {
  const currentRun = getRun(db, run_id);
  if (!currentRun) {
    throw new Error(`Run ${run_id} not found`);
  }
  
  const status = updates.status !== undefined ? updates.status : currentRun.status;
  const final_score = updates.final_score !== undefined ? updates.final_score : currentRun.final_score;
  
  return withRetry(() => {
    db.runUpdateRun.run(status, final_score, run_id);
  });
}

/**
 * Get run by ID
 * @param {Database} db - Database connection
 * @param {string} run_id - Run identifier
 * @returns {Object|null} - Run record or null
 */
export function getRun(db, run_id) {
  return withRetry(() => {
    return db.runGetRun.get(run_id) || null;
  });
}

/**
 * Get method runs for a run
 * @param {Database} db - Database connection
 * @param {string} run_id - Run identifier
 * @returns {Array} - Method run records
 */
export function getMethodRunsForRun(db, run_id) {
  return withRetry(() => {
    return db.runGetMethodRuns.all(run_id);
  });
}

// CLI interface for manual testing
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Learning DB Module - Manual Test');
  console.log('================================\n');
  
  const testDbPath = '/tmp/learning_db_test.db';
  
  // Cleanup test file if exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  
  const db = initDb(testDbPath);
  console.log('✓ Database initialized');
  
  // Test recordRun
  recordRun(db, {
    run_id: '20260325_030000',
    timestamp: '2026-03-25T03:00:00Z',
    baseline_score: 0.267,
    final_score: null,
    status: 'RUNNING'
  });
  console.log('✓ Run recorded');
  
  // Test recordMethodRun
  recordMethodRun(db, {
    method_id: 'test_method',
    run_id: '20260325_030000',
    decision: 'KEEP',
    improvement: 0.05,
    duration_ms: 120000
  });
  console.log('✓ Method run recorded');
  
  // Test reading data
  const run = getRun(db, '20260325_030000');
  console.log('\nRecorded run:', run);
  
  const methodRuns = getMethodRunsForRun(db, '20260325_030000');
  console.log('Method runs:', methodRuns);
  
  // Test update
  updateRun(db, '20260325_030000', { 
    status: 'COMPLETED', 
    final_score: 0.317 
  });
  console.log('✓ Run updated');
  
  const updatedRun = getRun(db, '20260325_030000');
  console.log('Updated run:', updatedRun);
  
  closeDb(db);
  console.log('\n✓ Database closed successfully');
  console.log('CLI test complete!');
}
