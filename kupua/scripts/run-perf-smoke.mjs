#!/usr/bin/env node

/**
 * Thin wrapper around e2e-perf/run-audit.mjs.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — NEVER RUN BY CI, SCRIPTS, OR AGENTS.    ║
 * ║  Only a human developer should run this from their IDE terminal.   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Usage (same as before):
 *   node scripts/run-perf-smoke.mjs              # run all P* tests
 *   node scripts/run-perf-smoke.mjs P1            # run just P1
 *   node scripts/run-perf-smoke.mjs P2,P7         # run P2 and P7
 *
 * For labelled audit runs with --runs support, use directly:
 *   node e2e-perf/run-audit.mjs --label "Phase 1" --runs 3
 *
 * Prerequisites:
 *   Terminal 1: ./scripts/start.sh --use-TEST
 *   Terminal 2: node scripts/run-perf-smoke.mjs [P<N>]
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Forward all args to the audit harness
const forwardArgs = process.argv.slice(2);

const child = spawn(
  "node",
  [resolve(__dirname, "../e2e-perf/run-audit.mjs"), ...forwardArgs],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env },
  },
);

child.on("close", (code) => {
  process.exit(code ?? 1);
});
