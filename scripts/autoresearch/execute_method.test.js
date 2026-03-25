/**
 * execute_method.test.js - Unit Tests für Phase 2.2
 * Tests für execute_method.js als ES-Module
 * @version 2.2.0
 */

import { 
    parseArgs, 
    loadPromptTemplate, 
    fillTemplate, 
    generateRunPaths, 
    spawnMethodExecutor,
    savePromptToFile, 
    loadDispatchRequest, 
    validateParams, 
    generateTaskContent 
} from './execute_method.js';

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test-Utilities
const TEST_DIR = join(__dirname, '../../test_data_real/execute_method_test');
const FIXTURES_DIR = join(TEST_DIR, 'fixtures');

// Assertion Helpers
function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

function assertTrue(value, message) {
    if (value !== true) {
        throw new Error(message || 'Expected true');
    }
}

function assertContains(haystack, needle, message) {
    if (!haystack.includes(needle)) {
        throw new Error(`${message || 'Assertion failed'}: expected to contain "${needle}"`);
    }
}

// Tests
async function runTests() {
    console.log('=== Testing execute_method.js (Phase 2.2) ===\n');
    
    let passed = 0;
    let failed = 0;
    
    // Setup
    if (!existsSync(TEST_DIR)) {
        mkdirSync(TEST_DIR, { recursive: true });
    }
    if (!existsSync(FIXTURES_DIR)) {
        mkdirSync(FIXTURES_DIR, { recursive: true });
    }
    
    const tests = [
        // ==================== parseArgs Tests ====================
        {
            name: 'parseArgs: should parse --methodId',
            run: () => {
                const result = parseArgs(['--methodId', 'test_method']);
                assertEqual(result.methodId, 'test_method', 'methodId should be parsed');
            }
        },
        {
            name: 'parseArgs: should parse --runId',
            run: () => {
                const result = parseArgs(['--runId', '20260325_123456']);
                assertEqual(result.runId, '20260325_123456', 'runId should be parsed');
            }
        },
        {
            name: 'parseArgs: should parse --jobIndex',
            run: () => {
                const result = parseArgs(['--jobIndex', '5']);
                assertEqual(result.jobIndex, '5', 'jobIndex should be parsed');
            }
        },
        {
            name: 'parseArgs: should parse --dispatch',
            run: () => {
                const result = parseArgs(['--dispatch', '/path/to/file.json']);
                assertEqual(result.dispatch, '/path/to/file.json', 'dispatch should be parsed');
            }
        },
        {
            name: 'parseArgs: should parse --dry-run',
            run: () => {
                const result = parseArgs(['--dry-run']);
                assertTrue(result.dryRun === true, 'dryRun should be true');
            }
        },
        {
            name: 'parseArgs: should parse --help',
            run: () => {
                const result = parseArgs(['--help']);
                assertTrue(result.help === true, 'help should be true');
            }
        },
        {
            name: 'parseArgs: should parse multiple arguments',
            run: () => {
                const result = parseArgs([
                    '--methodId', 'my_method',
                    '--runId', '20260325_123456',
                    '--jobIndex', '3'
                ]);
                assertEqual(result.methodId, 'my_method', 'methodId should be parsed');
                assertEqual(result.runId, '20260325_123456', 'runId should be parsed');
                assertEqual(result.jobIndex, '3', 'jobIndex should be parsed');
            }
        },
        {
            name: 'parseArgs: should handle empty args',
            run: () => {
                const result = parseArgs([]);
                assertEqual(Object.keys(result).length, 0, 'should return empty object');
            }
        },
        
        // ==================== fillTemplate Tests ====================
        {
            name: 'fillTemplate: should replace single placeholder',
            run: () => {
                const template = 'Hello {{methodId}}!';
                const result = fillTemplate(template, { methodId: 'World' });
                assertEqual(result, 'Hello World!', 'should replace placeholder');
            }
        },
        {
            name: 'fillTemplate: should replace multiple placeholders',
            run: () => {
                const template = '{{methodId}} {{runId}}! {{methodId}} again!';
                const result = fillTemplate(template, { methodId: 'Hello', runId: 'World' });
                assertEqual(result, 'Hello World! Hello again!', 'should replace multiple placeholders');
            }
        },
        {
            name: 'fillTemplate: should handle nested path values',
            run: () => {
                const template = 'Path: {{runDir}}';
                const result = fillTemplate(template, { runDir: '/some/nested/path' });
                assertEqual(result, 'Path: /some/nested/path', 'should handle path values');
            }
        },
        {
            name: 'fillTemplate: should skip undefined values',
            run: () => {
                const template = 'Hello {{methodId}}! {{undefined}}';
                const result = fillTemplate(template, { methodId: 'World', undefined: undefined });
                assertContains(result, 'Hello World!', 'should replace defined values');
            }
        },
        {
            name: 'fillTemplate: should skip null values',
            run: () => {
                const template = 'Hello {{methodId}}! {{nullValue}}';
                const result = fillTemplate(template, { methodId: 'World', nullValue: null });
                assertContains(result, 'Hello World!', 'should replace defined values');
            }
        },
        {
            name: 'fillTemplate: should throw on empty template',
            run: () => {
                try {
                    fillTemplate('', { methodId: 'test' });
                    throw new Error('should throw on empty template');
                } catch (e) {
                    if (e.message === 'should throw on empty template') {
                        throw e;
                    }
                    // Expected error - pass
                }
            }
        },
        {
            name: 'fillTemplate: should throw on non-string template',
            run: () => {
                try {
                    fillTemplate(null, { methodId: 'test' });
                    throw new Error('should throw on null template');
                } catch (e) {
                    if (e.message === 'should throw on null template') {
                        throw e;
                    }
                    // Expected error - pass
                }
            }
        },
        {
            name: 'fillTemplate: should convert numbers to strings',
            run: () => {
                const template = 'Count: {{jobIndex}}';
                const result = fillTemplate(template, { jobIndex: 42 });
                assertEqual(result, 'Count: 42', 'should convert number to string');
            }
        },
        {
            name: 'fillTemplate: should handle special characters in values',
            run: () => {
                const template = 'Path: {{runDir}}';
                const result = fillTemplate(template, { runDir: '/path/with-special.chars' });
                assertEqual(result, 'Path: /path/with-special.chars', 'should handle special chars');
            }
        },
        
        // ==================== generateRunPaths Tests ====================
        {
            name: 'generateRunPaths: should generate correct paths',
            run: () => {
                const result = generateRunPaths('20260325_123456', 'test_method', 5);
                assertTrue(result.runDir.includes('20260325_123456'), 'runDir should contain runId');
                assertTrue(result.resultsDir.includes('results'), 'resultsDir should contain results');
                assertTrue(result.statusPath.includes('STATUS.json'), 'statusPath should contain STATUS.json');
                assertTrue(result.resultPath.includes('result.json'), 'resultPath should contain result.json');
            }
        },
        {
            name: 'generateRunPaths: should use default jobIndex',
            run: () => {
                const result = generateRunPaths('20260325_123456', 'test_method');
                assertTrue(result.jobKey.includes('__001'), 'jobKey should have default index 001');
            }
        },
        {
            name: 'generateRunPaths: should format jobIndex with padding',
            run: () => {
                const result = generateRunPaths('20260325_123456', 'test_method', 42);
                assertTrue(result.jobKey.includes('__042'), 'jobKey should have padded index 042');
            }
        },
        
        // ==================== validateParams Tests ====================
        {
            name: 'validateParams: should return null for valid params',
            run: () => {
                const result = validateParams({
                    methodId: 'test',
                    runId: '20260325_123456'
                });
                assertEqual(result, null, 'should return null for valid params');
            }
        },
        {
            name: 'validateParams: should detect missing methodId',
            run: () => {
                const result = validateParams({
                    runId: '20260325_123456'
                });
                assertTrue(result.includes('methodId'), 'should report missing methodId');
            }
        },
        {
            name: 'validateParams: should detect missing runId',
            run: () => {
                const result = validateParams({
                    methodId: 'test'
                });
                assertTrue(result.includes('runId'), 'should report missing runId');
            }
        },
        {
            name: 'validateParams: should detect missing both',
            run: () => {
                const result = validateParams({});
                assertEqual(result.length, 2, 'should report 2 missing params');
                assertTrue(result.includes('methodId'), 'should report missing methodId');
                assertTrue(result.includes('runId'), 'should report missing runId');
            }
        },
        
        // ==================== loadDispatchRequest Tests ====================
        {
            name: 'loadDispatchRequest: should load valid dispatch file',
            run: () => {
                const dispatchPath = join(FIXTURES_DIR, 'valid_dispatch.json');
                const dispatch = {
                    methodId: 'silence_overlap_bleed_weight',
                    runId: '20260325_002306',
                    jobIndex: 1,
                    methodTitle: 'Silence Overlap Bleed Weight'
                };
                writeFileSync(dispatchPath, JSON.stringify(dispatch, null, 2));
                
                const result = loadDispatchRequest(dispatchPath);
                assertEqual(result.methodId, 'silence_overlap_bleed_weight', 'should load methodId');
                assertEqual(result.runId, '20260325_002306', 'should load runId');
                assertEqual(result.jobIndex, 1, 'should load jobIndex');
            }
        },
        {
            name: 'loadDispatchRequest: should return null for missing file',
            run: () => {
                const result = loadDispatchRequest('/nonexistent/file.json');
                assertEqual(result, null, 'should return null for missing file');
            }
        },
        {
            name: 'loadDispatchRequest: should return null for invalid JSON',
            run: () => {
                const dispatchPath = join(FIXTURES_DIR, 'invalid.json');
                writeFileSync(dispatchPath, 'not valid json');
                
                const result = loadDispatchRequest(dispatchPath);
                assertEqual(result, null, 'should return null for invalid JSON');
            }
        },
        
        // ==================== generateTaskContent Tests ====================
        {
            name: 'generateTaskContent: should include all parameters',
            run: () => {
                const prompt = 'Execute this method';
                const params = {
                    methodId: 'test_method',
                    methodTitle: 'Test Method',
                    runId: '20260325_123456',
                    resultPath: '/path/to/result.json',
                    statusPath: '/path/to/status.json'
                };
                
                const result = generateTaskContent(prompt, params);
                assertContains(result, 'test_method', 'should include methodId');
                assertContains(result, 'Test Method', 'should include methodTitle');
                assertContains(result, '20260325_123456', 'should include runId');
                assertContains(result, 'Execute this method', 'should include prompt');
            }
        },
        {
            name: 'generateTaskContent: should include JSON schema',
            run: () => {
                const prompt = 'Execute';
                const params = {
                    methodId: 'test',
                    runId: 'run',
                    resultPath: '/result.json',
                    statusPath: '/status.json'
                };
                
                const result = generateTaskContent(prompt, params);
                assertContains(result, 'schemaVersion', 'should include schemaVersion');
                assertContains(result, 'KEEP|REJECT|FAILED', 'should include decision options');
                assertContains(result, 'Result Schema', 'should include section header');
            }
        },
        
        // ==================== savePromptToFile Tests ====================
        {
            name: 'savePromptToFile: should create file with correct content',
            run: () => {
                const runDir = join(TEST_DIR, 'run_save_test');
                if (!existsSync(runDir)) {
                    mkdirSync(runDir, { recursive: true });
                }
                
                const prompt = 'Test prompt content';
                const filePath = savePromptToFile(prompt, runDir, 'my_method');
                
                assertTrue(existsSync(filePath), 'file should exist');
                const content = readFileSync(filePath, 'utf8');
                assertContains(content, 'Test prompt content', 'should contain prompt');
                assertContains(content, 'my_method', 'should contain methodId');
                assertContains(content, 'Manual Execution', 'should contain instructions');
            }
        },
        {
            name: 'savePromptToFile: should create manual-tasks directory',
            run: () => {
                const runDir = join(TEST_DIR, 'run_mkdir_test');
                if (!existsSync(runDir)) {
                    mkdirSync(runDir, { recursive: true });
                }
                
                const prompt = 'Test';
                savePromptToFile(prompt, runDir, 'method');
                
                const manualDir = join(runDir, 'manual-tasks');
                assertTrue(existsSync(manualDir), 'manual-tasks directory should exist');
            }
        },
        
        // ==================== spawnMethodExecutor Tests ====================
        {
            name: 'spawnMethodExecutor: should create task file',
            async run() {
                const runDir = join(TEST_DIR, 'run_spawn_test');
                if (!existsSync(runDir)) {
                    mkdirSync(runDir, { recursive: true });
                }
                
                const params = {
                    methodId: 'spawn_test',
                    methodTitle: 'Spawn Test',
                    runId: '20260325_123456',
                    runDir: runDir,
                    resultPath: join(runDir, 'result.json'),
                    statusPath: join(runDir, 'STATUS.json')
                };
                
                const prompt = 'Test prompt for spawning';
                const taskFile = await spawnMethodExecutor(prompt, params);
                
                assertTrue(existsSync(taskFile), 'task file should exist');
                assertTrue(taskFile.includes('method_executor_spawn_test'), 'task file should be named correctly');
                
                const content = readFileSync(taskFile, 'utf8');
                assertContains(content, 'Test prompt for spawning', 'should contain prompt');
            }
        },
        {
            name: 'spawnMethodExecutor: should create subagent-tasks directory',
            async run() {
                const runDir = join(TEST_DIR, 'run_subagent_test');
                if (!existsSync(runDir)) {
                    mkdirSync(runDir, { recursive: true });
                }
                
                const params = {
                    methodId: 'subagent_test',
                    runId: '20260325_123456',
                    runDir: runDir,
                    resultPath: join(runDir, 'result.json'),
                    statusPath: join(runDir, 'STATUS.json')
                };
                
                await spawnMethodExecutor('prompt', params);
                
                const subagentDir = join(runDir, 'subagent-tasks');
                assertTrue(existsSync(subagentDir), 'subagent-tasks directory should exist');
            }
        }
    ];
    
    // Führe Tests aus
    for (const test of tests) {
        try {
            await test.run();
            console.log(`✅ ${test.name}`);
            passed++;
        } catch (err) {
            console.log(`❌ ${test.name}`);
            console.log(`   Error: ${err.message}`);
            failed++;
        }
    }
    
    // Cleanup
    try {
        if (existsSync(TEST_DIR)) {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }
    } catch (err) {
        // Ignoriere Cleanup-Fehler
    }
    
    // Zusammenfassung
    console.log('\n========================================');
    console.log('Test Results');
    console.log('========================================');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total:  ${passed + failed}`);
    console.log('========================================');
    
    return { passed, failed, total: passed + failed };
}

// Ausführung
runTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
}).catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
