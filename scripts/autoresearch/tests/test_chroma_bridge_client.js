/**
 * Tests for ChromaDB Bridge Client
 * 
 * Run with: node scripts/autoresearch/tests/test_chroma_bridge_client.js
 */

const { ChromaBridgeClient, ChromaBridgeError } = require('../chroma_bridge_client.js');

// Test configuration
const TEST_CONFIG = {
    port: 8766,  // Use different port to avoid conflicts
    host: 'localhost'
};

/**
 * Simple test runner
 */
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('='.repeat(60));
        console.log('ChromaDB Bridge Client Test Suite');
        console.log('='.repeat(60));
        console.log();

        for (const { name, fn } of this.tests) {
            try {
                await fn();
                this.passed++;
                console.log(`✓ ${name}`);
            } catch (error) {
                this.failed++;
                console.log(`✗ ${name}`);
                console.log(`  Error: ${error.message}`);
            }
        }

        console.log();
        console.log('='.repeat(60));
        console.log(`Results: ${this.passed} passed, ${this.failed} failed`);
        console.log('='.repeat(60));

        return this.failed === 0 ? 0 : 1;
    }
}

// Create test runner
const runner = new TestRunner();

// Test: Client initialization
runner.test('Client initialization with default config', () => {
    const client = new ChromaBridgeClient();
    if (!client) {
        throw new Error('Client not created');
    }
    if (client.port !== 8765) {
        throw new Error(`Expected port 8765, got ${client.port}`);
    }
});

// Test: Client initialization with custom config
runner.test('Client initialization with custom config', () => {
    const client = new ChromaBridgeClient({ port: 9999, retries: 5 });
    if (client.port !== 9999) {
        throw new Error(`Expected port 9999, got ${client.port}`);
    }
    if (client.retries !== 5) {
        throw new Error(`Expected 5 retries, got ${client.retries}`);
    }
});

// Test: ChromaBridgeError creation
runner.test('ChromaBridgeError creation', () => {
    const error = new ChromaBridgeError('Test error', 500);
    if (error.message !== 'Test error') {
        throw new Error('Message mismatch');
    }
    if (error.statusCode !== 500) {
        throw new Error('Status code mismatch');
    }
    if (error.name !== 'ChromaBridgeError') {
        throw new Error('Name mismatch');
    }
});

// Test: Missing method_id validation
runner.test('getSuccessRate validates method_id', async () => {
    const client = new ChromaBridgeClient(TEST_CONFIG);
    try {
        await client.getSuccessRate('');
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message !== 'methodId is required') {
            throw error;
        }
    }
});

// Test: Missing run_id validation
runner.test('getRecommendations validates run_id', async () => {
    const client = new ChromaBridgeClient(TEST_CONFIG);
    try {
        await client.getRecommendations('');
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message !== 'runId is required') {
            throw error;
        }
    }
});

// Test: addMethod validation
runner.test('addMethod validates method_id', async () => {
    const client = new ChromaBridgeClient(TEST_CONFIG);
    try {
        await client.addMethod({ category: 'test', parameters: {} });
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message !== 'method_id is required') {
            throw error;
        }
    }
});

// Test: recordRun validation
runner.test('recordRun validates required fields', async () => {
    const client = new ChromaBridgeClient(TEST_CONFIG);
    try {
        await client.recordRun({ run_id: 'test' });
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message !== 'timestamp is required') {
            throw error;
        }
    }
});

// Test: Environment variable configuration
runner.test('Client reads environment variables', () => {
    process.env.CHROMA_BRIDGE_HOST = 'testhost';
    process.env.CHROMA_BRIDGE_PORT = '7777';
    
    const client = new ChromaBridgeClient();
    
    delete process.env.CHROMA_BRIDGE_HOST;
    delete process.env.CHROMA_BRIDGE_PORT;
    
    if (client.host !== 'testhost') {
        throw new Error(`Expected host 'testhost', got '${client.host}'`);
    }
    if (client.port !== 7777) {
        throw new Error(`Expected port 7777, got ${client.port}`);
    }
});

// Test: getSimilarMethods validation
runner.test('getSimilarMethods validates method_id', async () => {
    const client = new ChromaBridgeClient(TEST_CONFIG);
    try {
        await client.getSimilarMethods('');
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message !== 'methodId is required') {
            throw error;
        }
    }
});

// Test: recordMethodRun validation
runner.test('recordMethodRun validates method_id', async () => {
    const client = new ChromaBridgeClient(TEST_CONFIG);
    try {
        await client.recordMethodRun({ run_id: 'test' });
        throw new Error('Should have thrown error');
    } catch (error) {
        if (error.message !== 'method_id is required') {
            throw error;
        }
    }
});

// Run all tests
(async () => {
    const exitCode = await runner.run();
    process.exit(exitCode);
})();
