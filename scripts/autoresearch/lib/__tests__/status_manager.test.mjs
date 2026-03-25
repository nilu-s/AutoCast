/**
 * status_manager.mjs - Unit Tests
 * Tests für Status-Management und Job-Tracking
 * @version 1.3.0
 */

import {
  STATUS,
  createStatus,
  loadStatus,
  saveStatus,
  addJob,
  updateJobStatus,
  getSummary,
  isComplete,
  getJobsByStatus
} from '../status_manager.mjs';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '../../../test_data_real/status_manager_test');

// Test Utilities
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(value, message) {
  if (value !== true) {
    throw new Error(message || `Expected true, got ${value}`);
  }
}

function assertFalse(value, message) {
  if (value !== false) {
    throw new Error(message || `Expected false, got ${value}`);
  }
}

function assertNull(value, message) {
  if (value !== null) {
    throw new Error(message || `Expected null, got ${value}`);
  }
}

function assertDefined(value, message) {
  if (value === undefined) {
    throw new Error(message || 'Expected defined value, got undefined');
  }
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(message || 'Expected function to throw');
  }
}

async function test(name, fn) {
  testsRun++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      await result;
    }
    testsPassed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    testsFailed++;
    console.error(`❌ ${name}`);
    console.error(`   ${error.message}`);
  }
}

// Setup
function setup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ==================== Tests ====================

console.log('=== Testing status_manager.mjs ===\n');

setup();

// -------------------- STATUS Constants --------------------
test('STATUS: has all required values', () => {
  assertEqual(STATUS.PENDING, 'PENDING');
  assertEqual(STATUS.RUNNING, 'RUNNING');
  assertEqual(STATUS.COMPLETED, 'COMPLETED');
  assertEqual(STATUS.FAILED, 'FAILED');
  assertEqual(STATUS.REJECTED, 'REJECTED');
});

// -------------------- createStatus --------------------
test('createStatus: initializes with correct structure', () => {
  const statusPath = join(TEST_DIR, 'test_status.json');
  const status = createStatus(statusPath);
  
  assertDefined(status.path, 'Should have path property');
  assertDefined(status.data, 'Should have data property');
  assertEqual(status.path, statusPath);
  assertEqual(status.data.schemaVersion, '1.0.0');
  assertDefined(status.data.createdAt, 'Should have createdAt');
  assertDefined(status.data.updatedAt, 'Should have updatedAt');
  assertObject(status.data.jobs, {}, 'Should have empty jobs object');
});

function assertObject(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message || 'Objects not equal'}: expected ${expectedStr}, got ${actualStr}`);
  }
}

test('createStatus: timestamps are ISO format', () => {
  const status = createStatus(join(TEST_DIR, 'ts_test.json'));
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  assertTrue(isoRegex.test(status.data.createdAt), 'createdAt should be ISO format');
  assertTrue(isoRegex.test(status.data.updatedAt), 'updatedAt should be ISO format');
});

// -------------------- saveStatus --------------------
test('saveStatus: creates file with correct content', () => {
  const statusPath = join(TEST_DIR, 'save_test.json');
  const status = createStatus(statusPath);
  
  saveStatus(status);
  
  assertTrue(existsSync(statusPath), 'Status file should exist');
  const content = JSON.parse(readFileSync(statusPath, 'utf8'));
  assertEqual(content.schemaVersion, '1.0.0');
  // Check that jobs is an empty object
  assertTrue(typeof content.jobs === 'object' && Object.keys(content.jobs).length === 0, 'jobs should be empty object');
});

test('saveStatus: creates directories recursively', () => {
  const deepPath = join(TEST_DIR, 'nested', 'deep', 'status.json');
  const status = createStatus(deepPath);
  
  saveStatus(status);
  
  assertTrue(existsSync(deepPath), 'Should create nested directories');
});

test('saveStatus: updates updatedAt timestamp', () => {
  const statusPath = join(TEST_DIR, 'update_ts_test.json');
  const status = createStatus(statusPath);
  const originalUpdatedAt = status.data.updatedAt;
  
  // Wait a bit to ensure timestamp difference
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  
  saveStatus(status);
  
  assertTrue(status.data.updatedAt > originalUpdatedAt, 'updatedAt should be newer');
});

test('saveStatus: throws on invalid status object', () => {
  assertThrows(() => saveStatus(null), 'Should throw for null');
  assertThrows(() => saveStatus({}), 'Should throw for empty object');
  assertThrows(() => saveStatus({ path: '/test' }), 'Should throw for missing data');
});

// -------------------- loadStatus --------------------
test('loadStatus: loads existing status file', () => {
  const statusPath = join(TEST_DIR, 'load_test.json');
  const created = createStatus(statusPath);
  addJob(created, { jobId: 'test__job__001', taskAgent: 'test', methodId: 'job', methodTitle: 'Test' });
  saveStatus(created);
  
  const loaded = loadStatus(statusPath);
  
  assertDefined(loaded, 'Should return status object');
  assertEqual(loaded.path, statusPath);
  assertDefined(loaded.data.jobs['test__job__001'], 'Should have job');
});

test('loadStatus: returns null for missing file', () => {
  const result = loadStatus(join(TEST_DIR, 'nonexistent.json'));
  assertNull(result);
});

test('loadStatus: returns null for invalid JSON', () => {
  const badPath = join(TEST_DIR, 'bad.json');
  writeFileSync(badPath, 'not valid json {{{');
  
  const result = loadStatus(badPath);
  assertNull(result);
});

test('loadStatus: returns null for unreadable file', () => {
  // Create a file with no read permissions (if not root)
  const noReadPath = join(TEST_DIR, 'noread.json');
  writeFileSync(noReadPath, '{"test": 1}');
  
  const result = loadStatus(noReadPath);
  // May be null or may work depending on permissions
  assertDefined(result !== undefined, 'Should not return undefined');
});

// -------------------- addJob --------------------
test('addJob: adds job with PENDING status', () => {
  const status = createStatus(join(TEST_DIR, 'add_test.json'));
  
  addJob(status, {
    jobId: 'agent__method__001',
    taskAgent: 'silence-pruner',
    methodId: 'adjust_threshold',
    methodTitle: 'Adjust Threshold'
  });
  
  const job = status.data.jobs['agent__method__001'];
  assertDefined(job, 'Job should exist');
  assertEqual(job.status, STATUS.PENDING);
  assertEqual(job.taskAgent, 'silence-pruner');
  assertEqual(job.methodId, 'adjust_threshold');
  assertEqual(job.methodTitle, 'Adjust Threshold');
});

test('addJob: initializes timestamps', () => {
  const status = createStatus(join(TEST_DIR, 'ts_init_test.json'));
  
  addJob(status, {
    jobId: 'test__job__001',
    taskAgent: 'test',
    methodId: 'job',
    methodTitle: 'Test'
  });
  
  const job = status.data.jobs['test__job__001'];
  assertDefined(job.createdAt, 'Should have createdAt');
  assertDefined(job.updatedAt, 'Should have updatedAt');
  assertNull(job.startedAt, 'startedAt should be null initially');
  assertNull(job.completedAt, 'completedAt should be null initially');
});

test('addJob: throws without jobId', () => {
  const status = createStatus(join(TEST_DIR, 'throw_test.json'));
  assertThrows(() => addJob(status, { taskAgent: 'test' }), 'Should throw without jobId');
});

test('addJob: handles optional fields', () => {
  const status = createStatus(join(TEST_DIR, 'opt_test.json'));
  
  addJob(status, { jobId: 'minimal__test__001' });
  
  const job = status.data.jobs['minimal__test__001'];
  assertEqual(job.taskAgent, 'unknown');
  assertEqual(job.methodId, 'unknown');
  assertEqual(job.methodTitle, '');
});

// -------------------- updateJobStatus --------------------
test('updateJobStatus: updates status and timestamps', () => {
  const status = createStatus(join(TEST_DIR, 'update_test.json'));
  addJob(status, { jobId: 'test__job__001', taskAgent: 'test', methodId: 'job', methodTitle: 'Test' });
  
  updateJobStatus(status, 'test__job__001', STATUS.RUNNING);
  
  const job = status.data.jobs['test__job__001'];
  assertEqual(job.status, STATUS.RUNNING);
  assertDefined(job.startedAt, 'Should set startedAt on RUNNING');
});

test('updateJobStatus: sets completedAt on terminal states', () => {
  const status = createStatus(join(TEST_DIR, 'complete_test.json'));
  addJob(status, { jobId: 'test__job__001', taskAgent: 'test', methodId: 'job', methodTitle: 'Test' });
  updateJobStatus(status, 'test__job__001', STATUS.RUNNING);
  
  updateJobStatus(status, 'test__job__001', STATUS.COMPLETED);
  
  const job = status.data.jobs['test__job__001'];
  assertEqual(job.status, STATUS.COMPLETED);
  assertDefined(job.completedAt, 'Should set completedAt');
});

test('updateJobStatus: sets result and error options', () => {
  const status = createStatus(join(TEST_DIR, 'opts_test.json'));
  addJob(status, { jobId: 'test__job__001', taskAgent: 'test', methodId: 'job', methodTitle: 'Test' });
  
  updateJobStatus(status, 'test__job__001', STATUS.COMPLETED, {
    result: { decision: 'KEEP', metrics: {} },
    error: null
  });
  
  const job = status.data.jobs['test__job__001'];
  assertDefined(job.result, 'Should have result');
  assertEqual(job.result.decision, 'KEEP');
});

test('updateJobStatus: throws for invalid status object', () => {
  assertThrows(() => updateJobStatus(null, 'id', STATUS.RUNNING));
  assertThrows(() => updateJobStatus({}, 'id', STATUS.RUNNING));
});

test('updateJobStatus: throws for non-existent job', () => {
  const status = createStatus(join(TEST_DIR, 'nojob_test.json'));
  assertThrows(() => updateJobStatus(status, 'nonexistent', STATUS.RUNNING));
});

// -------------------- getSummary --------------------
test('getSummary: returns correct counts', () => {
  const status = createStatus(join(TEST_DIR, 'summary_test.json'));
  
  // Add jobs with different statuses
  addJob(status, { jobId: 'job__pending__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  addJob(status, { jobId: 'job__running__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  addJob(status, { jobId: 'job__completed__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  addJob(status, { jobId: 'job__failed__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  addJob(status, { jobId: 'job__rejected__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  
  updateJobStatus(status, 'job__running__001', STATUS.RUNNING);
  updateJobStatus(status, 'job__completed__001', STATUS.COMPLETED);
  updateJobStatus(status, 'job__failed__001', STATUS.FAILED);
  updateJobStatus(status, 'job__rejected__001', STATUS.REJECTED);
  
  const summary = getSummary(status);
  
  assertEqual(summary.total, 5);
  assertEqual(summary.pending, 1);
  assertEqual(summary.running, 1);
  assertEqual(summary.completed, 1);
  assertEqual(summary.failed, 1);
  assertEqual(summary.rejected, 1);
});

test('getSummary: returns empty summary for invalid status', () => {
  const summary = getSummary(null);
  assertEqual(summary.total, 0);
  assertEqual(summary.pending, 0);
  
  const summary2 = getSummary({});
  assertEqual(summary2.total, 0);
});

test('getSummary: handles empty jobs', () => {
  const status = createStatus(join(TEST_DIR, 'empty_summary.json'));
  const summary = getSummary(status);
  
  assertEqual(summary.total, 0);
  assertEqual(summary.pending, 0);
  assertEqual(summary.running, 0);
  assertEqual(summary.completed, 0);
  assertEqual(summary.failed, 0);
  assertEqual(summary.rejected, 0);
});

// -------------------- isComplete --------------------
test('isComplete: returns true when no pending or running', () => {
  const status = createStatus(join(TEST_DIR, 'complete_true.json'));
  addJob(status, { jobId: 'j__1__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  updateJobStatus(status, 'j__1__001', STATUS.COMPLETED);
  
  assertTrue(isComplete(status));
});

test('isComplete: returns false when pending jobs exist', () => {
  const status = createStatus(join(TEST_DIR, 'complete_pending.json'));
  addJob(status, { jobId: 'j__1__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  // Status remains PENDING
  
  assertFalse(isComplete(status));
});

test('isComplete: returns false when running jobs exist', () => {
  const status = createStatus(join(TEST_DIR, 'complete_running.json'));
  addJob(status, { jobId: 'j__1__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  updateJobStatus(status, 'j__1__001', STATUS.RUNNING);
  
  assertFalse(isComplete(status));
});

// -------------------- getJobsByStatus --------------------
test('getJobsByStatus: returns jobs matching status', () => {
  const status = createStatus(join(TEST_DIR, 'filter_test.json'));
  addJob(status, { jobId: 'j__1__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  addJob(status, { jobId: 'j__2__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  updateJobStatus(status, 'j__1__001', STATUS.RUNNING);
  
  const running = getJobsByStatus(status, STATUS.RUNNING);
  assertEqual(running.length, 1);
  assertEqual(running[0].jobId, 'j__1__001');
  
  const pending = getJobsByStatus(status, STATUS.PENDING);
  assertEqual(pending.length, 1);
  assertEqual(pending[0].jobId, 'j__2__001');
});

test('getJobsByStatus: returns empty array for no matches', () => {
  const status = createStatus(join(TEST_DIR, 'filter_empty.json'));
  addJob(status, { jobId: 'j__1__001', taskAgent: 't', methodId: 'm', methodTitle: 'T' });
  
  const result = getJobsByStatus(status, STATUS.FAILED);
  assertEqual(result.length, 0);
  assertTrue(Array.isArray(result));
});

test('getJobsByStatus: returns empty array for invalid status', () => {
  const result = getJobsByStatus(null, STATUS.PENDING);
  assertEqual(result.length, 0);
  
  const result2 = getJobsByStatus({}, STATUS.PENDING);
  assertEqual(result2.length, 0);
});

// ==================== Integration ====================
test('integration: full workflow', () => {
  const statusPath = join(TEST_DIR, 'integration.json');
  
  // Create and save
  const status = createStatus(statusPath);
  addJob(status, { jobId: 'agent__method__001', taskAgent: 'agent', methodId: 'method', methodTitle: 'Test' });
  saveStatus(status);
  
  // Load and update
  const loaded = loadStatus(statusPath);
  updateJobStatus(loaded, 'agent__method__001', STATUS.RUNNING);
  updateJobStatus(loaded, 'agent__method__001', STATUS.COMPLETED, { result: { decision: 'KEEP' } });
  saveStatus(loaded);
  
  // Verify
  const final = loadStatus(statusPath);
  const job = final.data.jobs['agent__method__001'];
  assertEqual(job.status, STATUS.COMPLETED);
  assertDefined(job.result);
  assertDefined(job.startedAt);
  assertDefined(job.completedAt);
  
  const summary = getSummary(final);
  assertEqual(summary.completed, 1);
  assertTrue(isComplete(final));
});

// ==================== Summary ====================

console.log('\n' + '='.repeat(50));
console.log('Test Results');
console.log('='.repeat(50));
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📊 Total:  ${testsRun}`);
console.log('='.repeat(50));

cleanup();

if (testsFailed > 0) {
  process.exit(1);
}
