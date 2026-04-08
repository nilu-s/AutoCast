/**
 * ChromaDB Bridge Client for Node.js
 *
 * JavaScript Client für die ChromaDB HTTP Bridge API.
 * Bietet Async-Methoden für alle API Endpoints mit Retry-Logik.
 *
 * Example:
 *   const client = new ChromaBridgeClient({ port: 8765 });
 *   const health = await client.health();
 *   const similar = await client.getSimilarMethods('method_001', 5);
 */

const http = require('http');

/**
 * Configuration options for ChromaBridgeClient
 * @typedef {Object} ChromaClientConfig
 * @property {string} host - Hostname (default: 'localhost')
 * @property {number} port - Port number (default: 8765)
 * @property {number} timeoutMs - Request timeout in ms (default: 30000)
 * @property {number} retries - Number of retries (default: 3)
 * @property {number} retryDelayMs - Delay between retries in ms (default: 1000)
 */

/**
 * Method data structure
 * @typedef {Object} MethodData
 * @property {string} method_id - Unique method identifier
 * @property {string} category - Method category (e.g., 'vad', 'postprocess')
 * @property {Object} parameters - Method parameters
 */

/**
 * Run data structure
 * @typedef {Object} RunData
 * @property {string} run_id - Unique run identifier
 * @property {string} timestamp - ISO timestamp
 * @property {number} [baseline_score] - Optional baseline score
 * @property {number} [final_score] - Optional final score
 * @property {string} status - Run status
 * @property {string[]} [methods_applied] - List of method IDs
 */

/**
 * Method run result structure
 * @typedef {Object} MethodRunData
 * @property {string} method_id - Method identifier
 * @property {string} run_id - Run identifier
 * @property {string} [decision] - Decision (KEEP, REJECT, FAILED)
 * @property {number} [improvement] - Score improvement
 * @property {number} [duration_ms] - Duration in milliseconds
 */

class ChromaBridgeClient {
  /**
   * Create a new ChromaBridgeClient instance
   * @param {ChromaClientConfig} [config={}] - Configuration options
   */
  constructor(config = {}) {
    this.host = config.host || process.env.CHROMA_BRIDGE_HOST || 'localhost';
    this.port = config.port || parseInt(process.env.CHROMA_BRIDGE_PORT, 10) || 8765;
    this.timeoutMs = config.timeoutMs || 30000;
    this.retries = config.retries || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
  }

  /**
   * Make an HTTP request with retry logic
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} path - API path
   * @param {Object} [data=null] - Request body data
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _request(method, path, data = null) {
    const options = {
      hostname: this.host,
      port: this.port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    let lastError = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await this._makeRequest(options, data);
        return response;
      } catch (error) {
        lastError = error;
        
        // Don't retry on 4xx errors (client errors)
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // Wait before retry (except on last attempt)
        if (attempt < this.retries - 1) {
          await this._sleep(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw new ChromaBridgeError(
      `Request failed after ${this.retries} attempts: ${lastError.message}`,
      lastError.statusCode || 500
    );
  }

  /**
   * Make a single HTTP request
   * @param {Object} options - HTTP options
   * @param {Object} [data=null] - Request body
   * @returns {Promise<Object>} Response data
   * @private
   */
  _makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const responseData = body ? JSON.parse(body) : {};
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(responseData);
            } else {
              const error = new ChromaBridgeError(
                responseData.error || `HTTP ${res.statusCode}`,
                res.statusCode
              );
              reject(error);
            }
          } catch (parseError) {
            reject(new ChromaBridgeError(
              `Invalid JSON response: ${parseError.message}`,
              500
            ));
          }
        });
      });

      req.on('error', (error) => {
        reject(new ChromaBridgeError(
          `Request failed: ${error.message}`,
          500
        ));
      });

      req.setTimeout(this.timeoutMs, () => {
        req.destroy();
        reject(new ChromaBridgeError('Request timeout', 504));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check endpoint
   * @returns {Promise<Object>} Health status with { status, persist_dir, port }
   */
  async health() {
    return this._request('GET', '/health');
  }

  /**
   * Get success rate for a method
   * @param {string} methodId - Method identifier
   * @returns {Promise<Object>} Success rate data
   */
  async getSuccessRate(methodId) {
    if (!methodId) {
      throw new ChromaBridgeError('methodId is required', 400);
    }
    return this._request('GET', `/success-rate?method_id=${encodeURIComponent(methodId)}`);
  }

  /**
   * Get top performing methods
   * @param {number} [limit=10] - Number of methods to return
   * @param {string} [category=null] - Optional category filter
   * @returns {Promise<Object>} Top methods with { methods: [...] }
   */
  async getTopMethods(limit = 10, category = null) {
    let path = `/top-methods?limit=${encodeURIComponent(limit)}`;
    if (category) {
      path += `&category=${encodeURIComponent(category)}`;
    }
    return this._request('GET', path);
  }

  /**
   * Find similar methods to a given method
   * @param {string} methodId - Reference method identifier
   * @param {number} [n=5] - Number of similar methods to return
   * @returns {Promise<Object>} Similar methods with { method_id, similar_methods: [...] }
   */
  async getSimilarMethods(methodId, n = 5) {
    if (!methodId) {
      throw new ChromaBridgeError('methodId is required', 400);
    }
    const path = `/similar-methods?method_id=${encodeURIComponent(methodId)}&n=${encodeURIComponent(n)}`;
    return this._request('GET', path);
  }

  /**
   * Get method recommendations for a run
   * @param {string} runId - Run identifier
   * @param {number} [n=5] - Number of recommendations
   * @returns {Promise<Object>} Recommendations with { run_id, recommendations: [...] }
   */
  async getRecommendations(runId, n = 5) {
    if (!runId) {
      throw new ChromaBridgeError('runId is required', 400);
    }
    const path = `/recommend-methods?run_id=${encodeURIComponent(runId)}&n=${encodeURIComponent(n)}`;
    return this._request('GET', path);
  }

  /**
   * Add a new method to the database
   * @param {MethodData} methodData - Method data
   * @returns {Promise<Object>} Result with { status, method_id }
   */
  async addMethod(methodData) {
    if (!methodData.method_id) {
      throw new ChromaBridgeError('method_id is required', 400);
    }
    if (!methodData.category) {
      throw new ChromaBridgeError('category is required', 400);
    }
    if (!methodData.parameters) {
      throw new ChromaBridgeError('parameters is required', 400);
    }
    return this._request('POST', '/add-method', methodData);
  }

  /**
   * Record a new run
   * @param {RunData} runData - Run data
   * @returns {Promise<Object>} Result with { status, run_id }
   */
  async recordRun(runData) {
    if (!runData.run_id) {
      throw new ChromaBridgeError('run_id is required', 400);
    }
    if (!runData.timestamp) {
      throw new ChromaBridgeError('timestamp is required', 400);
    }
    if (!runData.status) {
      throw new ChromaBridgeError('status is required', 400);
    }
    return this._request('POST', '/record-run', runData);
  }

  /**
   * Record a method run result
   * @param {MethodRunData} methodRunData - Method run data
   * @returns {Promise<Object>} Result with { status }
   */
  async recordMethodRun(methodRunData) {
    if (!methodRunData.method_id) {
      throw new ChromaBridgeError('method_id is required', 400);
    }
    if (!methodRunData.run_id) {
      throw new ChromaBridgeError('run_id is required', 400);
    }
    return this._request('POST', '/record-method-run', methodRunData);
  }

  /**
   * Check if the bridge server is healthy
   * @param {number} [timeoutMs=5000] - Timeout for health check
   * @returns {Promise<boolean>} True if healthy
   */
  async isHealthy(timeoutMs = 5000) {
    const originalTimeout = this.timeoutMs;
    this.timeoutMs = timeoutMs;
    try {
      const response = await this.health();
      return response.status === 'ok';
    } catch {
      return false;
    } finally {
      this.timeoutMs = originalTimeout;
    }
  }
}

/**
 * Custom error class for ChromaBridgeClient
 */
class ChromaBridgeError extends Error {
  /**
   * Create a new ChromaBridgeError
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   */
  constructor(message, statusCode) {
    super(message);
    this.name = 'ChromaBridgeError';
    this.statusCode = statusCode;
  }
}

module.exports = {
  ChromaBridgeClient,
  ChromaBridgeError
};
