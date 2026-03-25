/**
 * Polling Module for AutoCast (ES Modules Version)
 * 
 * Reusable file-based waiting utilities with configurable intervals and timeouts.
 */

/**
 * Polling-Konfiguration
 */
export interface PollingConfig {
  /** Polling interval in ms (default: 10000) */
  intervalMs: number;
  /** Timeout in ms (default: 600000 = 10 minutes) */
  maxWaitMs: number;
}

/** Options-Objekt für Polling-Funktionen */
export interface PollingOptions {
  /** Polling interval in ms (default: 10000) */
  interval?: number;
  /** Timeout in ms (default: 600000 = 10 minutes) */
  timeout?: number;
  /** Optional custom check function */
  checkFn?: (filePath: string) => Promise<boolean> | boolean;
}

/** Ergebnis eines Polling-Aufrufs */
export interface PollingResult {
  success: boolean;
  path: string;
  waitTime: number;
}

/** Status-Change Ergebnis */
export interface StatusChangeResult {
  status: string;
  data: any;
}

/**
 * Sleep utility - promisified setTimeout
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void>;

/**
 * Wait for a file to exist with configurable interval and timeout.
 * @param filePath - Path to the file to wait for
 * @param options - Options object
 * @returns Result object
 * @throws If timeout is reached or checkFn throws
 */
export function waitForFile(filePath: string, options?: PollingOptions): Promise<PollingResult>;

/**
 * Poll with progress callback
 * @param filePath - Path to watch
 * @param onProgress - Callback(progress, elapsedTime)
 * @param options - Polling options
 * @returns Result
 */
export function pollWithProgress(
  filePath: string,
  onProgress: (progress: number, elapsedTime: number) => void,
  options?: PollingOptions
): Promise<PollingResult>;

/**
 * Wait for status change in JSON file
 * @param statusPath - Path to status JSON file
 * @param fromStatus - Status to wait for (or null for any)
 * @param toStatus - Target status
 * @param options - Polling options
 * @returns New status
 */
export function waitForStatusChange(
  statusPath: string,
  fromStatus: string | null,
  toStatus: string,
  options?: PollingOptions
): Promise<StatusChangeResult>;

/** Default export - TypeScript Namespace */
declare namespace _default {
    export { sleep };
    export { waitForFile };
    export { pollWithProgress };
    export { waitForStatusChange };
}
export default _default;
