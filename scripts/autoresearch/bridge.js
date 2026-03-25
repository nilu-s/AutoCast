// Bridge to Python Learning Engine
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class LearningBridge {
  constructor() {
    this.pythonPath = join(__dirname, 'python');
    this.dbPath = join(process.cwd(), 'method_results', 'learning.db');
  }

  async getTopMethods(limit = 10) {
    return this._callPython('analytics.py', ['get_top_methods', limit]);
  }

  async getSuccessRate(methodId, timeWindow = 30) {
    return this._callPython('analytics.py', ['get_success_rate', methodId, timeWindow]);
  }

  async predictSuccess(methodId) {
    return this._callPython('analytics.py', ['predict_success', methodId]);
  }

  async clusterMethods(nClusters = 5) {
    return this._callPython('analytics.py', ['cluster_methods', nClusters]);
  }

  async _callPython(script, args) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [
        join(this.pythonPath, script),
        ...args.map(String)
      ], {
        env: {
          ...process.env,
          LEARNING_DB_PATH: this.dbPath
        }
      });

      let result = '';
      let error = '';

      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python error: ${error || 'Unknown error'}`));
        } else {
          try {
            resolve(JSON.parse(result));
          } catch {
            resolve(result.trim());
          }
        }
      });
    });
  }
}

// HTTP API client for bridge.py server
export class LearningHTTPClient {
  constructor(baseUrl = 'http://localhost:8765') {
    this.baseUrl = baseUrl;
  }

  async getTopMethods(limit = 10) {
    const response = await fetch(`${this.baseUrl}/methods/top?limit=${limit}`);
    return response.json();
  }

  async getSuccessRate(methodId, timeWindow = 30) {
    const response = await fetch(`${this.baseUrl}/methods/success_rate?method_id=${encodeURIComponent(methodId)}&time_window=${timeWindow}`);
    return response.json();
  }

  async predictSuccess(methodId) {
    const response = await fetch(`${this.baseUrl}/methods/predict?method_id=${encodeURIComponent(methodId)}`);
    return response.json();
  }

  async clusterMethods(nClusters = 5) {
    const response = await fetch(`${this.baseUrl}/methods/clusters?n_clusters=${nClusters}`);
    return response.json();
  }

  async recordRun(runData) {
    const response = await fetch(`${this.baseUrl}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runData)
    });
    return response.json();
  }

  async recordMethodRun(methodRunData) {
    const response = await fetch(`${this.baseUrl}/method_runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(methodRunData)
    });
    return response.json();
  }

  async health() {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }
}

// Export convenience factory
export function createLearningBridge(useHttp = false) {
  if (useHttp) {
    return new LearningHTTPClient();
  }
  return new LearningBridge();
}

export default { LearningBridge, LearningHTTPClient, createLearningBridge };
