/**
 * Shared JSON report for all smoke tests (S1–S24+).
 *
 * Each `recordResult` call reads the current file, merges the new test
 * result, and writes back. This means:
 *   - Both manual-smoke-test.spec.ts and smoke-scroll-stability.spec.ts
 *     contribute to the same JSON file
 *   - Results are persisted immediately (no afterAll batch write)
 *   - If a test crashes, earlier results survive
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, "..", "test-results");
export const REPORT_PATH = path.join(OUT_DIR, "smoke-report.json");

function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

/** Read the current report, or create a fresh one if missing/corrupt. */
function readReport(): Record<string, any> {
  try {
    if (fs.existsSync(REPORT_PATH)) {
      return JSON.parse(fs.readFileSync(REPORT_PATH, "utf-8"));
    }
  } catch {
    // Corrupt file — start fresh
  }
  return { timestamp: new Date().toISOString(), tests: {} };
}

/**
 * Record a test result immediately to the shared JSON report.
 * Reads → merges → writes so multiple spec files can share one report.
 */
export function recordResult(testId: string, data: Record<string, any>) {
  ensureOutDir();
  const report = readReport();
  report.tests[testId] = { ...data, completedAt: new Date().toISOString() };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n  [${testId}] JSON recorded → ${REPORT_PATH}`);
}

/**
 * Reset the report file. Call this once at the start of a full run
 * (e.g. in a beforeAll) to clear stale results from previous runs.
 */
export function resetReport() {
  ensureOutDir();
  const fresh = { timestamp: new Date().toISOString(), tests: {} };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(fresh, null, 2));
}

