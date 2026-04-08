import Database from 'better-sqlite3';
// Schema
const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  baseline_score REAL,
  final_score REAL,
  status TEXT CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS method_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  decision TEXT CHECK(decision IN ('KEEP', 'REJECT', 'FAILED')),
  improvement REAL,
  duration_ms INTEGER,
  FOREIGN KEY (run_id) REFERENCES runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_method_runs_run_id ON method_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_method_runs_method_id ON method_runs(method_id);
`;
// Functions
export function initDb(dbPath) {
    const db = new Database(dbPath);
    db.exec(SCHEMA);
    return db;
}
export function recordRun(db, run) {
    const stmt = db.prepare(`
    INSERT INTO runs (run_id, timestamp, baseline_score, final_score, status)
    VALUES (@run_id, @timestamp, @baseline_score, @final_score, @status)
  `);
    stmt.run(run);
}
export function recordMethodRun(db, methodRun) {
    const stmt = db.prepare(`
    INSERT INTO method_runs (method_id, run_id, decision, improvement, duration_ms)
    VALUES (@method_id, @run_id, @decision, @improvement, @duration_ms)
  `);
    stmt.run(methodRun);
}
export function closeDb(db) {
    db.close();
}
// Test Interface
const isMainModule = typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    // CLI Test
    const db = initDb('./test_learning.db');
    console.log('DB initialized successfully');
    recordRun(db, {
        run_id: '20260325_030000',
        timestamp: '2026-03-25T03:00:00Z',
        baseline_score: 0.267,
        final_score: null,
        status: 'RUNNING'
    });
    console.log('Run recorded');
    recordMethodRun(db, {
        method_id: 'test_method',
        run_id: '20260325_030000',
        decision: 'KEEP',
        improvement: 0.05,
        duration_ms: 120000
    });
    console.log('Method run recorded');
    // Read back
    const run = db.prepare('SELECT * FROM runs WHERE run_id = ?').get('20260325_030000');
    console.log('Read run:', run);
    const methodRun = db.prepare('SELECT * FROM method_runs WHERE method_id = ?').get('test_method');
    console.log('Read method run:', methodRun);
    closeDb(db);
    console.log('DB closed');
}
//# sourceMappingURL=learning_db.js.map