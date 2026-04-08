/**
 * SimilaritySelectionClient - JavaScript Client for Similarity-Based Method Selection
 * 
 * Integration zwischen dispatch_processor.js und der Python SimilaritySelector.
 * Bietet ε-greedy Selection mit Fallback auf Random Selection.
 * 
 * @version 1.0.0
 * @module scripts/autoresearch/similarity_selection_client
 */

import { readFileSync } from 'fs';
import { ChromaBridgeClient } from './chroma_bridge_client.js';

/**
 * Logger with consistent format
 */
class Logger {
    static info(msg) { console.log(`[SIM_SELECT] ${msg}`); }
    static debug(msg) { if (process.env.DEBUG) console.log(`[SIM_SELECT:DEBUG] ${msg}`); }
    static warn(msg) { console.warn(`[SIM_SELECT:WARN] ${msg}`); }
    static error(msg) { console.error(`[SIM_SELECT:ERROR] ${msg}`); }
}

/**
 * MethodCandidate - Represents a candidate method with similarity score
 * @typedef {Object} MethodCandidate
 * @property {string} method_id - Unique method identifier
 * @property {number} score - Combined score (success_rate × similarity_score)
 * @property {number} success_rate - Historical success rate
 * @property {number} similarity_score - Context similarity (0.0 to 1.0)
 * @property {number} attempts - Number of historical attempts
 * @property {Object} metadata - Additional method metadata
 */

/**
 * SelectionResult - Result of a selection operation
 * @typedef {Object} SelectionResult
 * @property {MethodCandidate[]} candidates - Ranked list of candidates
 * @property {string} selection_type - 'exploration' or 'exploitation'
 * @property {Object} context - The context used for selection
 * @property {number} epsilon - Epsilon value used
 * @property {boolean} was_exploration - Whether this was an exploration selection
 */

/**
 * SimilaritySelectionClient - Client for similarity-based method selection
 * 
 * Implements ε-greedy strategy:
 * - With probability ε: random selection (exploration)
 * - With probability 1-ε: top similar successful method (exploitation)
 * 
 * Features:
 * - ChromaDB Bridge integration for method queries
 * - Context-based similarity matching
 * - Fallback to random selection if bridge unavailable
 * - Feature flag support via config
 */
export class SimilaritySelectionClient {
    /**
     * Create a SimilaritySelectionClient
     * @param {Object} options - Configuration options
     * @param {number} [options.epsilon=0.2] - Exploration probability (0.0 to 1.0)
     * @param {number} [options.minSuccessRate=0.3] - Minimum success rate threshold
     * @param {string} [options.bridgeHost='localhost'] - ChromaDB Bridge host
     * @param {number} [options.bridgePort=8765] - ChromaDB Bridge port
     * @param {number} [options.seed=42] - Random seed for reproducibility
     * @param {boolean} [options.enabled=true] - Feature flag override
     */
    constructor(options = {}) {
        this.epsilon = options.epsilon ?? parseFloat(process.env.SIM_SELECT_EPSILON) ?? 0.2;
        this.minSuccessRate = options.minSuccessRate ?? 0.3;
        this.bridgeHost = options.bridgeHost ?? process.env.CHROMA_BRIDGE_HOST ?? 'localhost';
        this.bridgePort = options.bridgePort ?? parseInt(process.env.CHROMA_BRIDGE_PORT, 10) ?? 8765;
        this.seed = options.seed ?? 42;
        this.enabled = options.enabled ?? this._checkFeatureFlag();
        
        // Initialize random number generator
        this._rng = this._createSeededRng(this.seed);
        
        // Initialize ChromaDB Bridge client if enabled
        this.chromaClient = null;
        if (this.enabled) {
            try {
                this.chromaClient = new ChromaBridgeClient({
                    host: this.bridgeHost,
                    port: this.bridgePort,
                    timeoutMs: 5000,
                    retries: 2
                });
                Logger.info(`Initialized (epsilon=${this.epsilon}, minSuccessRate=${this.minSuccessRate})`);
            } catch (err) {
                Logger.warn(`Failed to initialize ChromaDB client: ${err.message}`);
                this.chromaClient = null;
            }
        } else {
            Logger.info('Similarity selection disabled via feature flag');
        }
    }
    
    /**
     * Check if similarity selection feature is enabled
     * @returns {boolean}
     * @private
     */
    _checkFeatureFlag() {
        try {
            // Try to read from learning/config.py
            const configPath = new URL('../../learning/config.py', import.meta.url);
            const configContent = readFileSync(configPath, 'utf-8');
            
            // Parse FEATURES dict
            const match = configContent.match(/L2_SIMILARITY_SELECTION["']?\s*:\s*(true|True|false|False)/i);
            if (match) {
                return match[1].toLowerCase() === 'true';
            }
        } catch (err) {
            // Config not available, default to true
            Logger.debug(`Could not read config: ${err.message}`);
        }
        
        // Also check environment variable
        const envFlag = process.env.L2_SIMILARITY_SELECTION;
        if (envFlag !== undefined) {
            return envFlag === 'true' || envFlag === '1';
        }
        
        return true; // Default enabled
    }
    
    /**
     * Create a seeded random number generator
     * @param {number} seed - Random seed
     * @returns {Object} RNG with random() method
     * @private
     */
    _createSeededRng(seed) {
        // Simple LCG (Linear Congruential Generator)
        let state = seed;
        const m = 0x80000000; // 2^31
        const a = 1103515245;
        const c = 12345;
        
        return {
            random: () => {
                state = (a * state + c) % m;
                return state / (m - 1);
            },
            reset: () => { state = seed; }
        };
    }
    
    /**
     * Calculate context similarity between context and method metadata
     * @param {Object} context - Current context
     * @param {Object} metadata - Method metadata
     * @returns {number} Similarity score (0.0 to 1.0)
     * @private
     */
    _calculateContextSimilarity(context, metadata) {
        let score = 0.0;
        const weights = {
            audio_type: 0.3,
            noise_level: 0.25,
            speech_density: 0.25,
            duration_min: 0.1,
            speaker_count: 0.1
        };
        
        for (const [key, weight] of Object.entries(weights)) {
            if (metadata[key] !== undefined && context[key] !== undefined) {
                if (metadata[key] === context[key]) {
                    score += weight;
                } else if (key === 'duration_min') {
                    // For duration, check if within 20% range
                    const metaVal = parseFloat(metadata[key]) || 0;
                    const ctxVal = parseFloat(context[key]) || 0;
                    if (ctxVal > 0) {
                        const ratio = Math.min(metaVal, ctxVal) / Math.max(metaVal, ctxVal);
                        score += weight * ratio;
                    }
                }
            }
        }
        
        return score;
    }
    
    /**
     * Check if ChromaDB Bridge is available
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        if (!this.enabled || !this.chromaClient) {
            return false;
        }
        
        try {
            return await this.chromaClient.isHealthy(3000);
        } catch {
            return false;
        }
    }
    
    /**
     * Select methods using ε-greedy strategy
     * 
     * @param {Object} context - Context dict with keys like audio_type, noise_level, etc.
     * @param {number} nCandidates - Number of candidates to return
     * @param {string[]} [availableMethods] - Optional list of available method IDs to filter
     * @returns {Promise<MethodCandidate[]>} Ranked list of method candidates
     */
    async selectMethods(context, nCandidates = 3, availableMethods = null) {
        // Check if bridge is available
        const bridgeAvailable = await this.isAvailable();
        
        if (!bridgeAvailable) {
            Logger.warn('Bridge unavailable - using fallback selection');
            return this._fallbackSelection(context, nCandidates, availableMethods);
        }
        
        // ε-greedy decision
        const isExploration = this._rng.random() < this.epsilon;
        
        if (isExploration) {
            Logger.info(`EXPLORATION: Selecting random methods (ε=${this.epsilon})`);
            return this._explorationSelection(nCandidates, availableMethods);
        }
        
        Logger.info('EXPLOITATION: Selecting similar successful methods');
        return this._exploitationSelection(context, nCandidates, availableMethods);
    }
    
    /**
     * Select random methods for exploration
     * @param {number} nCandidates - Number of candidates
     * @param {string[]} [availableMethods] - Available method IDs
     * @returns {Promise<MethodCandidate[]>}
     * @private
     */
    async _explorationSelection(nCandidates, availableMethods = null) {
        try {
            // Get top methods
            const response = await this.chromaClient.getTopMethods(100);
            let methods = response.methods || [];
            
            // Filter if available methods specified
            if (availableMethods && availableMethods.length > 0) {
                const availableSet = new Set(availableMethods);
                methods = methods.filter(m => availableSet.has(m.method_id));
            }
            
            if (methods.length === 0) {
                return this._fallbackSelection({}, nCandidates, availableMethods);
            }
            
            // Random selection
            const shuffled = [...methods].sort(() => this._rng.random() - 0.5);
            const selected = shuffled.slice(0, Math.min(nCandidates, shuffled.length));
            
            return selected.map(m => ({
                method_id: m.method_id,
                score: 0.5, // Neutral score for exploration
                success_rate: m.success_rate || 0,
                similarity_score: 0,
                attempts: m.attempts || 0,
                context_match: 0,
                metadata: { selection_type: 'exploration', ...m }
            }));
        } catch (err) {
            Logger.error(`Exploration selection failed: ${err.message}`);
            return this._fallbackSelection({}, nCandidates, availableMethods);
        }
    }
    
    /**
     * Select top similar successful methods for exploitation
     * @param {Object} context - Current context
     * @param {number} nCandidates - Number of candidates
     * @param {string[]} [availableMethods] - Available method IDs
     * @returns {Promise<MethodCandidate[]>}
     * @private
     */
    async _exploitationSelection(context, nCandidates, availableMethods = null) {
        try {
            // Get top methods
            const response = await this.chromaClient.getTopMethods(50);
            let methods = response.methods || [];
            
            // Filter by success rate
            methods = methods.filter(m => 
                (m.success_rate || 0) >= this.minSuccessRate &&
                (m.attempts || 0) >= 1
            );
            
            // Filter if available methods specified
            if (availableMethods && availableMethods.length > 0) {
                const availableSet = new Set(availableMethods);
                methods = methods.filter(m => availableSet.has(m.method_id));
            }
            
            if (methods.length === 0) {
                Logger.info('No successful methods found - falling back to exploration');
                return this._explorationSelection(nCandidates, availableMethods);
            }
            
            // Calculate combined scores
            const candidates = methods.map(m => {
                const successRate = m.success_rate || 0;
                const metadata = m.metadata || {};
                const similarity = this._calculateContextSimilarity(context, metadata);
                
                // Combined score: success_rate × similarity
                const score = successRate > 0 ? successRate * similarity : similarity * 0.5;
                
                return {
                    method_id: m.method_id,
                    score,
                    success_rate: successRate,
                    similarity_score: similarity,
                    attempts: m.attempts || 0,
                    context_match: similarity,
                    metadata: { ...m }
                };
            });
            
            // Sort by score descending
            candidates.sort((a, b) => b.score - a.score);
            
            return candidates.slice(0, nCandidates);
        } catch (err) {
            Logger.error(`Exploitation selection failed: ${err.message}`);
            return this._explorationSelection(nCandidates, availableMethods);
        }
    }
    
    /**
     * Fallback selection when bridge is unavailable
     * @param {Object} context - Current context
     * @param {number} nCandidates - Number of candidates
     * @param {string[]} [availableMethods] - Available method IDs
     * @returns {MethodCandidate[]}
     * @private
     */
    _fallbackSelection(context, nCandidates, availableMethods = null) {
        Logger.warn('Using fallback selection');
        
        if (availableMethods && availableMethods.length > 0) {
            // Return available methods with neutral scores
            return availableMethods.slice(0, nCandidates).map(methodId => ({
                method_id: methodId,
                score: 0.5,
                success_rate: 0,
                similarity_score: 0,
                attempts: 0,
                context_match: 0,
                metadata: { selection_type: 'fallback' }
            }));
        }
        
        return [];
    }
    
    /**
     * Get full selection result with metadata
     * @param {Object} context - Context dict
     * @param {number} nCandidates - Number of candidates
     * @param {string[]} [availableMethods] - Available method IDs
     * @returns {Promise<SelectionResult>}
     */
    async getSelectionResult(context, nCandidates = 3, availableMethods = null) {
        const wasExploration = this._rng.random() < this.epsilon;
        const candidates = await this.selectMethods(context, nCandidates, availableMethods);
        
        return {
            candidates,
            selection_type: wasExploration ? 'exploration' : 'exploitation',
            context,
            epsilon: this.epsilon,
            was_exploration: wasExploration
        };
    }
    
    /**
     * Reset the random number generator
     */
    resetRng() {
        this._rng.reset();
        Logger.debug('RNG reset');
    }
    
    /**
     * Get current configuration
     * @returns {Object}
     */
    getConfig() {
        return {
            epsilon: this.epsilon,
            minSuccessRate: this.minSuccessRate,
            bridgeHost: this.bridgeHost,
            bridgePort: this.bridgePort,
            enabled: this.enabled,
            seed: this.seed
        };
    }
}

/**
 * Create a SimilaritySelectionClient with configuration
 * @param {Object} options - Configuration options
 * @returns {SimilaritySelectionClient}
 */
export function createSimilaritySelector(options = {}) {
    return new SimilaritySelectionClient(options);
}

// Default export
export default SimilaritySelectionClient;