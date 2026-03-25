"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const learning_db_1 = require("./learning_db");
const fs_1 = __importDefault(require("fs"));
(0, vitest_1.describe)('learning_db', () => {
    let db;
    const TEST_DB_PATH = './test_learning_temp.db';
    (0, vitest_1.beforeEach)(() => {
        if (fs_1.default.existsSync(TEST_DB_PATH)) {
            fs_1.default.unlinkSync(TEST_DB_PATH);
        }
        db = (0, learning_db_1.initDb)(TEST_DB_PATH);
    });
    (0, vitest_1.afterEach)(() => {
        (0, learning_db_1.closeDb)(db);
        if (fs_1.default.existsSync(TEST_DB_PATH)) {
            fs_1.default.unlinkSync(TEST_DB_PATH);
        }
    });
    (0, vitest_1.it)('should initialize database', () => {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        const tableNames = tables.map((t) => t.name);
        (0, vitest_1.expect)(tableNames).toContain('runs');
        (0, vitest_1.expect)(tableNames).toContain('method_runs');
    });
    (0, vitest_1.it)('should record a run', () => {
        const run = {
            run_id: 'test_run_001',
            timestamp: '2026-03-25T03:00:00Z',
            baseline_score: 0.267,
            final_score: null,
            status: 'RUNNING'
        };
        (0, learning_db_1.recordRun)(db, run);
        const result = db.prepare('SELECT * FROM runs WHERE run_id = ?').get('test_run_001');
        (0, vitest_1.expect)(result.run_id).toBe('test_run_001');
        (0, vitest_1.expect)(result.baseline_score).toBe(0.267);
        (0, vitest_1.expect)(result.status).toBe('RUNNING');
    });
    (0, vitest_1.it)('should record a method run', () => {
        // First record a run (foreign key)
        (0, learning_db_1.recordRun)(db, {
            run_id: 'test_run_002',
            timestamp: '2026-03-25T03:00:00Z',
            baseline_score: 0.267,
            final_score: null,
            status: 'RUNNING'
        });
        const methodRun = {
            method_id: 'test_method',
            run_id: 'test_run_002',
            decision: 'KEEP',
            improvement: 0.05,
            duration_ms: 120000
        };
        (0, learning_db_1.recordMethodRun)(db, methodRun);
        const result = db.prepare('SELECT * FROM method_runs WHERE method_id = ?').get('test_method');
        (0, vitest_1.expect)(result.method_id).toBe('test_method');
        (0, vitest_1.expect)(result.decision).toBe('KEEP');
        (0, vitest_1.expect)(result.improvement).toBe(0.05);
    });
});
//# sourceMappingURL=learning_db.test.js.map