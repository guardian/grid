/**
 * Writes Testcontainers' debug output to `logs/testcontainers.log` on every run.
 *
 * Testcontainers only records the Docker build stream, where build failures such as network
 * errors are reported, when its debug logging is on; otherwise it throws an opaque
 * "Failed to build image". CI uploads this file as the testcontainers-log artifact on failure.
 */
import * as fs from 'fs';
import * as path from 'path';
import { format, stripVTControlCharacters } from 'util';
import createDebug from 'debug';

const DEBUG_LOG_DIR = path.join(import.meta.dirname, '..', 'logs');
export const DEBUG_LOG_PATH = path.join(DEBUG_LOG_DIR, 'testcontainers.log');
const NAMESPACES = 'testcontainers*';

const userNamespaces = process.env.DEBUG;

export function captureDebugLog(): void {
  fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
  // Synchronous writes, so a crash mid-boot cannot drop the lines that explain it.
  const fd = fs.openSync(DEBUG_LOG_PATH, 'w');

  createDebug.enable([userNamespaces, NAMESPACES].filter(Boolean).join(','));
  createDebug.log = (...args: unknown[]) => {
    const line = `${format(...args)}\n`;
    fs.writeSync(fd, stripVTControlCharacters(line));
    // Preserve `DEBUG=... npm test` printing to the terminal.
    if (userNamespaces) {
      process.stderr.write(line);
    }
  };
}

/**
 * Stop recording container output once the stack is up, as services such as LocalStack
 * keep logging every request and would grow the file for as long as the run lasts.
 */
export function stopContainerLogCapture(): void {
  // An explicit DEBUG is an opt-in to the full output.
  if (!userNamespaces) {
    createDebug.enable(`${NAMESPACES},-testcontainers:containers`);
  }
}
