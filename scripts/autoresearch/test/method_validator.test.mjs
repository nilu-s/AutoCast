/**
 * method_validator.test.mjs - Tests für Method Validator
 */

import {
    validateMethodId,
    validateMethod,
    validateMethodCatalog,
    quickValidate,
    strictValidate
} from '../lib/method_validator.mjs';

// Test-Daten
const validMethod = {
    id: 'silence_overlap_bleed_weight',
    title: 'Test Method',
    hypothesis: 'This is a test hypothesis',
    codeScope: ['src/file.js'],
    editStrategy: ['Edit the file']
};

const invalidMethod = {
    id: 'INVALID ID',  // Ungültiges Format (Leerzeichen, Großbuchstaben)
    title: '',
    // Fehlende hypothesis
    codeScope: 'not-an-array'  // Falsches Format
};

// Tests
function runTests() {
    let passed = 0;
    let failed = 0;
    
    function test(name, fn) {
        try {
            fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (err) {
            console.log(`✗ ${name}: ${err.message}`);
            failed++;
        }
    }
    
    console.log('\n=== Method Validator Tests ===\n');
    
    // Test: validateMethodId
    test('valid method ID', () => {
        const result = validateMethodId('valid_method-id123');
        if (!result.valid) throw new Error('Should be valid');
    });
    
    test('invalid method ID (uppercase)', () => {
        const result = validateMethodId('InvalidMethod');
        if (result.valid) throw new Error('Should be invalid');
    });
    
    test('invalid method ID (space)', () => {
        const result = validateMethodId('invalid method');
        if (result.valid) throw new Error('Should be invalid');
    });
    
    test('invalid method ID (number start)', () => {
        const result = validateMethodId('123method');
        if (result.valid) throw new Error('Should be invalid');
    });
    
    // Test: validateMethod
    test('valid method', () => {
        const result = validateMethod(validMethod);
        if (!result.valid) throw new Error(`Should be valid: ${result.errors.join(', ')}`);
    });
    
    test('invalid method', () => {
        const result = validateMethod(invalidMethod);
        if (result.valid) throw new Error('Should be invalid');
        if (result.errors.length === 0) throw new Error('Should have errors');
    });
    
    test('method with empty id', () => {
        const result = validateMethod({ ...validMethod, id: '' });
        if (result.valid) throw new Error('Should be invalid');
    });
    
    // Test: validateMethodCatalog
    test('valid catalog', () => {
        const catalog = {
            'test-agent': [validMethod]
        };
        const result = validateMethodCatalog(catalog);
        if (!result.valid) throw new Error(`Should be valid: ${result.errors.join(', ')}`);
    });
    
    test('catalog with duplicate IDs', () => {
        const catalog = {
            'agent1': [validMethod],
            'agent2': [validMethod]  // Gleiche ID
        };
        const result = validateMethodCatalog(catalog);
        if (result.valid) throw new Error('Should be invalid (duplicate IDs)');
    });
    
    test('empty catalog', () => {
        const result = validateMethodCatalog({});
        if (!result.valid) throw new Error('Should be valid (empty is OK)');
    });
    
    test('null catalog', () => {
        const result = validateMethodCatalog(null);
        if (result.valid) throw new Error('Should be invalid');
    });
    
    // Test: quickValidate
    test('quickValidate returns boolean', () => {
        const result = quickValidate({ 'agent': [validMethod] });
        if (typeof result !== 'boolean') throw new Error('Should return boolean');
    });
    
    // Test: strictValidate
    test('strictValidate throws on invalid', () => {
        let threw = false;
        try {
            strictValidate({ 'agent': [invalidMethod] });
        } catch (err) {
            threw = true;
        }
        if (!threw) throw new Error('Should throw');
    });
    
    test('strictValidate returns on valid', () => {
        const result = strictValidate({ 'agent': [validMethod] });
        if (!result || !result.valid) throw new Error('Should return valid result');
    });
    
    console.log(`\n=== Results: ${passed}/${passed + failed} passed ===\n`);
    
    return failed === 0;
}

// Run tests
const success = runTests();
process.exit(success ? 0 : 1);
