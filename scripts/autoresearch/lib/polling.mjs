/**
 * Polling Module for AutoCast (ES Modules Version)
 * 
 * Reusable file-based waiting utilities with configurable intervals and timeouts.
 * @module polling
 */

import fs from 'fs';
import path from 'path';

/**
 * Sleep utility - promisified setTimeout
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a file to exist with configurable interval and timeout.
 * 
 * @param {string} filePath - Path to the file to wait for
 * @param {Object} options - Options object
 * @param {number} options.interval - Polling interval in ms (default: 10000)
 * @param {number} options.timeout - Timeout in ms (default: 600000 = 10 minutes)
 * @param {Function} options.checkFn - Optional custom check function
 * @returns {Promise<{success: boolean, path: string, waitTime: number}>} Result object
 * @throws {Error} If timeout is reached or checkFn throws
 */
export async function waitForFile(filePath, options = {}) {
  const interval = options.interval || 10000;
  const timeout = options.timeout || 600000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(filePath)) {
      if (options.checkFn) {
        try {
          const checkResult = await options.checkFn(filePath);
          if (checkResult) {
            return { 
              success: true, 
              path: filePath, 
              waitTime: Date.now() - startTime 
            };
          }
        } catch (err) {
          throw new Error(`Check function failed: ${err.message}`);
        }
      } else {
        return { 
          success: true, 
          path: filePath, 
          waitTime: Date.now() - startTime 
        };
      }
    }
    await sleep(interval);
  }
  
  throw new Error(`TIMEOUT: File ${filePath} not found after ${timeout}ms`);
}

/**
 * Poll with progress callback
 * @param {string} filePath - Path to watch
 * @param {Function} onProgress - Callback(progress, elapsedTime)
 * @param {Object} options - Polling options
 * @returns {Promise<Object>} Result
 */
export async function pollWithProgress(filePath, onProgress, options = {}) {
  const interval = options.interval || 10000;
  const timeout = options.timeout || 600000;
  const startTime = Date.now();
  let elapsed = 0;
  
  while (elapsed < timeout) {
    if (fs.existsSync(filePath)) {
      return { success: true, path: filePath, waitTime: elapsed };
    }
    
    elapsed = Date.now() - startTime;
    const progress = Math.min(100, Math.round((elapsed / timeout) * 100));
    
    if (onProgress) {
      onProgress(progress, elapsed);
    }
    
    await sleep(interval);
  }
  
  throw new Error(`TIMEOUT after ${timeout}ms`);
}

/**
 * Wait for status change in JSON file
 * @param {string} statusPath - Path to status JSON file
 * @param {string} fromStatus - Status to wait for (or null for any)
 * @param {string} toStatus - Target status
 * @param {Object} options - Polling options
 * @returns {Promise<Object>} New status
 */
export async function waitForStatusChange(statusPath, fromStatus, toStatus, options = {}) {
  const interval = options.interval || 10000;
  const timeout = options.timeout || 600000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      const currentStatus = data.overallStatus || data.status;
      
      if (fromStatus && currentStatus !== fromStatus) {
        return { status: currentStatus, data };
      }
      
      if (currentStatus === toStatus) {
        return { status: currentStatus, data };
      }
    } catch (err) {
      // File might not exist yet, continue polling
    }
    
    await sleep(interval);
  }
  
  throw new Error(`TIMEOUT waiting for status change to ${toStatus}`);
}

export default { sleep, waitForFile, pollWithProgress, waitForStatusChange };
