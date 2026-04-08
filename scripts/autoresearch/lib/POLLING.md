# Polling Module

Reusable file-based waiting utilities with configurable intervals and timeouts for AutoCast.

## Overview

The polling module provides promise-based utilities for waiting on file system events, status changes, and custom conditions. It supports progress callbacks, custom check functions, and proper timeout handling.

## Installation

```javascript
const { 
  waitForFile, 
  pollWithProgress, 
  waitForStatusChange,
  pollWithAbort,
  sleep 
} = require('./lib/polling');
```

## API Reference

### `waitForFile(filePath, options)`

Wait for a file to exist with configurable interval and timeout.

**Parameters:**
- `filePath` (string): Path to the file to wait for
- `options` (Object):
  - `interval` (number): Polling interval in milliseconds (default: `10000`)
  - `timeout` (number): Timeout in milliseconds (default: `600000` = 10 minutes)
  - `checkFn` (Function): Optional custom check function that receives `filePath` and returns `boolean` or `Promise<boolean>`

**Returns:** `Promise<{success: boolean, path: string, waitTime: number}>`

**Throws:**
- `Error` with message starting with `TIMEOUT:` if timeout is reached
- `Error` with message starting with `CHECK_ERROR:` if custom check function throws

**Example:**
```javascript
// Basic usage - wait up to 10 minutes, checking every 10 seconds
const result = await waitForFile('/tmp/output.txt');
console.log(`File appeared after ${result.waitTime}ms`);

// With custom options
const result = await waitForFile('/tmp/output.txt', {
  interval: 5000,   // Check every 5 seconds
  timeout: 300000   // Wait up to 5 minutes
});

// With custom check function - wait for file AND specific content
const result = await waitForFile('/tmp/status.txt', {
  interval: 2000,
  checkFn: (path) => {
    if (!fs.existsSync(path)) return false;
    const content = fs.readFileSync(path, 'utf8');
    return content.includes('READY');
  }
});
```

---

### `pollWithProgress(filePath, onProgress, options)`

Poll for a file with a progress callback called on each attempt.

**Parameters:**
- `filePath` (string): Path to the file to wait for
- `onProgress` (Function): Callback called on each poll attempt with `(attempts, elapsedTime, found)`
- `options` (Object): Same as `waitForFile`

**Returns:** `Promise<{success: boolean, path: string, waitTime: number, attempts: number}>`

**Throws:**
- `Error` with message starting with `TIMEOUT:` if timeout is reached

**Example:**
```javascript
await pollWithProgress(
  '/tmp/output.txt',
  (attempts, elapsedTime, found) => {
    console.log(`Attempt ${attempts}: ${elapsedTime}ms elapsed, found=${found}`);
  },
  { interval: 5000, timeout: 300000 }
);
```

---

### `waitForStatusChange(statusPath, fromStatus, toStatus, options)`

Wait for a status file to transition from one status to another.

**Parameters:**
- `statusPath` (string): Path to the status file
- `fromStatus` (string | null): Initial status to wait for (use `null` to accept any initial status)
- `toStatus` (string): Target status to wait for
- `options` (Object):
  - `interval` (number): Polling interval in milliseconds (default: `10000`)
  - `timeout` (number): Timeout in milliseconds (default: `600000`)
  - `readFn` (Function): Optional custom read function that receives `filePath` and returns status string

**Returns:** `Promise<{success: boolean, path: string, waitTime: number, oldStatus: string, newStatus: string}>`

**Throws:**
- `Error` with message starting with `TIMEOUT:` if timeout is reached or initial status not found

**Status File Format:**
The status file can be:
- **JSON**: `{ "status": "pending" }` (reads the `status` field)
- **Plain text**: Just the status string (e.g., `pending`)

**Example:**
```javascript
// Wait for status to change from "pending" to "completed"
await waitForStatusChange(
  '/tmp/task.status',
  'pending',
  'completed',
  { interval: 5000, timeout: 600000 }
);

// Accept any initial status, wait for "ready"
await waitForStatusChange(
  '/tmp/task.status',
  null,  // Accept any current status
  'ready',
  { interval: 5000 }
);
```

---

### `pollWithAbort(filePath, options)`

Poll with AbortController support for cancellation.

**Parameters:**
- `filePath` (string): Path to the file to wait for
- `options` (Object):
  - `signal` (AbortSignal): Signal for cancellation
  - Other options same as `waitForFile`

**Returns:** `Promise<{success: boolean, path: string, waitTime: number}>`

**Throws:**
- `Error` with message starting with `ABORTED:` if polling was cancelled
- `Error` with message starting with `TIMEOUT:` if timeout is reached

**Example:**
```javascript
const controller = new AbortController();

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
  const result = await pollWithAbort('/tmp/output.txt', {
    signal: controller.signal,
    interval: 5000,
    timeout: 300000
  });
} catch (err) {
  if (err.message.includes('ABORTED')) {
    console.log('Polling was cancelled');
  }
}
```

---

### `sleep(ms)`

Utility function for promisified delay.

**Parameters:**
- `ms` (number): Milliseconds to sleep

**Returns:** `Promise<void>`

**Example:**
```javascript
await sleep(5000); // Sleep for 5 seconds
```

## Error Handling

All polling functions throw `Error` objects with descriptive messages:

| Error Prefix | Cause | Handling |
|--------------|-------|----------|
| `TIMEOUT:` | Timeout reached before condition met | Catch and retry or fail |
| `CHECK_ERROR:` | Custom check function threw | Review check function logic |
| `ABORTED:` | Polling was cancelled via AbortSignal | Clean up and exit gracefully |

**Example Error Handling:**
```javascript
try {
  const result = await waitForFile('/tmp/output.txt', { timeout: 60000 });
} catch (err) {
  if (err.message.includes('TIMEOUT')) {
    console.error('Operation timed out');
    // Decide: retry, fail, or continue
  } else if (err.message.includes('CHECK_ERROR')) {
    console.error('Check function failed:', err.message);
  } else {
    console.error('Unexpected error:', err);
  }
}
```

## Default Values

| Option | Default | Description |
|--------|---------|-------------|
| `interval` | `10000` (10 seconds) | Time between checks |
| `timeout` | `600000` (10 minutes) | Maximum total wait time |

## Common Patterns

### Pattern: Retry with Exponential Backoff

```javascript
async function waitWithRetry(filePath, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeout = Math.min(60000 * attempt, 300000); // Increasing timeout
      return await waitForFile(filePath, { timeout });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`Attempt ${attempt} failed, retrying...`);
    }
  }
}
```

### Pattern: Wait for Multiple Files

```javascript
async function waitForAllFiles(filePaths, options = {}) {
  const results = await Promise.all(
    filePaths.map(fp => waitForFile(fp, options).catch(err => ({ success: false, error: err.message })))
  );
  return results;
}
```

### Pattern: Progress Reporting

```javascript
const progress = { startTime: Date.now() };

await pollWithProgress(
  '/tmp/result.txt',
  (attempt, elapsed) => {
    const percent = Math.min((elapsed / 600000) * 100, 100);
    console.log(`Progress: ${percent.toFixed(1)}% (attempt ${attempt})`);
  },
  { interval: 10000, timeout: 600000 }
);
```

## Testing

Run the test suite:

```bash
node polling.test.js
```

The test suite covers:
- Basic file waiting
- Timeout handling
- Custom check functions
- Progress callbacks
- Status change detection
- Error handling

## License

Part of the AutoCast project.
